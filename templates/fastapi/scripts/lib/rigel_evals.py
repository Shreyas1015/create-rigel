# scripts/lib/rigel_evals.py
# Shared helpers for the deterministic-eval scripts (redgreen_record, ac_vector,
# mutation_report). Pure stdlib (no third-party deps) so it runs anywhere the
# template is scaffolded.
#
# The linkage this file resolves:
#   docs/exec-plans/active/PLAN-XXX.md   (the active plan)
#     -> **Spec:** docs/product-specs/ready/SPEC-XXX.md   (the linked spec)
#       -> ## Acceptance Criteria  -> AC-1, AC-2, ...        (the AC-IDs)
#         -> tests/acceptance/SPEC-XXX/test_ac_N.py          (test carries the AC-ID)
#
# AC-id -> test matching (fastapi/pytest convention):
#   Every AC gets one file `tests/acceptance/<SPEC-ID>/test_ac_<N>.py` whose
#   module docstring carries the token `AC-<N>` and whose test functions are named
#   `test_ac_<N>_*`. A test "belongs" to AC-N if the token `AC-N` (hyphen form) is
#   found in the file source (docstring) OR the AC-id can be normalised out of the
#   file/function name (`ac_<N>` / `ac-<N>` -> `AC-<N>`). Python identifiers cannot
#   contain '-', so the JUnit-XML green vector maps testcases back to their AC via
#   the same name/file normalisation.
#
# Everything is deterministic and content-based -- we grade what was produced.

import json
import re
import subprocess
import xml.etree.ElementTree as ET
from pathlib import Path

# Canonical AC-id token as authors write it in specs/docstrings: `AC-1`, `AC-12`.
AC_ID_RE = re.compile(r"\bAC-\d+\b")
# Tolerant matcher for python identifiers / file paths / xml names: `ac_1`, `ac-1`, `AC1`.
_AC_NAME_RE = re.compile(r"(?i)ac[_-]?(\d+)")

ACTIVE_DIR = "docs/exec-plans/active"
READY_DIR = "docs/product-specs/ready"
ACCEPTANCE_DIR = "tests/acceptance"
REDGREEN_DIR = ".rigel/redgreen"
RESULTS_DIR = ".rigel/ac-results"


def ac_ids_from_name(name: str) -> set[str]:
    """AC-ids normalised out of an identifier / path / xml attribute (`ac_1` -> `AC-1`)."""
    return {f"AC-{m.group(1)}" for m in _AC_NAME_RE.finditer(name or "")}


def find_active_plan() -> str | None:
    """First active plan file, or None on a fresh repo (no plan yet)."""
    d = Path(ACTIVE_DIR)
    if not d.exists():
        return None
    plans = sorted(p for p in d.iterdir() if p.suffix == ".md")
    return str(plans[0]) if plans else None


def spec_ids_from_plan(plan_text: str) -> list[str]:
    """SPEC-IDs referenced by a plan -- the `**Spec:**` line first, else any SPEC-\\d+."""
    m = re.search(r"\*\*Spec:\*\*\s*(.+)", plan_text)
    source = m.group(1) if m else plan_text
    ids: list[str] = []
    seen: set[str] = set()
    for hit in re.finditer(r"\bSPEC-\d+\b", source):
        if hit.group(0) not in seen:
            seen.add(hit.group(0))
            ids.append(hit.group(0))
    return ids


def find_spec_file(spec_id: str) -> str | None:
    """Resolve a SPEC-ID to its READY spec file path, or None."""
    d = Path(READY_DIR)
    if not d.exists():
        return None
    for f in sorted(d.iterdir()):
        if f.name.startswith(spec_id) and f.suffix == ".md":
            return str(f)
    return None


def parse_acceptance_criteria(spec_text: str) -> list[dict[str, str]]:
    """Parse the `## Acceptance Criteria` section into [{'id', 'text'}].

    Accepts `- [ ] **AC-1:** text` and tolerant variants.
    """
    lines = spec_text.split("\n")
    start = next(
        (i for i, ln in enumerate(lines) if re.match(r"^##\s+Acceptance Criteria", ln, re.I)),
        -1,
    )
    if start == -1:
        return []
    out: list[dict[str, str]] = []
    seen: set[str] = set()
    for ln in lines[start + 1 :]:
        if re.match(r"^##\s+", ln):
            break  # next section
        m = re.search(r"\b(AC-\d+)\b[:*\s]*(.*)$", ln)
        if m and m.group(1) not in seen:
            seen.add(m.group(1))
            out.append({"id": m.group(1), "text": m.group(2).replace("*", "").strip()})
    return out


