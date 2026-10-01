const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  { openApp } = require("./dom-helper.cjs"),
  { base, gate } = require("./fixtures/quality.cjs"),
  A = require("../js/authoring");
async function app(t, d = base()) {
  const a = await openApp(d);
  t.after(() => a.close());
  return a;
}
test("visible authoring flow creates actors and activities from an empty document", async (t) => {
  const a = await app(t, A.empty());
  a.click("#add-actor");
  a.fill("name", "Sensor");
  a.submit();
  a.click("#add-activity");
  a.fill("label", "Search");
  a.fill("result", "Detected");
  a.fill("duration", 5);
  a.submit();
  const d = a.savedDoc();
  assert.equal(d.tasks.length, 1);
  assert.equal(d.states.length, 2);
  a.w.IMEE.select({ type: "state", id: d.states[1].id });
  const button = [...a.$("#inspector").querySelectorAll("button")].find(
    (b) => b.textContent === "達成目標にする",
  );
  button.click();
  assert(a.$(".goal-marker"));
  assert.equal(a.savedDoc().simulation.successStateIds[0], d.states[1].id);
  assert.deepEqual(a.errors, []);
});
test("new documents preserve the previous document and can be reopened", async (t) => {
  const a = await app(t);
  a.click("#new-document");
  a.fill("title", "New");
  a.submit();
  assert.equal(a.savedDoc().states.length, 0);
  assert.equal(a.w.IMEE.getWorkspace().length, 2);
  a.click("#documents-btn");
  a.click("[data-document-open]");
  assert.equal(a.savedDoc().title, "quality");
  assert.deepEqual(a.errors, []);
});
test("cancelled connections do not persist provisional objects or consume undo steps", async (t) => {
  const a = await app(t),
    before = a.savedDoc();
  a.click('.state[data-id="s0"]');
  a.key("c");
  a.click('.state[data-id="r0"]');
  assert.equal(a.w.IMEE.getDocument().causalLinks.length, 2);
  assert.equal(a.savedDoc().causalLinks.length, 1);
  a.click("#dialog-cancel");
  assert.equal(a.w.IMEE.getDocument().causalLinks.length, 1);
  assert.deepEqual(a.savedDoc().states, before.states);
  a.click('.state[data-id="s0"]');
  a.key("c");
  a.click('.state[data-id="r0"]');
  a.submit();
  assert.equal(a.savedDoc().causalLinks.length, 2);
  a.w.IMEE.undo();
  assert.equal(a.savedDoc().causalLinks.length, 1);
});
test("State dialog atomically updates an incoming signal and downstream times", async (t) => {
  const a = await app(t);
  a.event(a.$('.state[data-id="r0"]'), "dblclick");
  a.fill("time", 12);
  a.submit();
  assert.equal(a.$("#dialog-error").textContent, "");
  assert.equal(a.savedDoc().causalLinks[0].propagation.duration, 2);
  assert.equal(a.savedDoc().states[3].time, 22);
  a.w.IMEE.undo();
  assert.equal(a.savedDoc().states[3].time, 20);
});
test("causal dialog updates downstream nominal times without changing its CDF", async (t) => {
  const a = await app(t);
  a.event(a.$('.causal-label[data-id="report"]'), "dblclick");
  a.fill("causalDelay", 3);
  a.submit();
  assert.equal(a.savedDoc().states[2].time, 13);
  assert.equal(a.savedDoc().states[3].time, 23);
});
test("branch composer creates a configured probability branch and rejects invalid totals atomically", async (t) => {
  const a = await app(t);
  a.w.IMEE.select({ type: "task", id: "consume" });
  a.click("#branch-btn");
  a.fill("name", "Alternative");
  a.fill("probability", 1.1);
  a.submit();
  assert(a.$("#dialog-error").textContent);
  assert.equal(a.savedDoc().states.length, 4);
  a.fill("probability", 0.25);
  a.submit();
  const j = a.savedDoc().tasks[1].junctions[0];
  assert.equal(j.simulation.mode, "probability");
  assert.equal(j.outcomes[0].probability, 0.25);
  assert.equal(j.outcomes[0].delay, 0);
});
test("implicit dependencies are visible when a branch effect source is selected", async (t) => {
  const a = await app(t, gate());
  a.w.IMEE.select({ type: "state", id: "effect" });
  assert(a.$(".authoring-dependency"));
  assert(a.$("#inspector").textContent.includes("作成・調整"));
});
test("inline time editing previews its changes before applying", async (t) => {
  const a = await app(t);
  a.w.IMEE.select({ type: "state", id: "r0" });
  a.fill("quickTime", 12);
  a.$(".quick-editor form").dispatchEvent(
    new a.w.Event("submit", { bubbles: true, cancelable: true }),
  );
  assert.equal(a.savedDoc().states[2].time, 10);
  assert(a.$("#dialog-fields").textContent.includes("22"));
  a.submit();
  assert.equal(a.savedDoc().states[3].time, 22);
});
test("CDF graph keyboard editing synchronizes with numeric points and does not save preview quality", async (t) => {
  const a = await app(t, gate());
  a.event(a.$('.task-label[data-id="action"]'), "dblclick");
  const point = a.$('[data-cdf-handle="0:1"]');
  a.event(point, "keydown");
  point.dispatchEvent(
    new a.w.KeyboardEvent("keydown", {
      key: "ArrowRight",
      bubbles: true,
      cancelable: true,
    }),
  );
  assert.equal(a.$('[name="curve-0-t-1"]').value, "21");
  a.fill("performanceQ", 0.3);
  a.submit();
  const task = a.savedDoc().tasks.find((x) => x.id === "action");
  assert.equal(task.simulation.performanceModel.curves[0].points[1].t, 21);
  assert.equal(task.simulation.q, undefined);
});
test("timing diagnostics propose a repair while retaining source JSON until confirmation", async (t) => {
  const a = await app(t),
    d = base();
  d.causalLinks[0].propagation.duration = 4;
  a.w.IMEE.loadJSON(JSON.stringify(d));
  a.click("#issues-btn");
  a.click("#repair-times");
  assert.equal(a.w.IMEE.getDocument().states[2].time, 10);
  a.submit();
  assert.equal(a.savedDoc().states[2].time, 14);
  assert.equal(a.savedDoc().states[3].time, 24);
  assert(a.w.IMEE.getWorkspace()[0].checkpoints.length);
});
test("changing annotations through inline and full editors preserves every nominal time", async (t) => {
  const d = gate();
  d.tasks[0].junctions[0].outcomes[0].delay = 5;
  const a = await app(t, d),
    before = a.savedDoc().states.map((s) => s.time);
  a.w.IMEE.select({ type: "task", id: "flight" });
  a.fill("quickName", "Renamed flight");
  a.$(".quick-editor form").dispatchEvent(
    new a.w.Event("submit", { bubbles: true, cancelable: true }),
  );
  a.submit();
  assert.deepEqual(
    a.savedDoc().states.map((s) => s.time),
    before,
  );
  a.event(a.$('.causal-label[data-id="hit"]'), "dblclick");
  a.fill("label", "Renamed hit");
  a.submit();
  assert.equal(a.$("#dialog-error").textContent, "");
  assert.deepEqual(
    a.savedDoc().states.map((s) => s.time),
    before,
  );
});
test("connection mode marks unavailable targets and rejects cycles without draft changes", async (t) => {
  const a = await app(t);
  a.click('.state[data-id="s1"]');
  a.click("#connect-btn");
  assert(a.$('.state[data-id="s0"]').classList.contains("connect-unavailable"));
  assert(a.$('.state[data-id="r0"]').classList.contains("connect-target"));
  a.click('.edge.task[data-id="consume"]');
  assert(a.$("#status").textContent.includes("循環"));
  assert(!a.$("#editor-dialog").hasAttribute("open"));
  assert.equal(a.savedDoc().tasks.length, 2);
});
test("the activity editor keeps start fixed when its duration changes", async (t) => {
  const a = await app(t);
  a.event(a.$('.task-label[data-id="consume"]'), "dblclick");
  assert.equal(a.$('[name="timeAnchor"]').value, "start");
  a.fill("taskDuration", 15);
  a.$('[name="taskDuration"]').dispatchEvent(
    new a.w.Event("input", { bubbles: true }),
  );
  assert.equal(a.$('[name="end"]').value, "25");
  a.submit();
  assert.equal(a.savedDoc().states[3].time, 25);
  assert.equal(a.savedDoc().states[2].time, 10);
});
test("changing activity start moves its branch and preview consistently", async (t) => {
  const a = await app(t, gate());
  a.event(a.$('.task-label[data-id="flight"]'), "dblclick");
  a.fill("start", 12);
  a.$('[name="start"]').dispatchEvent(
    new a.w.Event("input", { bubbles: true }),
  );
  assert.equal(a.$('[name="j0"]').value, "23");
  assert(a.$(".authoring-preview").textContent.includes("23"));
  a.submit();
  assert.equal(a.$("#dialog-error").textContent, "");
  const d = a.savedDoc();
  assert.equal(d.tasks[0].junctions[0].time, 23);
  assert.equal(d.states.find((s) => s.id === "killed").time, 23);
  assert.equal(d.causalLinks[0].propagation.duration, 3);
});

test("workspace copy reports storage errors without switching documents", async (t) => {
  const a = await app(t),
    before = a.savedDoc();
  a.click("#documents-btn");
  a.w.Storage.prototype.setItem = () => {
    throw new a.w.Error("quota");
  };
  a.click("#workspace-copy");
  assert(a.$("#dialog-error").textContent.includes("別案を保存できません"));
  assert.equal(a.w.IMEE.getWorkspace().length, 1);
  assert.deepEqual(a.savedDoc(), before);
  assert.deepEqual(a.errors, []);
});
