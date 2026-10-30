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

function validate(schema, value, at, problems, doc) {
  if (schema?.$ref) schema = doc.components.schemas[schema.$ref.split("/").pop()];
  if (!schema) return;
  if (schema.const !== undefined && value !== schema.const) problems.push(`${at}: must be ${JSON.stringify(schema.const)}, not ${JSON.stringify(value)}`);
  if (schema.enum && !schema.enum.includes(value)) problems.push(`${at}: ${JSON.stringify(value)} is not one of ${schema.enum.join(", ")}`);
  if (schema.type === "object" && value && typeof value === "object" && !Array.isArray(value)) {
    for (const k of Object.keys(value)) {
      if (schema.properties?.[k]) validate(schema.properties[k], value[k], `${at}.${k}`, problems, doc);
      else if (schema.additionalProperties === false) problems.push(`${at}: "${k}" is not a parameter (it takes ${Object.keys(schema.properties ?? {}).join(", ")})`);
    }
    for (const r of schema.required ?? []) if (!(r in value)) problems.push(`${at}: "${r}" is required`);
  }
  if (schema.type === "array" && Array.isArray(value)) {
    if (schema.maxItems !== undefined && value.length > schema.maxItems) problems.push(`${at}: at most ${schema.maxItems}`);
    value.forEach((v, i) => validate(schema.items, v, `${at}[${i}]`, problems, doc));
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

/** The flags as the CLI reads them: `--a b` takes a value unless the next word is a flag. */
function flagsOf(words) {
  const flags = [];
  for (let i = 0; i < words.length; i++) {
    if (!words[i].startsWith("--")) continue;
    const name = words[i].slice(2);
    const next = words[i + 1];
    flags.push({ name, value: next && !next.startsWith("--") ? next.replace(/^["']|["']$/g, "") : true });
  }
  return flags;
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
  const helpLines = help.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("tnb "));
  for (const { line, words } of commands(md)) {
    checked++;
    if (words[0] === "generate") {
      const key = words[1];
      if (!key || key.startsWith("--")) continue;
      const schema = schemaOf(doc, `${key}-v1`) ?? Object.entries(doc.components?.schemas ?? {}).find(([k]) => k.startsWith(`Generate_${key}_v`))?.[1];
      if (!schema) { problems.push(`examples.md:${line}: tnb generate ${key} — no such workflow in the API`); continue; }
      /* `--help` reads the flags; it is not a call. */
      if (words.includes("--help")) continue;
      const body = {};
      for (const f of flagsOf(words)) {
        if (CLI_ONLY.has(f.name)) continue;
        const k = f.name.replace(/-/g, "_");
        if (schema.properties?.[k]) body[k] = schema.properties[k].type === "array" ? [f.value] : f.value;
        else if (schema.properties?.fields?.properties?.[k]) (body.fields ??= {})[k] = f.value;
        else problems.push(`examples.md:${line}: tnb generate ${key} --${f.name} — not a flag of this workflow`);
      }
      const p = [];
      validate({ ...schema, required: (schema.required ?? []).filter((r) => r !== "workflow") }, body, `tnb generate ${key}`, p, doc);
      /* A file path stands for an uploaded picture's url: only the url's format is not checked. */
      problems.push(...p.filter((x) => !/must be|format/.test(x) || /is not one of/.test(x)).map((x) => `examples.md:${line}: ${x}`));
      continue;
    }
    /* Any other command: the longest help line whose words match (a <placeholder> matches any word). */
    const literal = words.filter((w) => !w.startsWith("--"));
    const match = helpLines
      .map((h) => ({ h, cmd: h.split(/\s{2,}/)[0].replace(/\[[^\]]*\]/g, " ").split(/\s+/).slice(1).filter((w) => w && !w.startsWith("--")) }))
      .filter(({ cmd }) => cmd.length && cmd.every((w, i) => (w.startsWith("<") ? literal[i] !== undefined : literal[i] === w)))
      .sort((a, b) => b.cmd.filter((w) => !w.startsWith("<")).length - a.cmd.filter((w) => !w.startsWith("<")).length)[0];
    if (!match) { problems.push(`examples.md:${line}: tnb ${words.join(" ")} — no such command in the CLI's help`); continue; }
    for (const f of flagsOf(words)) if (!GLOBAL_FLAGS.has(f.name) && !match.h.includes(`--${f.name}`)) problems.push(`examples.md:${line}: tnb ${words.join(" ")} — --${f.name} is not a flag the CLI shows for « tnb ${match.cmd.join(" ")} »`);
  }
  return { problems, checked };
}
