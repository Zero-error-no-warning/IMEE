const { test } = require("node:test");
const assert = require("node:assert/strict");
const M = require("../js/model.js"),
  sample = require("../js/sample.js");
function invalid(change, pattern) {
  const d = sample();
  change(d);
  assert.throws(() => M.validate(d), pattern);
}
test("v2 stores State as a point and rejects v1 / duration State / old collections", () => {
  const d = sample();
  assert.equal(M.validate(d), d);
  assert.equal(d.states[0].time, 2);
  invalid((d) => (d.version = 1), /version: 2/);
  invalid((d) => (d.states[0].end = 5), /一点/);
  invalid((d) => (d.transitions = []), /旧/);
});
test("normal Task derives duration from State references without duplicate time fields", () => {
  const d = sample();
  assert.deepEqual(M.taskWindow(d, d.tasks[0]), { start: 2, end: 16 });
  assert.equal(d.tasks[0].start, undefined);
  d.states[1].time = 20;
  assert.equal(M.taskWindow(d, d.tasks[0]).end, 20);
});
test("same Actor State connection creates a first-class Task", () => {
  const d = sample();
  const s = M.createConnection(
    d,
    { type: "state", id: "i1" },
    { type: "state", id: "i2" },
  );
  assert.equal(s.type, "task");
  assert.equal(M.get(d, "task", s.id).toStateId, "i2");
});
test("different Actor / Task point connections create CausalLinks", () => {
  const d = sample();
  const s = M.createConnection(
    d,
    { type: "state", id: "s1" },
    { type: "task", id: "identify", time: 20 },
  );
  assert.equal(s.type, "causalLink");
  assert.equal(M.get(d, s.type, s.id).target.time, 20);
});
test("add result converts normal destination to explicit continuation and shares point", () => {
  const d = sample();
  d.states.push({ id: "s2", actorId: "sensor", name: "未探知", time: 18 });
  M.addOutcome(d, "search", 14, "s2", "NG");
  M.addOutcome(d, "search", 14, "s1", "OK");
  const t = d.tasks[0];
  assert.equal(t.toStateId, undefined);
  assert.equal(t.junctions.length, 1);
  assert.deepEqual(
    t.junctions[0].outcomes.map((o) => o.label),
    ["継続", "NG", "OK"],
  );
  assert.deepEqual(M.taskWindow(d, t), { start: 2, end: 14 });
});
test("multiple junctions are representable with no duplicate times", () => {
  const d = sample();
  d.tasks[0].junctions = [
    { id: "j1", time: 10, outcomes: [{ toStateId: "s1", label: "早期成功" }] },
    { id: "j2", time: 13, outcomes: [{ toStateId: "s1", label: "成功" }] },
  ];
  M.validate(d);
  d.tasks[0].junctions[1].time = 10;
  assert.throws(() => M.validate(d), /1つに/);
});
test("validation rejects dangling, backward, cross-Actor Task and duplicate IDs", () => {
  invalid((d) => (d.tasks[0].toStateId = "missing"), /接続先/);
  invalid((d) => (d.states[1].time = 0), /接続先/);
  invalid((d) => (d.tasks[0].toStateId = "i0"), /同一Actor/);
  invalid((d) => (d.tasks[0].id = "s0"), /ID重複/);
  invalid((d) => (d.causalLinks[0].source.id = "missing"), /端点/);
});
test("causal source / target are strictly timed, proposed allows late task attachment", () => {
  const d = sample(),
    c = d.causalLinks[2];
  c.target.time = 55;
  assert.throws(() => M.validate(d), /実行期間内/);
  c.proposed = true;
  M.validate(d);
  assert.equal(M.opportunity(d, c).within, false);
  assert.match(M.opportunity(d, c).message, /遅すぎ/);
  invalid(
    (d) => (d.causalLinks[0].target = { type: "state", id: "s0" }),
    /逆行/,
  );
  invalid((d) => (d.causalLinks[0].source.time = 16), /重複保存/);
});
test("JSON roundtrip preserves mission and all views", () => {
  const d = sample.research();
  assert.deepEqual(M.parse(JSON.stringify(d)), d);
});
test("History undo / redo restores whole model, branches and view state", () => {
  const h = new M.History(sample()),
    d = M.clone(h.doc);
  M.addOutcome(d, "identify", 29, "i2", "再試行");
  d.views.main.collapsedActors = ["group"];
  h.commit(d);
  h.undo();
  assert.equal(h.doc.tasks[1].junctions[0].outcomes.length, 2);
  h.redo();
  assert.deepEqual(h.doc, d);
  assert.throws(() => h.commit({ ...d, version: 1 }));
  assert.deepEqual(h.doc, d);
});
test("Actor hierarchy, grouping, ungrouping, cycle protection and ordering", () => {
  const d = sample();
  assert.equal(M.hierarchy(d).length, 5);
  d.views.main.collapsedActors = ["group"];
  assert.equal(M.hierarchy(d).length, 2);
  assert.equal(M.visibleActor(d, "radio"), "group");
  const id = M.groupActors(d, ["sensor", "control"]);
  assert.equal(M.get(d, "actor", id).parentId, "group");
  M.ungroupActor(d, id);
  assert.equal(M.get(d, "actor", "sensor").parentId, "group");
  assert.throws(() => M.placeActor(d, "group", "sensor", "inside"));
  M.placeActor(d, "radio", "sensor", "before");
  M.validate(d);
});
test("recursive copy reissues IDs, preserves internal edges and bindings, excludes outside causes", () => {
  const d = sample.research(),
    f = M.fragment(d, [{ type: "actor", id: "group" }]);
  assert.equal(f.actors.length, 4);
  assert.equal(f.states.length, 8);
  assert.equal(f.tasks.length, 3);
  assert.equal(f.causalLinks.length, 2);
  const before = new Set(
    [...d.actors, ...d.states, ...d.tasks, ...d.causalLinks, ...d.bindings].map(
      (x) => x.id,
    ),
  );
  const selected = M.paste(d, f);
  assert(selected.every((s) => !before.has(s.id)));
  assert.equal(d.tasks.length, 7);
  M.validate(d);
  const copiedTask = d.tasks.at(-2);
  assert(!before.has(copiedTask.id));
  assert.notEqual(copiedTask.junctions[0].id, "j-identify");
});
test("multiple states copy remaps internal Tasks, does not copy external causal links", () => {
  const d = sample(),
    f = M.fragment(d, [
      { type: "state", id: "s0" },
      { type: "state", id: "s1" },
    ]);
  assert.equal(f.tasks.length, 1);
  assert.equal(f.causalLinks.length, 0);
  const sel = M.paste(d, f, 1);
  assert.equal(sel.length, 2);
  assert.equal(d.states.at(-2).time, 3);
  assert.notEqual(d.tasks.at(-1).fromStateId, "s0");
});
test("move selected Actor subtree shifts States, junctions and causal Task endpoints", () => {
  const d = sample();
  M.moveSelection(
    d,
    [
      { type: "actor", id: "group" },
      { type: "actor", id: "enemy" },
    ],
    1,
  );
  assert.equal(d.states[0].time, 3);
  assert.equal(d.tasks[1].junctions[0].time, 30);
  assert.equal(d.causalLinks[2].source.time, 43);
  assert.equal(d.causalLinks[2].target.time, 50);
});
test("delete subtree removes dependent elements and bindings but keeps catalog", () => {
  const d = sample.research();
  M.remove(d, [{ type: "actor", id: "group" }]);
  assert.equal(d.actors.length, 1);
  assert.equal(d.states.length, 2);
  assert.equal(d.tasks.length, 1);
  assert.equal(d.causalLinks.length, 0);
  assert.equal(d.technologies.length, 2);
  M.validate(d);
});
test("Technology Binding accepts exactly actor / state / task / causalLink", () => {
  const d = sample.research();
  M.validate(d);
  assert.equal(M.technologyFor(d, "task", "transmit").length, 2);
  d.bindings[0].targetType = "transition";
  assert.throws(() => M.validate(d), /Binding/);
});
test("View fields stay separate and invalid references are rejected", () => {
  invalid((d) => (d.actors[0].collapsed = true), /views/);
  invalid((d) => d.views.main.actorOrder.push("missing"), /参照/);
  invalid((d) => (d.views.main.mode = "interaction"), /View/);
  invalid((d) => (d.views.main.visibleTimeRange.end = 0), /長さ/);
});
test("hostile Task analysis finds directed Blue path, reports research gaps and SOME/ALL", () => {
  const d = sample.research();
  const a = M.analyzeTask(d, "jam");
  assert(a.paths.length > 0);
  assert(a.paths.some((p) => p.structural));
  assert.equal(a.some, false);
  assert(a.paths.some((p) => p.gaps.some((g) => g.status === "research")));
  d.technologies[1].status = "existing";
  assert(M.analyzeTask(d, "jam").some);
  assert(M.analyzeTask(d, "jam").all);
  d.technologies[0].status = "research";
  const b = M.analyzeTask(d, "jam");
  assert.equal(b.some, false);
  assert(b.paths.some((p) => p.gaps.some((g) => g.status === "research")));
});
test("analysis does not combine roles from disconnected paths", () => {
  const d = sample.research();
  d.causalLinks = d.causalLinks.filter((c) => c.id !== "report");
  d.bindings = d.bindings.filter((b) => b.targetId !== "report");
  assert.equal(M.analyzeTask(d, "jam").some, false);
});
test("analysis blocks late and proposed interventions and unbound technologies", () => {
  const d = sample.research();
  const c = M.get(d, "causalLink", "blue-action");
  c.target.time = 50;
  c.proposed = true;
  assert.equal(M.analyzeTask(d, "jam").some, false);
  c.target.time = 44;
  c.proposed = false;
  d.bindings = [];
  assert.equal(M.analyzeTask(d, "jam").some, false);
});
