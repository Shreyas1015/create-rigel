#!/usr/bin/env python3
# scripts/rigel_knowledge.py — PLAN-009/011. Is the company knowledge still true?
#
# Every domain entry names an anchor — a file or an exported symbol it describes. This resolves
# them against the repo. When a model is renamed and the glossary still describes the old world,
# the build fails.
#
# That is the whole reason prose is allowed in a Rigel repo at all: a wiki rots in silence,
# anchored knowledge rots loudly. It can fail a build, so it isn't "just a doc".
#
# BLOCKING as of v0.13.0 (advisory for one release before that, deliberately — a new gate that
# misfires even once teaches everyone to ignore it).
#
# OWNERSHIP: the whole glossary is distributed to every service, because shared vocabulary is the
# entire point. But a term's code lives in exactly ONE repo, so a term may declare `owner:` and
# only that service resolves its anchors. Everyone else reads it without being held to it. A term
# with no `owner` is checked everywhere, which keeps single-repo projects ceremony-free.
#
#   python3 scripts/rigel_knowledge.py              # blocking
#   python3 scripts/rigel_knowledge.py --advisory   # report only (exit 0) — for a migration window
#
# WHY THIS IS PYTHON AND SELF-CONTAINED: the other stacks import the stamped
# `scripts/lib/rigel-knowledge-lib.mjs`. Shelling out to node here and skipping when node is
# absent would make a BLOCKING gate silently green on any machine without node — a false pass is
# worse than no check (LSN-0004). A FastAPI repo is guaranteed to have python3 and nothing else,
# so the checker is python3 + stdlib only. It is a line-for-line port of `lib/knowledge.mjs`;
# `scripts/rigel_knowledge_test.py` pins the semantics that must not drift.

from __future__ import annotations

import os
import re
import sys

KNOWLEDGE_DIR = "knowledge"

# ── frontmatter (a deliberately tiny reader — no YAML dependency) ────────────────
_FM_RE = re.compile(r"^---\r?\n([\s\S]*?)\r?\n---")
_ITEM_RE = re.compile(r"^\s*-\s*(\w+)\s*:\s*(.*)$")
_KV_RE = re.compile(r"^(\w[\w-]*)\s*:\s*(.*)$")
_QUOTE_RE = re.compile(r"^[\"']|[\"']$")


def _strip(s: str) -> str:
    return _QUOTE_RE.sub("", s.strip())


def parse_frontmatter(text: str) -> tuple[dict, str]:
    """Parse the leading `---` block. Supports scalars and the one list shape anchors need:

    anchors:
      - path: src/models/shipment.py
      - symbol: Shipment
    """
    m = _FM_RE.match(text)
    if not m:
        return {}, text
    out: dict = {}
    list_key: str | None = None
    for raw in re.split(r"\r?\n", m.group(1)):
        if not raw.strip() or raw.strip().startswith("#"):
            continue
        item = _ITEM_RE.match(raw)
        if item and list_key:
            out[list_key].append({item.group(1): _strip(item.group(2))})
            continue
        kv = _KV_RE.match(raw)
        if not kv:
            continue
        if kv.group(2).strip() == "":
            list_key = kv.group(1)
            out[list_key] = []
        else:
            list_key = None
            out[kv.group(1)] = _strip(kv.group(2))
    return out, text[m.end() :]


# ── anchor resolution ───────────────────────────────────────────────────────────
CODE_EXT = re.compile(r"\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|rb)$")

# About to gate a build, so a definition style we don't recognise becomes a false FAILURE.
# Covers TS/JS (incl. `let`, `var`, generator `function*`), Python `def`/`class`, Go, Rust.
_DEF_KEYWORDS = r"class|interface|type|enum|const|let|var|function\*?|def|struct|model"


