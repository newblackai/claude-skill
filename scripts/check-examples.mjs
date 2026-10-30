/* THE EXAMPLES CANNOT DRIFT EITHER (Audit H-516 → H-521, lot L7).
   references/examples.md is prose with calls in it — curl bodies, a Node and a Python object, `tnb` command lines.
   Each call must be one the platform accepts today:
   · a body naming a `workflow` is checked against that workflow's own schema in the OpenAPI (components
     Generate_<endpoint>): the endpoint exists, no key the schema does not have, every required one present, every
     value inside its enum — nested `fields` included;
   · `tnb generate <key> --flag value …` the same way, each flag read as the body key the CLI sends;
   · any other `tnb …` line must name a command the CLI's help lists, with only the flags that command shows.
   No dependency: the schemas are strict objects, enums and arrays — the subset read here. */

const CLI_ONLY = new Set(["wait", "out", "project", "pretty", "help", "timeout", "json", "fresh", "key"]);
const GLOBAL_FLAGS = new Set(["pretty", "help", "json", "fresh"]);

/* THE SUBSET OF JSON SCHEMA THE Generate_ SCHEMAS USE — and only that (Audit H-561). Checked: type (one or a list:
   string, integer, number, boolean, object, array, null), const, enum, format "uri", properties, additionalProperties
   false, required, items, minItems, maxItems. Ignored as annotations: description, default, title, examples, x-*.
   Any OTHER keyword is reported as unsupported rather than passed in silence, so a schema the platform makes richer
   tomorrow fails here until this reader learns it. `opts.uriAsPath`: in a CLI line a file path stands where the url
   the CLI uploads it to will go — that, and only the format, is tolerated. */
const CHECKED = new Set(["type", "const", "enum", "format", "properties", "additionalProperties", "required", "items", "minItems", "maxItems", "$ref"]);
const ANNOTATIONS = new Set(["description", "default", "title", "examples"]);
const typeOf = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : Number.isInteger(v) ? "integer" : typeof v);

export function validate(schema, value, at, problems, doc, opts = {}) {
  if (schema?.$ref) schema = doc.components.schemas[schema.$ref.split("/").pop()];
  if (!schema || typeof schema !== "object") return;
  for (const k of Object.keys(schema)) if (!CHECKED.has(k) && !ANNOTATIONS.has(k) && !k.startsWith("x-")) problems.push(`${at}: the schema uses "${k}", which this check does not read`);
  if (schema.type !== undefined) {
    const allowed = [].concat(schema.type);
    const t = typeOf(value);
    const ok = allowed.includes(t) || (t === "integer" && allowed.includes("number"));
    if (!ok) { problems.push(`${at}: ${JSON.stringify(value)} is ${t === "integer" || t === "number" ? "a number" : `a ${t}`}, the API takes ${allowed.join(" or ")}`); return; }
  }
  if (schema.const !== undefined && value !== schema.const) problems.push(`${at}: must be ${JSON.stringify(schema.const)}, not ${JSON.stringify(value)}`);
  if (schema.enum && !schema.enum.includes(value)) problems.push(`${at}: ${JSON.stringify(value)} is not one of ${schema.enum.join(", ")}`);
  if (schema.format === "uri" && typeof value === "string" && !opts.uriAsPath && !/^https?:\/\/\S+$/.test(value)) problems.push(`${at}: ${JSON.stringify(value)} is not a url`);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const k of Object.keys(value)) {
      if (schema.properties?.[k]) validate(schema.properties[k], value[k], `${at}.${k}`, problems, doc, opts);
      else if (schema.additionalProperties === false) problems.push(`${at}: "${k}" is not a parameter (it takes ${Object.keys(schema.properties ?? {}).join(", ")})`);
    }
    for (const r of schema.required ?? []) if (!(r in value)) problems.push(`${at}: "${r}" is required`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) problems.push(`${at}: at least ${schema.minItems} item(s), ${value.length} given`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) problems.push(`${at}: at most ${schema.maxItems} item(s), ${value.length} given`);
    value.forEach((v, i) => validate(schema.items, v, `${at}[${i}]`, problems, doc, opts));
  }
}

