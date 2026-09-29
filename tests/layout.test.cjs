const { test } = require("node:test");
const assert = require("node:assert/strict"),
  M = require("../js/model"),
  L = require("../js/layout"),
  R = require("../js/render"),
  sample = require("../js/sample");
const { JSDOM } = require("jsdom");
function svg(d) {
  return new JSDOM(R.render(d, L.layout(d)), { contentType: "image/svg+xml" })
    .window.document;
}
test("State circles have exact time X and no duration or resize handles", () => {
  const d = sample(),
    g = L.layout(d),
    s = g.states.get("s0"),
    xml = svg(d);
  assert.equal(s.x, g.vp.x(2));
  assert.equal(s.r, 7);
  assert.equal(
    xml.querySelectorAll(".state circle.body").length,
    d.states.length,
  );
  assert.equal(
    xml.querySelectorAll(".state rect,.resize,.handle-line").length,
    0,
  );
});
test("ordinary Task has no intermediate junction; branches have one smaller white node", () => {
  const d = sample(),
    g = L.layout(d);
  assert(![...g.junctions.values()].some((j) => j.taskId === "search"));
  const j = g.junctions.get("identify@29");
  assert.equal(j.x, g.vp.x(29));
  assert(j.r < g.states.get("i1").r);
  assert.equal(
    g.edges.filter((e) => e.part === "outcome" && e.id === "identify").length,
    2,
  );
});
test("same-time result States use Y sublanes, never alter X", () => {
  const g = L.layout(sample());
  const a = g.states.get("i1"),
    b = g.states.get("i2");
  assert.equal(a.x, b.x);
  assert.notEqual(a.y, b.y);
});
test("positive remains solid; negative is genuinely wavy after routing without dashes", () => {
  const d = sample(),
    g = L.layout(d),
    c = g.edges.find((e) => e.id === "negative");
  assert.notEqual(c.path, L.path(c.points));
  assert(c.path.split("L").length > 20);
  const positive = g.edges.find((e) => e.id === "report");
  assert.equal(positive.path, L.path(positive.points));
  const output = R.render(d, g);
  assert(!/dasharray|dashed|dotted/.test(output));
});
test("planned / proposed only add explicit text and hollow State, never line semantics", () => {
  const d = sample();
  d.tasks[0].status = "planned";
  d.states[0].status = "proposed";
  d.causalLinks[0].proposed = true;
  const g = L.layout(d),
    output = R.render(d, g);
  assert(output.includes("予定 · 捜索"));
  assert(output.includes("案 · 探知情報"));
  assert.equal(g.edges[0].path, L.path(g.edges[0].points));
  assert.equal(
    svg(d).querySelector('[data-id="s0"] .body').getAttribute("fill"),
    "white",
  );
  assert(!output.includes("dasharray"));
});
test("multiple causal links share one Task junction at exact time", () => {
  const d = sample();
  d.causalLinks.push({
    ...M.clone(d.causalLinks[2]),
    id: "extra",
    label: "追加作用",
  });
  const g = L.layout(d);
  assert.equal(
    [...g.junctions.values()].filter(
      (j) => j.taskId === "transmit" && j.time === 49,
    ).length,
    1,
  );
  for (const id of ["negative", "extra"])
    assert.equal(g.edges.find((e) => e.id === id).points.at(-1).x, g.vp.x(49));
  assert.equal(
    g.edges.find((e) => e.id === "negative").points[0].x,
    g.vp.x(42),
  );
});
test("causal links connect facing circle boundaries downwards and upwards", () => {
  const d = sample();
  d.causalLinks.push({
    id: "up",
    source: { type: "state", id: "e0" },
    target: { type: "state", id: "i1" },
    polarity: "positive",
    label: "上向き",
  });
  const g = L.layout(d),
    down = g.edges.find((e) => e.id === "report"),
    up = g.edges.find((e) => e.id === "up");
  assert.equal(down.points[0].y, g.states.get("s1").y + 7);
  assert.equal(down.points.at(-1).y, g.states.get("i0").y - 7);
  assert.equal(up.points[0].y, g.states.get("e0").y - 7);
  assert.equal(up.points.at(-1).y, g.states.get("i1").y + 7);
});
for (const [name, a, b] of [
  [
    "same source",
    [
      { x: 10, y: 10 },
      { x: 10, y: 90 },
      { x: 150, y: 90 },
      { x: 150, y: 150 },
    ],
    [
      { x: 10, y: 10 },
      { x: 10, y: 90 },
      { x: 200, y: 90 },
      { x: 200, y: 150 },
    ],
  ],
  [
    "same target",
    [
      { x: 10, y: 10 },
      { x: 10, y: 90 },
      { x: 150, y: 90 },
      { x: 150, y: 150 },
    ],
    [
      { x: 30, y: 10 },
      { x: 30, y: 90 },
      { x: 150, y: 90 },
      { x: 150, y: 150 },
    ],
  ],
  [
    "both endpoints",
    [
      { x: 10, y: 10 },
      { x: 10, y: 90 },
      { x: 150, y: 90 },
      { x: 150, y: 150 },
    ],
    [
      { x: 10, y: 10 },
      { x: 10, y: 90 },
      { x: 150, y: 90 },
      { x: 150, y: 150 },
    ],
  ],
  [
    "middle segment",
    [
      { x: 10, y: 10 },
      { x: 10, y: 90 },
      { x: 150, y: 90 },
      { x: 150, y: 150 },
    ],
    [
      { x: 30, y: 30 },
      { x: 30, y: 90 },
      { x: 200, y: 90 },
      { x: 200, y: 180 },
    ],
  ],
])
  test("routing separates " + name + " while keeping exact anchors", () => {
    const route = L.createEdgeRouter(),
      first = route(a),
      second = route(b);
    assert.deepEqual(second[0], b[0]);
    assert.deepEqual(second.at(-1), b.at(-1));
    const overlap = (pts) =>
      L.routeSegments(pts).reduce(
        (n, s) =>
          n +
          L.routeSegments(first).reduce(
            (n, t) => n + L.parallelOverlap(s, t),
            0,
          ),
        0,
      );
    assert(overlap(second) < overlap(b));
  });