def resolve_anchor(root: str, anchor: dict, src_index: list[dict]) -> dict:
    """Resolve one anchor against the repo.

    {"path": "src/models/shipment.py"} → that file must exist
    {"symbol": "Shipment"}             → must appear as a DEFINITION somewhere in src/
    """
    if anchor.get("path"):
        path = anchor["path"]
        return (
            {"ok": True}
            if os.path.exists(os.path.join(root, path))
            else {"ok": False, "reason": f"path not found: {path}"}
        )
    if anchor.get("symbol"):
        symbol = anchor["symbol"]
        # A mere mention is not a definition — the keyword prefix is what makes this a real check.
        rx = re.compile(rf"\b({_DEF_KEYWORDS})\s+{re.escape(symbol)}\b")
        hit = any(rx.search(entry["text"]) for entry in src_index)
        return {"ok": True} if hit else {"ok": False, "reason": f"symbol not defined anywhere: {symbol}"}
    return {"ok": False, "reason": 'anchor has neither "path" nor "symbol"'}


def _walk(directory: str):
    """Yield every file under `directory`, skipping vendored/generated/hidden trees.

    Mirrors lib/knowledge.mjs `walk`: the root itself is never filtered, only its children.
    """
    for entry in sorted(os.scandir(directory), key=lambda e: e.name):
        path = os.path.join(directory, entry.name)
        if entry.is_dir():
            if entry.name in ("node_modules", "__pycache__") or entry.name.startswith("."):
                continue
            yield from _walk(path)
        else:
            yield path


def build_source_index(root: str, dirs: tuple[str, ...] = ("src", "app", "lib")) -> list[dict]:
    """Read every source file once — anchor checking is O(entries), not O(entries x files)."""
    out: list[dict] = []
    for d in dirs:
        abs_dir = os.path.join(root, d)
        if not os.path.exists(abs_dir):
            continue
        for p in _walk(abs_dir):
            if not CODE_EXT.search(p):
                continue
            try:
                with open(p, encoding="utf-8") as fh:
                    out.append({"path": os.path.relpath(p, root).replace(os.sep, "/"), "text": fh.read()})
            except (OSError, UnicodeDecodeError):
                pass  # unreadable/binary — skip
    return out


# ── scanning the knowledge tree ─────────────────────────────────────────────────
def check_knowledge(root: str, knowledge_dir: str = KNOWLEDGE_DIR, service: str | None = None) -> dict:
    """Check every anchored entry under knowledge/domain/.

    Returns {checked, skippedNotOwner, entries: [{file, term, anchors: [...]}], problems: [...]}.
    """
    domain = os.path.join(root, knowledge_dir, "domain")
    result: dict = {"checked": 0, "skippedNotOwner": 0, "entries": [], "problems": []}
    if not os.path.exists(domain):
        return result

    src_index = build_source_index(root)
    files = [p for p in _walk(domain) if p.endswith(".md")]

    for abs_path in sorted(files):
        rel = os.path.relpath(abs_path, root).replace(os.sep, "/")
        try:
            with open(abs_path, encoding="utf-8") as fh:
                data, _ = parse_frontmatter(fh.read())
        except (OSError, UnicodeDecodeError):
            continue
        anchors = data.get("anchors")
        if not isinstance(anchors, list) or len(anchors) == 0:
            continue  # context docs and prose need no anchors

        # The WHOLE glossary is distributed to every service — that is the point of shared
        # vocabulary. But a term's code lives in exactly one repo, so only its owner can resolve
        # its anchors. Without this, every consumer would fail on every term it merely reads.
        # `owner` absent means "check everywhere", which keeps a single-repo project working with
        # no ceremony.
        if data.get("owner") and service and data["owner"] != service:
            result["skippedNotOwner"] += len(anchors)
            continue

        checks = [{"anchor": a, **resolve_anchor(root, a, src_index)} for a in anchors]
        result["checked"] += len(checks)
        term = data.get("term")
        result["entries"].append({"file": rel, "term": term, "anchors": checks})
        for c in checks:
            if not c["ok"]:
                result["problems"].append(f"{rel}{f' ({term})' if term else ''}: {c['reason']}")
    return result


