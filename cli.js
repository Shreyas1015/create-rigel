#!/usr/bin/env node
// create-rigel — scaffold an agent-first, gate-enforced starter project.
// Zero runtime dependencies (Node builtins only), so it publishes with no build step.

import { readdir, mkdir, writeFile, mkdtemp, rm } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { buildManifest, resolveOwnership, readManifest, MANIFEST_PATH } from "./lib/manifest.mjs";
import { parseTemplateSpec, fetchLayer, readLayerConfig, applyLayer, mergeOwnership } from "./lib/layer.mjs";
import {
  materialize,
  planUpdate,
  applyUpdate,
  summarize,
  rewriteManifest,
  hashTree,
  managedOnly,
  writeJson,
} from "./lib/update.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(HERE, "templates");

const STACKS = {
  nextjs: "Next.js + React + TypeScript (frontend)",
  express: "Express + TypeScript + Sequelize (backend)",
  nestjs: "NestJS + TypeScript (backend)",
  fastapi: "FastAPI + Python (backend)",
};

function parseArgs(argv) {
  const args = { name: undefined, template: undefined, context: undefined };
  const rest = argv.slice(2);
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--template" || a === "-t") args.template = rest[++i];
    else if (a.startsWith("--template=")) args.template = a.split("=")[1];
    else if (a === "--context") args.context = rest[++i];
    else if (a.startsWith("--context=")) args.context = a.split("=")[1];
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

// Write `.rigel/manifest.json` — the provenance record `rigel verify` and `rigel update` read.
async function writeManifest(target, stack, { layer = null, extraOwnership = {} } = {}) {
  const pkg = JSON.parse(readFileSync(join(HERE, "package.json"), "utf8"));
  const table = JSON.parse(readFileSync(join(HERE, "ownership.json"), "utf8"));
  const manifest = buildManifest({
    root: target,
    template: stack,
    version: pkg.version,
    source: { kind: "npm", spec: `${pkg.name}@${pkg.version}` },
    layer,
    answers: {},
    ownership: mergeOwnership(resolveOwnership(table, stack), extraOwnership),
    now: new Date().toISOString(),
  });
  await mkdir(join(target, ".rigel"), { recursive: true });
  await writeFile(join(target, MANIFEST_PATH), JSON.stringify(manifest, null, 2) + "\n");
}

// ── `create-rigel update` — bring an existing scaffold forward (PLAN-008 AC-3) ──
async function cmdUpdate(argv) {
  const root = process.cwd();
  const dryRun = argv.includes("--dry-run");
  const allowDirty = argv.includes("--allow-dirty");
  const conflictMode = argv.includes("--conflict=theirs") ? "theirs" : "sidecar";

  const manifest = readManifest(root);
  if (!manifest) {
    console.error(`\n  ✗ No ${MANIFEST_PATH} here — this isn't a Rigel project (or it predates provenance).\n`);
    process.exit(2);
  }

  // The whole update must land as one reviewable diff. A dirty tree makes "what did Rigel change?"
  // unanswerable, which is the only review mechanism there is.
  if (!allowDirty && !dryRun) {
    try {
      const dirty = execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim();
      if (dirty) {
        console.error("\n  ✗ Working tree is dirty. Commit or stash first, or pass --allow-dirty.");
        console.error("    The update should land as one reviewable `git diff`.\n");
        process.exit(2);
      }
    } catch {
      /* not a git repo — nothing to protect */
    }
  }

  const pkg = JSON.parse(readFileSync(join(HERE, "package.json"), "utf8"));
  const stack = manifest.template;
  const ownership = manifest.ownership;

  const theirsDir = await mkdtemp(join(tmpdir(), "rigel-update-"));
  try {
    await materialize(HERE, stack, theirsDir);

    const theirs = managedOnly(hashTree(theirsDir), ownership);
    const mine = managedOnly(hashTree(root), ownership);
    const plan = planUpdate({
      recorded: manifest.files ?? {},
      mine,
      theirs,
      deletedByUser: manifest.deletedByUser ?? [],
    });

    const total = plan.overwrite.length + plan.added.length + plan.removed.length + plan.conflict.length;
    console.log(`\n  ${manifest.template}  ${manifest.updatedWith} → ${pkg.version}\n`);
    const summary = summarize(plan);
    console.log(summary || "  Already up to date — nothing to change.\n");

    if (dryRun) {
      console.log("\n  (--dry-run: nothing was written)\n");
      return;
    }
    if (total === 0) return;

    await applyUpdate({ root, theirsDir, plan, conflictMode });
    const next = rewriteManifest({ manifest, version: pkg.version, root, ownership });
    next.deletedByUser = [...new Set([...(manifest.deletedByUser ?? []), ...plan.skippedDeleted])].sort();
    await writeJson(join(root, MANIFEST_PATH), next);

    console.log(`\n  ✓ Updated to ${pkg.version}. Review with \`git diff\`, then commit.`);
    if (plan.conflict.length) {
      console.log(`  ⚠ ${plan.conflict.length} conflict(s): compare each *.rigel-new with the original,`);
      console.log("    take what you want, then delete the sidecar (the gate fails while any remain).");
    }
    console.log("");
  } finally {
    await rm(theirsDir, { recursive: true, force: true });
  }
}

async function main() {
  // Subcommands run inside an existing project; anything else scaffolds a new one.
  if (process.argv[2] === "update") return cmdUpdate(process.argv.slice(3));

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

    // --template may name a built-in stack OR point at a company layer (git URI / local dir).
    const parsed = parseTemplateSpec(args.template, Object.keys(STACKS));
    if (parsed.kind === "unknown") {
      console.error(`\n  Unrecognised --template "${args.template}".`);
      console.error(`  Use a built-in (${Object.keys(STACKS).join(", ")}) or a layer (gh:org/repo#sha, a git URL, or a path).\n`);
      process.exit(1);
    }

    let stack, layer = null, extraOwnership = {}, layerDir = null;
    if (parsed.kind === "builtin") {
      stack = await chooseStack(rl, parsed.stack);
    } else {
      layerDir = await mkdtemp(join(tmpdir(), "rigel-layer-"));
      console.log(`\n  Fetching company layer ${parsed.spec} …`);
      const fetched = fetchLayer(parsed, layerDir);
      const cfg = readLayerConfig(layerDir);
      stack = cfg.extends;
      if (!STACKS[stack]) {
        console.error(`\n  Layer "${cfg.name ?? parsed.spec}" extends unknown template "${stack}".\n`);
        process.exit(1);
      }
      extraOwnership = cfg.ownership ?? {};
      layer = { uri: parsed.spec, url: fetched.url, sha: fetched.sha, name: cfg.name ?? null };
    }

    const source = join(TEMPLATES_DIR, stack);
    if (!existsSync(source)) {
      console.error(`\n  Template "${stack}" is missing from this package. Aborting.\n`);
      process.exit(1);
    }

    // Scaffold and update share ONE materialisation path (lib/update.mjs). If they diverged, an
    // update would compare against files a scaffold never actually produced.
    await materialize(HERE, stack, target);

    if (layerDir) {
      // --context selects which bounded-context doc this service receives; default to its own
      // directory name, which is right often enough to be worth trying and harmless when wrong.
      const context = args.context ?? (name === "." ? null : name.split("/").pop());
      const w = await applyLayer(layerDir, target, { context });
      await rm(layerDir, { recursive: true, force: true });
      let msg = `  ✓ Layer applied: ${w.managed.length} managed, ${w.seed.length} seed`;
      if (w.knowledge.length) msg += `, ${w.knowledge.length} knowledge`;
      console.log(msg + " file(s)");
      if (w.knowledge.length && !w.knowledge.some((p) => p.startsWith("domain/contexts/"))) {
        console.log(`  · no bounded-context doc for "${context}" — pass --context <name> if one exists`);
      }
    }

    // The return address (PLAN-008 AC-1). Written LAST, so its hashes cover everything above —
    // including the stamped model-routing.json. Without this a repo is permanently unreachable:
    // no `rigel verify`, no `rigel update`, ever. It cannot be added retroactively.
    await writeManifest(target, stack, { layer, extraOwnership });

    const rel = name === "." ? "." : name;
    const what = layer ? `"${layer.name ?? stack}" (${stack} + company layer)` : `a "${stack}" project`;
    console.log(`\n  ✓ Scaffolded ${what} into ${rel}\n`);
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
