"""Architecture test -- AC<->test traceability (AC-1, static half) + red-green
integrity (AC-4). Runs in the per-layer gate via `pytest tests/architecture/`.

This enforces the *structural* invariants that must hold from spec-time onward and
are safe to check on every gate (they do NOT require the tests to be green yet):
  1. Every AC-ID in the active plan's spec has an acceptance test carrying it.
  2. Every such AC-ID has a recorded red state in .rigel/redgreen/SPEC-XXX.json.

The green PASS/FAIL vector is a feature-completion check (scripts/ac_vector.py), not
this file -- acceptance tests are legitimately red mid-build.

A fresh repo (no active plan, or a plan with no spec) skips cleanly, exactly like
test_layers.py, so the suite passes immediately after /infra-setup.

Self-contained (no scripts/ import) so it runs under bare `pytest tests/architecture/`
regardless of sys.path -- mirrors the express reference (traceability.test.ts).
"""

import json
import re
from pathlib import Path

import pytest

ACTIVE_DIR = "docs/exec-plans/active"
READY_DIR = "docs/product-specs/ready"
ACCEPTANCE_DIR = "tests/acceptance"
REDGREEN_DIR = ".rigel/redgreen"

AC_ID = re.compile(r"\bAC-\d+\b")
AC_NAME = re.compile(r"(?i)ac[_-]?(\d+)")


def _first_active_plan() -> str | None:
    d = Path(ACTIVE_DIR)
    if not d.exists():
        return None
    plans = sorted(p for p in d.iterdir() if p.suffix == ".md")
    return str(plans[0]) if plans else None


def _spec_ids_from_plan(text: str) -> list[str]:
    m = re.search(r"\*\*Spec:\*\*\s*(.+)", text)
    source = m.group(1) if m else text
    return list(dict.fromkeys(re.findall(r"\bSPEC-\d+\b", source)))


def _find_spec_file(spec_id: str) -> str | None:
    d = Path(READY_DIR)
    if not d.exists():
        return None
    for f in sorted(d.iterdir()):
        if f.name.startswith(spec_id) and f.suffix == ".md":
            return str(f)
    return None


def _ac_ids_in_spec(spec_text: str) -> list[str]:
    lines = spec_text.split("\n")
    start = next(
        (i for i, ln in enumerate(lines) if re.match(r"^##\s+Acceptance Criteria", ln, re.I)),
        -1,
    )
    if start == -1:
        return []
    ids: list[str] = []
    for ln in lines[start + 1 :]:
        if re.match(r"^##\s+", ln):
            break
        for m in AC_ID.finditer(ln):
            if m.group(0) not in ids:
                ids.append(m.group(0))
    return ids


def _ac_ids_with_tests(spec_id: str) -> set[str]:
    found: set[str] = set()
    root = Path(ACCEPTANCE_DIR) / spec_id
    if not root.exists():
        return found
    for f in root.rglob("*.py"):
        if not (f.name.startswith("test_") or f.name.endswith("_test.py")):
            continue
        found |= {f"AC-{m.group(1)}" for m in AC_NAME.finditer(f.name)}
        try:
            found |= set(AC_ID.findall(f.read_text(encoding="utf-8")))
        except OSError:
            continue
    return found


def _read_redgreen(spec_id: str) -> dict | None:
    f = Path(REDGREEN_DIR) / f"{spec_id}.json"
    if not f.exists():
        return None
    try:
        return json.loads(f.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


_plan = _first_active_plan()
_spec_id = _spec_ids_from_plan(Path(_plan).read_text(encoding="utf-8"))[0:1] if _plan else []
_spec_id = _spec_id[0] if _spec_id else None
_spec_file = _find_spec_file(_spec_id) if _spec_id else None
_acs = _ac_ids_in_spec(Path(_spec_file).read_text(encoding="utf-8")) if _spec_file else []


def test_active_plan_and_spec_resolve_or_skip() -> None:
    """Sanity anchor so the suite is never empty; real assertions are conditional."""
    assert isinstance(_acs, list)


@pytest.mark.skipif(not _acs, reason="fresh repo: no active plan/spec with AC-IDs")
def test_every_ac_has_a_titled_acceptance_test() -> None:
    """No MISSING: every spec AC-ID has an acceptance test carrying it."""
    with_tests = _ac_ids_with_tests(_spec_id)
    missing = [ac for ac in _acs if ac not in with_tests]
    assert missing == [], f"AC-IDs with no acceptance test: {missing}"


@pytest.mark.skipif(not _acs, reason="fresh repo: no active plan/spec with AC-IDs")
def test_every_ac_has_recorded_red_state() -> None:
    """No INVALID: every spec AC-ID has a recorded red state (red-green proven)."""
    rg = _read_redgreen(_spec_id)
    tests = (rg or {}).get("tests") or {}
    invalid = [ac for ac in _acs if ac not in tests]
    assert invalid == [], (
        f"AC-IDs with no red-green record in {REDGREEN_DIR}/{_spec_id}.json: {invalid} "
        "-- run: uv run python scripts/redgreen_record.py " + str(_spec_id)
    )
