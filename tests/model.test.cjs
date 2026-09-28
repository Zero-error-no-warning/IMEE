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
      assert.equal(p.get(s.id).x, 176 + s.start * scale);
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
  assert.deepEqual(M.parse(JSON.stringify(d)), M.migrate(M.clone(d)));
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

test("Actor hierarchy supports arbitrary parent Actors and nested groups", () => {
  const d = sample();
  d.actors.find((a) => a.id === "torpedo").parentId = "uuv";
  d.actors.find((a) => a.id === "sensor").parentId = "torpedo";
  M.validate(d);
  const nodes = M.hierarchy(d);
  assert.equal(nodes.find((n) => n.actor.id === "sensor").depth, 2);
  assert.equal(nodes.find((n) => n.actor.id === "uuv").hasChildren, true);
});
test("hierarchy rejects absent parents, self-parenting, cycles and invalid collapse flags", () => {
  for (const mutate of [
    (d) => (d.actors[0].parentId = "missing"),
    (d) => (d.actors[0].parentId = d.actors[0].id),
    (d) => {
      d.actors[0].parentId = "sensor";
      d.actors[1].parentId = "enemy";
    },
    (d) => (d.actors[0].collapsed = "yes"),
  ]) {
    const d = sample();
    mutate(d);
    assert.throws(() => M.validate(d));
  }
});
test("collapsing a group hides descendants without changing their state times or references", () => {
  const d = sample();
  d.actors.find((a) => a.id === "sensor").parentId = "uuv";
  d.actors.find((a) => a.id === "torpedo").parentId = "sensor";
  d.actors.find((a) => a.id === "uuv").collapsed = true;
  const saved = JSON.stringify(d.states);
  const layout = M.layout(d);
  assert.equal(layout.positions.has("t2"), false);
  assert.equal(layout.positions.has("u2"), true);
  assert.equal(
    M.layout(d, 16, { includeHidden: true }).positions.has("t2"),
    true,
  );
  assert.equal(JSON.stringify(d.states), saved);
  M.validate(d);
});
test("moving a group reparents the root and carries every descendant", () => {
  const d = sample();
  d.actors.find((a) => a.id === "torpedo").parentId = "uuv";
  M.placeActor(d, "uuv", "control", "inside");
  M.validate(d);
  assert.equal(d.actors.find((a) => a.id === "uuv").parentId, "control");
  assert.equal(d.actors.find((a) => a.id === "torpedo").parentId, "uuv");
  assert.deepEqual([...M.descendants(d, "control")].sort(), [
    "control",
    "torpedo",
    "uuv",
  ]);
  assert.throws(() => M.placeActor(d, "control", "torpedo", "inside"));
});
test("deleting a group cascades the entire subtree and all dependent edges", () => {
  const d = sample();
  d.actors.find((a) => a.id === "torpedo").parentId = "uuv";
  M.remove(d, "actor", "uuv");
  M.validate(d);
  assert.equal(
    d.actors.some((a) => a.id === "torpedo"),
    false,
  );
  assert.equal(
    d.interactions.some((i) => i.id === "hit"),
    false,
  );
  assert.equal(
    d.transitions.some((t) => t.id === "escape"),
    true,
  );
});
test("view zoom changes the time span while preserving canvas width and linearity", () => {
  for (const width of [320, 768, 1440]) {
    const full = M.viewport(60, width),
      zoom = M.viewport(60, width, 20, 10);
    assert.equal(full.width, zoom.width);
    assert.ok(Math.abs(zoom.scale / full.scale - 6) < 1e-12);
    const l = M.layout(sample(), zoom.scale, {
      start: zoom.start,
      plotLeft: zoom.plotLeft,
      width,
    });
    assert.equal(l.width, width);
    assert.equal(
      l.positions.get("e2").x,
      zoom.plotLeft + (14 - 20) * zoom.scale,
    );
  }
  assert.equal(M.viewport(60, 1000, -10, 10).start, 0);
  assert.equal(M.viewport(60, 1000, 59, 10).start, 50);
});
