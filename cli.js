#!/usr/bin/env node
// create-rigel — scaffold an agent-first, gate-enforced starter project.
// Zero runtime dependencies (Node builtins only), so it publishes with no build step.

import { readdir, mkdir, writeFile, mkdtemp, rm, rename } from "node:fs/promises";
import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { buildManifest, resolveOwnership, readManifest, MANIFEST_PATH } from "./lib/manifest.mjs";
import { parseTemplateSpec, fetchLayer, readLayerConfig, applyLayer, mergeOwnership } from "./lib/layer.mjs";
import { extractFacts, aggregate, readCapabilities, queryMap, formatSlice, FACTS_PATH } from "./lib/map.mjs";
import { planInstall, install, summarizeInstall, coreCollisions, staleHarness } from "./lib/install.mjs";
import { diagnose, countBad, BLIND_SPOTS as DOCTOR_BLIND_SPOTS } from "./lib/doctor.mjs";
import { candidates } from "./lib/candidates.mjs";
import { buildIndex, resolveCorpus, REFS_PATH } from "./lib/design.mjs";
import {
  buildGraph, reverseGraph, dependents, changedFiles, sourceFiles,
  serviceImpact, touchesContract, unenforced, BLIND_SPOTS,
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

// Adoption is NARROWER than scaffolding. nextjs is scaffoldable but not adoptable — see the
// explanation at the refusal site in cmdAdopt.
const ADOPTABLE = ["express", "fastapi"];

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
async function writeManifest(target, stack, { layer = null, extraOwnership = {}, owned = null, baseline = [], mode = "greenfield" } = {}) {
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
    owned,
    baseline,
    mode,
    adoptedAt: mode === "brownfield" ? new Date().toISOString() : null,
  });
  await mkdir(join(target, ".rigel"), { recursive: true });
  await writeFile(join(target, MANIFEST_PATH), JSON.stringify(manifest, null, 2) + "\n");
  return Object.keys(manifest.files).length; // how many files Rigel actually owns and will verify
}

// ── `create-rigel adopt` — add Rigel to a repo it did not create (PLAN-013 AC-1) ──
//
// There is ONE model of a healthy Rigel repo and every repo has a distance from it; greenfield is
// simply the point where that distance is zero. So this shares `materialize` + the `install()`
// placement policy with the scaffold path rather than forking, and it NEVER asks "greenfield or
// brownfield?" — that is a fact about the directory, not a question for a human.

/** What state is this directory in? A fact, derived, then printed. */
function detectState(root) {
  if (!existsSync(root)) return "greenfield";
  if (readdirSync(root).length === 0) return "greenfield";
  if (existsSync(join(root, MANIFEST_PATH))) return "adopted";
  if (existsSync(join(root, ".rigel"))) return "stale-rigel"; // an older Rigel, drifted
  return "never-rigel";
}

/** Guess the stack from what's already here. Overridable with --template; never silently wrong. */
function detectStack(root) {
  const pkgPath = join(root, "package.json");
  if (existsSync(pkgPath)) {
    let deps = {};
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
      deps = { ...pkg.dependencies, ...pkg.devDependencies };
    } catch {
      /* unparseable package.json — fall through to "unknown" */
    }
    if (deps.next) return "nextjs";
    if (deps["@nestjs/core"]) return "nestjs";
    if (deps.express) return "express";
    return null;
  }
  if (existsSync(join(root, "pyproject.toml")) || existsSync(join(root, "requirements.txt"))) return "fastapi";
  return null;
}

