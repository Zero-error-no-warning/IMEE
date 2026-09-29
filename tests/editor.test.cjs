const { test } = require("node:test");
const assert = require("node:assert/strict");
const { openApp } = require("./dom-helper.cjs");
const sample = require("./fixtures/mission.cjs");
async function app(t, d = sample()) {
  const a = await openApp(d);
  t.after(() => {
    assert.deepEqual(a.errors, []);
    a.close();
  });
  return a;
}
const element = (a, id) => a.$(`[data-id="${id}"]`);
const context = (a, id, label) => {
  a.event(element(a, id), "contextmenu", { clientX: 400, clientY: 160 });
  const b = [...a.d.querySelectorAll("#context-menu button")].find(
    (b) => b.textContent === label,
  );
  assert(b, label);
  b.click();
};
test("file-style classic script startup renders points and no resize affordance", async (t) => {
  const a = await app(t);
  assert.equal(a.d.querySelectorAll(".state .body").length, 10);
  assert.equal(a.d.querySelectorAll(".resize,.handle-line").length, 0);
  assert.equal(a.savedDoc().version, 2);
  assert.equal(a.$("#inspector").classList.contains("hidden"), true);
});
test("double click State opens point editor with no start/end fields; edit Undo Redo", async (t) => {
  const a = await app(t);
  a.event(element(a, "s0"), "dblclick");
  assert(a.$('[name="time"]'));
  assert.equal(a.$('[name="start"]'), null);
  a.fill("time", 3);
  a.fill("name", "捜索開始");
  a.submit();
  assert.equal(a.savedDoc().states[0].time, 3);
  a.key("z", { ctrlKey: true });
  assert.equal(a.savedDoc().states[0].time, 2);
  a.key("z", { ctrlKey: true, shiftKey: true });
  assert.equal(a.savedDoc().states[0].time, 3);
});
test("C then same Actor State makes Task, opens editor with derived duration", async (t) => {
  const a = await app(t);
  a.click(element(a, "i1"));
  a.key("c");
  assert(a.$(".connect-target"));
  a.click(element(a, "i2"));
  assert.equal(a.savedDoc().tasks.length, 5);
  assert.equal(a.$("#dialog-title").textContent, "Task");
  assert(a.$(".dialog-summary").textContent.includes("所要時間 0"));
  a.fill("label", "再評価");
  a.submit();
  assert.equal(a.savedDoc().tasks.at(-1).label, "再評価");
});
test("Alt drag creates causal link to precise Task time and polarity editable in popup", async (t) => {
  const a = await app(t),
    L = a.w.MELayout,
    g = L.layout(a.savedDoc(), 1050);
  const from = element(a, "s1");
  a.event(from, "pointerdown", {
    altKey: true,
    clientX: g.vp.x(16),
    clientY: g.states.get("s1").y,
  });
  a.event(a.w, "pointermove", {
    clientX: g.vp.x(24),
    clientY: g.tasks.get("identify").from.y,
  });
  a.event(element(a, "identify"), "pointerup", {
    clientX: g.vp.x(24),
    clientY: g.tasks.get("identify").from.y,
  });
  assert.equal(a.$("#dialog-title").textContent, "因果リンク");
  a.fill("polarity", "negative");
  a.fill("label", "処理を妨害");
  a.submit();
  const c = a.savedDoc().causalLinks.at(-1);
  assert.equal(c.target.type, "task");
  assert.equal(c.target.time, 24);
  assert.equal(c.polarity, "negative");
  assert(
    a.$(`[data-id="${c.id}"] .line`).getAttribute("d").split("L").length > 10,
  );
});
test("right-click add result creates shared white junction and new State", async (t) => {
  const a = await app(t);
  context(a, "search", "結果を追加");
  a.fill("time", 14);
  a.fill("label", "NG");
  a.fill("name", "捜索継続");
  a.fill("stateTime", 18);
  a.submit();
  const task = a.savedDoc().tasks[0];
  assert.equal(task.toStateId, "s1");
  assert.equal(task.junctions[0].outcomes.length, 1);
  assert.equal(a.d.querySelectorAll('.junction[data-id="search"]').length, 1);
});
test("State drag changes time without resizing; invalid backward movement rolls back", async (t) => {
  const a = await app(t),
    g = a.w.MELayout.layout(a.savedDoc(), 1050),
    s = g.states.get("s0");
  a.event(element(a, "s0"), "pointerdown", { clientX: s.x, clientY: s.y });
  a.event(a.w, "pointermove", { clientX: s.x + g.vp.scale * 2, clientY: s.y });
  a.event(element(a, "s0"), "pointerup", {
    clientX: s.x + g.vp.scale * 2,
    clientY: s.y,
  });
  assert.equal(a.savedDoc().states[0].time, 4);
  a.event(element(a, "s0"), "dblclick");
  a.fill("time", 59);
  a.submit();
  assert(a.$("#dialog-error").textContent);
  assert.equal(a.savedDoc().states[0].time, 4);
});
test("Ctrl click, group, duplicate subtree, copy/cut/paste preserve references", async (t) => {
  const a = await app(t);
  a.click(element(a, "sensor"));
  a.event(element(a, "control"), "click", { ctrlKey: true });
  a.key("g", { ctrlKey: true });
  let d = a.savedDoc(),
    group = d.actors.at(-1);
  assert.equal(d.actors.find((x) => x.id === "sensor").parentId, group.id);
  a.key("d", { ctrlKey: true });
  assert.equal(a.savedDoc().actors.length, 9);
  a.key("z", { ctrlKey: true });
  a.click(element(a, group.id));
  a.key("c", { ctrlKey: true });
  a.key("x", { ctrlKey: true });
  assert.equal(a.savedDoc().actors.length, 3);
  a.key("v", { ctrlKey: true });
  assert.equal(a.savedDoc().actors.length, 6);
});
test("rectangle selection selects nearby State points, Delete and Undo restore", async (t) => {
  const a = await app(t),
    g = a.w.MELayout.layout(a.savedDoc(), 1050),
    s = g.states.get("s0"),
    e = g.states.get("s1");
  a.event(a.$("#timeline"), "pointerdown", {
    clientX: s.x - 10,
    clientY: s.y - 10,
  });
  a.event(a.w, "pointermove", { clientX: e.x + 10, clientY: e.y + 10 });
  a.event(a.$("#timeline"), "pointerup", {
    clientX: e.x + 10,
    clientY: e.y + 10,
  });
  assert.equal(a.d.querySelectorAll(".state.selected").length, 2);
  a.key("Delete");
  assert.equal(a.savedDoc().states.length, 8);
  a.key("z", { ctrlKey: true });
  assert.equal(a.savedDoc().states.length, 10);
});
test("zoom and pan keep width fixed; full export restores all Actors and range", async (t) => {
  const a = await app(t);
  const width = a.$("#timeline").getAttribute("width");
  a.click("#zoom-in");
  assert.equal(a.$("#timeline").getAttribute("width"), width);
  assert(a.savedDoc().views.main.visibleTimeRange.start > 0);
  a.click('[data-collapse="group"]');
  assert.equal(a.d.querySelectorAll(".state").length, 10);
  const before = a.w.IMEE.getDocument(),
    out = a.w.IMEE.exportSource();
  assert(out.svg.includes("未探知"));
  assert(out.svg.includes("送信失敗"));
  assert.deepEqual(a.w.IMEE.getDocument(), before);
});
test("JSON download/import roundtrip and rejected v1 leaves document intact", async (t) => {
  const a = await app(t);
  a.click("#save-btn");
  assert.equal(a.downloads.at(-1).name, "mission-v2.json");
  const text = await a.readBlob(a.downloads.at(-1).blob);
  a.w.IMEE.loadJSON(text);
  assert.equal(a.savedDoc().tasks.length, 4);
  assert.throws(() => a.w.IMEE.loadJSON('{"version":1}'), /version: 2/);
  assert.equal(a.savedDoc().tasks.length, 4);
});
test("SVG export contains full model, real waves and no editor hit targets", async (t) => {
  const a = await app(t);
  a.w.IMEE.exportSVG();
  const download = a.downloads.at(-1),
    text = await a.readBlob(download.blob);
  assert.equal(download.name, "mission.svg");
  assert(text.includes('data-polarity="negative"'));
  assert(!text.includes("dasharray"));
  assert(!text.includes('class="hit"'));
  assert(text.includes("識別"));
});
test("technology binding UI supports Task and detail inspector", async (t) => {
  const a = await app(t, sample.research());
  context(a, "search", "技術を関連付け");
  a.fill("technologyId", "tech-rd");
  a.submit();
  assert(
    a
      .savedDoc()
      .bindings.some(
        (b) =>
          b.targetId === "search" &&
          b.targetType === "task" &&
          b.technologyId === "tech-rd",
      ),
  );
  a.click(element(a, "search"));
  a.click("#inspector-toggle");
  assert(a.$("#inspector").textContent.includes("耐妨害通信"));
});
test("Causality View and filters use new names and keep negative wavy", async (t) => {
  const a = await app(t);
  a.$("#view-mode").value = "causality";
  a.$("#view-mode").dispatchEvent(new a.w.Event("change"));
  assert.equal(a.savedDoc().views.main.mode, "causality");
  assert.equal(
    a.$('[data-id="negative"] .line').getAttribute("data-polarity"),
    "negative",
  );
  a.click("#view-settings");
  a.fill("causalLink", "false");
  a.submit();
  assert.equal(a.$('[data-id="negative"]'), null);
  assert.equal(a.d.querySelectorAll(".state").length, 10);
});
function mockRaster(a, { loadError = false, emptyBlob = false } = {}) {
  const calls = { draw: [], revoked: [] };
  a.w.URL.revokeObjectURL = (u) => calls.revoked.push(u);
  a.w.Image = class {
    set src(value) {
      queueMicrotask(() => (loadError ? this.onerror() : this.onload()));
    }
  };
  a.w.HTMLCanvasElement.prototype.getContext = function () {
    calls.canvas = this;
    return {
      set fillStyle(v) {
        calls.background = v;
      },
      fillRect() {},
      drawImage(...args) {
        calls.draw.push(args);
      },
    };
  };
  a.w.HTMLCanvasElement.prototype.toBlob = function (cb, type) {
    calls.mime = type;
    cb(
      emptyBlob
        ? null
        : new a.w.Blob([new Uint8Array([137, 80, 78, 71])], { type }),
    );
  };
  return calls;
}
test("PNG export uses full white canvas, bounded dimensions and preserves view (mock encoder)", async (t) => {
  const a = await app(t);
  a.click("#zoom-in");
  const before = a.w.IMEE.getDocument(),
    calls = mockRaster(a);
  await a.w.IMEE.exportPNG();
  assert.equal(a.downloads.at(-1).name, "mission.png");
  assert.equal(calls.background, "white");
  assert.equal(calls.mime, "image/png");
  assert.equal(calls.canvas.width, 2100);
  assert(calls.canvas.width * calls.canvas.height <= 32000000);
  assert(calls.revoked.length);
  assert.deepEqual(a.w.IMEE.getDocument(), before);
});
test("PNG encoder and image errors report failure, no false download", async (t) => {
  const a = await app(t);
  mockRaster(a, { loadError: true });
  await a.w.IMEE.exportPNG();
  assert.equal(a.downloads.length, 0);
  assert(a.$("#toast").textContent.includes("読み込めません"));
  mockRaster(a, { emptyBlob: true });
  await a.w.IMEE.exportPNG();
  assert.equal(a.downloads.length, 0);
  assert(a.$("#toast").textContent.includes("変換に失敗"));
});
test("editing multiple junction times remaps attachments once, without cascading moves", async (t) => {
  const d = sample();
  d.tasks[1].junctions.unshift({
    id: "j-early",
    time: 24,
    outcomes: [{ toStateId: "i1", label: "早期" }],
  });
  d.causalLinks.push({
    id: "attach-early",
    source: { type: "state", id: "s1" },
    target: { type: "task", id: "identify", time: 24 },
    polarity: "positive",
    label: "確認",
  });
  const a = await app(t, d);
  a.event(element(a, "identify"), "dblclick");
  a.fill("j0", 29);
  a.fill("j1", 31);
  a.submit();
  assert.equal(a.$("#dialog-error").textContent, "");
  assert.equal(
    a.savedDoc().causalLinks.find((c) => c.id === "attach-early").target.time,
    29,
  );
});
