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
// The SCAFFOLDABLE stacks — must stay in sync with cli.js's STACKS. `nestjs` is delisted (its
// files still ship so `update` keeps working for repos already on it), so it can't be scaffolded
// and isn't smoke-tested. The assertion below is what stops the two lists drifting apart.
const STACKS = ["nextjs", "express", "fastapi"];

// The list above and cli.js's STACKS must agree — otherwise a stack silently stops being tested
// (or a delisted one gets scaffolded in CI and never in reality). Assert it rather than trust it.
{
  const cli = readFileSync(CLI, "utf8");
  const block = /const STACKS = \{([\s\S]*?)\};/.exec(cli);
  assert.ok(block, "cli.js: could not find the STACKS table");
  const cliStacks = [...block[1].matchAll(/^\s*(\w+):/gm)].map((m) => m[1]);
  assert.deepEqual(
    [...STACKS].sort(),
    cliStacks.sort(),
    "smoke.mjs STACKS and cli.js STACKS have drifted — one of them is wrong",
  );
  assert.ok(!cliStacks.includes("nestjs"), "nestjs is delisted and must not be scaffoldable");
  assert.ok(
    existsSync(join(HERE, "..", "templates", "nestjs")),
    "templates/nestjs must still SHIP — `update` resolves it from the manifest for existing repos",
  );
}

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

// PLAN-005 — design enforcement stack. BOUNDARY (AC-9): it applies ONLY to the frontend
// template (nextjs). The backends (express/nestjs/fastapi) render no UI, so they intentionally
// ship NONE of it — asserting its absence documents the boundary mechanically rather than
// force-fitting a design system onto a backend.
function assertDesignFiles(dir, stack) {
  if (stack === "nextjs") {
    // Committed files that must land on scaffold (copied verbatim).
    for (const f of [
      ".claude/hooks/impeccable-severity.json", // AC-3 Rigel slop/craft tiering
      ".claude/hooks/impeccable-tier.mjs", // AC-3 hook wrapper
      "scripts/check-waivers.mjs", // AC-4 waiver reasons
      "scripts/check-design-drift.mjs", // AC-5 DESIGN.md value drift
      "docs/design-workflow.md", // AC-8 Figma connector + boundary
    ]) {
      assert.ok(has(dir, f), `nextjs: missing PLAN-005 file ${f}`);
    }
    // AC-2: the committed eslint config wires the Tailwind token-discipline plugin.
    assert.match(
      reads(dir, "eslint.config.mjs"),
      /eslint-plugin-tailwindcss/,
      "nextjs: eslint.config.mjs missing eslint-plugin-tailwindcss (AC-2)"
    );
    // Generated design files: infra-setup.sh must write/build/wire them.
    const infra = reads(dir, ".claude/scripts/infra-setup.sh");
    for (const marker of [
      "write_if_absent tokens.json", // AC-1 DTCG source of truth
      "style-dictionary.config.mjs", // AC-1 build config
      "npm install -D style-dictionary", // AC-1 dep
      "npm install -D impeccable", // AC-3 detector dep
      "write_if_absent .impeccable/config.json", // AC-3 detector ignores
      "waivers:check", // AC-4 in gate
      "design:drift", // AC-5 in gate
    ]) {
      assert.ok(infra.includes(marker), `nextjs: infra-setup.sh does not reference "${marker}"`);
    }
  } else {
    // Boundary: backends ship none of the design stack.
    for (const f of ["tokens.json", ".claude/hooks/impeccable-severity.json", "docs/design-workflow.md"]) {
      assert.ok(!has(dir, f), `${stack}: should NOT ship ${f} (design stack is frontend-only, AC-9)`);
    }
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
    assertDesignFiles(dir, stack);
    console.log(`  ✓ ${stack} scaffolded (${entries.length} top-level entries)`);
  } catch (err) {
    failures++;
    console.error(`  ✗ ${stack}: ${err instanceof Error ? err.message : err}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// A company layer must scaffold too — examples/company-layer/ is the format's only proof, so it
// is exercised here rather than merely documented (PLAN-008 AC-5).
{
  const dir = mkdtempSync(join(tmpdir(), "create-rigel-layer-"));
  const proj = join(dir, "svc");
  try {
    execFileSync("node", [CLI, proj, "--template", join(HERE, "..", "examples", "company-layer"), "--context", "billing"], { stdio: "pipe" });
    const manifest = JSON.parse(readFileSync(join(proj, ".rigel", "manifest.json"), "utf8"));
    assert.equal(manifest.template, "express", "layer extends express");
    assert.equal(manifest.layer?.name, "acme", "manifest records the layer");
    assert.ok(
      existsSync(join(proj, ".claude", "rules", "acme-security.md")),
      "layer managed/ file was overlaid",
    );
    assert.ok(
      manifest.ownership.managed.includes("eslint-rules/**"),
      "layer ownership globs merged into the manifest",
    );
    assert.ok(
      "eslint-rules/no-pii-in-logs.cjs" in manifest.files,
      "layer file is hashed as managed, so verify protects it",
    );
    assert.ok(
      existsSync(join(proj, "docs", "design-docs", "decisions", "ADR-000-acme-stack.md")),
      "layer seed/ file was written",
    );
    assert.ok(
      !("docs/design-docs/decisions/ADR-000-acme-stack.md" in manifest.files),
      "seed files are NOT managed — the team owns them",
    );

    // PLAN-009 distribution rule: whole business + whole glossary + whole map, OWN context only.
    const k = (p) => existsSync(join(proj, "knowledge", p));
    assert.ok(k("business/company.md"), "whole business context");
    assert.ok(k("business/capabilities/checkout.md"), "whole capabilities");
    assert.ok(k("domain/glossary/shipment.md") && k("domain/glossary/order.md"), "WHOLE glossary");
    assert.ok(k("map/services.json"), "whole map — offline cross-repo reasoning");
    assert.ok(k("domain/contexts/billing.md"), "its OWN bounded context");
    assert.ok(
      !k("domain/contexts/identity.md"),
      "another service's context must NOT be distributed (context bloat)",
    );
    console.log("  ✓ company layer scaffolded (base + managed overlay + seed)");
  } catch (err) {
    failures++;
    console.error(`  ✗ company layer: ${err instanceof Error ? err.message : err}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (failures > 0) {
  console.error(`\n${failures} scaffold check(s) failed.`);
  process.exit(1);
}
console.log("\nAll templates scaffolded successfully.");
