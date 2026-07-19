// Smoke test: scaffold every template into a temp dir and assert it lands correctly.
// Zero dependencies — runs on plain Node in CI.
import { execFileSync } from "node:child_process";
import { mkdtempSync, existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, "..", "cli.js");
const STACKS = ["nextjs", "express", "nestjs", "fastapi"];

const has = (dir, rel) => existsSync(join(dir, rel));
const reads = (dir, rel) => (has(dir, rel) ? readFileSync(join(dir, rel), "utf8") : "");

// PLAN-003 deterministic-eval files must land on scaffold. Python for fastapi, JS elsewhere.
// nextjs is a GENERATED template (no tests/ shipped) — its arch tests + acceptance holdout
// are written by .claude/scripts/infra-setup.sh, so we assert that script references them.
function assertEvalFiles(dir, stack) {
  const py = stack === "fastapi";
  const ext = py ? "py" : "mjs";
  const vector = py ? "scripts/ac_vector.py" : "scripts/ac-vector.mjs";
  const redgreen = py ? "scripts/redgreen_record.py" : "scripts/redgreen-record.mjs";
  const lib = py ? "scripts/lib/rigel_evals.py" : "scripts/lib/rigel-evals.mjs";

  // Shipped in every template:
  assert.ok(has(dir, vector), `${stack}: missing ${vector}`);
  assert.ok(has(dir, redgreen), `${stack}: missing ${redgreen}`);
  assert.ok(has(dir, lib), `${stack}: missing ${lib}`);
  assert.ok(
    has(dir, ".github/workflows/mutation-nightly.yml"),
    `${stack}: missing nightly mutation workflow`
  );
  assert.match(
    reads(dir, ".claude/hooks/post-write.sh"),
    /tests\/acceptance/,
    `${stack}: post-write hook has no acceptance-holdout rule`
  );
  assert.match(
    reads(dir, ".github/CODEOWNERS"),
    /tests\/acceptance/,
    `${stack}: CODEOWNERS missing the acceptance-holdout line`
  );

  // PLAN-004: the advisory spec-judge ships in every template's agents dir.
  assert.ok(
    has(dir, ".claude/agents/spec-judge.md"),
    `${stack}: missing spec-judge agent (PLAN-004)`
  );

  if (stack === "nextjs") {
    // The vision-judge ships only for nextjs.
    assert.ok(has(dir, ".claude/agents/vision-judge.md"), `${stack}: missing vision-judge agent`);
    // Generated template: arch tests + holdout + judge screenshot capture are written by infra-setup.sh.
    const infra = reads(dir, ".claude/scripts/infra-setup.sh");
    for (const marker of [
      "tests/architecture/traceability.test.ts",
      "tests/architecture/assertion-integrity.test.ts",
      "tests/acceptance/.gitkeep",
      "tests/design/token-conformance.spec.ts", // AC-6
      "tests/design/capture-screens.spec.ts", // AC-2 vision-judge input
    ]) {
      assert.ok(infra.includes(marker), `${stack}: infra-setup.sh does not write ${marker}`);
    }
  } else {
    // Shipped-complete templates: the arch tests + holdout dir ship directly.
    const trace = py
      ? "tests/architecture/test_traceability.py"
      : "tests/architecture/traceability.test.ts";
    const integ = py
      ? "tests/architecture/test_assertion_integrity.py"
      : "tests/architecture/assertion-integrity.test.ts";
    assert.ok(has(dir, trace), `${stack}: missing ${trace}`);
    assert.ok(has(dir, integ), `${stack}: missing ${integ}`);
    assert.ok(has(dir, "tests/acceptance/.gitkeep"), `${stack}: missing tests/acceptance/.gitkeep`);
  }
}

let failures = 0;
for (const stack of STACKS) {
  const dir = mkdtempSync(join(tmpdir(), `create-rigel-${stack}-`));
  try {
    execFileSync("node", [CLI, dir, "--template", stack], { stdio: "pipe" });
    const entries = readdirSync(dir);
    assert.ok(entries.length > 0, `${stack}: target dir is empty`);
    assert.ok(existsSync(join(dir, ".gitignore")), `${stack}: .gitignore was not restored`);
    assert.ok(existsSync(join(dir, ".claude")), `${stack}: .claude workflow missing`);
    assert.ok(
      existsSync(join(dir, ".claude", "model-routing.json")),
      `${stack}: .claude/model-routing.json was not stamped`
    );
    assertEvalFiles(dir, stack);
    console.log(`  ✓ ${stack} scaffolded (${entries.length} top-level entries)`);
  } catch (err) {
    failures++;
    console.error(`  ✗ ${stack}: ${err instanceof Error ? err.message : err}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (failures > 0) {
  console.error(`\n${failures} template(s) failed to scaffold.`);
  process.exit(1);
}
console.log("\nAll templates scaffolded successfully.");
