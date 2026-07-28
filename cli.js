#!/usr/bin/env node
// create-rigel — scaffold an agent-first, gate-enforced starter project.
// Zero runtime dependencies (Node builtins only), so it publishes with no build step.

import { readdir, cp, rename, mkdir, stat, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { buildManifest, resolveOwnership, MANIFEST_PATH } from "./lib/manifest.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(HERE, "templates");

const STACKS = {
  nextjs: "Next.js + React + TypeScript (frontend)",
  express: "Express + TypeScript + Sequelize (backend)",
  nestjs: "NestJS + TypeScript (backend)",
  fastapi: "FastAPI + Python (backend)",
};

function parseArgs(argv) {
  const args = { name: undefined, template: undefined };
  const rest = argv.slice(2);
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--template" || a === "-t") args.template = rest[++i];
    else if (a.startsWith("--template=")) args.template = a.split("=")[1];
    else if (!a.startsWith("-") && !args.name) args.name = a;
  }
  return args;
}

async function prompt(rl, question) {
  const answer = await rl.question(question);
  return answer.trim();
}

async function chooseStack(rl, preset) {
  if (preset && STACKS[preset]) return preset;
  if (preset) {
    console.error(`\n  Unknown template "${preset}". Available: ${Object.keys(STACKS).join(", ")}\n`);
  }
  console.log("\n  Which stack?\n");
  const keys = Object.keys(STACKS);
  keys.forEach((k, i) => console.log(`    ${i + 1}) ${k.padEnd(11)} ${STACKS[k]}`));
  console.log("");
  while (true) {
    const raw = await prompt(rl, "  Enter number (1-4): ");
    const idx = Number(raw) - 1;
    if (Number.isInteger(idx) && keys[idx]) return keys[idx];
    console.log("  Please enter a number between 1 and 4.");
  }
}

async function isNonEmptyDir(dir) {
  if (!existsSync(dir)) return false;
  const entries = await readdir(dir);
  return entries.length > 0;
}

// A scaffolded project must never inherit generated junk that happens to be sitting in the
// template dir on disk (LSN-0008). This is the LAST of three boundaries that each need it
// stated separately — .gitignore stops git, the package.json `files` negations stop npm pack,
// and this stops the copy. None of the three implies the others.
const GENERATED = [/(^|\/)__pycache__$/, /\.py[cod]$/, /\.tsbuildinfo$/, /(^|\/)node_modules$/, /(^|\/)\.next$/, /(^|\/)\.DS_Store$/];
const notGenerated = (src) => !GENERATED.some((re) => re.test(src));

// Write `.rigel/manifest.json` — the provenance record `rigel verify` and `rigel update` read.
async function writeManifest(target, stack) {
  const pkg = JSON.parse(readFileSync(join(HERE, "package.json"), "utf8"));
  const table = JSON.parse(readFileSync(join(HERE, "ownership.json"), "utf8"));
  const manifest = buildManifest({
    root: target,
    template: stack,
    version: pkg.version,
    source: { kind: "npm", spec: `${pkg.name}@${pkg.version}` },
    layer: null, // set by --template <giget-uri> (AC-4)
    answers: {},
    ownership: resolveOwnership(table, stack),
    now: new Date().toISOString(),
  });
  await mkdir(join(target, ".rigel"), { recursive: true });
  await writeFile(join(target, MANIFEST_PATH), JSON.stringify(manifest, null, 2) + "\n");
}

// npm ships templates with `gitignore` (not `.gitignore`, which npm strips).
// Restore the leading dot in the scaffolded project.
async function restoreDotfiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      await restoreDotfiles(full);
    } else if (e.name === "gitignore") {
      await rename(full, join(dir, ".gitignore"));
    } else if (e.name === "npmignore") {
      await rename(full, join(dir, ".npmignore"));
    }
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const rl = createInterface({ input, output });
  try {
    let name = args.name;
    if (!name) name = await prompt(rl, "\n  Project directory (\".\" for current): ");
    if (!name) {
      console.error("  No project directory given. Aborting.");
      process.exit(1);
    }
    const target = resolve(process.cwd(), name);

    if (name !== "." && (await isNonEmptyDir(target))) {
      console.error(`\n  Target "${name}" already exists and is not empty. Aborting.\n`);
      process.exit(1);
    }

    const stack = await chooseStack(rl, args.template);
    const source = join(TEMPLATES_DIR, stack);
    if (!existsSync(source)) {
      console.error(`\n  Template "${stack}" is missing from this package. Aborting.\n`);
      process.exit(1);
    }

    await mkdir(target, { recursive: true });
    await cp(source, target, { recursive: true, filter: notGenerated });
    await restoreDotfiles(target);

    // Stamp the canonical model-routing table into the project's .claude/ so
    // /build-layer role escalation can resolve worker/orchestrator roles at runtime.
    // One source of truth (repo root) — never a per-template copy that can drift.
    await cp(join(HERE, "model-routing.json"), join(target, ".claude", "model-routing.json"));

    // The return address (PLAN-008 AC-1). Written LAST, so its hashes cover everything above —
    // including the stamped model-routing.json. Without this a repo is permanently unreachable:
    // no `rigel verify`, no `rigel update`, ever. It cannot be added retroactively.
    await writeManifest(target, stack);

    const rel = name === "." ? "." : name;
    console.log(`\n  ✓ Scaffolded a "${stack}" project into ${rel}\n`);
    console.log("  Next steps:");
    if (name !== ".") console.log(`    cd ${name}`);
    console.log("    git init");
    console.log("    # open in Claude Code, then run the harness setup skill:");
    console.log("    #   /infra-setup      (generates src/ and installs deps)");
    console.log("    #   /write-roadmap → /write-spec → /write-plan → /build-layer\n");
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
