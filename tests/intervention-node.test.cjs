"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const { openApp } = require("./dom-helper.cjs"),
  M = require("../js/model.js"),
  sample = require("../js/sample.js");
async function app(t, d = sample()) {
  const a = await openApp(d);
  t.after(() => {
    assert.deepEqual(a.errors, []);
    a.close();
  });
  return a;
}
const point = (el) => ({
  x: Number(el.getAttribute("cx")),
  y: Number(el.getAttribute("cy")),
});
const end = (el) => {
  const nums = el
    .getAttribute("d")
    .match(/-?\d*\.?\d+/g)
    .map(Number);
  return { x: nums.at(-2), y: nums.at(-1) };
};
test("a circular intervention node identifies successful and unsuccessful destinations without changing JSON", async (t) => {
  const d = M.migrate(sample()),
    a = await app(t, d);
  const node = a.$('.intervention-point[data-id="hit"] .intervention-node');
  assert.ok(node);
  assert.equal(a.$(".blocked-cross"), null);
  assert.deepEqual(point(node), end(a.$('[data-id="hit"] > .line')));
  assert.equal(
    a.$('[data-id="escape"] [data-branch="failure"]').textContent,
    "妨害失敗",
  );
  const success = a.$('.outcome-branch[data-id="hit"]');
  assert.equal(
    success.querySelector('[data-branch="success"]').textContent,
    "妨害成功",
  );
  assert.ok(
    success.querySelector(".success-branch").getAttribute("marker-end"),
  );
  assert.equal(
    success.querySelector(".success-branch").getAttribute("stroke-dasharray"),
    null,
  );
  assert.match(
    a.$('.intervention-point[data-id="hit"] title').textContent,
    /妨害成功 → 無力化/,
  );
  assert.match(
    a.$('.intervention-point[data-id="hit"] title').textContent,
    /妨害失敗 → 離脱完了/,
  );
  assert.deepEqual(a.savedDoc(), d);
  a.click(node);
  assert.ok(
    a.$('.intervention-point[data-id="hit"]').classList.contains("selected"),
  );
  assert.match(a.$("#inspector").textContent, /比較用の分岐/);
});
test("missing outcome is explicit and does not fabricate a successful State or branch", async (t) => {
  const d = M.migrate(sample());
  d.interactions.find((i) => i.id === "hit").outcomeStateId = null;
  const a = await app(t, d);
  assert.ok(a.$(".intervention-node"));
  assert.match(
    a.$('.intervention-point [data-branch="success"]').textContent,
    /結果未設定/,
  );
  assert.equal(a.$(".outcome-branch"), null);
  assert.deepEqual(a.savedDoc(), d);
});
test("proposed interventions do not create confirmed circular decision nodes or failure labels", async (t) => {
  const d = M.migrate(sample());
  d.interactions.find((i) => i.id === "hit").proposed = true;
  const a = await app(t, d);
  assert.equal(a.$(".intervention-node"), null);
  assert.equal(a.$('[data-branch="failure"]'), null);
  assert.equal(
    a.$('.outcome-branch [data-branch="success"]').textContent,
    "検討案の結果",
  );
  assert.equal(a.$(".success-branch").getAttribute("stroke-dasharray"), "2 3");
});
test("an intervention originating in a collapsed group retains its visible node and branches", async (t) => {
  const d = M.migrate(sample.research());
  d.views.main.collapsedActors = ["uuv"];
  const a = await app(t, d),
    node = a.$('.intervention-point[data-id="hit"] .intervention-node');
  assert.ok(node);
  assert.ok(a.$('.outcome-branch[data-id="hit"] .success-branch'));
  assert.deepEqual(
    end(a.$('.interaction-proxy[data-id="hit"] .line')),
    point(node),
  );
  assert.deepEqual(a.savedDoc(), d);
});
test("hiding interactions hides decision nodes while image export includes the full branch diagram", async (t) => {
  const d = M.migrate(sample());
  d.views.main.filters.interaction = false;
  const a = await app(t, d);
  assert.equal(a.$(".intervention-node"), null);
  a.click("#more-btn");
  a.click(
    [...a.d.querySelectorAll("#context-menu button")].find((b) =>
      b.textContent.includes("SVG"),
    ),
  );
  const xml = new a.w.DOMParser().parseFromString(
    await a.readBlob(a.downloads.at(-1).blob),
    "image/svg+xml",
  );
  assert.equal(xml.querySelector("parsererror"), null);
  assert.ok(xml.querySelector(".intervention-node"));
  assert.ok(xml.querySelector(".success-branch"));
  assert.equal(xml.querySelector(".blocked-cross"), null);
  assert.equal(
    xml.querySelector('[data-branch="failure"]').textContent,
    "妨害失敗",
  );
  assert.equal(a.$(".intervention-node"), null);
  assert.deepEqual(a.savedDoc(), d);
});