async function cmdAdopt(argv) {
  const root = process.cwd();
  const dryRun = argv.includes("--dry-run");
  const forceCore = argv.includes("--force-core");
  const takeHarness = argv.includes("--take-harness");
  const state = detectState(root);

  if (state === "adopted") {
    console.error(`\n  This repo already has ${MANIFEST_PATH}.`);
    console.error("  To bring it up to the current template:  npx create-rigel update\n");
    process.exit(2);
  }

  const stack = argFor(argv, "--template") ?? detectStack(root);
  if (!stack) {
    console.error("\n  Could not tell which stack this repo is.");
    console.error(`  Pass one explicitly:  npx create-rigel adopt --template <${ADOPTABLE.join("|")}>\n`);
    process.exit(2);
  }
  if (!ADOPTABLE.includes(stack)) {
    console.error(`\n  Cannot adopt into a "${stack}" repo yet.`);
    if (stack === "nextjs") {
      // A GENERATED template: its arch tests and acceptance holdout are written by infra-setup.sh,
      // not shipped in the tree (test/smoke.mjs already encodes this). materialize() therefore
      // produces an INCOMPLETE nextjs repo, so adopting one would install a harness that claims
      // checks it does not actually have — a false green by construction.
      console.error("  nextjs's harness is partly generated by /infra-setup rather than shipped, so");
      console.error("  adopting it would install checks that do not exist yet.");
    }
    console.error(`  Adoption supports: ${ADOPTABLE.join(", ")}\n`);
    process.exit(2);
  }

  console.log(`\n  Detected: ${state} · ${stack}${argFor(argv, "--template") ? " (you specified the stack)" : " (from this repo)"}`);

  const staged = await mkdtemp(join(tmpdir(), "rigel-adopt-"));
  try {
    await materialize(HERE, stack, staged);
    const plan = planInstall(staged, root);

    const core = coreCollisions(plan);
    if (core.length && !forceCore) {
      console.error("\n  ✗ Cannot adopt: these files decide whether Rigel's own checks mean anything,");
      console.error("    and yours differ from Rigel's:\n");
      for (const p of core) console.error(`      ${p}`);
      console.error("\n    Leaving yours in place would make `verify:rigel` report on something other than");
      console.error("    Rigel's contract — every green after that would be meaningless. Nothing was written.");
      console.error("\n    To move yours aside and take Rigel's:  npx create-rigel adopt --force-core\n");
      process.exit(2);
    }

    console.log("");
    console.log(summarizeInstall(plan) || "  Nothing to place — already complete.");

    // A repo an OLDER Rigel scaffolded has stale copies of shipped harness scripts. They are
    // declined like anything else, but silence here would leave NEW scripts importing an OLD shared
    // library — which fails later, somewhere unrelated, and looks like a Rigel bug.
    const stale = staleHarness(plan)
    if (stale.length && !takeHarness) {
      console.log("");
      console.log(`  ! ${stale.length} Rigel harness file(s) here are older than this version and were left as-is:`);
      for (const p of stale.slice(0, 8)) console.log(`      ${p}`);
      if (stale.length > 8) console.log(`      … and ${stale.length - 8} more`);
      console.log("    New scripts may expect the newer versions. To take Rigel's copies");
      console.log("    (yours are saved as <path>.pre-rigel):  npx create-rigel adopt --take-harness");
    }

    if (dryRun) {
      console.log("\n  (--dry-run: nothing was written)\n");
      return;
    }

    const takeOver = [...(forceCore ? core : []), ...(takeHarness ? stale : [])];
    for (const p of takeOver) {
      await rename(join(root, p), join(root, `${p}.pre-rigel`));
      console.log(`  · moved yours to ${p}.pre-rigel`);
      plan.added.push(p);
      plan.declined = plan.declined.filter((x) => x !== p);
    }

    const placed = await install(staged, root, plan);
    const owned = await writeManifest(root, stack, { owned: placed, baseline: plan.declined, mode: "brownfield" });

    // "placed" and "owned" are different numbers and conflating them would overstate what Rigel
    // enforces: only `managed` files land in manifest.files: seed files (README, configs) become the
    // team's the moment they're written, and user paths were never Rigel's.
    console.log(`\n  ✓ Adopted. ${placed.length} file(s) placed, of which Rigel owns and verifies ${owned}.`);
    console.log(`    ${plan.declined.length} pre-existing file(s) are yours and stay that way.`);
    console.log("  Review with `git diff` / `git status` — nothing you had was rewritten.\n");
    printGateWiring(root, stack);
  } finally {
    await rm(staged, { recursive: true, force: true });
  }
}

