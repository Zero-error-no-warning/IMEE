"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const M = require("../js/model.js"),
  sample = require("../js/sample.js");
const research = () => M.migrate(sample.research());
test("legacy JSON migrates collapse and ordering into views without changing mission timing", () => {
  const d = sample.grouped();
  d.actors.find((a) => a.id === "uuv").collapsed = true;
  const next = M.parse(JSON.stringify(d));
  assert.equal(M.isCollapsed(next, "uuv"), true);
  assert.equal(
    next.actors.some((a) => "collapsed" in a),
    false,
  );
  assert.deepEqual(next.states, d.states);
  assert.deepEqual(
    next.views.main.actorOrder,
    d.actors.map((a) => a.id),
  );
  assert.deepEqual(M.parse(JSON.stringify(next)), next);
});
test("technology bindings support all four element types and validate global references and TRL", () => {
  const d = research();
  M.validate(d);
  for (const type of ["actor", "state", "transition", "interaction"])
    assert.ok(d.bindings.some((b) => b.targetType === type));
  for (const mutate of [
    (d) => (d.technologies[0].trl = 10),
    (d) => (d.technologies[0].status = "fake"),
    (d) => (d.bindings[0].targetId = "absent"),
    (d) => (d.bindings[0].technologyId = "absent"),
    (d) => (d.bindings[0].id = d.states[0].id),
    (d) => (d.views.main.collapsedActors = ["absent"]),
    (d) => (d.views.main.visibleTimeRange.end = 100),
  ]) {
    const copy = M.clone(d);
    mutate(copy);
    assert.throws(() => M.validate(copy));
  }
});
test("recursive Group duplication remaps internal edges and bindings and excludes external interactions", () => {
  const d = research(),
    f = M.fragment(d, [
      { type: "actor", id: "uuv" },
      { type: "actor", id: "sensor" },
    ]);
  assert.equal(f.actors.length, 3);
  assert.equal(f.interactions.length, 1);
  assert.equal(f.interactions[0].id, "launch");
  const oldIds = new Set(
    [
      ...d.actors,
      ...d.states,
      ...d.transitions,
      ...d.interactions,
      ...d.bindings,
    ].map((x) => x.id),
  );
  const counts = Object.fromEntries(
    ["actors", "states", "transitions", "interactions", "bindings"].map((k) => [
      k,
      d[k].length,
    ]),
  );
  const selected = M.paste(d, f);
  M.validate(d);
  for (const key of Object.keys(counts))
    for (const x of d[key].slice(counts[key]))
      assert.equal(oldIds.has(x.id), false);
  assert.equal(d.technologies.length, 3); // shared catalogue is deliberately not duplicated
  const copied = d.actors.find((a) => a.id === selected[0].id);
  assert.equal(M.descendants(d, copied.id).size, 3);
  assert.ok(d.interactions.at(-1).targetId !== "t2");
  assert.ok(d.bindings.at(-1).targetId !== f.bindings.at(-1).targetId);
});
test("copying State pairs copies internal transitions, cutting and pasting restores valid fragments", () => {
  const d = research(),
    selection = [
      { type: "state", id: "c2" },
      { type: "state", id: "c3" },
    ],
    f = M.fragment(d, selection);
  assert.equal(f.transitions.length, 1);
  assert.equal(f.interactions.length, 0);
  selection.forEach((x) => M.remove(d, x.type, x.id));
  M.paste(d, f);
  M.validate(d);
  assert.equal(
    d.states.some((s) => s.id === "c2"),
    false,
  );
  assert.equal(d.states.filter((s) => s.name === "識別").length, 1);
});
test("deletion removes bindings but retains reusable technologies", () => {
  const d = research();
  M.remove(d, "actor", "uuv");
  M.validate(d);
  assert.equal(
    d.bindings.some((b) =>
      ["s2", "order", "launch", "hit"].includes(b.targetId),
    ),
    false,
  );
  assert.equal(d.technologies.length, 3);
});
test("grouping ignores already-selected descendants and ungroup preserves states and binding-bearing Actors", () => {
  const d = research(),
    id = M.groupActors(d, ["uuv", "sensor", "control"]);
  assert.equal(d.actors.find((a) => a.id === "sensor").parentId, "uuv");
  assert.equal(d.actors.find((a) => a.id === "uuv").parentId, id);
  M.ungroupActor(d, id);
  assert.equal(
    d.actors.some((a) => a.id === id),
    false,
  );
  M.ungroupActor(d, "uuv");
  assert.ok(d.actors.some((a) => a.id === "uuv"));
  assert.equal(d.actors.find((a) => a.id === "sensor").parentId, null);
  M.validate(d);
});
test("Actor ordering and collapse change only View data", () => {
  const d = research(),
    before = M.clone(d.actors);
  M.placeActor(d, "enemy", "control", "after");
  M.setCollapsed(d, "uuv", true);
  assert.deepEqual(
    d.actors.map((a) => ({ ...a, parentId: a.parentId || null })),
    before.map((a) => ({ ...a, parentId: a.parentId || null })),
  );
  assert.equal(M.hierarchy(d)[1].actor.id, "enemy");
  assert.equal(
    M.hierarchy(d).some((x) => x.actor.id === "sensor"),
    false,
  );
});
test("moving multiple connected States preserves duration and shifts both interaction endpoints once", () => {
  const d = research();
  d.interactions = d.interactions.filter((i) => i.id === "report");
  d.transitions = [];
  d.bindings = [];
  const before = M.clone(d.interactions[0]);
  M.moveSelection(
    d,
    [
      { type: "state", id: "s2" },
      { type: "state", id: "c2" },
    ],
    1,
  );
  M.validate(d);
  assert.equal(d.interactions[0].sourceTime, before.sourceTime + 1);
  assert.equal(d.interactions[0].time, before.time + 1);
});
test("proxies aggregate matching external links and preserve original model and times", () => {
  const d = research();
  d.actors.push({
    id: "fleet",
    name: "水中戦力",
    side: "friendly",
    isGroup: true,
  });
  for (const id of ["sensor", "uuv", "torpedo"])
    d.actors.find((a) => a.id === id).parentId = "fleet";
  d.interactions = ["s2", "u2", "t2"].map((id, n) => ({
    id: `cmd${n}`,
    fromStateId: "c1",
    targetType: "state",
    targetId: id,
    kind: "command",
    label: "指令",
    effect: "cause",
    sourceTime: 0,
    time: d.states.find((s) => s.id === id).start,
  }));
  d.bindings = [];
  M.migrate(d);
  M.setCollapsed(d, "fleet", true);
  const before = M.clone(d);
  const proxies = M.interactionProxies(
    d,
    new Set(M.hierarchy(d).map((r) => r.actor.id)),
  );
  assert.equal(proxies.length, 1);
  assert.equal(proxies[0].interactions.length, 3);
  assert.equal(proxies[0].toActorId, "fleet");
  assert.deepEqual(d, before);
});
test("proposed late arrival can be evaluated but cannot masquerade as a confirmed block", () => {
  const d = research(),
    late = d.interactions.find((i) => i.id === "late-hit");
  M.validate(d);
  assert.equal(M.opportunity(d, late).status, "late");
  assert.equal(M.opportunity(d, late).margin, -2);
  late.proposed = false;
  assert.throws(() => M.validate(d));
});
test("directed paths require observation, explicit decision, command, attack, bindings and timely arrival", () => {
  const d = research();
  d.interactions = d.interactions.filter((i) => i.id !== "late-hit");
  d.bindings = d.bindings.filter((b) => b.targetId !== "late-hit");
  for (const t of d.technologies) t.status = "existing";
  const a = M.analyzeTransition(d, "escape");
  assert.ok(a.paths.length > 1);
  assert.equal(a.some, true);
  assert.equal(a.all, false);
  const complete = a.paths.find((p) => p.complete);
  assert.ok(complete.route.some((e) => e.id === "detect"));
  assert.ok(complete.route.some((e) => e.id === "c3"));
  d.states.find((s) => s.id === "c3").phase = "other";
  assert.equal(M.analyzeTransition(d, "escape").some, false);
});
test("capability gaps and unknown/unbound support interrupt complete paths", () => {
  const d = research();
  assert.equal(M.analyzeTransition(d, "escape").some, false);
  for (const t of d.technologies) t.status = "existing";
  assert.equal(M.analyzeTransition(d, "escape").some, true);
  d.bindings = d.bindings.filter((b) => b.targetId !== "order");
  assert.equal(M.analyzeTransition(d, "escape").some, false);
});
test("roles on separate upstream branches are never combined into one complete path", () => {
  const d = research();
  for (const t of d.technologies) t.status = "existing";
  d.interactions = d.interactions.filter((i) => i.id !== "report");
  d.bindings = d.bindings.filter((b) => b.targetId !== "report");
  assert.equal(M.analyzeTransition(d, "escape").some, false);
});
test("unrelated outgoing branches are absent from directed causal ancestry", () => {
  const d = research();
  d.states.push({
    id: "irrelevant",
    actorId: "control",
    name: "別任務",
    start: 50,
    end: 60,
    status: "actual",
    activity: "active",
  });
  d.interactions.push({
    id: "unrelated",
    fromStateId: "s2",
    targetType: "state",
    targetId: "irrelevant",
    label: "別情報",
    kind: "information",
    effect: "cause",
    sourceTime: 48,
    time: 50,
  });
  const a = M.analyzeTransition(d, "escape");
  assert.equal(a.ids.has("irrelevant"), false);
  assert.equal(a.ids.has("unrelated"), false);
});

