"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict");
const { openApp } = require("./dom-helper.cjs"),
  M = require("../js/model.js"),
  sample = require("../js/sample.js");
async function app(t, d = sample.research()) {
  const a = await openApp(d);
  t.after(() => {
    assert.deepEqual(a.errors, []);
    a.close();
  });
  return a;
}
function ctrlClick(a, selector) {
  const el = a.$(selector);
  for (const type of ["pointerdown", "pointerup", "click"])
    a.event(el, type, { ctrlKey: true });
}
function chooseView(a, value) {
  a.$("#view-mode").value = value;
  a.$("#view-mode").dispatchEvent(new a.w.Event("change", { bubbles: true }));
}
test("Ctrl/Cmd multi-selection groups Actors in one action and ungroup restores their structure", async (t) => {
  const a = await app(t);
  a.click('[data-id="uuv"].actor-label');
  ctrlClick(a, '[data-id="control"].actor-label');
  assert.match(a.$("#inspector").textContent, /2 件を選択/);
  a.key("g", { ctrlKey: true });
  const d = a.savedDoc(),
    g = d.actors.at(-1);
  assert.equal(g.isGroup, true);
  assert.equal(d.actors.find((x) => x.id === "control").parentId, g.id);
  a.key("g", { ctrlKey: true, shiftKey: true });
  assert.equal(
    a.savedDoc().actors.some((x) => x.id === g.id),
    false,
  );
  M.validate(a.savedDoc());
});
test("Actor Ctrl+D duplicates descendants, internal interactions and bindings only", async (t) => {
  const a = await app(t);
  a.click('[data-id="uuv"].actor-label');
  a.key("d", { ctrlKey: true });
  const d = a.savedDoc();
  assert.equal(d.actors.length, 8);
  assert.equal(d.interactions.length, 7);
  assert.equal(d.interactions.at(-1).label, "発射");
  M.validate(d);
  a.key("z", { ctrlKey: true });
  assert.equal(a.savedDoc().actors.length, 5);
});
test("multi-State Ctrl+D and Delete act on the complete selection with remapped Transition IDs", async (t) => {
  const a = await app(t);
  a.click('[data-id="c2"] .body');
  ctrlClick(a, '[data-id="c3"] .body');
  a.key("d", { metaKey: true });
  const d = a.savedDoc();
  assert.equal(d.states.length, 17);
  assert.equal(d.transitions.length, 11);
  assert.ok(d.transitions.at(-1).from !== "c2");
  M.validate(d);
  a.key("Delete");
  assert.equal(a.savedDoc().states.length, 15);
  assert.equal(a.savedDoc().transitions.length, 10);
});
test("copy/cut/paste regenerates references and remains usable after Undo", async (t) => {
  const a = await app(t);
  a.click('[data-id="uuv"].actor-label');
  a.key("x", { ctrlKey: true });
  assert.equal(a.savedDoc().actors.length, 2);
  a.key("v", { ctrlKey: true });
  assert.equal(a.savedDoc().actors.length, 5);
  assert.equal(
    a.savedDoc().actors.some((x) => x.id === "uuv"),
    false,
  );
  M.validate(a.savedDoc());
  a.key("z", { ctrlKey: true });
  a.key("v", { ctrlKey: true });
  assert.equal(a.savedDoc().actors.length, 5);
});
test("marquee selects multiple timeline States and arrow movement moves both atomically", async (t) => {
  const d = sample();
  d.transitions = [];
  d.interactions = [];
  const a = await app(t, d),
    s1 = a.$('[data-id="s1"] .body'),
    s2 = a.$('[data-id="s2"] .body');
  const x = Number(s1.getAttribute("x")),
    y = Number(s1.getAttribute("y"));
  a.event(a.$('[data-row="sensor"]'), "pointerdown", {
    clientX: x - 2,
    clientY: y - 5,
  });
  a.event(a.w, "pointermove", {
    clientX:
      Number(s2.getAttribute("x")) + Number(s2.getAttribute("width")) + 2,
    clientY: y + 35,
  });
  a.event(a.w, "pointerup");
  assert.match(a.$("#inspector").textContent, /2 件を選択/);
  a.key("ArrowRight");
  const after = a.savedDoc();
  assert.equal(after.states.find((s) => s.id === "s1").start, 1);
  assert.equal(after.states.find((s) => s.id === "s2").start, 15);
});
test("multi-Actor dragging reparents every selected root without moving descendants twice", async (t) => {
  const a = await app(t);
  a.click('[data-id="sensor"].actor-label');
  ctrlClick(a, '[data-id="torpedo"].actor-label');
  const row = a.$('[data-row="control"]'),
    y = Number(row.getAttribute("y")) + 45;
  a.event(a.$('[data-id="sensor"].actor-label'), "pointerdown", {
    clientX: 50,
    clientY: 100,
  });
  a.event(a.w, "pointermove", { clientX: 50, clientY: y });
  a.event(a.w, "pointerup");
  for (const id of ["sensor", "torpedo"])
    assert.equal(
      a.savedDoc().actors.find((x) => x.id === id).parentId,
      "control",
    );
});
test("technology editing, TRL and Binding are persisted and shown on the SVG", async (t) => {
  const a = await app(t, sample());
  chooseView(a, "technology");
  a.click('[data-action="technology"]');
  a.fill("name", "新型ソナー");
  a.fill("status", "research");
  a.fill("trl", "4");
  a.submit();
  a.click('[data-id="s2"] .body');
  a.click('[data-action="bind"]');
  a.submit();
  assert.equal(a.savedDoc().technologies[0].trl, 4);
  assert.equal(a.savedDoc().bindings[0].targetId, "s2");
  assert.match(a.$("#timeline").textContent, /新型ソナー/);
  a.click("[data-unbind]");
  assert.equal(a.savedDoc().bindings.length, 0);
  assert.equal(a.savedDoc().technologies.length, 1);
});
test("view filters, zoom and lane height persist separately and restore without widening canvas", async (t) => {
  const a = await app(t),
    before = a.savedDoc();
  chooseView(a, "interaction");
  a.click("#zoom-in");
  a.click("#view-settings");
  a.fill("planned", "false");
  a.fill("quiet", "false");
  a.fill("technology", "false");
  a.fill("laneHeight", 70);
  a.submit();
  const d = a.savedDoc();
  assert.deepEqual(d.actors, before.actors);
  assert.deepEqual(d.states, before.states);
  assert.equal(d.views.main.laneHeight, 70);
  assert.equal(a.$('[data-id="e4"]'), null);
  assert.equal(a.$(".technology-tag"), null);
  const b = await app(t, d);
  assert.equal(b.$("#view-mode").value, "interaction");
  assert.equal(b.$("#timeline").getAttribute("width"), "1050");
  assert.equal(b.$("#zoom-label").textContent, a.$("#zoom-label").textContent);
});
test("collapse renders external interaction proxies and keeps original references", async (t) => {
  const a = await app(t),
    before = a.savedDoc().interactions;
  a.click('[data-id="uuv"] [data-toggle]');
  assert.ok(a.$(".interaction-proxy"));
  assert.deepEqual(a.savedDoc().interactions, before);
  assert.ok(a.savedDoc().views.main.collapsedActors.includes("uuv"));
  assert.equal(
    "collapsed" in a.savedDoc().actors.find((x) => x.id === "uuv"),
    false,
  );
});
test("interaction visual styles distinguish observation, information, command and attack", async (t) => {
  const a = await app(t),
    line = (id) => a.$(`[data-id="${id}"] .line`);
  assert.equal(line("detect").getAttribute("stroke"), "#8056ad");
  assert.equal(line("detect").getAttribute("stroke-dasharray"), "6 4");
  assert.equal(line("report").getAttribute("stroke"), "#46515e");
  assert.equal(line("order").getAttribute("stroke"), "#18858c");
  assert.match(line("hit").getAttribute("style"), /3.2/);
});
test("connection drag highlights compatible States and wide-hit planned Transitions", async (t) => {
  const a = await app(t);
  a.event(a.$('[data-id="t2"] .body'), "pointerdown", {
    altKey: true,
    clientX: 200,
    clientY: 400,
  });
  assert.ok(a.$('[data-id="escape"]').classList.contains("connect-target"));
  assert.equal(
    a.$('[data-id="et2"]').classList.contains("connect-target"),
    false,
  );
  a.event(a.$('[data-id="escape"] .hit'), "pointermove", {
    clientX: 400,
    clientY: 100,
  });
  assert.ok(a.$('[data-id="escape"]').classList.contains("connect-hover"));
  a.key("Escape");
  assert.equal(a.$("#timeline").classList.contains("connecting"), false);
});
test("Transition duration editor changes adjacent State boundaries and reports the derived duration", async (t) => {
  const a = await app(t);
  a.event(a.$('[data-id="ct2"] .hit'), "dblclick");
  assert.match(a.$("#dialog-fields").textContent, /前Stateの終了/);
  a.fill("transitionStart", 24);
  a.fill("transitionEnd", 28);
  a.submit();
  assert.equal(a.savedDoc().states.find((s) => s.id === "c2").end, 24);
  assert.equal(a.savedDoc().states.find((s) => s.id === "c3").start, 28);
  a.click('[data-id="ct2"] .hit');
  assert.match(a.$("#inspector").textContent, /4 分/);
  assert.equal(
    "duration" in a.savedDoc().transitions.find((t) => t.id === "ct2"),
    false,
  );
});
test("late proposed interventions show a timing warning without marking an additional block", async (t) => {
  const a = await app(t);
  assert.equal(a.d.querySelectorAll(".blocked-cross").length, 1);
  a.click('[data-id="late-hit"] .hit');
  assert.match(a.$("#inspector").textContent, /遅すぎる/);
  assert.match(a.$("#inspector").textContent, /検討案/);
});
test("enemy Transition selection exposes separate directed paths and technology gaps", async (t) => {
  const a = await app(t);
  chooseView(a, "gap");
  a.click('[data-id="escape"] .hit');
  assert.match(a.$("#inspector").textContent, /SOME:/);
  assert.match(a.$("#inspector").textContent, /水中指令通信/);
  assert.ok(a.$("[data-path]"));
  a.click('[data-path="0"]');
  assert.ok(a.$('[data-id="escape"]').classList.contains("selected"));
});
test("overlapping labels elide until selection and retain full titles", async (t) => {
  const d = sample();
  d.interactions.push({
    ...d.interactions[1],
    id: "report2",
    label: "非常に長い重複した情報共有の名称をすべて表示",
  });
  const a = await app(t, d),
    group = a.$('[data-id="report2"]');
  assert.match(group.querySelector(".interaction-label").textContent, /…/);
  a.click(group.querySelector(".hit"));
  assert.equal(
    a.$('[data-id="report2"] .interaction-label').textContent,
    d.interactions.at(-1).label,
  );
});

