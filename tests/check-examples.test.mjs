import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { checkExamples, validate } from "../scripts/check-examples.mjs";

/* THE EXAMPLES' CHECKER, PROVED ON WHAT IT MUST REFUSE (Audit H-561). The real checkExamples on the real fixtures,
   and the very command the CI runs (FIXTURES=1 node scripts/check-openapi.mjs) on a file holding the bad example. */

const doc = JSON.parse(readFileSync(new URL("./fixtures/openapi.json", import.meta.url), "utf8"));
const help = readFileSync(new URL("./fixtures/cli-help.txt", import.meta.url), "utf8");
const bodyMd = (o) => "```bash\ncurl -d '" + JSON.stringify(o) + "'\n```\n";
const cliMd = (l) => "```sh\n" + l + "\n```\n";
const run = (md) => checkExamples(md, doc, help);
const M = "https://example.com/m.jpg", P = "https://example.com/p.jpg";

const REFUSED = [
  ["a prompt that is a number", bodyMd({ workflow: "freeform_image-v1", prompt: 42 }), /prompt: 42 is a number, the API takes string/],
  ["an empty list of product images", bodyMd({ workflow: "virtual_try_on-v1", product_images: [], model_image: M }), /product_images: at least 1 item/],
  ["a number where a list goes", bodyMd({ workflow: "virtual_try_on-v1", product_images: 42, model_image: M }), /product_images: 42 is a number, the API takes array/],
  ["an invented command under a known one", cliMd("tnb mila dance"), /« dance » is not part of « tnb mila »/],
  ["an object where a string goes, nested", bodyMd({ workflow: "virtual_try_on-v1", product_images: [P], model_image: M, fields: { seg_camera: { a: 1 } } }), /seg_camera: \{"a":1\} is a object, the API takes string/],
  ["null where a url goes", bodyMd({ workflow: "virtual_try_on-v1", product_images: [P], model_image: null }), /model_image: null is a null, the API takes string/],
  ["a url that is not one", bodyMd({ workflow: "virtual_try_on-v1", product_images: ["photo.jpg"], model_image: M }), /product_images\[0\]: "photo.jpg" is not a url/],
  ["too many items", bodyMd({ workflow: "virtual_try_on-v1", product_images: [P, P, P, P], model_image: M }), /at most 3 item/],
  ["a command missing its argument", cliMd("tnb techpack pdf"), /needs <id>/],
  ["a generate line with a stray word", cliMd("tnb generate virtual_try_on extra --product_images a.jpg --model_image m.jpg"), /extra words extra/],
  ["a generate line missing a required picture", cliMd("tnb generate virtual_try_on --model_image m.jpg"), /"product_images" is required/],
];
for (const [what, md, msg] of REFUSED) {
  test(`refused: ${what}`, () => {
    const r = run(md);
    assert.equal(r.checked, 1);
    assert.ok(r.problems.some((p) => msg.test(p)), `${what}: ${JSON.stringify(r.problems)}`);
  });
}

const ACCEPTED = [
  ["a full prompt", bodyMd({ workflow: "freeform_image-v1", prompt: "a coat", ratio: "1:1" })],
  ["a try-on with one product", bodyMd({ workflow: "virtual_try_on-v1", product_images: [P], model_image: M })],
  ["a command and its argument", cliMd("tnb techpack pdf 3f1c9a6e")],
  ["a command with its variadic files and flags", cliMd("tnb techpack from-photos front.jpg back.jpg side.jpg --back back.jpg --unit cm")],
  ["a free message, quoted", cliMd('tnb mila send "Make three visuals" --media 3f1c')],
  ["a CLI file path where a url goes (it is uploaded first)", cliMd("tnb generate virtual_try_on --product_images dress.jpg --product_images skirt.jpg --model_image model.jpg --wait")],
];
for (const [what, md] of ACCEPTED) {
  test(`accepted: ${what}`, () => assert.deepEqual(run(md).problems, []));
}

test("a keyword the checker does not read is reported, never passed in silence", () => {
  const p = [];
  validate({ type: "string", pattern: "^a" }, "b", "x", p, doc);
  assert.match(p.join(), /uses "pattern", which this check does not read/);
});

test("the very command the CI runs fails on a bad examples file, and passes on the real one", () => {
  const dir = mkdtempSync(join(tmpdir(), "skill-"));
  const bad = join(dir, "examples.md");
  writeFileSync(bad, bodyMd({ workflow: "virtual_try_on-v1", product_images: [], model_image: M }) + cliMd("tnb mila dance"));
  const env = { ...process.env, FIXTURES: "1" };
  const failing = spawnSync("node", ["scripts/check-openapi.mjs"], { env: { ...env, EXAMPLES_FILE: bad }, encoding: "utf8" });
  assert.equal(failing.status, 1);
  assert.match(failing.stdout, /at least 1 item/);
  assert.match(failing.stdout, /« dance » is not part of « tnb mila »/);
  const passing = spawnSync("node", ["scripts/check-openapi.mjs"], { env, encoding: "utf8" });
  assert.equal(passing.status, 0, passing.stdout);
});
