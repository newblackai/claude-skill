# Working examples

Every example assumes `TNB_API_KEY` in the environment. Replace workflow
names and parameters with what `GET /v1/workflows` returns — these are
shapes, not contracts.

## curl — the whole loop

```bash
# 1. What can I run, and with which parameters?
curl -s https://thenewblack.ai/api/v1/workflows \
  -H "Authorization: Bearer $TNB_API_KEY"

# 2. Submit (202 — the id comes back instantly, the image doesn't)
curl -s -X POST https://thenewblack.ai/api/v1/generate \
  -H "Authorization: Bearer $TNB_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "workflow": "product_to_model-v1",
    "prompt": "AI model wearing the handbag, studio light",
    "ratio": "4:5",
    "product_images": ["https://example.com/handbag.jpg"]
  }'
# → { "generation_id": "3f1c9a6e-...", "status": "running", "poll": "/api/v1/generations/3f1c9a6e-..." }

# 3. Poll until settled (3-5s apart)
curl -s https://thenewblack.ai/api/v1/generations/3f1c9a6e-... \
  -H "Authorization: Bearer $TNB_API_KEY"
# → { "status": "succeeded", "result": { "type": "image", "url": "https://.../result.webp", ... } }
```

## Node (no dependencies)

```js
const BASE = "https://thenewblack.ai/api/v1";
const headers = {
  Authorization: `Bearer ${process.env.TNB_API_KEY}`,
  "Content-Type": "application/json",
};

async function generate(body) {
  const r = await fetch(`${BASE}/generate`, { method: "POST", headers, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(`${j.error?.code}: ${j.error?.message}`);
  return j.generation_id;
}

async function waitFor(id) {
  for (;;) {
    const r = await fetch(`${BASE}/generations/${id}`, { headers });
    const j = await r.json();
    if (j.status === "succeeded") return j.result;     // { type, url, thumbnail }
    if (j.status === "failed") throw new Error("generation failed (credits refunded)");
    await new Promise((res) => setTimeout(res, 4000));
  }
}

// Results are stored for 48 hours — download and keep your own copy.
const id = await generate({
  workflow: "product_to_model-v1",
  prompt: "AI model wearing the handbag, studio light",
  ratio: "4:5",
  product_images: ["https://example.com/handbag.jpg"],
});
const result = await waitFor(id);
```

## Python (requests)

```python
import os, time, requests

BASE = "https://thenewblack.ai/api/v1"
H = {"Authorization": f"Bearer {os.environ['TNB_API_KEY']}"}

r = requests.post(f"{BASE}/generate", headers=H, json={
    "workflow": "product_to_model-v1",
    "prompt": "AI model wearing the handbag, studio light",
    "ratio": "4:5",
    "product_images": ["https://example.com/handbag.jpg"],
})
r.raise_for_status()
gen_id = r.json()["generation_id"]

while True:
    j = requests.get(f"{BASE}/generations/{gen_id}", headers=H).json()
    if j["status"] == "succeeded":
        result = j["result"]; break
    if j["status"] == "failed":
        raise RuntimeError("generation failed (credits refunded)")
    time.sleep(4)

# Copy result["url"] to your own storage — it expires after 48 hours.
```

## Webhook instead of polling

Pass `"webhook_url": "https://yourapp.com/hooks/tnb"` in the generate
body; the outcome is POSTed there when the generation settles. Poll as a
fallback if the webhook does not arrive — networks drop.

## Shopify: list, then publish

```bash
curl -s https://thenewblack.ai/api/v1/shopify/products \
  -H "Authorization: Bearer $TNB_API_KEY"
# → { "store": "yourbrand.myshopify.com", "products": [{ "id": "gid://shopify/Product/879...", ... }] }

curl -s -X POST https://thenewblack.ai/api/v1/shopify/publish \
  -H "Authorization: Bearer $TNB_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "media_id": "3f1c9a6e-...", "product_id": "8790123456789", "alt": "Boxy tweed jacket on model" }'
# → { "published": true, "preview_url": "https://yourbrand.myshopify.com/products/..." }
```

Publish rules worth coding around: the media must be a creation of the
key's account (`404 media_not_found` otherwise), one product page per
creation (`409 already_published` on a second push — unpublishing
happens in the app), videos up to 96 MB.

