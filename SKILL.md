---
name: the-new-black-api
description: Integrate The New Black AI's fashion generation API (thenewblack.ai) into any codebase — generate fashion images/videos from prompts and reference images, poll results, check credits, publish to Shopify product pages. Use when the user wants to connect their system, store, or app to The New Black AI, mentions the TNB API, tnb_live keys, or AI fashion image generation by API.
---

# The New Black AI — API integration

REST API for AI fashion visuals: 25+ studio workflows (design generation,
product-to-model, virtual try-on, fabric swaps, video, HD enhance…), each
callable through ONE endpoint. Base URL: `https://thenewblack.ai/api/v1`.
JSON in, JSON out.

## Rules that keep integrations correct

1. **Never hardcode the API key.** It is a `tnb_live_…` secret, shown once
   at creation. Put it in an environment variable (suggest `TNB_API_KEY`)
   and send it as `Authorization: Bearer $TNB_API_KEY`. Server-side only —
   never in a browser, never committed.
2. **Read the live catalogue before writing workflow calls.** Workflow
   names, parameters and versions come from
   `GET /v1/workflows` — fetch it (with the user's key) and generate code
   against what it returns. Do NOT rely on memorized workflow names or
   parameters: versions move (e.g. a workflow graduating to `-v2`) and the
   catalogue is the source of truth. Each workflow also has a human page
   at https://thenewblack.ai/clothing_fashion_api_integrations
3. **The API is asynchronous.** `POST /v1/generate` answers `202` with a
   `generation_id` immediately; the image is NOT in that response. Poll
   `GET /v1/generations/{id}` every 3–5 seconds (generations take
   ~15–60s), or pass `webhook_url` and receive the outcome as a POST.
4. **Results live 48 hours.** Copy the result file to the user's own
   storage as soon as it succeeds; never store our URL as permanent.
5. **Credits are debited at submission and refunded on failure.** A
   `402 insufficient_credits` means the ACCOUNT needs topping up
   (`GET /v1/credits` reads the balance) — it is not a code bug; surface
   it to the user instead of retrying.

## The stable surface

| Endpoint | Scope | Purpose |
|---|---|---|
| `GET /v1/workflows` | read | Live catalogue: every workflow, its versioned name (`key-vN`), named image params, fields, prices |
| `POST /v1/generate` | generate | Run any workflow. `202` → `{ generation_id, status, poll }` |
| `GET /v1/generations/{id}` | read | Poll until `status` is `succeeded` (result URLs inside) or `failed` (auto-refunded) |
| `GET /v1/credits` | read | `{ "credits": 142 }` |
| `GET /v1/shopify/products` | read | Connected store's catalogue. No store → `{ "store": null, "products": [] }` (an answer, not an error) |
| `POST /v1/shopify/publish` | publish | Push a creation onto a product page — images and videos, same route |

`POST /v1/generate` body: `workflow` (versioned name), `prompt` (if the
workflow takes one), **named** image parameters exactly as the catalogue
declares them (`sketch_image`, `model_image`, … — positional arrays are
refused), optional `fields`, `variant`, `tier` (`standard`|`pro`),
`ratio` or `duration`, `webhook_url`. Validation happens BEFORE any
debit: an unknown parameter or missing slot is refused with the
contract's words and costs nothing.

Shopify publish: `product_id` (gid or bare number from
/v1/shopify/products) + `media_id` (a generation's id) or `url` (its
file url — must be the account's own creation). One product page per
creation: a second publish answers `409 already_published`. Needs the
`publish` scope and an active plan.

## Errors

JSON with a stable code: `{ "error": { "code": "…", "message": "…" } }`.
`401` missing/invalid key · `402` insufficient_credits · `403`
missing_scope or premium_required · `404` unknown_workflow / not_found /
media_not_found · `409` no_store / already_published · `413`
file_too_large · `502` generation_refused (refunded) /
shopify_unreachable.

## Keys

Created (max 3, scoped: generate/read/publish) in the account's
Profile → API tab at thenewblack.ai. Keys belong to the paying account —
on a team they spend the leader's credits. Migrating from the legacy
(Bubble) API: keys are NOT carried over; create a fresh key and point
the integration at `/api/v1`.

For working code in curl, Node and Python — including the full
generate-poll-save loop and the Shopify flow — read
[references/examples.md](references/examples.md).