test("ALL applies to the enumerated candidate paths and Blue support needs no enemy technology binding", () => {
  const d = research();
  for (const t of d.technologies) t.status = "existing";
  d.interactions = d.interactions.filter((i) => i.id !== "late-hit");
  const omitted = new Set(["late-hit", "ct1", "st1", "ut1", "tt1"]);
  d.transitions = d.transitions.filter((t) => !omitted.has(t.id));
  d.bindings = d.bindings.filter(
    (b) =>
      !omitted.has(b.targetId) &&
      ![
        "enemy",
        "e1",
        "e2",
        "e3",
        "e4",
        "e5",
        "et1",
        "et2",
        "escape",
        "disabled",
      ].includes(b.targetId),
  );
  M.validate(d);
  const a = M.analyzeTransition(d, "escape");
  assert.equal(a.paths.length, 1);
  assert.equal(a.some, true);
  assert.equal(a.all, true);
  assert.equal(a.ids.has("e1"), false);
});

test("proxy bundling never combines a proposed and confirmed intervention even with identical labels", () => {
  const d = research();
  d.interactions.find((i) => i.id === "late-hit").label = d.interactions.find(
    (i) => i.id === "hit",
  ).label;
  M.setCollapsed(d, "uuv", true);
  const proxies = M.interactionProxies(
    d,
    new Set(M.hierarchy(d).map((r) => r.actor.id)),
  );
  const attack = proxies.filter((p) => p.kind === "attack");
  assert.equal(attack.length, 2);
  assert.ok(attack.every((p) => p.interactions.length === 1));
});
