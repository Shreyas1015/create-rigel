#!/usr/bin/env python3
"""scripts/rigel_verify.py — PLAN-008 AC-2. Has anyone edited a file Rigel owns?

Runs in the gate. Purely local: the manifest already records the sha256 of exactly what Rigel
wrote, so this is a hash compare — no network, no template download.

Python (not the .mjs the other stacks use) because this template has no node dependency and
gate.sh runs on every commit via pre-commit. See lib/manifest.py.

What it deliberately does NOT do:
  - fail because a newer create-rigel exists (that is `cruft check`'s antipattern: red-lighting
    your PR on someone else's release schedule)
  - fail on calendar age

Escape hatch: a waiver pinning the exact accepted content, with an expiry. An expired waiver
FAILS — a temporary exception cannot quietly become permanent.

Exit 0 = clean, 1 = violations, 2 = cannot run.
"""

import datetime
import json
import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib"))
from rigel_manifest import (  # noqa: E402
    MANIFEST_PATH,
    classify,
    hash_file,
    read_manifest,
    walk_files,
)

ROOT = os.getcwd()
problems: list[str] = []
notes: list[str] = []

# ── the manifest must exist and parse ────────────────────────────────────────────
try:
    manifest = read_manifest(ROOT)
except json.JSONDecodeError as exc:
    print(f"✗ {MANIFEST_PATH} is not valid JSON: {exc}", file=sys.stderr)
    sys.exit(2)

if manifest is None:
    print(f"✗ {MANIFEST_PATH} is missing.", file=sys.stderr)
    print("  This repo has lost its provenance — `rigel update` can no longer reach it.", file=sys.stderr)
    print("  Restore it from git history; it cannot be regenerated.", file=sys.stderr)
    sys.exit(2)

ownership = manifest.get("ownership") or {"managed": [], "seed": [], "user": []}
recorded = manifest.get("files") or {}

# ── waivers ──────────────────────────────────────────────────────────────────────
today = datetime.date.today().isoformat()
waivers: dict[str, dict] = {}
for w in manifest.get("waivers") or []:
    if not all(w.get(k) for k in ("path", "sha256", "reason", "owner", "expires")):
        problems.append(
            f'waiver for "{w.get("path", "(no path)")}" is incomplete '
            "— needs path, sha256, reason, owner, expires"
        )
        continue
    if w["expires"] < today:
        problems.append(
            f'waiver for "{w["path"]}" EXPIRED on {w["expires"]} (owner {w["owner"]}) '
            "— re-justify it or take the update"
        )
        continue
    waivers[w["path"]] = w

# ── every file Rigel wrote must still be byte-identical ─────────────────────────
for path, expected in recorded.items():
    abs_path = os.path.join(ROOT, path)
    if not os.path.isfile(abs_path):
        if path in waivers:
            continue  # deliberately removed, and waived
        problems.append(f"missing: {path} (Rigel owns this file; it was deleted)")
        continue

    actual = hash_file(abs_path)
    if actual == expected:
        continue

    w = waivers.get(path)
    if w and w["sha256"] == actual:
        notes.append(f'waived: {path} — {w["reason"]} ({w["owner"]}, expires {w["expires"]})')
        continue
    if w:
        problems.append(
            f"edited: {path} — a waiver exists but pins a different version "
            "(re-waive the current content)"
        )
        continue
    problems.append(f"edited: {path} (Rigel owns this file — revert it, or add a waiver)")

# ── files added into Rigel's space ──────────────────────────────────────────────
on_disk = walk_files(ROOT)
for p in on_disk:
    if classify(p, ownership) == "managed" and p not in recorded:
        notes.append(f"untracked in a managed path: {p} (Rigel will not update or protect this)")

# ── merge debris must never be committed ────────────────────────────────────────
for p in on_disk:
    if p.endswith(".rigel-new"):
        problems.append(f"unresolved update: {p} — review it against the original, then delete it")

CONFLICT = re.compile(r"^(<{7}|={7}|>{7})", re.M)
for p in recorded:
    abs_path = os.path.join(ROOT, p)
    if not os.path.isfile(abs_path):
        continue
    try:
        if CONFLICT.search(open(abs_path, encoding="utf-8").read()):
            problems.append(f"conflict markers committed in {p}")
    except UnicodeDecodeError:
        pass  # binary file — no markers to find

# ── report ──────────────────────────────────────────────────────────────────────
for n in notes:
    print(f"  · {n}")

if not problems:
    print(
        f"✓ rigel verify: {len(recorded)} managed files intact "
        f'(template {manifest.get("template")}@{manifest.get("updatedWith")})'
    )
    sys.exit(0)

print(f"\n✗ rigel verify: {len(problems)} problem(s)\n", file=sys.stderr)
for p in problems:
    print(f"  ✗ {p}", file=sys.stderr)
print(
    f"""
Rigel owns these files so it can keep them current. To resolve:
  • revert the file, or
  • add a waiver to {MANIFEST_PATH}:
      {{ "path": "<path>", "sha256": "<current hash>", "reason": "<why>",
        "owner": "@you", "expires": "YYYY-MM-DD" }}
    An expired waiver fails this check again — that is the point.
""",
    file=sys.stderr,
)
sys.exit(1)
