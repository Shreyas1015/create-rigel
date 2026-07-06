// Smoke test: scaffold every template into a temp dir and assert it lands correctly.
// Zero dependencies — runs on plain Node in CI.
import { execFileSync } from "node:child_process";
import { mkdtempSync, existsSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, "..", "cli.js");
const STACKS = ["nextjs", "express", "nestjs", "fastapi"];

let failures = 0;
for (const stack of STACKS) {
  const dir = mkdtempSync(join(tmpdir(), `create-harness-${stack}-`));
  try {
    execFileSync("node", [CLI, dir, "--template", stack], { stdio: "pipe" });
    const entries = readdirSync(dir);
    assert.ok(entries.length > 0, `${stack}: target dir is empty`);
    assert.ok(existsSync(join(dir, ".gitignore")), `${stack}: .gitignore was not restored`);
    assert.ok(existsSync(join(dir, ".claude")), `${stack}: .claude workflow missing`);
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
