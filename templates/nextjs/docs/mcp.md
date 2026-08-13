# MCP servers

An MCP server gives the agent a capability it does not otherwise have. Two things make that
dangerous rather than useful, and this page is organised around both:

1. **A declared server that cannot start is a silent no-op.** It loads as "configured", provides no
   tools, reports no error, and the agent answers from training data instead. Same false-green class
   as a test runner that executes zero tests. `npm run mcp:check` is a gate step precisely so that
   cannot happen quietly.
2. **Every server costs context on every turn**, whether or not it is used. A server earns its line
   by doing something Claude Code's built-in tools cannot.

---

## Shipped by default

These are declared in [`.mcp.json`](../.mcp.json) and checked by the gate. Neither needs an account
or an API key.

| Server | Why it earns the line |
| --- | --- |
| **context7** — `npx -y @upstash/context7-mcp` | Live, version-correct library docs. Every skill with a non-empty `libraries:` list owes a Skill Freshness Check, and answering *"what changed in v6?"* from training data is exactly the stale-knowledge failure that check exists to catch. |
| **playwright** — `npx -y @playwright/mcp@latest` | Drives a real browser. This template already ships e2e tests and captures screenshots for the vision-judge, so letting the agent open the page it just built closes that loop instead of making it guess from the DOM. |

Verify whatever you have declared:

```bash
npm run mcp:check
```

It validates the file, every entry, and that every launcher exists on `PATH`. It does **not** launch
the servers or reach the network — a gate that fails because a registry was slow teaches people to
skip the gate. It prints what it did not prove, so a pass is never mistaken for "the servers work".
| **design-notes** — `npx -y create-rigel mcp-design-notes` | Gives the agent a reference corpus to ground design decisions in, instead of whatever it remembered. Ships with notes on authorization, idempotency, failure handling, data retention and rate limiting, each citing the public standard that settles it. `/write-design` cites these refs and the gate verifies they resolve. |

### Using your own notes instead

The corpus is a plug, not a fixture. Point it at any directory of markdown — your own notes, a team
handbook, an internal standards repo:

```bash
export RIGEL_NOTES_PATH=~/notes/my-system-design-notes
```

Headings become citable anchors (`note.md#some-heading`), so well-structured markdown works with no
conversion. Yours takes precedence; the shipped notes stay as the fallback for anything yours does
not cover.

Then record the index so the gate can verify citations **offline** — on CI, and on a machine that
has never seen your notes:

```bash
npx create-rigel design-index          # or: design-index /path/to/notes
```

That writes `.rigel/design-refs.json` — headings only, no content — which you commit. A 358-note
corpus indexes to roughly 300 KB.

If a big notes repo is mostly images, clone just the markdown:

```bash
git clone --filter=blob:none --sparse --depth 1 <repo> notes
cd notes && git sparse-checkout set --no-cone '**/*.md'
```


---

## Opt-in

Add only what you will use. Each line states the real cost.

> Chrome DevTools MCP is **not** listed here: **playwright** above already drives a real browser
> for this template, and running both means two browser tool-sets competing for the same job.

| Server | Add it with | Cost | Buys you |
| --- | --- | --- | --- |
| **GitHub** | `claude mcp add --transport http github https://api.githubcopilot.com/mcp/` | GitHub auth | PR and issue work from `/open-pr` without shelling out to `gh` |
| **sequential-thinking** | `claude mcp add sequential-thinking -- npx -y @modelcontextprotocol/server-sequential-thinking` | none | Structured multi-step reasoning for genuinely branchy problems |
| **Exa** | `claude mcp add exa -- npx -y exa-mcp-server` | API key | Web research meaningfully better than raw fetch |
| **code-review-graph** | `claude mcp add code-review-graph -- uvx code-review-graph serve` | Python 3.10+, `uv`, and a genuinely slow first install | Real AST blast radius. Parses with tree-sitter into a symbol graph, so it resolves *which function* changed and who calls it — where `create-rigel impact` works at file level. Also returns a minimal review set, which is where the token savings come from |

