// Smoke test: scaffold every template into a temp dir and assert it lands correctly.
// Zero dependencies — runs on plain Node in CI.
import { execFileSync } from "node:child_process";
import { mkdtempSync, existsSync, readdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
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

// PLAN-013 AC-0: scaffolding must never write over a file it did not write. `create-rigel .` used
// to walk straight into a populated repo and `fs.cp`'s force:true default destroyed the user's
// .gitignore. Both layers of the fix are asserted: the CLI refuses, AND nothing was touched.
{
  const dir = mkdtempSync(join(tmpdir(), "create-rigel-nonempty-"));
  const sentinel = "node_modules\nMY-SECRET-IGNORE\n";
  writeFileSync(join(dir, ".gitignore"), sentinel);
  writeFileSync(join(dir, "README.md"), "# My Real Project\n");

  let refused = false;
  try {
    execFileSync("node", [CLI, dir, "--template", "express"], { stdio: "pipe" });
  } catch {
    refused = true;
  }
  assert.ok(refused, "scaffolding into a non-empty directory must fail, not proceed");
  assert.equal(
    readFileSync(join(dir, ".gitignore"), "utf8"),
    sentinel,
    "the user's .gitignore must be byte-identical — this is the data-loss regression",
  );
  assert.equal(readFileSync(join(dir, "README.md"), "utf8"), "# My Real Project\n");
  rmSync(dir, { recursive: true, force: true });
  console.log("  \u2713 refuses a non-empty target and preserves existing files");
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
    // PLAN-012: /debug must end in a regression test, and that is only true if the script and
    // the gate wiring actually ship. Assert both — a skill that references a missing script is
    // exactly the "documented but not enforced" failure this repo exists to prevent.
    {
      const py = stack === "fastapi";
      const script = py ? "scripts/debug_regression.py" : "scripts/debug-regression.mjs";
      assert.ok(has(dir, script), `${stack}: missing ${script}`);
      const skill = reads(dir, ".claude/skills/debug/SKILL.md");
      assert.match(skill, /debug[-_]regression/, `${stack}: /debug skill never invokes the regression recorder`);
      assert.match(skill, /red\b/, `${stack}: /debug skill does not record a RED proof before the fix`);
      const gate = py ? reads(dir, "scripts/gate.sh") : reads(dir, "package.json");
      const wired = py
        ? /debug_regression\.py check/.test(gate)
        : /debug:regression check/.test(gate) ||
          /debug:regression check/.test(reads(dir, ".claude/skills/00-infra-setup/SKILL.md"));
      assert.ok(wired, `${stack}: debug regression check is not wired into the gate`);
    }
    // PLAN-014: the migration prompt only works if the spec can declare it and the plan can act
    // on it. A skill that mentions `migrate:` with no Layer 0 to receive it is a dead end.
    {
      const skills = readdirSync(join(dir, ".claude/skills"));
      const specSkill = skills.find((s) => /write-spec$/.test(s));
      const planSkill = skills.find((s) => /write-plan$/.test(s));
      assert.ok(specSkill && planSkill, `${stack}: missing write-spec/write-plan skills`);
      assert.match(
        reads(dir, `.claude/skills/${specSkill}/SKILL.md`),
        /migrate: \[\]/,
        `${stack}: /write-spec's impact block cannot declare a migration`,
      );
      assert.match(
        reads(dir, `.claude/skills/${planSkill}/SKILL.md`),
        /Layer 0: Migrate/,
        `${stack}: /write-plan has nowhere to put a declared migration`,
      );
    }

    // PLAN-015: MCP declarations must ship WITH the checker that validates them. A .mcp.json
    // nothing verifies is a list of capabilities the agent may silently not have.
    {
      assert.ok(has(dir, ".mcp.json"), `${stack}: missing .mcp.json`);
      assert.ok(has(dir, "scripts/check-mcp.mjs"), `${stack}: missing scripts/check-mcp.mjs`);
      assert.ok(has(dir, "scripts/lib/rigel-mcp.mjs"), `${stack}: MCP lib was not stamped in`);
      const declared = JSON.parse(reads(dir, ".mcp.json")).mcpServers ?? {};
      assert.ok(Object.keys(declared).length > 0, `${stack}: .mcp.json declares nothing`);
      const gate = stack === "fastapi" ? reads(dir, "scripts/gate.sh") : reads(dir, "package.json");
      const wired =
        /check-mcp\.mjs|mcp:check/.test(gate) ||
        /mcp:check/.test(reads(dir, ".claude/skills/00-infra-setup/SKILL.md"));
      assert.ok(wired, `${stack}: mcp:check is not wired into the gate`);
    }

    // PLAN-016: the swallowed-error check must ship AND be invoked. Shipped-but-unwired is the
    // exact failure this project keeps rediscovering (LSN-0015) — a script in scripts/ that no
    // gate ever calls reads as a capability the repo does not actually have.
    {
      assert.ok(has(dir, "scripts/check-silent-failures.mjs"), `${stack}: missing scripts/check-silent-failures.mjs`);
      assert.ok(has(dir, "scripts/lib/rigel-silent.mjs"), `${stack}: silent-failure lib was not stamped in`);
      const gate = stack === "fastapi" ? reads(dir, "scripts/gate.sh") : reads(dir, "package.json");
      const wired =
        /check-silent-failures\.mjs|silent:check/.test(gate) ||
        /silent:check/.test(reads(dir, ".claude/skills/00-infra-setup/SKILL.md"));
      assert.ok(wired, `${stack}: silent:check is not wired into the gate`);
    }

    // PLAN-017: the blast-radius hook must ship AND be registered as a PreToolUse hook. A hook file
    // that settings.json never references is inert — it looks like a capability and is not one.
    {
      assert.ok(has(dir, ".claude/hooks/pre-edit-blast.mjs"), `${stack}: missing the blast-radius hook`);
      assert.ok(has(dir, "scripts/lib/rigel-blast.mjs"), `${stack}: blast lib was not stamped in`);
      const settings = JSON.parse(reads(dir, ".claude/settings.json"));
      const pre = settings.hooks?.PreToolUse ?? [];
      const registered = pre.some(
        (e) =>
          /Write|Edit/.test(e.matcher ?? "") &&
          (e.hooks ?? []).some((h) => /pre-edit-blast\.mjs/.test(h.command ?? "")),
      );
      assert.ok(registered, `${stack}: pre-edit-blast.mjs ships but no PreToolUse entry runs it`);
      // It must fail OPEN. A PreToolUse hook that fails closed blocks every edit and bricks the
      // session — the one place in this repo where failing loud is the wrong call.
      const hook = reads(dir, ".claude/hooks/pre-edit-blast.mjs");
      assert.match(hook, /catch \(e\)/, `${stack}: blast hook has no error path`);
      assert.match(hook, /edit allowed/, `${stack}: blast hook does not fail open`);
    }

    // PLAN-018: the resume block must ship AND be registered on SessionStart. Its whole value is
    // that it runs every time — a prose checklist is followed most of the time, which is the gap
    // it exists to close, so an unregistered hook is worth nothing at all.
    {
      assert.ok(has(dir, ".claude/hooks/session-start.mjs"), `${stack}: missing the session-start hook`);
      assert.ok(has(dir, "scripts/lib/rigel-resume.mjs"), `${stack}: resume lib was not stamped in`);
      const settings = JSON.parse(reads(dir, ".claude/settings.json"));
      const registered = (settings.hooks?.SessionStart ?? []).some((e) =>
        (e.hooks ?? []).some((h) => /session-start\.mjs/.test(h.command ?? "")),
      );
      assert.ok(registered, `${stack}: session-start.mjs ships but no SessionStart entry runs it`);
      // It must not write. A side effect at session start is the kind of surprise that gets a hook
      // deleted, and every input it reads is already on disk.
      const hook = reads(dir, ".claude/hooks/session-start.mjs");
      assert.ok(!/writeFile|appendFile|mkdirSync/.test(hook), `${stack}: session-start hook writes to disk`);
    }

    // PLAN-019: docs/mcp.md must agree with .mcp.json. A page that lists servers the repo does not
    // declare — or omits ones it does — is the only way this doc can actually mislead, and MCP moves
    // fast enough that it would happen silently.
    {
      assert.ok(has(dir, "docs/mcp.md"), `${stack}: missing docs/mcp.md`);
      const doc = reads(dir, "docs/mcp.md");
      const declared = Object.keys(JSON.parse(reads(dir, ".mcp.json")).mcpServers ?? {}).filter((k) => k !== "//");
      for (const name of declared) {
        assert.ok(doc.includes(name), `${stack}: ${name} is declared in .mcp.json but absent from docs/mcp.md`);
      }
      // The deprecated GitHub package must never be recommended as an install command.
      assert.ok(
        !/claude mcp add[^\n]*@modelcontextprotocol\/server-github/.test(doc),
        `${stack}: docs/mcp.md recommends the deprecated github MCP package`,
      );
    }

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