const schemaOf = (doc, endpoint) => doc.components?.schemas?.[`Generate_${endpoint.replace(/[^A-Za-z0-9]/g, "_")}`];

/** Every object literal in the text that names a workflow, as data (JSON, a JS literal or a Python dict). */
function bodies(md) {
  const out = [];
  for (const m of md.matchAll(/["']?workflow["']?\s*:\s*"([a-z0-9_]+-v\d+)"/g)) {
    let i = m.index, depth = 0;
    while (i > 0 && !(md[i] === "{" && depth === 0)) { if (md[i] === "}") depth++; if (md[i] === "{") depth--; i--; }
    let j = i, d = 0;
    for (; j < md.length; j++) { if (md[j] === "{") d++; if (md[j] === "}" && --d === 0) break; }
    const raw = md.slice(i, j + 1);
    const json = raw
      .replace(/([{,]\s*)([a-z_][a-z0-9_]*)\s*:/gi, '$1"$2":')
      .replace(/,\s*([}\]])/g, "$1");
    try { out.push({ line: md.slice(0, m.index).split("\n").length, body: JSON.parse(json) }); }
    catch { out.push({ line: md.slice(0, m.index).split("\n").length, body: null, raw }); }
  }
  return out;
}

/** Every `tnb …` command line in the code blocks, continuation lines joined, quoted words kept whole. */
function commands(md) {
  const out = [];
  const lines = md.replace(/\\\n\s*/g, " ").split("\n");
  lines.forEach((l, n) => {
    const m = l.match(/^\s*(?:npx\s+@thenewblack\/cli|tnb)\s+(.*)$/);
    if (!m) return;
    const words = [...m[1].replace(/\s+#.*$/, "").matchAll(/"[^"]*"|'[^']*'|\S+/g)].map((w) => w[0]);
    out.push({ line: n + 1, words });
  });
  return out;
}

/** A command line split as the CLI reads it: `--a b` takes b as its value unless b is a flag; the rest is positional. */
export function splitLine(words) {
  const positional = [], flags = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w.startsWith("--")) {
      const next = words[i + 1];
      const takes = next !== undefined && !next.startsWith("--");
      flags.push({ name: w.slice(2), value: takes ? next.replace(/^["']|["']$/g, "") : true });
      if (takes) i++;
    } else positional.push(w.replace(/^["']|["']$/g, ""));
  }
  return { positional, flags };
}

/** The CLI's help as a grammar: per command, its words, its positional arguments (required, optional, variadic) and
    the flags its line shows. The arguments come from the left column (<id>, <file…>) or, where it shows none, from
    the usage the description writes (« tnb techpack from-photos front.jpg [back.jpg …] … »). */
export function grammarOf(help) {
  const out = [];
  for (const raw of help.split("\n")) {
    const l = raw.trim();
    if (!l.startsWith("tnb ")) continue;
    const [left, ...descParts] = l.split(/\s{2,}/);
    const desc = descParts.join("  ");
    const tokens = (t) => [...t.matchAll(/\[[^\]]*\]|"[^"]*"|\S+/g)].map((m) => m[0]);
    const lt = tokens(left).slice(1);
    const words = [];
    for (const t of lt) { if (/^[a-z][a-z0-9-]*$/.test(t)) words.push(t); else break; }
    const argOf = (t) => {
      const optional = t.startsWith("[");
      const inner = optional ? t.slice(1, -1).trim() : t;
      if (inner.startsWith("--")) return null;
      return { name: t, optional, variadic: /…/.test(inner) };
    };
    let args = lt.slice(words.length).map(argOf).filter(Boolean);
    if (!args.length) {
      /* The usage written in the description, after the same command words. */
      const usage = desc.match(new RegExp(`tnb ${words.join(" ")} (.*)`));
      if (usage) {
        for (const t of tokens(usage[1])) {
          if (t.startsWith("--") || t.startsWith("[--") || /[.:]$/.test(t) && !t.startsWith("[")) break;
          const a = argOf(t);
          if (!a) break;
          args.push(a);
        }
      }
    }
    const flags = new Set([...l.matchAll(/--([a-z][a-z0-9_-]*)/g)].map((m) => m[1]));
    out.push({ words, args, flags });
  }
  return out;
}

export function checkExamples(md, doc, help) {
  const problems = [];
  let checked = 0;
  for (const { line, body, raw } of bodies(md)) {
    checked++;
    if (!body) { problems.push(`examples.md:${line}: a body that cannot be read as data: ${raw.slice(0, 80)}…`); continue; }
    const schema = schemaOf(doc, body.workflow);
    if (!schema) { problems.push(`examples.md:${line}: no workflow ${body.workflow} in the API`); continue; }
    const p = [];
    validate(schema, body, body.workflow, p, doc);
    problems.push(...p.map((x) => `examples.md:${line}: ${x}`));
  }
  const grammar = grammarOf(help);
  for (const { line, words } of commands(md)) {
    checked++;
    const { positional, flags } = splitLine(words);
    if (positional[0] === "generate") {
      const key = positional[1];
      if (!key) { problems.push(`examples.md:${line}: tnb generate needs a workflow key`); continue; }
      if (positional.length > 2) { problems.push(`examples.md:${line}: tnb generate ${key} — extra words ${positional.slice(2).join(" ")}`); continue; }
      const schema = schemaOf(doc, `${key}-v1`) ?? Object.entries(doc.components?.schemas ?? {}).find(([k]) => k.startsWith(`Generate_${key}_v`))?.[1];
      if (!schema) { problems.push(`examples.md:${line}: tnb generate ${key} — no such workflow in the API`); continue; }
      /* `--help` reads the flags; it is not a call. */
      if (flags.some((f) => f.name === "help")) continue;
      const body = {};
      for (const f of flags) {
        if (CLI_ONLY.has(f.name)) continue;
        const k = f.name.replace(/-/g, "_");
        const prop = schema.properties?.[k];
        if (prop) {
          if (prop.type === "array") (body[k] ??= []).push(f.value);
          else body[k] = f.value;
        } else if (schema.properties?.fields?.properties?.[k]) (body.fields ??= {})[k] = f.value;
        else problems.push(`examples.md:${line}: tnb generate ${key} --${f.name} — not a flag of this workflow`);
      }
      const p = [];
      validate({ ...schema, required: (schema.required ?? []).filter((r) => r !== "workflow") }, body, `tnb generate ${key}`, p, doc, { uriAsPath: true });
      problems.push(...p.map((x) => `examples.md:${line}: ${x}`));
      continue;
    }
    /* Any other command: the help line whose command words are EXACTLY the line's leading words (the longest), then
       its positional arguments by the help's own grammar — no extra word taken for a command. */
    const cmd = grammar
      .filter((g) => g.words.every((w, i) => positional[i] === w))
      .sort((a, b) => b.words.length - a.words.length)[0];
    if (!cmd) { problems.push(`examples.md:${line}: tnb ${words.join(" ")} — no such command in the CLI's help`); continue; }
    const rest = positional.slice(cmd.words.length);
    const required = cmd.args.filter((a) => !a.optional).length;
    const variadic = cmd.args.some((a) => a.variadic);
    if (rest.length < required) problems.push(`examples.md:${line}: tnb ${words.join(" ")} — « tnb ${cmd.words.join(" ")} » needs ${cmd.args.map((a) => a.name).join(" ")}`);
    else if (!variadic && rest.length > cmd.args.length) problems.push(`examples.md:${line}: tnb ${words.join(" ")} — « ${rest.slice(cmd.args.length).join(" ")} » is not part of « tnb ${cmd.words.join(" ")}${cmd.args.length ? " " + cmd.args.map((a) => a.name).join(" ") : ""} »`);
    for (const f of flags) if (!GLOBAL_FLAGS.has(f.name) && !cmd.flags.has(f.name)) problems.push(`examples.md:${line}: tnb ${words.join(" ")} — --${f.name} is not a flag the CLI shows for « tnb ${cmd.words.join(" ")} »`);
  }
  return { problems, checked };
}