/**
 * `package.json` is class `seed` — the team owns it — so adoption declines it, which means an
 * adopted repo has no `gate` script and nothing enforcing anything. Print the block and let a human
 * paste it: silently editing a seed file would break the very ownership contract adoption
 * establishes. If they skip it, `doctor` says the harness is present but not wired, in those words.
 */
function printGateWiring(root, stack) {
  if (stack === "fastapi") {
    console.log("  One more step — the gate is not wired yet. Run it with:");
    console.log("      bash scripts/gate.sh\n");
    return;
  }
  const pkgPath = join(root, "package.json");
  if (!existsSync(pkgPath)) return;
  let scripts = {};
  try {
    scripts = JSON.parse(readFileSync(pkgPath, "utf8")).scripts ?? {};
  } catch {
    return;
  }
  if (scripts.gate) return;
  console.log("  One more step. Rigel will not edit your package.json — it's yours. Add:\n");
  console.log('      "verify:rigel":     "node scripts/rigel-verify.mjs",');
  console.log('      "knowledge":        "node scripts/rigel-knowledge.mjs",');
  console.log('      "debug:regression": "node scripts/debug-regression.mjs",');
  console.log('      "contract:gate":    "node scripts/contract-gate.mjs",');
  console.log('      "gate":             "npm run verify:rigel && npm run knowledge && npm run debug:regression check"');
  console.log("\n  Until then the harness is present but nothing runs it. `create-rigel doctor` will say so.\n");
}



// ── `create-rigel candidates` — the deterministic half of /backfill-knowledge ──
// Read-only, exit 0. The skill shells out to this rather than grepping, for the same reason
// /curate shells out to curate-scan.mjs: derivation in prose gets improvised.
function cmdCandidates(argv) {
  const root = process.cwd();
  const limit = Number(argFor(argv, "--limit") ?? 10);
  const found = candidates(root, { limit });

  if (argv.includes("--json")) {
    console.log(JSON.stringify({ candidates: found }, null, 2));
    return;
  }
  console.log("");
  if (!found.length) {
    console.log("  No glossary candidates found — no defined types, or they are all documented already.\n");
    return;
  }
  console.log(`  ${found.length} candidate term(s), domain layers first, then by fan-in:\n`);
  for (const c of found) {
    console.log(`      ${c.symbol.padEnd(24)} ${c.file}  (${c.fanIn} importer${c.fanIn === 1 ? "" : "s"})`);
  }
  console.log("\n  Each is DEFINED where shown, so an anchor on it will resolve.");
  console.log("  The definition, owner and business meaning are yours to write — run /backfill-knowledge.\n");
}

// ── `create-rigel doctor` — how far is this repo from a healthy Rigel repo? ──
//
// ALWAYS exits 0, like `impact`. A brownfield repo will light up on day one; a red exit there
// teaches "rigel is broken" and gets it switched off, taking the working gates with it. `--strict`
// exists for a team that wants it in their OWN ci, and Rigel wires it into nothing.
//
// Read-only, and works in a repo with zero Rigel files — so running it BEFORE adopting is the
// "what would this take" preview. One engine, not two.
const MARK = { ok: "✓", note: "!", bad: "✗" };

