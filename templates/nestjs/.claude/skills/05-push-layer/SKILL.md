# /push-layer
1. npx tsc --noEmit && npx eslint src/ --max-warnings=0
2. If fails → stop
3. git add -A
4. git commit -m "{type}({scope}): {description from active plan}"
5. git push origin main
