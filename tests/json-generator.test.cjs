"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const M = require("../js/model.js");
const root = path.resolve(__dirname, "..");
const script = path.join(root, "scripts/validate-mission.cjs");
const examplePath = path.join(root, "examples/llm-example.json");
const example = () => JSON.parse(fs.readFileSync(examplePath, "utf8"));
const run = (args, input) =>
  spawnSync(process.execPath, [script, ...args], {
    input,
    encoding: "utf8",
    cwd: root,
  });
const check = (doc) => run(["-"], JSON.stringify(doc));

test("CLI validates all shipped JSON examples without changing the files", () => {
  for (const name of fs
    .readdirSync(path.join(root, "examples"))
    .filter((x) => x.endsWith(".json"))) {
    const file = path.join(root, "examples", name);
    const before = fs.readFileSync(file);
    const result = run([file]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^VALID:/);
    assert.deepEqual(fs.readFileSync(file), before);
  }
});

test("standalone specification embeds the complete importable example", () => {
  const spec = fs.readFileSync(
    path.join(root, "docs/llm-json-generation.md"),
    "utf8",
  );
  const blocks = [...spec.matchAll(/```json\n([\s\S]*?)```/g)];
  assert.equal(blocks.length, 1);
  assert.deepEqual(M.parse(blocks[0][1]), M.parse(JSON.stringify(example())));
});

test("example retains planned and actual branches and bindings for all four target types", () => {
  const doc = example();
  M.validate(doc);
  assert.deepEqual(
    new Set(doc.bindings.map((b) => b.targetType)),
    new Set(["actor", "state", "transition", "interaction"]),
  );
  const analysis = M.analyzeTransition(doc, "transition-goal");
  assert.ok(analysis.paths.some((p) => p.structural));
  assert.ok(analysis.paths.every((p) => !p.complete));
  assert.equal(
    doc.transitions.find((t) => t.id === "transition-goal").status,
    "planned",
  );
  assert.equal(
    doc.states.find((s) => s.id === "state-red-stop").status,
    "actual",
  );
});

test("CLI supports stdin and legacy input without installed dependencies", () => {
  const doc = example();
  delete doc.technologies;
  delete doc.bindings;
  delete doc.views;
  const result = check(doc);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Technology 0 \/ Binding 0/);
});

test("CLI rejects ID collisions across collections", () => {
  const doc = example();
  doc.technologies[0].id = doc.actors[0].id;
  assert.equal(check(doc).status, 1);
});

test("CLI rejects dangling Binding references", () => {
  const doc = example();
  doc.bindings[0].targetId = "missing";
  const result = check(doc);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Binding/);
});

test("CLI rejects state arrival mismatch even for a proposed interaction", () => {
  const doc = example();
  doc.interactions[0].time += 1;
  doc.interactions[0].proposed = true;
  assert.equal(check(doc).status, 1);
});

test("CLI allows late proposed intervention but rejects a late confirmed block", () => {
  const doc = example();
  const block = doc.interactions.find((i) => i.effect === "block");
  block.time = 20;
  block.outcomeStateId = null;
  assert.equal(check(doc).status, 1);
  block.proposed = true;
  assert.equal(check(doc).status, 0);
});

test("CLI rejects cross-Actor Transitions", () => {
  const doc = example();
  doc.transitions[0].from = "state-observe";
  assert.equal(check(doc).status, 1);
});

test("CLI reports invalid JSON, missing files, invalid arguments, and help", () => {
  assert.equal(run(["-"], "{bad json}").status, 1);
  assert.equal(run(["does-not-exist.json"]).status, 1);
  assert.equal(run([]).status, 2);
  assert.equal(run(["--invalid"]).status, 2);
  assert.equal(run(["--help"]).status, 0);
});

test("CLI enforces the editor's 8MiB file limit", () => {
  const result = run(["-"], " ".repeat(8 * 1024 * 1024 + 1));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /8MiB/);
});