def test_files(directory: str) -> list[str]:
    """Recursively collect pytest files (`test_*.py` / `*_test.py`) under a dir."""
    d = Path(directory)
    if not d.exists():
        return []
    out: list[str] = []
    for f in sorted(d.rglob("*.py")):
        if f.name.startswith("test_") or f.name.endswith("_test.py"):
            out.append(str(f))
    return out


def ac_ids_with_tests(spec_id: str) -> set[str]:
    """AC-IDs that have an acceptance test carrying their id inside a spec's dir.

    An AC-id is credited when it appears (hyphen form) in the file source -- the
    module docstring is the declared home -- or when it is normalisable out of the
    file name (`test_ac_1.py` -> AC-1).
    """
    found: set[str] = set()
    for file in test_files(str(Path(ACCEPTANCE_DIR) / spec_id)):
        found |= ac_ids_from_name(Path(file).name)
        try:
            src = Path(file).read_text(encoding="utf-8")
        except OSError:
            continue
        found |= set(AC_ID_RE.findall(src))
    return found


def _ac_ids_from_testcase(tc: ET.Element) -> set[str]:
    """AC-ids a JUnit <testcase> belongs to (from classname / name / file attrs)."""
    ids: set[str] = set()
    for attr in ("classname", "name", "file"):
        ids |= ac_ids_from_name(tc.get(attr, ""))
    return ids


def parse_junit(path: str) -> dict[str, str]:
    """Parse a pytest JUnit XML report into a Map<AC-ID, 'passed'|'failed'|'skipped'>.

    A <testcase> with a child <failure>/<error> is failed; <skipped> is skipped;
    otherwise passed. A single passing test is enough to mark its AC passed.
    """
    by_ac: dict[str, str] = {}
    try:
        root = ET.parse(path).getroot()
    except (ET.ParseError, OSError):
        return by_ac
    for tc in root.iter("testcase"):
        failed = any(child.tag in ("failure", "error") for child in tc)
        skipped = any(child.tag == "skipped" for child in tc)
        status = "failed" if failed else ("skipped" if skipped else "passed")
        for ac in _ac_ids_from_testcase(tc):
            prev = by_ac.get(ac)
            if status == "passed":
                by_ac[ac] = "passed"
            elif prev != "passed":
                # failed beats skipped; never downgrade a recorded failure to skipped.
                by_ac[ac] = "failed" if (failed or prev == "failed") else status
    return by_ac


def run_acceptance_tests(spec_id: str) -> dict[str, str]:
    """Run a spec's acceptance suite via pytest, return Map<AC-ID, status>.

    Uses --junitxml so stdout pollution never corrupts the report. pytest exiting
    non-zero (expected when tests are red) is fine -- the XML is still written.
    """
    directory = str(Path(ACCEPTANCE_DIR) / spec_id)
    Path(".rigel").mkdir(parents=True, exist_ok=True)
    out_file = str(Path(".rigel") / f".junit-{spec_id}.xml")
    try:
        subprocess.run(
            [
                "uv",
                "run",
                "pytest",
                directory,
                f"--junitxml={out_file}",
                "-p",
                "no:cacheprovider",
                "--tb=no",
                "-q",
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
    except OSError:
        # uv/pytest not available -- caller treats an empty result as "no data".
        pass
    if not Path(out_file).exists():
        return {}
    return parse_junit(out_file)


def read_redgreen(spec_id: str) -> dict | None:
    f = Path(REDGREEN_DIR) / f"{spec_id}.json"
    if not f.exists():
        return None
    try:
        return json.loads(f.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def write_json(path: str, data: object) -> None:
    p = Path(path)
    if p.parent != Path("."):
        p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def git_head() -> str:
    try:
        return subprocess.run(
            ["git", "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return "unknown"


def resolve_active_spec() -> dict | None:
    """Resolve the active plan -> its single primary spec.

    Returns {plan_path, plan_text, spec_id, spec_file, acs} or None if nothing is
    active yet. Raises only on a genuinely broken linkage (plan present but spec
    unresolvable).
    """
    plan_path = find_active_plan()
    if not plan_path:
        return None
    plan_text = Path(plan_path).read_text(encoding="utf-8")
    spec_ids = spec_ids_from_plan(plan_text)
    if not spec_ids:
        return None
    spec_id = spec_ids[0]
    spec_file = find_spec_file(spec_id)
    if not spec_file:
        raise SystemExit(
            f"Active plan references {spec_id} but no READY spec file found in {READY_DIR}"
        )
    acs = parse_acceptance_criteria(Path(spec_file).read_text(encoding="utf-8"))
    return {
        "plan_path": plan_path,
        "plan_text": plan_text,
        "spec_id": spec_id,
        "spec_file": spec_file,
        "acs": acs,
    }
