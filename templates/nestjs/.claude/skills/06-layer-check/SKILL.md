# /layer-check
```bash
npx tsc --noEmit 2>&1 | head -20
npx eslint src/ --max-warnings=0 2>&1 | head -20
grep -rn "console\." src/ --include="*.ts"
grep -rn "process\.env" src/ --include="*.ts" | grep -v "src/config/"
grep -rn "HttpException\b" src/ --include="*.service.ts"
grep -rn "@InjectModel" src/ --include="*.service.ts"
find src/ -name "*.ts" | xargs wc -l | sort -rn | awk '$1 > 400 { print "VIOLATION:", $2, $1 }'
npx jest --no-coverage 2>&1 | tail -5
```
Output: CLEAN or {N} violations.
