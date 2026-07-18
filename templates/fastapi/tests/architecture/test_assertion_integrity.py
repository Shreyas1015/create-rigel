"""Architecture test -- assertion integrity (AC-5). Runs in the per-layer gate via
`pytest tests/architecture/`.

A test that claims an AC-ID must actually assert something. Using python's builtin
`ast` module we parse every acceptance test file and, for each test function that
claims an AC-ID, require at least one NON-TRIVIAL assertion. Rejected:
  - zero assertions
  - literal-only assertions (`assert True`, `assert 1`, `assert 1 == 1`)
  - snapshot-only assertions (`assert x == snapshot` -- syrupy style)

A test function claims an AC-ID if the id is normalisable out of its own name
(`test_ac_1_*` -> AC-1) or docstring, or -- when it declares none -- out of the
module (file name `test_ac_1.py` / module docstring). A `with pytest.raises(...)`
counts as a meaningful assertion (it is the pytest way to assert on errors).

A fresh repo (no acceptance tests) skips cleanly. Self-contained (no scripts/ import)
so it runs under bare `pytest tests/architecture/`; mirrors the express reference
(assertion-integrity.test.ts).
"""

import ast
import re
from pathlib import Path

import pytest

ACCEPTANCE_DIR = "tests/acceptance"
AC_ID = re.compile(r"\bAC-\d+\b")
AC_NAME = re.compile(r"(?i)ac[_-]?(\d+)")


def _acceptance_files() -> list[Path]:
    root = Path(ACCEPTANCE_DIR)
    if not root.exists():
        return []
    return sorted(
        f
        for f in root.rglob("*.py")
        if f.name.startswith("test_") or f.name.endswith("_test.py")
    )


def _ac_ids_from_name(name: str) -> set[str]:
    return {f"AC-{m.group(1)}" for m in AC_NAME.finditer(name or "")}


def _ac_ids_in_text(text: str | None) -> set[str]:
    return set(AC_ID.findall(text or ""))


def _mentions_snapshot(node: ast.AST) -> bool:
    """True if the expression references a `snapshot` name/attr/call (syrupy style)."""
    for n in ast.walk(node):
        if isinstance(n, ast.Name) and n.id == "snapshot":
            return True
        if isinstance(n, ast.Attribute) and n.attr in ("snapshot", "to_match_snapshot"):
            return True
        if isinstance(n, ast.Call):
            f = n.func
            if isinstance(f, ast.Name) and f.id == "snapshot":
                return True
            if isinstance(f, ast.Attribute) and f.attr in ("snapshot", "to_match_snapshot"):
                return True
    return False


def _is_constant_only(node: ast.AST) -> bool:
    """True if the expression has no reference (Name/Attribute/Call/Subscript) -- i.e.
    it is built purely from literals, so it asserts nothing real."""
    for n in ast.walk(node):
        if isinstance(n, (ast.Name, ast.Attribute, ast.Call, ast.Subscript, ast.Await, ast.Starred)):
            return False
    return True


def _is_pytest_raises(node: ast.AST) -> bool:
    for item in getattr(node, "items", []):
        ctx = item.context_expr
        if isinstance(ctx, ast.Call):
            f = ctx.func
            if isinstance(f, ast.Attribute) and f.attr in ("raises", "warns"):
                return True
            if isinstance(f, ast.Name) and f.id in ("raises", "warns"):
                return True
    return False


def _has_meaningful_assertion(func: ast.AST) -> bool:
    for n in ast.walk(func):
        if isinstance(n, ast.Assert):
            if _mentions_snapshot(n.test):
                continue
            if _is_constant_only(n.test):
                continue
            return True
        if isinstance(n, (ast.With, ast.AsyncWith)) and _is_pytest_raises(n):
            return True
    return False


def _scan() -> list[str]:
    offenders: list[str] = []
    for file in _acceptance_files():
        module_acs = _ac_ids_from_name(file.name)
        try:
            src = file.read_text(encoding="utf-8")
            tree = ast.parse(src)
        except (OSError, SyntaxError):
            continue
        module_acs |= _ac_ids_in_text(ast.get_docstring(tree))
        for node in ast.walk(tree):
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            if not node.name.startswith("test"):
                continue
            claimed = _ac_ids_from_name(node.name) | _ac_ids_in_text(ast.get_docstring(node))
            if not claimed:
                claimed = module_acs
            if not claimed:
                continue  # not an AC-claiming test -- ignore (helpers, etc.)
            if not _has_meaningful_assertion(node):
                offenders.append(f"{file} :: {node.name} (claims {', '.join(sorted(claimed))})")
    return offenders


_offenders = _scan()


@pytest.mark.skipif(not Path(ACCEPTANCE_DIR).exists(), reason="fresh repo: no acceptance tests")
def test_ac_claiming_tests_have_nontrivial_assertions() -> None:
    assert _offenders == [], "AC-claiming acceptance tests without a real assertion:\n" + "\n".join(
        _offenders
    )
