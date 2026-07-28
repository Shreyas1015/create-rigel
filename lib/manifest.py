"""lib/manifest.py — PLAN-008 AC-1/AC-2, Python runtime.

A faithful 1:1 port of lib/manifest.mjs. It exists because the fastapi template has NO node
dependency anywhere (its scripts are .py and .sh, its hooks state "no node, husky, jq"), and
putting node on the critical path of every fastapi commit would be a real regression.

lib/manifest.mjs remains the spec. Both are stamped into scaffolds by cli.js — .mjs for the JS
stacks, .py for fastapi — and lib/manifest.parity.test.mjs asserts they agree on identical input,
which is the same JS/Python parity discipline already used for curate_scan.

Stdlib only: this is a leaf that must never itself fail the gate.
"""

import hashlib
import json
import os
import re

MANIFEST_PATH = ".rigel/manifest.json"
SCHEMA_VERSION = 1

_SKIP_DIRS = {"node_modules", ".git", ".next", "dist", "coverage", "__pycache__"}
_REGEX_SPECIAL = "\\^$.|?+()[]{}"


def glob_to_regex(glob: str) -> "re.Pattern[str]":
    """`**` crosses separators, `*` does not, everything else is literal."""
    out = []
    i = 0
    while i < len(glob):
        c = glob[i]
        if c == "*":
            if i + 1 < len(glob) and glob[i + 1] == "*":
                i += 1
                if i + 1 < len(glob) and glob[i + 1] == "/":
                    i += 1  # `**/` also matches zero directories
                out.append(".*")
            else:
                out.append("[^/]*")
        elif c in _REGEX_SPECIAL:
            out.append("\\" + c)
        else:
            out.append(c)
        i += 1
    return re.compile("^" + "".join(out) + "$")


def matches_any(path: str, globs) -> bool:
    return any(glob_to_regex(g).match(path) for g in (globs or []))


def classify(path: str, ownership: dict):
    """`managed` wins, then `user`, then `seed`. The manifest is its own category."""
    if path == MANIFEST_PATH:
        return "manifest"
    if matches_any(path, ownership.get("managed")):
        return "managed"
    if matches_any(path, ownership.get("user")):
        return "user"
    if matches_any(path, ownership.get("seed")):
        return "seed"
    return None  # unclassified — reported, never silently assumed owned


def resolve_ownership(table: dict, stack: str) -> dict:
    base = table.get("common", {})
    extra = table.get(stack, {})
    return {k: list(base.get(k, [])) + list(extra.get(k, [])) for k in ("managed", "seed", "user")}


def walk_files(root: str):
    """Every file under `root`, as repo-relative POSIX paths, sorted."""
    out = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if d not in _SKIP_DIRS)
        for name in sorted(filenames):
            rel = os.path.relpath(os.path.join(dirpath, name), root)
            out.append(rel.replace(os.sep, "/"))
    return sorted(out)


def hash_file(abs_path: str) -> str:
    with open(abs_path, "rb") as fh:
        return hashlib.sha256(fh.read()).hexdigest()


def hash_managed(root: str, ownership: dict) -> dict:
    return {
        p: hash_file(os.path.join(root, p))
        for p in walk_files(root)
        if classify(p, ownership) == "managed"
    }


def read_manifest(root: str = ".") -> "dict | None":
    path = os.path.join(root, MANIFEST_PATH)
    if not os.path.isfile(path):
        return None
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)
