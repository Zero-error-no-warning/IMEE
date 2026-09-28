"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const M = require("../js/model.js");
const sample = require("../js/sample.js");
const { openApp } = require("./dom-helper.cjs");
const elbow = (a, b) => [
  a,
  { x: a.x, y: (a.y + b.y) / 2 },
  { x: b.x, y: (a.y + b.y) / 2 },
  b,
];
const overlap = (a, b) =>
  M.routeSegments(a).reduce(
    (sum, s) =>
      sum +
      M.routeSegments(b).reduce((n, t) => n + M.parallelOverlap(s, t, 1), 0),
    0,
  );
const points = (path) => {
  const n = path
    .getAttribute("d")
    .match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)
    .map(Number);
  return Array.from({ length: n.length / 2 }, (_, i) => ({
    x: n[i * 2],
    y: n[i * 2 + 1],
  }));
};
async function app(t, d) {
  const a = await openApp(d);
  t.after(() => {
    assert.deepEqual(a.errors, []);
    a.close();
  });
  return a;
}
for (const [name, pairs] of [
  [
    "shared source",
    [
      [
        { x: 100, y: 20 },
        { x: 200, y: 200 },
      ],
      [
        { x: 100, y: 20 },
        { x: 260, y: 250 },
      ],
    ],
  ],
  [
    "shared target",
    [
      [
        { x: 100, y: 20 },
        { x: 260, y: 250 },
      ],
      [
        { x: 180, y: 80 },
        { x: 260, y: 250 },
      ],
    ],
  ],
  [
    "both endpoints",
    [
      [
        { x: 100, y: 20 },
        { x: 200, y: 200 },
      ],
      [
        { x: 100, y: 20 },
        { x: 200, y: 200 },
      ],
    ],
  ],
  [
    "shared section without common endpoints",
    [
      [
        { x: 100, y: 20 },
        { x: 200, y: 200 },
      ],
      [
        { x: 100, y: 50 },
        { x: 260, y: 170 },
      ],
    ],
  ],
])
  test(`routing separates ${name} without changing event coordinates`, () => {
    const original = pairs.map(([a, b]) => elbow(a, b));
    const router = M.createEdgeRouter();
    const routed = original.map((p) => router(p));
    assert.ok(overlap(...original) > 30);
    assert.ok(overlap(...routed) < 8, JSON.stringify(routed));
    routed.forEach((p, i) => {
      assert.deepEqual(p[0], pairs[i][0]);
      assert.deepEqual(p.at(-1), pairs[i][1]);
    });
    const again = M.createEdgeRouter();
    assert.deepEqual(
      original.map((p) => again(p)),
      routed,
      "rendering is deterministic",
    );
  });
test("vertical identical-time edges fan out sideways and nonconflicting edges stay unchanged", () => {
  const router = M.createEdgeRouter([], {
    left: 0,
    right: 300,
    top: 0,
    bottom: 300,
  });
  const path = elbow({ x: 100, y: 20 }, { x: 100, y: 200 });
  const a = router(path),
    b = router(path);
  assert.ok(overlap(a, b) < 8);
  assert.ok(b.some((p) => p.x !== 100));
  const separate = elbow({ x: 250, y: 20 }, { x: 280, y: 200 });
  assert.deepEqual(router(separate), separate);
});
test("parallel Transitions stay time-monotone and their time anchors follow the routed line", () => {
  const router = M.createEdgeRouter();
  const path = [
    { x: 100, y: 60 },
    { x: 260, y: 60 },
  ];
  const first = router(path, { axis: "horizontal", timeAxis: true });
  const second = router(path, { axis: "horizontal", timeAxis: true });
  assert.ok(overlap(first, second) < 8);
  assert.ok(second.every((p, n) => !n || p.x >= second[n - 1].x));
  const anchor = M.pointOnRoute(second, 180, 60);
  assert.equal(anchor.x, 180);
  assert.notEqual(anchor.y, 60);
});
test("shared-endpoint interactions render separate visible and hit paths without modifying mission data", async (t) => {
  const d = M.migrate(sample());
  d.interactions.push({
    ...d.interactions.find((i) => i.id === "report"),
    id: "report-copy",
    label: "別経路の情報共有",
  });
  const a = await app(t, d),
    before = a.savedDoc();
  const one = points(a.$('[data-id="report"] .line'));
  const two = points(a.$('[data-id="report-copy"] .line'));
  assert.ok(overlap(one, two) < 8);
  assert.deepEqual(one[0], two[0]);
  assert.deepEqual(one.at(-1), two.at(-1));
  for (const id of ["report", "report-copy"]) {
    assert.equal(
      a.$(`[data-id="${id}"] .hit`).getAttribute("d"),
      a.$(`[data-id="${id}"] .line`).getAttribute("d"),
    );
  }
  a.click('[data-id="report-copy"] .hit');
  assert.equal(
    a.$('[data-id="report-copy"]').classList.contains("selected"),
    true,
  );
  assert.deepEqual(a.savedDoc(), before);
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
  assert.ok(
    overlap(
      points(xml.querySelector('[data-id="report"] .line')),
      points(xml.querySelector('[data-id="report-copy"] .line')),
    ) < 8,
  );
  assert.deepEqual(a.savedDoc(), before);
});
test("block arrows and decision nodes follow an offset Transition at the same arrival time", async (t) => {
  const d = M.migrate(sample());
  d.transitions.push({
    ...d.transitions.find((x) => x.id === "escape"),
    id: "escape-copy",
    label: "別の予定経路",
  });
  d.interactions.push({
    ...d.interactions.find((x) => x.id === "hit"),
    id: "hit-copy",
    targetId: "escape-copy",
  });
  const a = await app(t, d);
  const one = points(a.$('[data-id="escape"] .line'));
  const two = points(a.$('[data-id="escape-copy"] .line'));
  assert.ok(overlap(one, two) < 8);
  const arrow = points(a.$('[data-id="hit-copy"] .line')).at(-1);
  const onLine = M.pointOnRoute(two, arrow.x, arrow.y);
  assert.ok(Math.abs(onLine.y - arrow.y) < 1e-6);
  const node = a.$(
    '.intervention-point[data-id="hit-copy"] .intervention-node',
  );
  assert.ok(Math.abs(Number(node.getAttribute("cx")) - arrow.x) < 1e-6);
  assert.ok(Math.abs(Number(node.getAttribute("cy")) - arrow.y) < 1e-6);
});
test("collapsed proxies with different meanings separate without changing the original interactions", async (t) => {
  const d = M.migrate(sample.research());
  const i = d.interactions.find((x) => x.id === "report");
  d.interactions.push({ ...i, id: "report-copy", label: "別指令" });
  d.views.main.collapsedActors = ["uuv"];
  const a = await app(t, d);
  const paths = ["report", "report-copy"].map((id) =>
    a.$(`.interaction-proxy[data-id="${id}"] .line`),
  );
  assert.ok(paths.every(Boolean));
  assert.ok(overlap(...paths.map(points)) < 8);
  assert.deepEqual(a.savedDoc().interactions, d.interactions);
});
