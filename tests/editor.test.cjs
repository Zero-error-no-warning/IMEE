"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { openApp } = require("./dom-helper.cjs");
const M = require("../js/model.js");
const sample = require("../js/sample.js");
const extra = () => {
  const d = sample();
  d.actors.push({
    id: "test-actor",
    name: "検証Actor",
    side: "neutral",
    notes: "",
  });
  d.states.push({
    id: "free",
    actorId: "test-actor",
    name: "検証状態",
    start: 5,
    end: 10,
    status: "actual",
    activity: "active",
  });
  return d;
};
async function app(t, saved) {
  const a = await openApp(saved);
  t.after(() => a.close());
  return a;
}
function drag(a, selector, dx, dy = 0, options = {}) {
  const el = a.$(selector),
    body = el.closest('[data-type="state"]')?.querySelector(".body") || el;
  const x =
      Number(body.getAttribute("x") || 0) +
      Number(body.getAttribute("width") || 0) / 2,
    y = Number(body.getAttribute("y") || 0) + 16;
  a.event(el, "pointerdown", { clientX: x, clientY: y, ...options });
  a.event(a.w, "pointermove", { clientX: x + dx, clientY: y + dy, ...options });
  a.event(a.w, "pointerup", { clientX: x + dx, clientY: y + dy, ...options });
}
test("starts offline with the sample and proportional SVG geometry", async (t) => {
  const a = await app(t);
  assert.equal(a.d.querySelectorAll(".state").length, 15);
  assert.equal(a.d.querySelectorAll(".actor-label").length, 5);
  const p = Number(a.$('[data-id="e1"] .body').getAttribute("width")),
    q = Number(a.$('[data-id="e2"] .body').getAttribute("width"));
  assert.ok(Math.abs(q / p - 20 / 12) < 1e-10);
  assert.match(a.$("#inspector").textContent, /予定遷移を阻止/);
  assert.deepEqual(a.errors, []);
});
test("selection preserves the clicked SVG node for a native double-click sequence", async (t) => {
  const a = await app(t);
  const body = a.$('[data-id="e1"] .body');
  a.click(body);
  assert.equal(a.$('[data-id="e1"] .body'), body);
  a.event(body, "dblclick");
  assert.ok(a.$("#editor-dialog[open]"));
  assert.equal(a.$('[name="name"]').value, "進出");
});
test("adds and edits Actor through the form, and undo/redo restores it", async (t) => {
  const a = await app(t);
  a.click("#add-actor");
  a.fill("name", "中継");
  a.fill("side", "neutral");
  a.submit();
  assert.equal(a.savedDoc().actors.length, 6);
  a.click("#undo");
  assert.equal(a.savedDoc().actors.length, 5);
  a.click("#redo");
  assert.equal(a.savedDoc().actors.at(-1).name, "中継");
});
test("empty row double-click adds a State at its time coordinate", async (t) => {
  const a = await app(t);
  const scale = Number(a.$('[data-id="e1"] .body').getAttribute("width")) / 12;
  a.event(a.$('[data-row="sensor"]'), "dblclick", {
    clientX: 208 + 50 * scale,
    clientY: 250,
  });
  assert.ok(a.$("#editor-dialog[open]"));
  assert.equal(a.$('[name="start"]').value, "50");
  a.fill("name", "追加State");
  a.submit();
  assert.equal(a.savedDoc().states.at(-1).start, 50);
});
test("State drag is one history entry, and Ctrl-drag creates an independent copy", async (t) => {
  const a = await app(t, extra());
  const scale = Number(a.$('[data-id="free"] .body').getAttribute("width")) / 5;
  drag(a, '[data-id="free"] .body', 2 * scale);
  assert.equal(a.savedDoc().states.find((s) => s.id === "free").start, 7);
  a.click("#undo");
  assert.equal(a.savedDoc().states.find((s) => s.id === "free").start, 5);
  drag(a, '[data-id="free"] .body', 3 * scale, 0, { ctrlKey: true });
  assert.equal(a.savedDoc().states.length, 17);
  assert.equal(a.savedDoc().states.at(-1).start, 8);
  assert.equal(a.savedDoc().states.find((s) => s.id === "free").start, 5);
});
test("both resize handles update the interval", async (t) => {
  const a = await app(t, extra());
  const scale = Number(a.$('[data-id="free"] .body').getAttribute("width")) / 5;
  drag(a, '[data-id="free"] [data-handle="end"]', 3 * scale);
  assert.equal(a.savedDoc().states.find((s) => s.id === "free").end, 13);
  drag(a, '[data-id="free"] [data-handle="start"]', 2 * scale);
  assert.equal(a.savedDoc().states.find((s) => s.id === "free").start, 7);
});
test("invalid drag rolls back and explains the failed temporal constraint", async (t) => {
  const a = await app(t, sample()),
    scale = Number(a.$('[data-id="e1"] .body').getAttribute("width")) / 12;
  drag(a, '[data-id="e2"] .body', -10 * scale);
  assert.equal(a.savedDoc().states.find((s) => s.id === "e2").start, 14);
  assert.match(a.$("#toast").textContent, /時間を逆行/);
  assert.equal(a.$("#undo").disabled, true);
});
test("cross-row drag changes actor for an unconnected state", async (t) => {
  const a = await app(t, extra());
  const s = a.$('[data-id="free"] .body'),
    target = Number(a.$('[data-row="control"]').getAttribute("y")) + 44,
    source = Number(s.getAttribute("y")) + 16;
  drag(a, '[data-id="free"] .body', 0, target - source);
  assert.equal(
    a.savedDoc().states.find((s) => s.id === "free").actorId,
    "control",
  );
});
test("keyboard time edits and cancellation use the same validation/history", async (t) => {
  const a = await app(t, extra());
  a.click('[data-id="free"] .body');
  a.key("ArrowRight");
  assert.equal(a.savedDoc().states.find((s) => s.id === "free").start, 6);
  a.key("ArrowRight", { shiftKey: true });
  assert.equal(a.savedDoc().states.find((s) => s.id === "free").end, 12);
  a.key("z", { ctrlKey: true });
  assert.equal(a.savedDoc().states.find((s) => s.id === "free").end, 11);
});
test("creates a transition via two endpoint clicks", async (t) => {
  const d = extra();
  d.states.push({
    ...d.states.at(-1),
    id: "free2",
    name: "次の状態",
    start: 20,
    end: 30,
  });
  const a = await app(t, d);
  a.click('[data-mode="transition"]');
  a.click('[data-id="free"] .body');
  a.click('[data-id="free2"] .body');
  a.fill("label", "経過");
  a.submit();
  assert.equal(a.savedDoc().transitions.at(-1).from, "free");
  assert.equal(a.savedDoc().transitions.at(-1).to, "free2");
  assert.equal(a.$("#editor-dialog").open, false);
});
test("creates an Interaction with independent source and target times", async (t) => {
  const a = await app(t, extra());
  a.click('[data-mode="interaction"]');
  a.click('[data-id="free"] .body');
  a.click('[data-id="s2"] .body');
  a.fill("label", "報告");
  a.fill("sourceTime", 8);
  a.submit();
  const i = a.savedDoc().interactions.at(-1);
  assert.equal(i.sourceTime, 8);
  assert.equal(i.time, 14);
  assert.equal(i.targetId, "s2");
});
test("creates an explicit block on a planned transition with actual outcome", async (t) => {
  const a = await app(t, sample());
  a.click('[data-mode="block"]');
  a.click('[data-id="t2"] .body');
  a.click('[data-id="escape"] .hit');
  a.fill("label", "追加の阻止");
  a.fill("outcomeStateId", "e5");
  a.submit();
  const i = a.savedDoc().interactions.at(-1);
  assert.equal(i.effect, "block");
  assert.equal(i.targetId, "escape");
  assert.equal(i.outcomeStateId, "e5");
  assert.ok(a.d.querySelectorAll(".blocked-cross").length >= 2);
});
test("rejects blocking an actual transition without opening an invalid form", async (t) => {
  const a = await app(t);
  a.click('[data-mode="block"]');
  a.click('[data-id="t2"] .body');
  a.click('[data-id="et2"] .hit');
  assert.equal(a.$("#editor-dialog").open, false);
  assert.match(a.$("#toast").textContent, /予定/);
});
test("Actor reorder buttons preserve causal references", async (t) => {
  const a = await app(t, sample());
  a.click('[data-id="enemy"].actor-label');
  a.click('[data-action="down"]');
  assert.equal(a.savedDoc().actors[1].id, "enemy");
  M.validate(a.savedDoc());
});
test("deleting an actor confirms the cascade and is undoable", async (t) => {
  const a = await app(t, sample());
  a.click('[data-id="enemy"].actor-label');
  a.click('[data-action="delete"]');
  assert.ok(a.$("#editor-dialog[open]"));
  a.submit();
  assert.equal(a.savedDoc().actors.length, 4);
  assert.equal(
    a.savedDoc().interactions.some((i) => i.id === "hit"),
    false,
  );
  a.click("#undo");
  assert.deepEqual(a.savedDoc(), sample());
});
test("failed dialog edits preserve the document and keep the error visible", async (t) => {
  const a = await app(t, sample());
  a.event(a.$('[data-id="e1"] .body'), "dblclick");
  a.fill("end", 16);
  a.submit();
  assert.ok(a.$("#editor-dialog[open]"));
  assert.match(a.$("#dialog-error").textContent, /時間を逆行/);
  assert.equal(a.savedDoc().states[0].end, 12);
});
test("search jumps to a state; causal focus includes the blocked plan", async (t) => {
  const a = await app(t);
  a.$("#search").value = "無力化";
  a.$("#search").dispatchEvent(new a.w.Event("input", { bubbles: true }));
  a.click("#search-results button");
  assert.match(a.$("#inspector").textContent, /無力化/);
  a.$("#focus-chain").checked = true;
  a.$("#focus-chain").dispatchEvent(new a.w.Event("change", { bubbles: true }));
  assert.equal(a.$('[data-id="escape"]').classList.contains("dimmed"), false);
});
test("renders imported names as literal text without injecting SVG or HTML", async (t) => {
  const d = sample();
  d.states[0].name = "<img src=x onerror=alert(1)>";
  d.actors[0].name = "<script>bad()</script>";
  const a = await app(t, d);
  a.click('[data-id="e1"] .body');
  assert.equal(a.d.querySelectorAll("img").length, 0);
  assert.equal(a.$("#inspector .panel-title").textContent, d.states[0].name);
  assert.equal(a.d.querySelectorAll("svg script").length, 0);
});
test("JSON export round trips and SVG export is self-contained and scroll-independent", async (t) => {
  const a = await app(t, sample());
  a.click("#save-btn");
  assert.deepEqual(M.parse(await a.readBlob(a.downloads[0].blob)), sample());
  a.$("#canvas-scroll").scrollLeft = 100;
  a.$("#canvas-scroll").scrollTop = 120;
  a.$("#canvas-scroll").dispatchEvent(new a.w.Event("scroll"));
  a.click("#more-btn");
  a.click('[data-menu="0"]');
  const svg = await a.readBlob(a.downloads[1].blob);
  assert.match(svg, /<style>/);
  assert.match(svg, /命中・離脱阻止/);
  assert.doesNotMatch(svg, /<g id="actor-labels" transform=/);
  assert.doesNotMatch(svg, /class="port"/);
  const parsed = new a.w.DOMParser().parseFromString(svg, "image/svg+xml");
  assert.equal(parsed.querySelectorAll("parsererror").length, 0);
});
test("autosaved edits reload through the same document model", async (t) => {
  const a = await app(t, extra());
  a.click('[data-id="free"] .body');
  a.key("ArrowRight");
  const b = await app(t, a.savedDoc());
  assert.match(b.$('[data-id="free"] title').textContent, /T\+6/);
});
test("Actor drag changes ordering without altering state times", async (t) => {
  const a = await app(t, sample());
  const el = a.$('[data-id="enemy"].actor-label'),
    target = Number(a.$('[data-row="control"]').getAttribute("y")) + 30;
  a.event(el, "pointerdown", { clientX: 50, clientY: 100 });
  a.event(a.w, "pointermove", { clientX: 50, clientY: target });
  a.event(a.w, "pointerup", { clientX: 50, clientY: target });
  assert.equal(a.savedDoc().actors[2].id, "enemy");
  assert.deepEqual(a.savedDoc().states, sample().states);
});
test("dragging from a State port opens a connection dialog for the dropped target", async (t) => {
  const d = extra();
  d.states.push({
    ...d.states.at(-1),
    id: "free2",
    name: "接続先",
    start: 20,
    end: 30,
  });
  const a = await app(t, d);
  a.event(a.$('[data-id="free"] .port'), "pointerdown", {
    clientX: 100,
    clientY: 100,
  });
  a.event(a.w, "pointermove", { clientX: 200, clientY: 100 });
  a.event(a.$('[data-id="free2"] .body'), "pointerup", {
    clientX: 200,
    clientY: 100,
  });
  assert.ok(a.$("#editor-dialog[open]"));
  assert.match(a.$("#dialog-title").textContent, /Transition/);
  a.submit();
  assert.equal(a.savedDoc().transitions.at(-1).to, "free2");
});
test("JSON file import confirms replacement, preserves references, and supports Undo", async (t) => {
  const a = await app(t, sample()),
    d = extra();
  d.title = "読み込みテスト";
  Object.defineProperty(a.$("#file-input"), "files", {
    value: [{ size: 100, text: async () => JSON.stringify(d) }],
    configurable: true,
  });
  await a.$("#file-input").onchange({ target: a.$("#file-input") });
  assert.ok(a.$("#editor-dialog[open]"));
  a.submit();
  assert.deepEqual(a.savedDoc(), d);
  a.click("#undo");
  assert.deepEqual(a.savedDoc(), sample());
});
test("invalid JSON file never replaces the current document", async (t) => {
  const a = await app(t, sample());
  Object.defineProperty(a.$("#file-input"), "files", {
    value: [{ size: 100, text: async () => "{broken" }],
  });
  await a.$("#file-input").onchange({ target: a.$("#file-input") });
  assert.equal(a.$("#editor-dialog").open, false);
  assert.deepEqual(a.savedDoc(), sample());
  assert.match(a.$("#toast").textContent, /読み込みできません/);
});
test("instantaneous transitions have a visible point marker at the exact event time", async (t) => {
  const a = await app(t);
  const markers = [...a.d.querySelectorAll('[data-id="tt1"]')];
  assert.equal(markers.length, 2);
  assert.match(markers[1].textContent, /即時遷移/);
  assert.ok(markers[1].querySelector('path[fill="white"]'));
});
