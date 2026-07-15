#!/usr/bin/env node
// check-model-routing — assert (or regenerate) every agent's `model:` frontmatter
// against the single source of truth in model-routing.json.
//
//   node scripts/check-model-routing.js          # check only; exit 1 on any drift
//   node scripts/check-model-routing.js --write   # rewrite each agent's model: to match
//
// Zero dependencies (Node builtins only), matching the rest of this repo.

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const ROUTING = join(ROOT, "model-routing.json");
const TEMPLATES = join(ROOT, "templates");

const write = process.argv.includes("--write");

// agent name -> expected model, derived from the role table.
const routing = JSON.parse(readFileSync(ROUTING, "utf8"));
const expected = new Map();
for (const [role, def] of Object.entries(routing.roles)) {
  for (const agent of def.used_by) {
    if (expected.has(agent)) {
      console.error(`model-routing.json: agent "${agent}" is listed under two roles.`);
      process.exit(1);
    }
    expected.set(agent, { role, model: def.model });
  }
}

// Find every agent file: templates/*/.claude/agents/*.md
function agentFiles() {
  const out = [];
  for (const stack of readdirSync(TEMPLATES)) {
    const dir = join(TEMPLATES, stack, ".claude", "agents");
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      continue; // template has no agents dir
    }
    for (const f of entries) {
      if (f.endsWith(".md") && statSync(join(dir, f)).isFile()) out.push(join(dir, f));
    }
  }
  return out;
}

const drift = [];
const unassigned = [];
let rewrote = 0;

for (const file of agentFiles()) {
  const src = readFileSync(file, "utf8");
  const name = basename(file, ".md");
  const rel = file.slice(ROOT.length + 1);

  const exp = expected.get(name);
  if (!exp) {
    unassigned.push(rel);
    continue;
  }

  const m = src.match(/^model:[ \t]*(.+)$/m);
  const current = m ? m[1].trim() : "(none)";

  if (current === exp.model) continue;

  if (write && m) {
    const next = src.replace(/^model:[ \t]*.+$/m, `model: ${exp.model}`);
    writeFileSync(file, next);
    rewrote++;
    console.log(`  ✓ ${rel}: ${current} -> ${exp.model} (${exp.role})`);
  } else {
    drift.push(`${rel}: model is "${current}" but role "${exp.role}" requires "${exp.model}"`);
  }
}

if (unassigned.length) {
  console.error("\nAgents with no role in model-routing.json (add each to a role's used_by):");
  for (const u of unassigned) console.error(`  - ${u}`);
}

if (write) {
  console.log(`\nRewrote ${rewrote} agent file(s) to match model-routing.json.`);
  if (unassigned.length) process.exit(1);
  process.exit(0);
}

if (drift.length || unassigned.length) {
  if (drift.length) {
    console.error("\nModel-routing drift — agent frontmatter disagrees with model-routing.json:");
    for (const d of drift) console.error(`  ✗ ${d}`);
    console.error("\nFix: run `node scripts/check-model-routing.js --write`.");
  }
  process.exit(1);
}

console.log("Model routing: all agent frontmatter matches model-routing.json.");
