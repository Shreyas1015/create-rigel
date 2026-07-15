# Contributing

Thanks for helping improve `create-rigel`.

## Repo layout

```text
cli.js                 # the scaffolder (zero dependencies, Node builtins only)
templates/             # the source of truth for every stack
  nextjs/  express/  nestjs/  fastapi/
test/smoke.mjs         # scaffolds every template and asserts it lands
```

This is a monorepo: **the templates live here.** Edit a template in `templates/<stack>/`
and it ships in the next release — there is no separate template repo to sync.

## Run it locally

```bash
node cli.js /tmp/demo-app --template nextjs   # scaffold without publishing
npm test                                      # scaffold all four + assert
```

## Add or change a stack

1. Add or edit the folder under `templates/<stack>/`.
2. Name any ignore files `gitignore` / `npmignore` (no leading dot) — npm strips real
   `.gitignore` files from the tarball; the CLI restores the dot on scaffold.
3. Register the stack in the `STACKS` map in `cli.js`.
4. `npm test` must pass.

## Releasing (maintainers)

```bash
npm version patch          # or minor / major — bumps package.json + tags
git push --follow-tags     # the Release workflow publishes to npm with provenance
```

Update `CHANGELOG.md` in the same PR. Follow [Semantic Versioning](https://semver.org).

## Commit style

Conventional Commits are appreciated (`feat:`, `fix:`, `docs:`, `chore:`), but not required.