async function cmdDoctor(argv) {
  const root = process.cwd();
  const asJson = argv.includes("--json");
  const strict = argv.includes("--strict");
  const state = detectState(root);

  // Not adopted yet? Then the most useful thing to show is what adoption WOULD do.
  let plan = null;
  let staged = null;
  if (state !== "adopted") {
    const stack = argFor(argv, "--template") ?? detectStack(root);
    if (stack && ADOPTABLE.includes(stack)) {
      staged = await mkdtemp(join(tmpdir(), "rigel-doctor-"));
      await materialize(HERE, stack, staged);
      plan = planInstall(staged, root);
    }
  }

  try {
    const report = diagnose(root, { plan });

    if (asJson) {
      console.log(JSON.stringify({ ...report, baseline: readManifest(root)?.baseline ?? [] }, null, 2));
      return;
    }

    console.log("");
    console.log(`  DETECTED      ${report.state}${report.template ? ` · ${report.template}` : ""}${report.mode ? ` · ${report.mode}` : ""}`);
    if (report.state !== "adopted") console.log("                not adopted yet — the sections below are what adoption would give you");

    for (const section of report.sections) {
      if (!section.findings.length) continue;
      console.log("");
      console.log(`  ${section.label}`);
      for (const f of section.findings) {
        console.log(`    ${MARK[f.state]} ${f.detail}`);
        if (f.fix && f.state !== "ok") console.log(`        → ${f.fix}`);
      }
    }

    console.log("");
    console.log("  NOT VISIBLE HERE — check these yourself:");
    for (const b of DOCTOR_BLIND_SPOTS) console.log(`      · ${b}`);

    const bad = countBad(report);
    console.log("");
    console.log(bad ? `  ${bad} thing(s) need attention.` : "  Nothing needs attention.");
    console.log("  This is a lens, not a gate. The gates are what block.\n");

    if (strict && bad) process.exit(1);
  } finally {
    if (staged) await rm(staged, { recursive: true, force: true });
  }
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
    // `written` is what this update actually placed. Without it the manifest would re-claim
    // everything matching a managed glob, including files the user wrote themselves.
    const written = [...plan.overwrite, ...plan.added];
    const next = rewriteManifest({ manifest, version: pkg.version, root, ownership, written });
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
    console.log(JSON.stringify({ changed, dependents: levels, service: svc, contractTouched, migratable: unenforced([...changed, ...levels.flat()]), blindSpots: BLIND_SPOTS }, null, 2));
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

  // PLAN-014 — the migration prompt, at the ONE moment it can be acted on cheaply.
  //
  // Rigel's rules are path-scoped, so code outside its layers is simply ungoverned. Closing that gap
  // as a planned "restructure the repo" project does not happen: developers already spend ~84% of
  // their time on maintenance and debt outpaces paydown, so the budget never arrives. A ground-up
  // rewrite is worse — the single worst strategic mistake a software team can make.
  //
  // What DOES happen is migrating a file you are already editing. So this names the ungoverned files
  // THIS change touches, while the author is in them. It never nags about the rest of the repo —
  // `doctor` reports that total, deliberately somewhere else.
  const migratable = unenforced([...changed, ...levels.flat()]);
  console.log("");
  if (migratable.length === 0) {
    console.log("  MIGRATION     nothing here is outside Rigel's enforced layers");
  } else {
    console.log(`  MIGRATION     ${migratable.length} file(s) this change touches are NOT governed by`);
    console.log("                Rigel's layer rules or coverage thresholds:");
    for (const f of migratable.slice(0, 8)) console.log(`      ${f}`);
    if (migratable.length > 8) console.log(`      … and ${migratable.length - 8} more`);
    console.log("");
    console.log("    You are already in this code — moving it under a layer now costs a fraction of");
    console.log("    a separate migration project. Declare it in the spec's impact block:");
    console.log(`        migrate: [${migratable.slice(0, 2).map((f) => `"${f}"`).join(", ")}${migratable.length > 2 ? ", …" : ""}]`);
    console.log("    Not now? docs/exec-plans/tech-debt-tracker.md is where it waits.");
  }

  console.log("\n  NOT VISIBLE HERE — check these yourself:");
  for (const b of BLIND_SPOTS) console.log(`      · ${b}`);
  console.log("\n  This is a lens, not a gate. Breaking changes are enforced by the contract gate.\n");
}

