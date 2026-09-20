#!/usr/bin/env node
/* THE TABLE IN SKILL.md CANNOT DRIFT FROM THE API (2026-09-20).
   The skill's surface table is typed by hand, because a table needs the
   words an OpenAPI document does not carry. What it must never do is
   name a route the API does not have, or miss a keyed one the API has.
   This script reads the live document and compares. Run it before
   pushing; the site's own test does the same for its doc page and CLI.

   node scripts/check-openapi.mjs            → against thenewblack.ai
   OPENAPI_URL=… node scripts/check-openapi.mjs */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const url = process.env.OPENAPI_URL ?? "https://thenewblack.ai/api/v1/openapi.json";
const doc = await (await fetch(url)).json();

const shape = (p) => p.replace(/\{[^}]+\}/g, "{}").replace(/\/$/, "");
/* The API's keyed operations: "GET /techpacks/{}". Public ones and the
   catalogue's three need no row. */
const api = new Map();
for (const [path, ops] of Object.entries(doc.paths ?? {})) {
  for (const [method, op] of Object.entries(ops)) {
    if (!/^(get|post|put|patch|delete)$/.test(method)) continue;
    const scope = op["x-scope"] ?? (op.security?.length ? "keyed" : "public");
    api.set(`${method.toUpperCase()} ${shape(path)}`, scope);
  }
}

/* The rows of SKILL.md: every `METHOD /v1/...` pair, `…` continuing the
   previous path, `[/{id}]` an optional segment, `GET`/`POST` a pair. */
const md = readFileSync(join(here, "..", "SKILL.md"), "utf8");
const cited = new Set();
for (const line of md.split("\n")) {
  if (!line.startsWith("|")) continue;
  const cell = line.split("|")[1] ?? "";
  let last = null;
  for (const m of cell.matchAll(/`((?:(?:GET|POST|PUT|PATCH|DELETE)`?(?:\/`)?`?\s*)+)(…[^`]*|\/v1[^`]*)`/g)) {
    const methods = [...m[1].matchAll(/GET|POST|PUT|PATCH|DELETE/g)].map((x) => x[0]);
    let path = m[2].replace(/^\/v1/, "");
    /* "…/messages" after "/agents/{id}/messages", "…/{id}/sections" after
       "/techpacks/{id}": the dots stand for whichever prefix of the
       previous path makes a route the API has. */
    if (path.startsWith("…")) {
      if (!last) continue;
      const suffix = path.slice(1);
      const segs = last.split("/");
      const candidates = segs.map((_, i) => segs.slice(0, segs.length - i).join("/") + suffix);
      path = candidates.find((c) => methods.some((method) => api.has(`${method} ${shape(c.replace(/\{id or path\}/, "{}"))}`))) ?? candidates[0];
    }
    const variants = path.includes("[") ? [path.replace(/\[[^\]]*\]/, ""), path.replace(/[\[\]]/g, "")] : [path];
    for (const v of variants) for (const method of methods) cited.add(`${method} ${shape(v.replace(/\{id or path\}/, "{}").replace(/\?.*$/, ""))}`);
    last = variants[variants.length - 1];
  }
}

const unknown = [...cited].filter((k) => !api.has(k) && !k.endsWith("/openapi.json"));
const missing = [...api.entries()].filter(([k, scope]) => scope !== "public" && !cited.has(k) && k !== "POST /generate").map(([k]) => k);
if (unknown.length) console.log("Named in SKILL.md, not in the API:\n  " + unknown.join("\n  "));
if (missing.length) console.log("Keyed in the API, not in SKILL.md:\n  " + missing.join("\n  "));
if (!unknown.length && !missing.length) console.log(`SKILL.md matches ${api.size} operations of ${url}`);
process.exit(unknown.length || missing.length ? 1 : 0);
