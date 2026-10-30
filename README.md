# The New Black AI — Claude Code skill

A [Claude Code](https://claude.com/claude-code) skill that teaches Claude
how to integrate [The New Black AI](https://thenewblack.ai)'s fashion
generation API into your codebase: generate fashion images and videos,
poll results, manage credits, publish to Shopify product pages.

## Install

In one command, for Claude Code, Cursor or Codex:

```bash
npx skills add newblackai/claude-skill --skill thenewblack
```

Or by hand, in your project (the skill travels with the repo):

```bash
git clone https://github.com/newblackai/claude-skill .claude/skills/the-new-black-api
```

Or for every project on your machine:

```bash
git clone https://github.com/newblackai/claude-skill ~/.claude/skills/the-new-black-api
```

Then just ask Claude Code — "connect my app to The New Black AI",
"generate product-on-model images for my catalogue", "publish this
visual to my Shopify product page" — and it knows the contract.

You'll need an API key (`tnb_live_…`), created in your
[profile's API tab](https://thenewblack.ai/profile?tab=api). Put it in
`TNB_API_KEY`; the skill insists on that.

## Staying current

The skill deliberately does NOT embed the workflow catalogue: it
instructs Claude to read `GET /v1/workflows` — the live contract — before
writing workflow calls. New workflows and version bumps (`-v2`…) are
picked up automatically, with nothing to update here.

The CLI the skill points to: [`@thenewblack/cli`](https://www.npmjs.com/package/@thenewblack/cli) —
`npx @thenewblack/cli --help`.

Full documentation:
[thenewblack.ai/clothing_fashion_api_integrations](https://thenewblack.ai/clothing_fashion_api_integrations)

## Install in one command

```bash
npx skills add newblackai/claude-skill
```

Works with Claude Code, Cursor, Codex, OpenCode and every agent the `skills` CLI supports. The skill teaches the agent the REST API and the MCP connector (`https://mcp.thenewblack.ai/mcp`); it never embeds the workflow catalogue — the agent reads it live from `GET /v1/catalog`, so new workflows need no skill update.

## Keeping the table and the examples true

The surface table in `SKILL.md` and the calls in `references/examples.md` are typed by hand (they need words the
OpenAPI document does not carry) and checked against the platform:

```
node scripts/check-openapi.mjs              # against thenewblack.ai and the CLI npm serves
FIXTURES=1 node scripts/check-openapi.mjs   # against tests/fixtures (what the CI runs on every push)
node scripts/refresh-fixtures.mjs           # take the fixtures again, read the diff, commit
```

It names any route the table cites that the API does not have, any keyed operation the table does not cite, a
scope that differs, and, in the examples, any workflow, parameter, option or `tnb` flag the platform would refuse.
The CI blocks on the frozen copy; a daily job runs it live and turns red when the platform has moved.