// ── `create-rigel design-index [path]` — PLAN-023 AC-2 ──────────────────────────
// Walks a markdown corpus and records every note's headings as citable anchors. Committing that
// index is what makes citation checking OFFLINE: the gate then verifies a design decision's
// reference without the corpus being present, so CI and a teammate who has never cloned the
// reference library both stay green.
//
// Headings only — never body text. That keeps the index small enough to commit and means it carries
// no content from whatever corpus produced it.
function cmdDesignIndex(argv) {
  const root = process.cwd();
  const given = argv.find((a) => !a.startsWith("-"));
  const bundled = join(HERE, "reference");

  const corpus = given
    ? { path: resolve(given), source: "argument" }
    : resolveCorpus(root, { bundled });

  if (!corpus.path || !existsSync(corpus.path)) {
    console.error(`  No corpus found${given ? `: ${given}` : ""}.`);
    console.error(`
    Point at one explicitly:      npx create-rigel design-index ~/notes/my-notes
    or set it for every project:  export RIGEL_NOTES_PATH=~/notes/my-notes
    or pin it for this project:   ${REFS_PATH}  →  { "corpus": "/abs/path" }
`);
    process.exit(1);
  }

  const idx = buildIndex(corpus.path);
  if (!idx.count) {
    console.error(`  ${corpus.path} contains no .md files — nothing to index.`);
    process.exit(1);
  }

  const out = join(root, REFS_PATH);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ corpus: corpus.path, generatedFrom: idx.count, files: idx.files }, null, 0) + "\n");

  const kb = (statSync(out).size / 1024).toFixed(0);
  console.log(`  ✓ indexed ${idx.count} note(s), ${idx.anchors} citable section(s)  (source: ${corpus.source})`);
  console.log(`    ${corpus.path}`);
  console.log(`    → ${REFS_PATH}  (${kb} KB — commit this)`);
  console.log(`
    Design decisions can now cite  note.md#section  and the gate will verify it.
    Re-run this after the corpus changes.
`);
  process.exit(0);
}

async function main() {
  // Subcommands run inside an existing project; anything else scaffolds a new one.
  const sub = process.argv[2];
  if (sub === "update") return cmdUpdate(process.argv.slice(3));
  if (sub === "facts") return cmdFacts();
  if (sub === "map:build") return cmdMapBuild(process.argv.slice(3));
  if (sub === "map") return cmdMap(process.argv.slice(3));
  if (sub === "impact") return cmdImpact(process.argv.slice(3));
  if (sub === "adopt") return cmdAdopt(process.argv.slice(3));
  if (sub === "doctor") return cmdDoctor(process.argv.slice(3));
  if (sub === "candidates") return cmdCandidates(process.argv.slice(3));
  if (sub === "design-index") return cmdDesignIndex(process.argv.slice(3));
  // The MCP server is launched by .mcp.json as `npx -y create-rigel mcp-design-notes`, so the
  // scaffolder itself is the entry point — one package to install, nothing extra to publish.
  if (sub === "mcp-design-notes") return import(join(HERE, "mcp", "design-notes.mjs"));

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

    // The guard is unconditional. It used to skip `.`, which meant `create-rigel .` walked straight
    // into a populated repo — the path that destroyed people's .gitignore. install() is the real
    // fix (it declines rather than clobbers); this is the belt to its braces, and it points at the
    // command that IS meant for an existing repo instead of just refusing.
    if (await isNonEmptyDir(target)) {
      const where = name === "." ? "The current directory" : `Target "${name}"`;
      console.error(`\n  ${where} is not empty.`);
      console.error("  `create-rigel` scaffolds into an empty directory and will not write over your files.");
      console.error("\n  To add Rigel to an existing repo:  npx create-rigel adopt");
      console.error("  See what it would do first:         npx create-rigel adopt --dry-run\n");
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
    //
    // PLAN-013 AC-0: materialise to a TEMP dir (exactly as `update` does), then place through
    // `install()`. Copying straight onto `target` meant `fs.cp`'s force:true default silently
    // overwrote whatever was already there — `create-rigel .` in a real repo destroyed the user's
    // .gitignore. install() declines any pre-existing file that differs, so nothing is ever
    // clobbered and Rigel only claims what it actually wrote.
    const staged = await mkdtemp(join(tmpdir(), "rigel-scaffold-"));
    let placed;
    try {
      await materialize(HERE, stack, staged);
      const plan = planInstall(staged, target);
      placed = await install(staged, target, plan);
      if (plan.declined.length) {
        console.log("");
        console.log(summarizeInstall(plan));
      }
    } finally {
      await rm(staged, { recursive: true, force: true });
    }

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
