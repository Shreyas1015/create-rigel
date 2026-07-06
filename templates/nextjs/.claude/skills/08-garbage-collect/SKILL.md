# /garbage-collect — End-of-Feature Cleanup

Triggered by: /garbage-collect

Calls garbage-collector agent which:
1. Scans file size violations and splits files > 400 lines
2. Removes unnecessary use client directives
3. Runs TypeScript + ESLint --fix
4. Updates stale docs
5. Updates QUALITY_SCORE.md
6. Logs tech debt
7. Closes plan (active/ to completed/)
8. Marks spec SHIPPED
9. Final commit + push
