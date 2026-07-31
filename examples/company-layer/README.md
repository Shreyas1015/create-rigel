# Example company layer

A **company layer** is one git repo holding your organisation's overlay on a Rigel template.
This directory is a working example — `npm test` scaffolds from it, so the format stays honest.

```
rigel-layer.json     name, which base template it extends, extra ownership globs
managed/**           overlaid into every service repo. Rigel owns these: `rigel verify` fails
                     if they're hand-edited, `rigel update` keeps them current.
seed/**              written once at scaffold, then the team owns it. Never overwritten.
```

Use it:

```bash
npx create-rigel my-service --template gh:acme/acme-rigel#a1b2c3d   # pinned by SHA
npx create-rigel my-service --template ./path/to/layer              # while developing one
```

The resolved URL **and commit SHA** are recorded in the service's `.rigel/manifest.json`, so
`rigel update` can reach both the base template and the layer later.

## What belongs in a layer

Things that can **fail a build**: lint rules, arch tests, CI workflows, gate steps, path-scoped
agent rules. If it can't fail a build, it's a doc — put it in your wiki, not here.

`ownership.managed` extends the base contract, so files in new directories (like `eslint-rules/`)
are protected too. Without that entry they'd be unowned: never updated, never verified.
