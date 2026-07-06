#!/usr/bin/env node
// create-harness — scaffold an agent-first, gate-enforced starter project.
// Zero runtime dependencies (Node builtins only), so it publishes with no build step.

import { readdir, cp, rename, mkdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

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
    await cp(source, target, { recursive: true });
    await restoreDotfiles(target);

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