## A video, priced by the second

```bash
# The catalogue says which durations a video workflow offers and its price per second.
curl -s -X POST https://thenewblack.ai/api/v1/generate \
  -H "Authorization: Bearer $TNB_API_KEY" -H "Content-Type: application/json" \
  -d '{
    "workflow": "ugc_video-v1",
    "product_image": "https://example.com/bag.jpg",
    "fields": { "script": "I have been wearing this every day this week", "presenter": "a friendly presenter in their twenties", "scene": "White Background Studio" },
    "duration": "10"
  }'
# Poll as for an image; videos take 1–5 minutes. The result carries the mp4 url and a poster.
```

## A video worked on (video → video)

```bash
# Remove Video Background, Reframe Video, Change Video Background, Edit Outfit in Video, Swap Model in Video:
# the clip you send is the input, billed by its own length, read from the file before the job starts.
curl -s -X POST https://thenewblack.ai/api/v1/generate \
  -H "Authorization: Bearer $TNB_API_KEY" -H "Content-Type: application/json" \
  -d '{ "workflow": "reframe_video-v1", "source_video": "https://example.com/clip.mp4", "ratio": "9:16" }'
```

## Publish to a social account

```bash
curl -s https://thenewblack.ai/api/v1/publish/accounts -H "Authorization: Bearer $TNB_API_KEY"
# → connected accounts with their connection_id and the placements each accepts (feed, reel, story…)

curl -s -X POST https://thenewblack.ai/api/v1/publish \
  -H "Authorization: Bearer $TNB_API_KEY" -H "Content-Type: application/json" \
  -d '{ "connection_id": "…", "media_id": "3f1c9a6e-…", "placement": "reel", "caption": "New season." }'
# → { "id": "…", "status": "scheduled" }   then   GET /v1/publish/{id}  until posted (permalink) or failed (reason)
```

## Talk to the account's AI agent

```bash
curl -s https://thenewblack.ai/api/v1/agents -H "Authorization: Bearer $TNB_API_KEY"
# → [{ "id": "…", "name": "Sam", "status": "active", "role": {...}, "busy": false, ... }]

curl -s -X POST https://thenewblack.ai/api/v1/agents/<id>/messages \
  -H "Authorization: Bearer $TNB_API_KEY" -H "Content-Type: application/json" \
  -H "Idempotency-Key: order-8812" \
  -d '{ "message": "Make three on-model visuals of this product and publish them to Instagram.", "media_ids": ["3f1c9a6e-…"] }'
# → 202 { "task_id": "…" } — or, while the agent is busy, { "status": "working", "task_id", "since" }: wait and send again
# The agent works in its one thread, as it would for a person, with the same tools and liberties.
curl -s https://thenewblack.ai/api/v1/agents/<id>/messages -H "Authorization: Bearer $TNB_API_KEY"
# → the thread, each of the agent's messages with typed results (media, post, techpack, file)
```

## The CLI — a folder of photos, without writing a script

```sh
npx @thenewblack/cli login            # once; or export TNB_API_KEY=tnb_live_…
tnb generate product_to_model --help  # the flags, read live from the catalogue

# every product photo of a folder on an AI model, saved with a readable name
for f in ./products/*.jpg; do
  tnb generate product_to_model --product_images "$f" \
    --prompt "AI model wearing the product, studio light, neutral background" \
    --ratio 4:5 --wait --out ./renders/
done
# → renders/robe-verte-product_to_model.webp beside products/robe-verte.jpg

# a virtual try-on with two local pictures (uploaded once, remembered)
tnb generate virtual_try_on --product_images dress.jpg --model_image model.jpg --seg_camera slightly_above --wait --out ./renders/

# a tech pack from photos, then read it
tnb techpack from-photos front.jpg --back back.jpg --sketch front --size-range XS-XL --unit cm
tnb techpack <id> --pretty

# talk to the account's agent
tnb agent send <agent_id> "Make three on-model visuals of the linen shirt" --media <media_id>
tnb agent thread <agent_id> --since 2026-09-12T09:00:00Z
```

Every command prints one line of JSON; errors are the platform's own `{ "error": { "code", "message" } }`
on stderr with exit code 1; a wrong command line exits 2.
