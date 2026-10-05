const { test } = require("node:test"),
  assert = require("node:assert/strict");
const M = require("../js/model"),
  A = require("../js/authoring"),
  S = require("../js/simulation");
const { base, gate, cdf, state, link } = require("./fixtures/quality.cjs");
test("activity creation reuses an existing start State", () => {
  const d = A.empty();
  d.actors.push({ id: "a", name: "A", side: "friendly" });
  const first = A.activity(d, {
      actorId: "a",
      start: 1,
      duration: 5,
      label: "search",
      result: "detected",
    }),
    t = M.get(d, first.type, first.id);
  A.activity(d, {
    actorId: "a",
    fromStateId: t.toStateId,
    duration: 3,
    label: "identify",
    result: "identified",
  });
  assert.equal(d.states.length, 3);
  assert.deepEqual(
    d.states.map((s) => s.time),
    [1, 6, 9],
  );
  M.validate(d);
});
test("moving a receipt preserves downstream duration and adjusts its propagation", () => {
  const d = base();
  A.moveState(d, "r0", 12);
  assert.equal(d.causalLinks[0].propagation.duration, 2);
  assert.equal(M.get(d, "state", "r1").time, 22);
  assert.equal(S.run(d).successProbability, 1);
});
test("keep policy preserves downstream arrival and changes activity duration", () => {
  const d = base();
  A.moveState(d, "r0", 12, "keep");
  assert.equal(M.get(d, "state", "r1").time, 20);
  assert.equal(
    M.taskWindow(d, d.tasks[1]).end - M.taskWindow(d, d.tasks[1]).start,
    8,
  );
  M.validate(d);
});
test("propagation updates receiver, downstream states and document period", () => {
  const d = base();
  A.propagation(d, "report", 95);
  assert.equal(M.get(d, "state", "r0").time, 105);
  assert.equal(M.get(d, "state", "r1").time, 115);
  assert.equal(d.time.duration, 115);
  M.validate(d);
});
test("AND and OR use all receipts instead of only the edited link", () => {
  for (const join of ["all", "any"]) {
    const d = base();
    d.states.push(state("second", "a", 0));
    d.causalLinks.push(link("alternate", "second", "r0", 10));
    M.get(d, "state", "r0").simulation = { join };
    A.propagation(d, "report", 5);
    assert.equal(M.get(d, "state", "r0").time, join === "all" ? 15 : 10);
    M.validate(d);
  }
});
test("branch propagation moves the junction and result while retaining delay", () => {
  const d = gate();
  d.tasks[0].junctions[0].outcomes[0].delay = 3;
  M.get(d, "state", "killed").time = 24;
  A.propagation(d, "hit", 2);
  assert.equal(d.tasks[0].junctions[0].time, 22);
  assert.equal(M.get(d, "state", "killed").time, 25);
  assert.equal(d.causalLinks[0].propagation.duration, 2);
  M.validate(d);
});
test("implicit starts remain mandatory when nominal times change", () => {
  const d = gate();
  A.moveState(d, "condition", 20);
  assert(M.get(d, "state", "effect").time >= 20);
  M.validate(d);
});
test("unit conversion scales curves, branches, propagation, deadline and snap", () => {
  const d = gate(),
    before = M.clone(d);
  d.simulation.deadline = 32;
  A.convertUnit(d, "hours");
  assert.equal(
    d.tasks[1].simulation.performanceModel.curves[0].points[1].t,
    20 / 3600,
  );
  assert.equal(d.simulation.deadline, 32 / 3600);
  assert.equal(d.causalLinks[0].propagation.duration, 1 / 3600);
  assert.equal(d.time.snap, 1 / 3600);
  A.convertUnit(d, "seconds");
  assert(
    Math.abs(d.tasks[0].junctions[0].time - before.tasks[0].junctions[0].time) <
      1e-9,
  );
  assert.equal(d.states[0].time, 10);
  M.validate(d);
});
test("reinterpretation preserves numeric times", () => {
  const d = base();
  A.convertUnit(d, "minutes", false);
  assert.equal(d.states[1].time, 10);
  assert.equal(d.time.unit, "minutes");
});
test("splitting retains original output, bindings and deterministic execution", () => {
  const d = base();
  d.technologies.push({ id: "tech", name: "T", status: "existing" });
  d.bindings.push({
    id: "bind",
    technologyId: "tech",
    targetType: "task",
    targetId: "produce",
  });
  const out = A.split(d, "produce", 5, "intermediate");
  assert.equal(d.tasks.length, 3);
  assert.equal(d.bindings.length, 2);
  assert.equal(M.get(d, "state", out.id).time, 5);
  assert.equal(d.tasks[0].toStateId, out.id);
  assert.equal(S.run(d).successProbability, 1);
});
test("CDF splitting requires an explicit reset", () => {
  const original = base();
  original.tasks[0].simulation = {
    enabled: true,
    performanceModel: cdf([{ t: 10, p: 1, q: 1 }]),
  };
  const draft = M.clone(original);
  assert.throws(() => A.split(draft, "produce", 5, "result"));
  assert.equal(original.states.length, 4);
  A.split(original, "produce", 5, "result", true);
  assert.equal(original.tasks[0].simulation.enabled, false);
  assert.equal(original.tasks[2].simulation.performanceModel, undefined);
});
test("fingerprint ignores annotations and explicit defaults, but detects performance changes", () => {
  const d = base(),
    key = A.fingerprint(d);
  d.title = "renamed";
  d.notes = "note";
  d.actors[0].color = "#abcdef";
  d.states[0].name = "initial";
  d.tasks[0].label = "renamed";
  d.views.main.zoom = 2;
  d.time.snap = 5;
  d.tasks[0].simulation.waitForStateIds = [];
  d.tasks[0].simulation.qInput = { stateIds: [], mode: "any" };
  assert.equal(A.fingerprint(d), key);
  d.tasks[0].simulation.qualityRetention = 0.5;
  assert.notEqual(A.fingerprint(d), key);
});
test("readiness detects missing goals and unconfigured branches in valid drafts", () => {
  const d = gate();
  delete d.simulation;
  delete d.tasks[0].junctions[0].simulation;
  M.validate(d);
  const errors = A.issues(d).filter((x) => x.severity === "error");
  assert.equal(errors.length, 2);
  assert(errors.some((x) => x.target?.id === "flight"));
});
test("repair preserves original source and references while updating nominal timings", () => {
  const original = base();
  original.causalLinks[0].propagation.duration = 4;
  const before = M.clone(original),
    proposal = A.repairTimes(original);
  assert.deepEqual(original, before);
  assert.equal(proposal.document.states[2].time, 14);
  assert.equal(proposal.document.states[3].time, 24);
  assert.equal(proposal.document.causalLinks.length, 1);
  M.validate(proposal.document);
});
test("invalid references cannot be silently repaired", () => {
  const d = base();
  d.causalLinks[0].source.id = "missing";
  assert.throws(() => A.repairTimes(d));
});
test("moving multiple adjacent States applies the shift once and preserves duration", () => {
  const d = base();
  A.moveSelection(
    d,
    [
      { type: "state", id: "r0" },
      { type: "state", id: "r1" },
    ],
    5,
  );
  assert.equal(M.get(d, "state", "r0").time, 15);
  assert.equal(M.get(d, "state", "r1").time, 25);
  assert.equal(d.causalLinks[0].propagation.duration, 5);
  assert.equal(M.get(d, "state", "s1").time, 10);
  assert.equal(S.run(d).successProbability, 1);
});
test("copied Actor threads can move together without changing their originals", () => {
  const d = base(),
    original = M.clone(d),
    selected = [
      { type: "actor", id: "a" },
      { type: "actor", id: "b" },
    ],
    pasted = M.paste(d, M.fragment(d, selected));
  A.moveSelection(d, pasted, 5);
  for (const old of original.states)
    assert.equal(M.get(d, "state", old.id).time, old.time);
  assert.deepEqual(
    d.states.slice(4).map((s) => s.time),
    [5, 15, 15, 25],
  );
  M.validate(d);
});
test("connection hints distinguish activities, signals, reverse time and implicit cycles", () => {
  const d = base(),
    hint = A.connectionHints(d, { id: "s1" });
  assert(hint("state", "r0").allowed);
  assert(!hint("state", "s0").allowed);
  assert(!hint("task", "consume").allowed);
  const g = gate();
  assert(A.connectionHints(g, { id: "effect" })("task", "flight").allowed);
  assert(!A.connectionHints(g, { id: "launch" })("task", "flight").allowed);
});
test("deletion scope includes dependent lines and bindings before mutating the document", () => {
  const d = base();
  d.technologies.push({ id: "tech", name: "T", status: "existing" });
  d.bindings.push({
    id: "bind",
    technologyId: "tech",
    targetType: "task",
    targetId: "produce",
  });
  const before = M.clone(d),
    info = A.selectionInfo(d, [{ type: "actor", id: "a" }]);
  assert.equal(info.deleted.states, 2);
  assert.equal(info.deleted.tasks, 1);
  assert.equal(info.deleted.causalLinks, 1);
  assert.equal(info.deleted.bindings, 1);
  assert.deepEqual(d, before);
});
test("resizing a branch-only activity updates outcomes while preserving branch delay", () => {
  const d = gate();
  delete d.tasks[0].toStateId;
  d.tasks[0].junctions[0].outcomes[0].delay = 2;
  M.get(d, "state", "killed").time = 23;
  A.resizeActivity(d, "flight", 15);
  assert.equal(d.tasks[0].junctions[0].time, 25);
  assert.equal(M.get(d, "state", "killed").time, 27);
  assert.equal(d.causalLinks[0].propagation.duration, 5);
  M.validate(d);
});
test("splitting a fixed activity preserves final quality without applying retention twice", () => {
  const d = base(),
    before = S.run(d).trace.tasks.find((t) => t.id === "consume").q;
  A.split(d, "produce", 5, "intermediate");
  const after = S.run(d).trace.tasks.find((t) => t.id === "consume").q;
  assert.equal(after, before);
  assert.equal(d.tasks.at(-1).simulation.qualityRetention, 1);
});
