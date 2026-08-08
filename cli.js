#!/usr/bin/env node
// create-rigel — scaffold an agent-first, gate-enforced starter project.
// Zero runtime dependencies (Node builtins only), so it publishes with no build step.

import { readdir, mkdir, writeFile, mkdtemp, rm } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { buildManifest, resolveOwnership, readManifest, MANIFEST_PATH } from "./lib/manifest.mjs";
import { parseTemplateSpec, fetchLayer, readLayerConfig, applyLayer, mergeOwnership } from "./lib/layer.mjs";
import { extractFacts, aggregate, readCapabilities, queryMap, formatSlice, FACTS_PATH } from "./lib/map.mjs";
import {
  buildGraph, reverseGraph, dependents, changedFiles, sourceFiles,
  serviceImpact, touchesContract, BLIND_SPOTS,
} from "./lib/impact.mjs";
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

// Scaffoldable stacks. `nestjs` is deliberately ABSENT: it is unmaintained for now and stays
// undocumented and unselectable. Its files still ship in `templates/nestjs` on purpose — `update`
// resolves the template from `.rigel/manifest.json`, not from this table, so anyone who already
// scaffolded nestjs keeps a working day-2 path. Re-listing it here is all it takes to bring back.
const STACKS = {
  nextjs: "Next.js + React + TypeScript (frontend)",
  express: "Express + TypeScript + Sequelize (backend)",
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
  // Derived from `keys`, never hardcoded — the range drifts the moment a stack is added or delisted.
  while (true) {
    const raw = await prompt(rl, `  Enter number (1-${keys.length}): `);
    const idx = Number(raw) - 1;
    if (Number.isInteger(idx) && keys[idx]) return keys[idx];
    console.log(`  Please enter a number between 1 and ${keys.length}.`);
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


// ── `create-rigel facts` — publish THIS repo's own facts (PLAN-009 AC-3) ──
// A repo only ever asserts things about itself. Everything here is derived from an artifact that
// already exists, because anything a human must remember to update is already wrong.
async function cmdFacts() {
  const root = process.cwd();
  const manifest = readManifest(root);
  if (!manifest) {
    console.error(`\n  ✗ No ${MANIFEST_PATH} here — run this inside a Rigel project.\n`);
    process.exit(2);
  }
  const service = basename(root);
  const facts = extractFacts(root, {
    service,
    template: manifest.template,
    now: new Date().toISOString().slice(0, 10),
  });
  await mkdir(join(root, ".rigel"), { recursive: true });
  await writeJson(join(root, FACTS_PATH), facts);
  console.log(`\n  ✓ ${FACTS_PATH}`);
  console.log(`      provides  ${facts.provides.map((p) => p.api).join(", ") || "—"}`);
  console.log(`      consumes  ${facts.consumes.map((c) => c.api).join(", ") || "—"}`);
  console.log(`      infra     ${facts.deps.join(", ") || "—"}`);
  console.log(`\n  Commit this, then copy it into your company layer as facts/${service}.json`);
  console.log("  and run `create-rigel map:build` there.\n");
}

// ── `create-rigel map:build` — aggregate every service's facts into the index (layer side) ──
async function cmdMapBuild(argv) {
  const root = process.cwd();
  const factsDir = join(root, argFor(argv, "--facts") ?? "facts");
  const outDir = join(root, "knowledge", "map");
  if (!existsSync(factsDir)) {
    console.error(`\n  ✗ No ${factsDir} — each service commits its .rigel/service.json there as <service>.json\n`);
    process.exit(2);
  }
  const files = (await readdir(factsDir)).filter((f) => f.endsWith(".json"));
  const factsList = files.map((f) => JSON.parse(readFileSync(join(factsDir, f), "utf8")));
  const capabilities = readCapabilities(join(root, "knowledge", "business", "capabilities"));
  const map = aggregate(factsList, { capabilities, now: new Date().toISOString().slice(0, 10) });

  await mkdir(outDir, { recursive: true });
  await writeJson(join(outDir, "services.json"), map);
  await writeJson(join(outDir, "capabilities.json"), {
    "//": "GENERATED by `rigel map:build` — do not edit.",
    generatedAt: map.generatedAt,
    capabilities,
  });
  console.log(`\n  ✓ knowledge/map/  ${factsList.length} service(s), ${Object.keys(capabilities).length} capabilit(ies)`);
  console.log("  Commit it; `create-rigel update` distributes it to every service.\n");
}

// ── `create-rigel map [service]` — the slice, never the whole file ──
async function cmdMap(argv) {
  const root = process.cwd();
  const mapPath = join(root, "knowledge", "map", "services.json");
  if (!existsSync(mapPath)) {
    console.error("\n  ✗ No knowledge/map/services.json — this repo has no company map yet.");
    console.error("    It arrives from your company layer via `create-rigel update`.\n");
    process.exit(2);
  }
  const map = JSON.parse(readFileSync(mapPath, "utf8"));
  const caps = existsSync(join(root, "knowledge", "map", "capabilities.json"))
    ? JSON.parse(readFileSync(join(root, "knowledge", "map", "capabilities.json"), "utf8")).capabilities
    : {};
  const service = argv.find((a) => !a.startsWith("-")) ?? basename(root);

  const slice = queryMap(map, service);
  if (!slice) {
    console.error(`\n  ✗ "${service}" is not in the map. Known: ${Object.keys(map.services).join(", ")}\n`);
    process.exit(1);
  }
  console.log("\n" + formatSlice(slice, caps) + "\n");
}

function argFor(argv, flag) {
  const i = argv.indexOf(flag);
  return i === -1 ? undefined : argv[i + 1];
}


// ── `create-rigel impact` — the blast-radius LENS (PLAN-011 AC-1) ──
// ALWAYS exits 0. Impact analysis over-reports by construction, and a cry-wolf gate would cost us
// the gates that work. Exactness lives in the contract gate; this supplies context.
async function cmdImpact(argv) {
  const root = process.cwd();
  const asJson = argv.includes("--json");
  const depth = Number(argFor(argv, "--depth") ?? 2);
  const explicit = argFor(argv, "--paths");
  const base = argFor(argv, "--base");

  const changed = explicit
    ? explicit.split(",").map((s) => s.trim()).filter(Boolean)
    : changedFiles(root, base);

  const rev = reverseGraph(buildGraph(root));
  const levels = changed.length ? dependents(rev, changed, depth) : [];
  const service = basename(root);
  const svc = serviceImpact(root, service);
  const contractTouched = touchesContract(changed);

  if (asJson) {
    console.log(JSON.stringify({ changed, dependents: levels, service: svc, contractTouched, blindSpots: BLIND_SPOTS }, null, 2));
    return;
  }

  console.log("");
  if (!changed.length) {
    console.log("  No changed source files. Pass --paths <a,b> to ask about specific files.\n");
    return;
  }

  console.log(`  CHANGED       ${changed.length} file(s)`);
  for (const c of changed.slice(0, 12)) console.log(`      ${c}`);
  if (changed.length > 12) console.log(`      … and ${changed.length - 12} more`);

  const total = levels.flat().length;
  console.log("");
  if (total === 0) {
    console.log("  IN-REPO       nothing else imports these");
  } else {
    console.log(`  IN-REPO       ${total} file(s) depend on them (depth ${depth})`);
    levels.forEach((lvl, i) => {
      console.log(`    ${i === 0 ? "direct " : `+${i + 1} hop`}    ${lvl.length}`);
      for (const f of lvl.slice(0, 8)) console.log(`      ${f}`);
      if (lvl.length > 8) console.log(`      … and ${lvl.length - 8} more`);
    });
  }

  console.log("");
  if (svc?.unknownService) {
    console.log(`  SERVICES      "${svc.unknownService}" is not in the map yet — run \`create-rigel facts\``);
  } else if (!svc) {
    console.log("  SERVICES      no company map in this repo (knowledge/map/services.json)");
  } else if (svc.consumedBy.length && contractTouched) {
    console.log(`  SERVICES      ⚠ this change touches the contract, and ${svc.consumedBy.length} service(s) consume it:`);
    for (const c of svc.consumedBy) console.log(`      ${c}`);
  } else if (svc.consumedBy.length) {
    console.log(`  SERVICES      ${svc.consumedBy.length} consumer(s) exist, but no route/contract file changed:`);
    for (const c of svc.consumedBy) console.log(`      ${c}`);
  } else {
    console.log("  SERVICES      nothing in the map consumes this service");
  }

  for (const c of svc?.capabilities ?? []) {
    const kpi = c.kpi ? `  KPI ${c.kpi}${c.owner ? ` (${c.owner})` : ""}` : "";
    console.log(`  BUSINESS      ${c.name}${kpi}`);
  }

  console.log("\n  NOT VISIBLE HERE — check these yourself:");
  for (const b of BLIND_SPOTS) console.log(`      · ${b}`);
  console.log("\n  This is a lens, not a gate. Breaking changes are enforced by the contract gate.\n");
}

async function main() {
  // Subcommands run inside an existing project; anything else scaffolds a new one.
  const sub = process.argv[2];
  if (sub === "update") return cmdUpdate(process.argv.slice(3));
  if (sub === "facts") return cmdFacts();
  if (sub === "map:build") return cmdMapBuild(process.argv.slice(3));
  if (sub === "map") return cmdMap(process.argv.slice(3));
  if (sub === "impact") return cmdImpact(process.argv.slice(3));

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
