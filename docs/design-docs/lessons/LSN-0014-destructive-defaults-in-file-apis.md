---
id: LSN-0014
summary: "A file API's default is usually the destructive one — fs.cp force:true, fs.rename clobber. Never copy onto a path you did not create without an explicit collision policy."
status: ENFORCED
seen: 1
first_seen: PLAN-013
last_seen: PLAN-013
signatures: []
enforced_by: "lib/install.mjs declines any differing pre-existing file (force:false + errorOnExist:true); lib/install.test.mjs pins fs.cp's overwrite default; test/smoke.mjs asserts a non-empty target is refused and left byte-identical (tamper-tested)"
---
