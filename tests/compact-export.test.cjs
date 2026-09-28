"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict");
const { openApp } = require("./dom-helper.cjs"),
  sample = require("../js/sample.js"),
  M = require("../js/model.js");
async function app(t, d = sample.research()) {
  const a = await openApp(d);
  t.after(() => {
    assert.deepEqual(a.errors, []);
    a.close();
  });
  return a;
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
function mockRaster(a, { loadError = false, emptyBlob = false } = {}) {
  const calls = { sources: [], revoked: [], draw: [], fill: [] },
    create = a.w.URL.createObjectURL;
  a.w.URL.createObjectURL = (b) => {
    calls.sources.push(b);
    return create(b);
  };
  a.w.URL.revokeObjectURL = (url) => calls.revoked.push(url);
  a.w.Image = class {
    set src(value) {
      calls.imageURL = value;
      queueMicrotask(() => (loadError ? this.onerror() : this.onload()));
    }
  };
  a.w.HTMLCanvasElement.prototype.getContext = function () {
    calls.canvas = this;
    return {
      set fillStyle(v) {
        calls.background = v;
      },
      fillRect(...args) {
        calls.fill.push(args);
      },
      drawImage(...args) {
        calls.draw.push(args);
      },
    };
  };
  // Encoder stand-in: tests export plumbing, not browser raster fidelity.
  a.w.HTMLCanvasElement.prototype.toBlob = function (callback, type) {
    calls.mime = type;
    callback(
      emptyBlob
        ? null
        : new a.w.Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], {
            type,
          }),
    );
  };
  return calls;
}
function png(a) {
  a.click("#more-btn");
  a.click(
    [...a.d.querySelectorAll("#context-menu button")].find((b) =>
      b.textContent.includes("PNG"),
    ),
  );
}
test("compact layout reduces empty space while preserving State duration and the user's lane spacing", () => {
  const d = M.migrate(sample());
  d.views.main.laneHeight = 52;
  const l = M.layout(d, 10);
  assert.equal(l.rows[1].height, 68);
  assert.ok(l.height < 470);
  for (const s of d.states) {
    assert.equal(l.positions.get(s.id).height, 32);
    assert.equal(l.positions.get(s.id).width, (s.end - s.start) * 10);
  }
  assert.equal(l.positions.get("e4").y - l.positions.get("e5").y, 52);
});
test("States have no connection circles; Alt-drag connects without moving or copying the source", async (t) => {
  const a = await app(t),
    before = a.savedDoc();
  assert.equal(a.$(".port"), null);
  a.event(a.$('[data-id="t2"] .body'), "pointerdown", {
    altKey: true,
    clientX: 800,
    clientY: 400,
  });
  a.event(a.w, "pointermove", { altKey: true, clientX: 820, clientY: 100 });
  assert.ok(a.$("#link-preview"));
  a.event(a.$('[data-id="escape"] .hit'), "pointerup", {
    altKey: true,
    clientX: 820,
    clientY: 100,
  });
  assert.ok(a.$("#editor-dialog[open]"));
  assert.deepEqual(a.savedDoc().states, before.states);
  a.submit();
  assert.equal(
    a.savedDoc().interactions.length,
    before.interactions.length + 1,
  );
});
test("technology annotations are filled outlined callouts and remain intact in standalone SVG", async (t) => {
  const a = await app(t),
    bubble = a.$(".technology-bubble");
  assert.ok(bubble);
  assert.notEqual(bubble.getAttribute("fill"), "none");
  assert.ok(bubble.getAttribute("stroke"));
  assert.match(a.$(".technology-tag title").textContent, /TRL/);
  a.click("#more-btn");
  a.click('[data-menu="0"]');
  const svg = await a.readBlob(a.downloads[0].blob);
  assert.match(svg, /technology-bubble/);
  assert.doesNotMatch(svg, /class="port"/);
  const parsed = new a.w.DOMParser().parseFromString(svg, "image/svg+xml");
  assert.equal(parsed.querySelector("parsererror"), null);
});
test("PNG export uses the full chart, 2x white canvas, and preserves the current View", async (t) => {
  const a = await app(t);
  a.click('[data-id="uuv"] [data-toggle]');
  a.click("#zoom-in");
  const before = a.savedDoc().views,
    range = a.$("#time-window").textContent;
  const calls = mockRaster(a);
  png(a);
  await settle();
  assert.equal(a.downloads.length, 1);
  assert.equal(a.downloads[0].name, "mission-timeline.png");
  assert.equal(a.downloads[0].blob.type, "image/png");
  const svg = await a.readBlob(calls.sources[0]);
  assert.match(svg, /data-id="t2"/);
  assert.match(svg, /T\+60/);
  const parsed = new a.w.DOMParser().parseFromString(
    svg,
    "image/svg+xml",
  ).documentElement;
  const bounds = parsed.getAttribute("viewBox").split(" ").map(Number);
  assert.equal(calls.canvas.width, bounds[2] * 2);
  assert.equal(calls.canvas.height, bounds[3] * 2);
  assert.equal(Number(parsed.getAttribute("width")), calls.canvas.width);
  assert.equal(Number(parsed.getAttribute("height")), calls.canvas.height);
  assert.equal(calls.background, "#ffffff");
  assert.equal(calls.draw.length, 1);
  assert.equal(calls.mime, "image/png");
  assert.equal(calls.revoked.length, 1);
  assert.deepEqual(a.savedDoc().views, before);
  assert.equal(a.$("#time-window").textContent, range);
  assert.equal(a.$('[data-id="t2"] .body'), null);
});
test("failed PNG decoding cleans resources and permits a retry without changing the document", async (t) => {
  const a = await app(t),
    before = a.savedDoc(),
    failed = mockRaster(a, { loadError: true });
  png(a);
  await settle();
  assert.equal(a.downloads.length, 0);
  assert.equal(failed.revoked.length, 1);
  assert.match(a.$("#toast").textContent, /画像化に失敗/);
  assert.deepEqual(a.savedDoc(), before);
  mockRaster(a);
  png(a);
  await settle();
  assert.equal(a.downloads.length, 1);
});
test("a failed PNG encoder does not download an empty file", async (t) => {
  const a = await app(t),
    calls = mockRaster(a, { emptyBlob: true });
  png(a);
  await settle();
  assert.equal(a.downloads.length, 0);
  assert.equal(calls.revoked.length, 1);
  assert.match(a.$("#toast").textContent, /PNGを生成できません/);
});