test("wave sampling works vertically / horizontally / elbows and retains endpoints", () => {
  for (const points of [
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    [
      { x: 10, y: 10 },
      { x: 10, y: 100 },
    ],
    [
      { x: 10, y: 10 },
      { x: 10, y: 50 },
      { x: 100, y: 50 },
    ],
  ]) {
    const wave = L.wave(points);
    assert(wave.startsWith(L.path([points[0]])));
    assert(wave.endsWith(L.path([points.at(-1)]).slice(1)));
    assert(wave.split("L").length > 10);
  }
});
test("Task / outcome / causal labels remain near their own line even when space is full", () => {
  const d = sample(),
    g = L.layout(d);
  for (const e of g.edges) {
    const b = e.labelInfo;
    assert(Math.abs(b.x + b.width / 2 - b.anchor.x) <= 36);
    assert(Math.abs(b.y - b.anchor.y) <= 40);
    assert(Number.isFinite(b.x));
  }
  const b = L.label(
    "crowded",
    [
      { x: 580, y: 200 },
      { x: 640, y: 200 },
    ],
    [{ x: 0, y: 0, width: 2000, height: 2000 }],
  );
  assert(b.x > 500);
  assert(b.y > 150 && b.y < 250);
});
test("long State labels wrap locally and do not enlarge nodes or change time", () => {
  const d = sample();
  d.states[0].name = "非常に長い到達状態の説明".repeat(8);
  const g = L.layout(d),
    s = g.states.get("s0");
  assert.equal(s.lines.length, 3);
  assert(s.lines[2].endsWith("…"));
  assert.equal(s.x, g.vp.x(2));
  assert.equal(s.r, 7);
});
test("zoom preserves canvas width and uses visible time range", () => {
  const d = sample(),
    g = L.layout(d, 1000);
  d.views.main.visibleTimeRange = { start: 20, end: 40 };
  const zoom = L.layout(d, 1000);
  assert.equal(zoom.vp.width, g.vp.width);
  assert.equal(zoom.vp.x(20), zoom.vp.left);
  assert.equal(zoom.vp.x(40), zoom.vp.right);
});
test("collapsed proxy preserves original times, polarity and mission data", () => {
  const d = sample(),
    before = M.clone(d);
  d.views.main.collapsedActors = ["group"];
  const g = L.layout(d);
  const c = g.edges.find((e) => e.id === "negative");
  assert(c.proxy);
  assert.equal(c.polarity, "negative");
  assert.equal(c.points.at(-1).x, g.vp.x(49));
  assert.deepEqual(d.causalLinks, before.causalLinks);
});
test("technology bubbles keep background, outline, title and supported bindings", () => {
  const d = sample.research(),
    xml = svg(d);
  assert(xml.querySelectorAll(".technology-tag rect[stroke]").length > 0);
  assert(
    [...xml.querySelectorAll(".technology-tag title")].some((x) =>
      x.textContent.includes("TRL 4"),
    ),
  );
});
test("standalone SVG export omits editing controls, escapes unsafe text, includes waves", () => {
  const d = sample();
  d.states[0].name = "<script>alert(1)</script>";
  const g = L.layout(d, 1050, { full: true }),
    out = R.render(d, g, { export: true, full: true });
  assert(!out.includes("data-id="));
  assert(!out.includes('class="hit"'));
  assert(!out.includes("<script>"));
  assert(out.includes("&lt;script&gt;"));
  assert(out.includes('data-polarity="negative"'));
});
test("maximum zoom samples only visible wave detail while retaining semantic anchors", () => {
  const d = sample();
  d.views.main.visibleTimeRange = { start: 45, end: 45.06 };
  d.views.main.zoom = 1000;
  const g = L.layout(d),
    edge = g.edges.find((e) => e.id === "negative");
  assert(edge.path.length < 40000);
  assert.equal(edge.points[0].x, g.vp.x(42));
  assert.equal(edge.points.at(-1).x, g.vp.x(49));
});
