const { test } = require("node:test");
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  { spawnSync } = require("node:child_process"),
  M = require("../js/model");
const root = path.join(__dirname, "..");
test("all shipped JSON samples validate as version 2", () => {
  for (const file of fs
    .readdirSync(path.join(root, "examples"))
    .filter((f) => f.endsWith(".json"))) {
    const d = M.parse(
      fs.readFileSync(path.join(root, "examples", file), "utf8"),
    );
    assert.equal(d.version, 2);
    assert(d.tasks.length);
  }
});
test("standalone LLM specification embeds the exact validated example", () => {
  const spec = fs.readFileSync(
      path.join(root, "docs/llm-json-generation.md"),
      "utf8",
    ),
    block = spec.match(/```json\n([\s\S]*?)\n```/)[1];
  assert.deepEqual(
    M.parse(block),
    M.parse(
      fs.readFileSync(path.join(root, "examples/llm-example.json"), "utf8"),
    ),
  );
});
test("CLI validates file and stdin using editor importer", () => {
  const cli = path.join(root, "scripts/validate-mission.cjs"),
    example = path.join(root, "examples/llm-example.json");
  for (const [args, input] of [
    [[example], undefined],
    [["-"], fs.readFileSync(example, "utf8")],
  ]) {
    const r = spawnSync(process.execPath, [cli, ...args], {
      encoding: "utf8",
      input,
    });
    assert.equal(r.status, 0, r.stderr);
    const model = M.parse(fs.readFileSync(example, 'utf8'));
    assert(r.stdout.includes(`Task ${model.tasks.length} / CausalLink ${model.causalLinks.length}`));
  }
});
test("CLI rejects legacy / malformed input and invalid usage with meaningful exit status", () => {
  const cli = path.join(root, "scripts/validate-mission.cjs");
  for (const input of ['{"version":1}', "not JSON"]) {
    const r = spawnSync(process.execPath, [cli, "-"], {
      encoding: "utf8",
      input,
    });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /INVALID/);
  }
  assert.equal(
    spawnSync(process.execPath, [cli], { encoding: "utf8" }).status,
    2,
  );
});
test("repository skill identifies v2 and links to existing spec and example", () => {
  const file = path.join(root, "skills/imee-json-generator/SKILL.md"),
    s = fs.readFileSync(file, "utf8");
  assert.match(s, /name: imee-json-generator/);
  assert.match(s, /version: 2/);
  for (const m of s.matchAll(/\]\((\.\.\/[^)]+)\)/g))
    assert(fs.existsSync(path.resolve(path.dirname(file), m[1])));
  assert(!s.includes("validateExtensions"));
});
