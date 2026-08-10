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

> The `nextjs` template also ships **playwright** (`npx -y @playwright/mcp@latest`) — it already has
> e2e tests and captures screenshots for the vision-judge, so letting the agent open the page it
> just built closes that loop instead of making it guess from the DOM.

Verify whatever you have declared:

```bash
npm run mcp:check
```

It validates the file, every entry, and that every launcher exists on `PATH`. It does **not** launch
the servers or reach the network — a gate that fails because a registry was slow teaches people to
skip the gate. It prints what it did not prove, so a pass is never mistaken for "the servers work".

---

## Opt-in

Add only what you will use. Each line states the real cost.

| Server | Add it with | Cost | Buys you |
| --- | --- | --- | --- |
| **GitHub** | `claude mcp add --transport http github https://api.githubcopilot.com/mcp/` | GitHub auth | PR and issue work from `/open-pr` without shelling out to `gh` |
| **sequential-thinking** | `claude mcp add sequential-thinking -- npx -y @modelcontextprotocol/server-sequential-thinking` | none | Structured multi-step reasoning for genuinely branchy problems |
| **Chrome DevTools** | `claude mcp add chrome-devtools -- npx -y chrome-devtools-mcp` | a local Chrome | Live page debugging — network, console, DOM against a running browser |
| **Exa** | `claude mcp add exa -- npx -y exa-mcp-server` | API key | Web research meaningfully better than raw fetch |

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
