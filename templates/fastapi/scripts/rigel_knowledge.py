#!/usr/bin/env python3
"""scripts/rigel_knowledge.py — PLAN-009/011. Is the company knowledge still true?

Every domain entry names an anchor — a file or a defined symbol it describes. This resolves them
against the repo, and BLOCKS when one is dead. A wiki rots in silence; anchored knowledge rots
loudly, which is what earns prose a place in a gate-enforced repo.

OWNERSHIP: the whole glossary reaches every service, because shared vocabulary is the point. But a
term's code lives in exactly ONE repo, so a term may declare `owner:` and only that service resolves
its anchors. Everyone else reads it without being held to it. No `owner` means "check here", so a
single-repo project needs no ceremony.

Python (not the .mjs the other stacks use) because this template has no node dependency and the
check is blocking. The logic lives in scripts/lib/rigel_knowledge_lib.py, stamped by create-rigel
from lib/knowledge.py and kept in step with the JS by a parity test.

  python3 scripts/rigel_knowledge.py              # blocking
  python3 scripts/rigel_knowledge.py --advisory   # report only (exit 0) — a migration window
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib"))
from rigel_knowledge_lib import check_knowledge  # noqa: E402


def main(argv: "list[str]") -> int:
    advisory = "--advisory" in argv
    root = os.getcwd()
    # Same identity `create-rigel facts` uses, so ownership means the same thing everywhere.
    service = os.path.basename(root)
    r = check_knowledge(root, "knowledge", service=service)

    owned = (
        f" ({r['skippedNotOwner']} anchor(s) belong to other services — read, not verified here)"
        if r["skippedNotOwner"]
        else ""
    )

    if r["checked"] == 0:
        print(f"· rigel knowledge: no anchored entries to verify here{owned}")
        return 0

    if not r["problems"]:
        print(
            f"✓ rigel knowledge: {r['checked']} anchor(s) across "
            f"{len(r['entries'])} entr(ies) still resolve{owned}"
        )
        return 0

    mark = "·" if advisory else "✗"
    out = sys.stdout if advisory else sys.stderr
    print(f"\n{mark} rigel knowledge: {len(r['problems'])} stale anchor(s)\n", file=out)
    for p in r["problems"]:
        print(f"  {mark} {p}", file=out)
    print(
        "\nThe code moved and the knowledge did not. Either:\n"
        "  • update the entry to describe what the code does now,\n"
        "  • repoint the anchor,\n"
        '  • add "owner: <the service that owns this code>" if this repo only reads the term, or\n'
        "  • delete the entry — knowledge nobody maintains is worse than none.\n"
        + ("\n(--advisory: reported, not enforced)\n" if advisory else ""),
        file=out,
    )
    return 0 if advisory else 1


if __name__ == "__main__":
    sys.stdout.reconfigure(line_buffering=True)  # ordering matters when piped
    sys.exit(main(sys.argv[1:]))