test("multiple State drag moves rows together and rejects an invalid external Transition atomically", async (t) => {
  const d = sample();
  d.transitions = [];
  d.interactions = [];
  const a = await app(t, d);
  a.click('[data-id="s1"] .body');
  ctrlClick(a, '[data-id="s2"] .body');
  const body = a.$('[data-id="s1"] .body'),
    x = Number(body.getAttribute("x")) + 10,
    y = Number(body.getAttribute("y")) + 10;
  const row = a.$('[data-row="control"]'),
    targetY = Number(row.getAttribute("y")) + 40;
  a.event(body, "pointerdown", { clientX: x, clientY: y });
  a.event(a.w, "pointermove", { clientX: x + 14, clientY: targetY });
  a.event(a.w, "pointerup");
  for (const id of ["s1", "s2"])
    assert.equal(
      a.savedDoc().states.find((s) => s.id === id).actorId,
      "control",
    );
  const b = await app(t);
  b.click('[data-id="c1"] .body');
  ctrlClick(b, '[data-id="c2"] .body');
  const before = b.savedDoc();
  b.key("ArrowRight"); // c1 source event dependency is absent; c2 end approaches c3 but remains valid
  b.key("z", { ctrlKey: true });
  assert.deepEqual(b.savedDoc().states, before.states);
  // Large shift crosses the unselected c3 boundary: document mutation is refused.
  b.click('[data-id="c1"] .body');
  ctrlClick(b, '[data-id="c2"] .body');
  const source = b.$('[data-id="c1"] .body'),
    sx = Number(source.getAttribute("x")),
    sy = Number(source.getAttribute("y"));
  b.event(source, "pointerdown", { clientX: sx + 5, clientY: sy + 10 });
  b.event(b.w, "pointermove", { clientX: sx + 405, clientY: sy + 10 });
  b.event(b.w, "pointerup");
  assert.deepEqual(b.savedDoc().states, before.states);
  assert.match(b.$("#toast").textContent, /時間/);
});

test("collapsed proxies omit colliding labels until selection and keep proposals dashed", async (t) => {
  const a = await app(t);
  a.click('[data-id="uuv"] [data-toggle]');
  const late = a.$('[data-id="late-hit"].interaction-proxy');
  assert.equal(
    late.querySelector(".line").getAttribute("stroke-dasharray"),
    "3 6",
  );
  assert.equal(late.querySelector(".interaction-label").textContent, "");
  a.click(late.querySelector(".hit"));
  assert.match(
    a.$('[data-id="late-hit"] .interaction-label').textContent,
    /検討:/,
  );
});
