#!/usr/bin/env node
/* THE TABLE IN SKILL.md CANNOT DRIFT FROM THE API (2026-09-20).
   The skill's surface table is typed by hand, because a table needs the
   words an OpenAPI document does not carry. What it must never do is
   name a route the API does not have, or miss a keyed one the API has,
   or give a route another scope than the one the API demands.
   This script reads the live document and compares. Run it before
   pushing; the site's own test does the same for its doc page and CLI.

   node scripts/check-openapi.mjs            → against thenewblack.ai (and the CLI npm serves)
   OPENAPI_URL=… node scripts/check-openapi.mjs
   FIXTURES=1 node scripts/check-openapi.mjs → against tests/fixtures (the CI's blocking check, no network)

   Since lot L7 it also checks references/examples.md (scripts/check-examples.mjs): every workflow, parameter, option
   and CLI flag an example uses must be one the platform accepts today. */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { checkExamples } from "./check-examples.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = process.env.FIXTURES === "1";
const url = fixtures ? "tests/fixtures/openapi.json" : process.env.OPENAPI_URL ?? "https://thenewblack.ai/api/v1/openapi.json";
const doc = fixtures ? JSON.parse(readFileSync(join(here, "..", "tests", "fixtures", "openapi.json"), "utf8")) : await (await fetch(url)).json();
/* The CLI's help: the frozen copy, or the one npm serves now (it is written on stderr). */
const cliHelp = fixtures
  ? readFileSync(join(here, "..", "tests", "fixtures", "cli-help.txt"), "utf8")
  : (({ stdout, stderr }) => `${stdout ?? ""}${stderr ?? ""}`)(spawnSync("npx", ["-y", "@thenewblack/cli@latest", "help"], { encoding: "utf8" }));

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
/* THE RIGHTS TOO (Audit H-509, 2026-10-29): each row's Scope cell is the scope the API demands of every route it
   names — a row saying `read` over a `generate` route sends a reader to a 403. */
const rowScope = new Map();
for (const line of md.split("\n")) {
  if (!line.startsWith("|")) continue;
  const cell = line.split("|")[1] ?? "";
  const scopeCell = (line.split("|")[2] ?? "").trim();
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
    for (const v of variants) for (const method of methods) {
      const k = `${method} ${shape(v.replace(/\{id or path\}/, "{}").replace(/\?.*$/, ""))}`;
      cited.add(k);
      if (/^(public|read|generate|publish|agents)$/.test(scopeCell)) rowScope.set(k, scopeCell);
    }
    last = variants[variants.length - 1];
  }
}

const unknown = [...cited].filter((k) => !api.has(k) && !k.endsWith("/openapi.json"));
const missing = [...api.entries()].filter(([k, scope]) => scope !== "public" && !cited.has(k) && k !== "POST /generate").map(([k]) => k);
const wrongScope = [...rowScope.entries()].filter(([k, sc]) => api.has(k) && api.get(k) !== "keyed" && api.get(k) !== sc).map(([k, sc]) => `${k}: SKILL.md says ${sc}, the API demands ${api.get(k)}`);
if (unknown.length) console.log("Named in SKILL.md, not in the API:\n  " + unknown.join("\n  "));
if (wrongScope.length) console.log("Scope in SKILL.md differs from the API:\n  " + wrongScope.join("\n  "));
if (missing.length) console.log("Keyed in the API, not in SKILL.md:\n  " + missing.join("\n  "));
if (!unknown.length && !missing.length && !wrongScope.length) console.log(`SKILL.md matches ${api.size} operations of ${url}, scopes included`);

/* EXAMPLES_FILE: another examples file, for the tests that prove this very path fails on a bad one. */
const examplesFile = process.env.EXAMPLES_FILE ?? join(here, "..", "references", "examples.md");
const examples = checkExamples(readFileSync(examplesFile, "utf8"), doc, cliHelp);
if (examples.problems.length) console.log("references/examples.md, refused by the platform as it is today:\n  " + examples.problems.join("\n  "));
else console.log(`references/examples.md: ${examples.checked} calls and command lines, none refused by the workflow schemas (types, enums, consts, required, item counts, url format) or the CLI's help (commands, arguments, flags)`);
process.exit(unknown.length || missing.length || wrongScope.length || examples.problems.length ? 1 : 0);
