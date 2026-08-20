# /layer-check — Ad-hoc Architecture Violation Scan

**Verified:** 2026-06-18 · **Staleness threshold:** 60 days  
**Libraries:** harness toolchain (uv, ruff, mypy, pytest) — process skill, no external library pins  

Triggered by: `/layer-check`

```bash
echo "=== ruff ==="
uv run ruff check src/ 2>&1

echo "=== mypy ==="
uv run mypy src/ 2>&1

echo "=== print() in src/ ==="
grep -rn "^\s*print(" src/ --include="*.py" | grep -v "src/providers/logger" | grep -v "src/config"

echo "=== os.environ outside settings ==="
grep -rn "os\.environ" src/ --include="*.py" | grep -v "src/config/settings.py"

echo "=== HTTPException in services ==="
grep -rn "HTTPException" src/services/ --include="*.py" 2>/dev/null

echo "=== raw dict returns in repo ==="
grep -rn "return row\.__dict__\|return dict(row" src/repo/ --include="*.py" 2>/dev/null

echo "=== offset pagination ==="
grep -rn "\.offset(\|OFFSET" src/repo/ --include="*.py" 2>/dev/null

echo "=== file sizes ==="
find src/ -name "*.py" | xargs wc -l | sort -rn | awk '$1 > 400 { print "VIOLATION:", $2, $1, "lines" }'

echo "=== architecture tests ==="
uv run pytest tests/architecture/ -v --no-header 2>&1
```

Output:
```
LAYER CHECK — {timestamp}
ruff:           CLEAN / {N} errors
mypy:           CLEAN / {N} errors
print():        NONE / {list}
os.environ:     NONE / {list}
HTTPException:  NONE / {list}
Raw returns:    NONE / {list}
Offset:         NONE / {list}
File sizes:     NONE / {list}
Arch tests:     PASS / FAIL

OVERALL: ✅ CLEAN / ❌ {N} violations
```
