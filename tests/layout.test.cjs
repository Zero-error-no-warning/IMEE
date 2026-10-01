const { test } = require("node:test");
const assert = require("node:assert/strict"),
  M = require("../js/model"),
  L = require("../js/layout"),
  R = require("../js/render"),
  sample = require("./fixtures/mission.cjs");
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
test("causes, Tasks and outcomes use straight routes", () => {
  const d = sample(),
    g = L.layout(d),
    c = g.edges.find((e) => e.id === "negative");
  assert.equal(c.path, L.path(c.points));
  assert(c.path.split("L").length >= 2);
  const positive = g.edges.find((e) => e.id === "report");
  assert.equal(positive.path, L.path(positive.points));
  assert.notEqual(positive.path, L.wave(positive.points));
  for (const edge of g.edges.filter(e => e.type === 'task'))
    assert.equal(edge.path, L.path(edge.points));
  const output = R.render(d, g);
  assert(!/dasharray|dashed|dotted/.test(output));
});
test("legacy planned/proposed fields do not change text, fill, opacity or visibility", () => {
  const d = sample(), baseline = R.render(d,L.layout(d));
  d.tasks[0].status = "planned"; d.states[0].status = "proposed";
  d.causalLinks[0].proposed = true; d.views.main.filters.planned = false;
  assert.equal(R.render(d,L.layout(d)),baseline);
  assert.equal(svg(d).querySelector('[data-id="s0"] .body').getAttribute("fill"), M.actorColor(d,d.actors.find(a=>a.id==='sensor')));
});
test("square wave has flat plateaus and perpendicular steps at the shared amplitude and period", () => {
  const values = L.wave([{x:0,y:0},{x:150,y:0}],2.8,15,null,"square")
    .match(/-?\d+(?:\.\d+)?/g).map(Number);
  const points = [];
  for (let i=0;i<values.length;i+=2) points.push({x:values[i],y:values[i+1]});
  for(let i=1;i<points.length;i++)
    assert(points[i].x===points[i-1].x || points[i].y===points[i-1].y, 'no sloped transitions');
  const middle = points.filter(p=>p.x>=15 && p.x<=120), plateaus=[];
  assert(middle.every(p=>Math.abs(p.y)===2.8));
  for(let i=1;i<middle.length;i++) {
    const a=middle[i-1],b=middle[i];
    if(a.x!==b.x) {
      assert.equal(b.x-a.x,7.5);assert.equal(a.y,b.y);plateaus.push(a.y);
    } else assert.equal(b.y,-a.y);
  }
  assert(plateaus.length>10);
  for(let i=1;i<plateaus.length;i++) assert.equal(plateaus[i],-plateaus[i-1]);
});
test("same-Actor cause uses the same route in every View and SVG export", () => {
  const d=sample();
  d.causalLinks.push({id:'same-actor',source:{type:'state',id:'s0'},target:{type:'state',id:'s1'},propagation:{duration:14},label:'同Actor作用'});
  for(const mode of ['mission','causality','technology','gap']) {
    d.views.main.mode=mode;
    const g=L.layout(d),edge=g.edges.find(e=>e.id==='same-actor');
    assert.equal(edge.path,L.path(edge.points));
    const dom=svg(d),line=dom.querySelector('[data-id="same-actor"] .line');
    assert.equal(line.getAttribute('stroke-linejoin'),'round');
    const exported=new JSDOM(R.render(d,g,{export:true}),{contentType:'image/svg+xml'}).window.document;
    assert([...exported.querySelectorAll('.line')].some(p=>p.getAttribute('d')===edge.path));
  }
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
    propagation: { duration: 11 },
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
    for (const shape of ["sine", "square"]) {
      const wave = L.wave(points, 2.8, 15, null, shape);
      assert(wave.startsWith(L.path([points[0]])));
      assert(wave.endsWith(L.path([points.at(-1)]).slice(1)));
      assert(wave.split("L").length > 10);
    }
  }
});
test("Task / outcome / causal labels remain near their own line even when space is full", () => {
  const d = sample(),
    g = L.layout(d);
  for (const e of g.edges) {
    const b = e.labelInfo;
    if(!b) {assert(e.type==='task' || e.hideLabel);assert(R.render(d,g).includes(e.label));continue;}
    assert(Math.max(b.x - b.anchor.x, b.anchor.x - b.x - b.width, 0) <= 36);
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
test("collapsed group projects child timelines and hides internal causal links without mutation", () => {
  const d=sample(), before=M.clone(d);
  d.views.main.collapsedActors=["group"];
  const g=L.layout(d);
  assert.equal(g.states.size,d.states.length);
  assert.equal(g.tasks.size,d.tasks.length);
  assert.deepEqual(g.edges.filter(e=>e.type==='causalLink').map(e=>e.id),['negative']);
  assert.equal(g.states.get('s0').displayActorId,'group');
  assert.equal(g.states.get('s0').x,g.vp.x(2));
  assert.deepEqual(d.causalLinks,before.causalLinks);
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
test("standalone SVG export omits editing controls and polarity and escapes unsafe text", () => {
  const d = sample();
  d.states[0].name = "<script>alert(1)</script>";
  const g = L.layout(d, 1050, { full: true }),
    out = R.render(d, g, { export: true, full: true });
  assert(!out.includes("data-id="));
  assert(!out.includes('class="hit"'));
  assert(!out.includes("<script>"));
  assert(out.includes("&lt;script&gt;"));
  assert(!out.includes('data-polarity='));
});
test("maximum zoom retains compact routes and semantic anchors", () => {
  const d = sample();
  d.views.main.visibleTimeRange = { start: 45, end: 45.06 };
  d.views.main.zoom = 1000;
  const g = L.layout(d),
    edge = g.edges.find((e) => e.id === "negative");
  assert(edge.path.length < 40000);
  d.views.main.mode = 'causality';
  const square = L.layout(d).edges.find(e => e.id === 'negative');
  assert(square.path.length < 40000);
  assert.deepEqual(square.points, edge.points);
  assert.equal(square.path, edge.path);
  assert.equal(edge.points[0].x, g.vp.x(42));
  assert.equal(edge.points.at(-1).x, g.vp.x(49));
});
