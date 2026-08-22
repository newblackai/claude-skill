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
