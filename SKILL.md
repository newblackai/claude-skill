---
name: thenewblack
description: Give any AI agent or codebase the fashion studio of The New Black AI (thenewblack.ai) — 47 workflows that generate and edit fashion images and videos (design, product-to-model, virtual try-on, fabric, sketch, video, HD), read the account's creations, tech packs and moodboards, publish to Shopify and social accounts, and talk to the account's own AI agents. Use when the user wants to connect a system, store, script or agent to The New Black AI, mentions the TNB API, MCP connector, tnb_live keys, or AI fashion generation by API.
---

# The New Black AI — for agents and integrations

One platform, three doors, one contract:

- **REST API** — `https://thenewblack.ai/api/v1`, JSON in, JSON out. Read below.
- **MCP connector** — `https://mcp.thenewblack.ai/mcp`: the same catalogue as tools, with an
  upload card, for Claude (web, Desktop, Code), Cursor and any MCP client. Connect it with
  the account's API key; it builds its tool list from `/v1/catalog` live.
- **This skill** — how to orchestrate either of them correctly.

## Rules that keep integrations correct

1. **Never hardcode the API key.** It is a `tnb_live_…` secret shown once at creation. Put it
   in an environment variable (suggest `TNB_API_KEY`) and send `Authorization: Bearer $TNB_API_KEY`.
   Server-side only — never in a browser, never committed.
2. **Read the live catalogue before writing workflow calls.** Names, parameters and versions
   come from `GET /v1/catalog` (public, no key) or `GET /v1/workflows` (keyed). Generate code
   against what it returns; never rely on memorized names — versions move (`-v2`), workflows are
   added weekly (47 on 2026-09-12; ten of them video). Every workflow also has a human page under
   https://thenewblack.ai/clothing_fashion_api_integrations
3. **Generation is asynchronous.** `POST /v1/generate` answers `202` with a `generation_id`;
   the result is NOT in that response. Poll `GET /v1/generations/{id}` every 3–5 s (images take
   ~10–60 s, videos 1–5 min), or pass `webhook_url` and receive the outcome as a POST.
4. **Results live 48 hours** on our URL. Copy the file to the user's own storage as soon as it
   succeeds; never store our URL as permanent. (Publishing to Shopify or a social account through
   the API copies it for you.)
5. **Credits are debited at submission and refunded on failure.** `402 insufficient_credits`
   means the ACCOUNT needs topping up (`GET /v1/credits`) — not a bug; surface it, don't retry.
   Video workflows are priced per second (of the clip generated, or of the clip handed in for a
   video-to-video workflow); the catalogue carries every price.
6. **Send image parameters by NAME**, exactly as the catalogue declares them (`product_image`,
   `model_image`, `front_image`…). Positional arrays are refused. Validation happens before any
   debit: a wrong parameter costs nothing and answers with the contract's words.
7. **Idempotency when you talk to an agent**: send `Idempotency-Key: <your id>` on
   `POST /v1/agents/{id}/messages`; a retry with the same key returns the first answer instead
   of filing the request twice. Elsewhere, keep your own record of the `generation_id` or post id.

## The surface

| Endpoint | Scope | Purpose |
|---|---|---|
| `GET /v1/catalog` | public | Every workflow: versioned name (`key-vN`), named image params, fields, variants, formats, durations, prices |
| `GET /v1/catalog/presets` | public | Stock template library (models, products, backgrounds, fabrics, sketches) usable as references |
| `GET /v1/workflows` | read | The same catalogue, keyed (what this key's plan can run) |
| `POST /v1/generate` | generate | Run any workflow → `202 { generation_id, status, poll }` |
| `GET /v1/generations/{id}` | read | Poll: `succeeded` (result URLs inside) or `failed` (refunded, with a code) |
| `GET /v1/credits` | read | `{ "credits": 142.5 }` |
| `GET /v1/media` | read | The account's recent creations — to reuse one as a reference or publish it |
| `GET /v1/elements` | read | The account's own pot: starred creations, starred presets, uploads |
| `GET /v1/projects` | read | The account's projects (collections), the filter every listing takes (`?project=`) |
| `GET /v1/techpacks` · `GET /v1/techpacks/{id}/pdf` | read | Tech packs, and a PDF export returned as a URL |
| `GET /v1/moodboards` · `GET /v1/moodboards/{id}/pdf` | read | Moodboards, same shape |
| `GET /v1/shopify/products` | read | Connected store's catalogue (`{ store: null, products: [] }` when none — an answer, not an error) |
| `POST /v1/shopify/publish` | publish | A creation onto a product page (images and videos) |
| `GET /v1/publish/accounts` | read | Connected social accounts (Instagram, TikTok, X, Pinterest, YouTube) and the placements each accepts |
| `POST /v1/publish` · `GET /v1/publish/{id}` | publish | Post a creation to a connected account; read its state (scheduled, posted with permalink, failed) |
| `GET /v1/agents` | agents | The account's AI agents: name, role, status, liberties, busy or waiting for an answer |
| `POST /v1/agents/{id}/messages` · `GET …/messages` | agents | Talk to an agent in its one thread, read the thread back with typed results (media, post, techpack, file) |
| `POST /v1/agents/{id}/stop` | agents | Stop the running task; what was done stays |

`POST /v1/generate` body: `workflow` (versioned name), the **named** image parameters, `prompt`
(if the workflow takes one), optional `fields` (the catalogue names them), `variant`, `tier`
(`standard` | `pro`), `ratio` or `duration` where offered, `webhook_url`.

Shopify publish: `product_id` (gid or bare number) + `media_id` (a generation's id) or `url`
(a creation's own file url). One product page per creation: a second publish answers
`409 already_published`. Needs the `publish` scope and an active plan.

Agents: an agent is hired in the app (Business plan and above). Through the API you speak to
it exactly as the chat does — same tools, same liberties, nothing widened by a key. Body:
`{ "message": "…", "media_ids": [...] }` (media_ids = the account's own creations). While the
agent is working, a new message answers `{ "status": "working", "task_id", "since" }` — wait,
then send again; a paused agent answers `409 paused`. A question the agent asks you appears in
the thread; answer it with another POST.

## Errors

`{ "error": { "code": "…", "message": "…" } }` with a stable code. `400` bad_json / missing_workflow /
missing_parameter / unknown_parameter / bad_option / unknown_field / too_many_images (the message
names what was expected) · `401` missing/invalid key · `402` insufficient_credits · `403`
missing_scope / premium_required / no_agents_door · `404` unknown_workflow / not_found /
media_not_found / unknown_media · `409` no_store / already_published / paused · `413`
file_too_large · `502` generation_refused (refunded) / shopify_unreachable.

## Keys and scopes

Created in the account's Profile → API tab (max 3), scoped: `read`, `generate`, `publish`,
`agents`. Keys belong to the paying account — on a team they spend the leader's credits.

## Choosing the door

- A script, a backend, a cron: the REST API, with `webhook_url` when you can receive one.
- A Claude / Cursor / MCP session that should *use* the studio: the MCP connector.
- An agent that must *discover* the platform before its human has a key: `GET /v1/catalog`.

For working code in curl, Node and Python — the generate-poll-save loop, a video with its
per-second price, the Shopify and social publish flows, a conversation with an agent — read
[references/examples.md](references/examples.md).
