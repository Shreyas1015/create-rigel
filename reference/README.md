# Reference corpus

The default corpus `rigel-design-notes` serves when nothing else is configured. Each note covers one
class of decision that `/write-design` requires an answer for, and cites the public standard that
settles it — OWASP ASVS, the Google SRE Book, RFC 9110, 12-Factor, AWS Well-Architected.

These are **decision aids, not tutorials**. Each answers: what has to be chosen, what the options
cost, and how the choice is usually got wrong.

## Bringing your own

Point `RIGEL_NOTES_PATH` at any directory of markdown, or pin one per project:

```json
// .rigel/design-refs.json
{ "corpus": "/absolute/path/to/your/notes" }
```

Yours takes precedence; these stay as the fallback for anything it doesn't cover. Headings become
citable anchors — `note.md#some-heading` — so any well-structured markdown works with no conversion.