#### On code-review-graph vs `create-rigel impact`

Both answer "if I change this, what else is involved?", and they are not competing — they sit at
different points on a cost curve, so keep both:

| | `create-rigel impact` | code-review-graph |
| --- | --- | --- |
| Parsing | regex over import statements | tree-sitter AST → symbol graph |
| Granularity | file level | function/symbol level |
| Install | none — ships with the scaffolder | Python 3.10+, `uv`. On a 2026 laptop the first `uvx code-review-graph index .` **had not finished after 20 minutes** — dependency resolution plus native tree-sitter builds. Budget for it once, on a good connection |
| Speed once ready | ~18 ms on a 78-file repo | indexes to a SQLite graph, then queries are fast |
| Blocks a build? | no — it is a lens | no — also a lens |

`impact` is the **floor**: zero dependencies, always present, and wired into `/write-spec`'s
`impact:` declaration which the contract gate does enforce. That is why it stays as-is.

code-review-graph is a genuine upgrade in *precision* — file-level blast radius over-reports, and
symbol-level does not. Worth adding on a large codebase or when review context cost is real. It is
opt-in rather than shipped because a Node project should not be made to install a Python toolchain
to scaffold, and because neither tool fails a build: precision you have to install is a preference,
not a guarantee.


**Do not use `@modelcontextprotocol/server-github`.** It is deprecated on npm ("Package no longer
supported"). GitHub's official server is the remote endpoint in the table above; the source lives at
[github/github-mcp-server](https://github.com/github/github-mcp-server).

---

## Deliberately not shipped

Saying no is most of the work. Each of these is a reasonable thing to want and still wrong as a
default.

| Not shipped | Why |
| --- | --- |
| **Filesystem / Git / Fetch MCP** | Claude Code already has file, bash, git and web tools. These duplicate them and spend context on every turn — pure tax. |
| **`@modelcontextprotocol/server-memory`** | An unenforced knowledge graph, parallel to `docs/design-docs/lessons/`. Two memories that can disagree is worse than one that cannot: this repo's lessons climb OBSERVED → ENFORCED and are cited by gate signatures, so they are checkable. A second, softer store would be the one people write to. |
| **Hosted repo-ingesting scanners** | For a repo whose whole claim is provenance and verifiable checks, defaulting anyone into uploading their source to a closed service is off-thesis. Adopt one deliberately if you want it. |

---

### Proving a server actually works

`mcp:check` is deliberately offline: it proves the declaration is well-formed and every launcher
exists on `PATH`, and it says plainly what it did **not** prove. It never starts a server, because a
gate that fails when a registry is slow is a gate people learn to skip.

The other half is one command:

```bash
claude mcp list      # starts each server, performs the handshake, reports health
```

Run it when the agent seems to be missing a capability it was told it had. It is **not** part of the
gate, on purpose — it needs the network, and it can prompt for approval on project-scoped servers.

> **Why there is no check *before* each MCP tool call.** It would not work. A server's tools only
> exist after a successful handshake, so a server that never started — the exact failure worth
> catching — contributes no tools, and a hook watching for those tool calls never fires. The two
> layers above are the ones that can actually observe the problem.

---

## Adding your own

```bash
claude mcp add <name> -- <command> [args...]     # local process
claude mcp add --transport http <name> <url>     # remote endpoint
npm run mcp:check                                # then prove it can actually start
```

Give the entry a `"//"` key explaining what it does that the built-ins cannot. The next person to
read `.mcp.json` — including the agent — has no other way to know why it is there.

---

## A note on freshness

Package names and endpoints in this file were verified against the npm registry and the GitHub API
on **2026-08-10**. MCP is young and moves fast; `@modelcontextprotocol/server-github` was a standard
recommendation until it was deprecated. If a command here fails, check the upstream project before
assuming your setup is broken — and `npm run mcp:check` will tell you which entry is at fault rather
than leaving the agent quietly short a capability.
