"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const M = require("../js/model.js");
const sample = require("../js/sample.js");
const modify = (fn) => {
  const d = sample();
  fn(d);
  return d;
};
test("sample describes a blocked plan and an actual alternative", () => {
  const d = M.validate(sample()),
    hit = d.interactions.find((i) => i.id === "hit");
  assert.equal(hit.targetId, "escape");
  assert.equal(hit.outcomeStateId, "e5");
  assert.equal(d.transitions.find((t) => t.id === "escape").status, "planned");
});
test("state width and horizontal position are strictly proportional to time at every scale", () => {
  for (const scale of [0.1, 3, 16, 200]) {
    const d = sample(),
      p = M.layout(d, scale).positions;
    for (const s of d.states) {
      assert.equal(p.get(s.id).x, 208 + s.start * scale);
      assert.equal(p.get(s.id).width, (s.end - s.start) * scale);
    }
  }
});
test("overlapping actual and planned states use separate lanes, touching states share a lane", () => {
  const d = sample(),
    l = M.layout(d);
  assert.notEqual(l.positions.get("e4").lane, l.positions.get("e5").lane);
  assert.equal(l.positions.get("t1").lane, l.positions.get("t2").lane);
});
test("actor reordering changes y, never time coordinates", () => {
  const d = sample(),
    before = M.layout(d);
  d.actors.reverse();
  const after = M.layout(d);
  assert.equal(before.positions.get("e1").x, after.positions.get("e1").x);
  assert.notEqual(before.positions.get("e1").y, after.positions.get("e1").y);
  M.validate(d);
});
test("zero-time and nonzero-time transitions are supported", () => {
  const d = sample();
  M.validate(d);
  const t = d.transitions.find((t) => t.id === "tt1");
  assert.equal(
    d.states.find((s) => s.id === t.to).start -
      d.states.find((s) => s.id === t.from).end,
    0,
  );
});
for (const [name, fn] of [
  [
    "backward transition",
    (d) => (d.states.find((s) => s.id === "e2").start = 10),
  ],
  ["cross-actor transition", (d) => (d.transitions[0].to = "s2")],
  ["nonfinite time", (d) => (d.states[0].start = NaN)],
  ["zero-length state", (d) => (d.states[0].end = 0)],
  ["negative time", (d) => (d.states[0].start = -1)],
  ["state beyond horizon", (d) => (d.states[0].end = 61)],
  ["dangling state reference", (d) => (d.transitions[0].to = "missing")],
  ["duplicate global IDs", (d) => (d.actors[0].id = d.states[0].id)],
  ["unsupported version", (d) => (d.version = 2)],
  ["source event outside state", (d) => (d.interactions[0].sourceTime = 13)],
  ["backward interaction", (d) => (d.interactions[1].sourceTime = 20)],
  ["state event not at start", (d) => (d.interactions[1].time = 19)],
  [
    "block an actual transition",
    (d) => (d.transitions.find((t) => t.id === "escape").status = "actual"),
  ],
  [
    "block a state instead of transition",
    (d) => {
      const i = d.interactions[0];
      i.effect = "block";
    },
  ],
  [
    "block outside transition interval",
    (d) => (d.interactions.find((i) => i.id === "hit").time = 53),
  ],
  [
    "outcome before block",
    (d) => (d.states.find((s) => s.id === "e5").start = 45),
  ],
  [
    "outcome on wrong actor",
    (d) => (d.interactions.find((i) => i.id === "hit").outcomeStateId = "t2"),
  ],
  [
    "same-actor interaction",
    (d) => {
      const i = d.interactions[0];
      i.targetId = "e2";
    },
  ],
  ["unbounded duration", (d) => (d.time.duration = 1000001)],
  ["nonstring label", (d) => (d.transitions[0].label = {})],
])
  test(`rejects ${name}`, () => assert.throws(() => M.validate(modify(fn))));
test("deleting an actor cascades its states, transitions and interactions", () => {
  const d = sample();
  M.remove(d, "actor", "enemy");
  M.validate(d);
  assert.equal(d.states.filter((s) => s.actorId === "enemy").length, 0);
  assert.equal(
    d.interactions.some((i) => i.id === "hit"),
    false,
  );
});
test("deleting the blocked transition also removes its blocking interaction", () => {
  const d = sample();
  M.remove(d, "transition", "escape");
  M.validate(d);
  assert.equal(
    d.interactions.some((i) => i.id === "hit"),
    false,
  );
});
test("deleting an outcome preserves the blocked plan without an alternative", () => {
  const d = sample();
  M.remove(d, "state", "e5");
  M.validate(d);
  assert.equal(d.interactions.find((i) => i.id === "hit").outcomeStateId, null);
});
test("deleting a blocker restores the planned transition without mutation", () => {
  const d = sample();
  M.remove(d, "interaction", "hit");
  M.validate(d);
  assert.equal(d.transitions.find((t) => t.id === "escape").status, "planned");
});
test("undo/redo are deep snapshots; invalid commits are atomic", () => {
  const h = new M.History(sample()),
    next = M.clone(h.doc);
  next.title = "changed";
  h.commit(next);
  next.title = "mutated outside";
  assert.equal(h.doc.title, "changed");
  h.undo();
  assert.equal(h.doc.title, sample().title);
  h.redo();
  assert.equal(h.doc.title, "changed");
  const bad = M.clone(h.doc);
  bad.states[0].start = -5;
  assert.throws(() => h.commit(bad));
  assert.equal(h.doc.states[0].start, 0);
});
test("new edits clear redo and the history is bounded", () => {
  const h = new M.History(sample());
  for (let n = 0; n < 110; n++) {
    const d = M.clone(h.doc);
    d.title = `change ${n}`;
    h.commit(d);
  }
  assert.equal(h.past.length, 100);
  h.undo();
  const d = M.clone(h.doc);
  d.title = "new branch";
  h.commit(d);
  assert.equal(h.future.length, 0);
});
test("JSON round trip preserves block references and time precision", () => {
  const d = sample();
  d.time.snap = 0.1;
  assert.deepEqual(M.parse(JSON.stringify(d)), d);
  assert.throws(() => M.parse("{broken"));
});
test("decimal snapping avoids accumulated floating point drift", () => {
  assert.equal(M.snap(0.1 + 0.2, 0.1), 0.3);
  assert.equal(M.snap(1.24, 0.5), 1);
});
test("causal highlighting includes planned target and actual outcome", () => {
  const ids = M.related(sample(), { type: "interaction", id: "hit" });
  for (const id of ["hit", "escape", "e4", "e5", "t2"]) assert.ok(ids.has(id));
});
