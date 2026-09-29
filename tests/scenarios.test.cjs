const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../js/model'), L = require('../js/layout'), R = require('../js/render');
const sample = require('../js/tutorial-sample');
const { openApp } = require('./dom-helper.cjs');
const cases = [['coastal', sample], ['submarine', sample.grouped], ['research', sample.research]];

test('renaming States, Tasks and causes cannot change lanes, anchors or routed geometry', () => {
  const d = sample(), before = L.layout(d);
  d.states.forEach(s => s.name = '長い説明を追加した状態名'.repeat(8));
  d.tasks.forEach(t => { t.label = '長いTask名'.repeat(12); t.junctions?.forEach(j => j.outcomes.forEach(o => o.label = '長い結果名'.repeat(10))); });
  d.causalLinks.forEach(c => c.label = '長い因果の説明'.repeat(12));
  const after = L.layout(d);
  assert.deepEqual([...after.states.values()].map(s => [s.id,s.x,s.y]), [...before.states.values()].map(s => [s.id,s.x,s.y]));
  assert.deepEqual(after.edges.map(e => e.points), before.edges.map(e => e.points));
});

test('simple timelines remain straight and branch continuations stay on their sublane', () => {
  const g = L.layout(sample());
  for (const id of ['search','reobserve','switch','retry','jam']) {
    const e = g.edges.find(e => e.id === id && e.part === 'task');
    assert.equal(e.points.length, 2, id);
    assert.equal(e.points[0].y, e.points[1].y, id);
  }
  assert.equal(g.states.get('r2').lane, g.states.get('r3').lane);
  assert.equal(g.states.get('r3').lane, g.states.get('r4').lane);
});

test('parallel lines fan out locally with at most three segments and preserve Task time direction', () => {
  const route = L.createEdgeRouter();
  const input = [{x:200,y:100},{x:500,y:100}];
  const first = route(input, {timeAxis:true}), second = route(input, {timeAxis:true});
  assert.notDeepEqual(first,second);
  assert(second.length <= 4);
  assert.deepEqual(second[0],input[0]); assert.deepEqual(second.at(-1),input.at(-1));
  second.forEach((p,i) => { assert(Math.abs(p.y-100)<=24); if(i) assert(p.x>=second[i-1].x); });
});

test('labels use actual diagonal segments rather than the empty area inside their bounding box', () => {
  const points = [{x:100,y:100},{x:300,y:100}];
  const obstacle = {a:{x:140,y:0},b:{x:340,y:200}};
  // The caption is inside the diagonal's bounding box, but clear of the diagonal itself.
  const box = L.label('短文',points,[],150,[obstacle]);
  assert.equal(box.y,78);
  assert.equal(box.x+box.width/2,200);
});

test('shipped scenarios are distinct, synchronized, time ordered and use planned result alternatives', () => {
  const signatures = new Set();
  for(const [name,create] of cases) {
    const d=create(); M.validate(d);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(__dirname,'../examples/tutorial',name+'.json'),'utf8')),d);
    signatures.add(d.tasks.map(t=>t.label).join('|'));
    for(const t of d.tasks) for(const j of t.junctions||[]) for(const o of j.outcomes)
      assert.equal(M.get(d,'state',o.toStateId).status,'planned');
    for(const c of d.causalLinks) assert(M.endpoint(d,c.source).time<=M.endpoint(d,c.target).time);
  }
  assert.equal(signatures.size,3);
});

test('research example has one specific maturity gap on a complete timed intervention chain', () => {
  const d=sample.research(), a=M.analyzeTask(d,'jam');
  assert.equal(a.paths.length,1);
  assert(a.paths[0].structural); assert(a.paths[0].window.within); assert(!a.some);
  assert.deepEqual([...new Set(a.paths[0].gaps.map(g=>g.name))],['妨害源追尾制御']);
  d.technologies.find(t=>t.id==='tracking').status='existing';
  assert(M.analyzeTask(d,'jam').all);
});

test('hierarchy sample retains reports and orders when the two-UUV team is collapsed', () => {
  const d=sample.grouped(), before=JSON.stringify(d.causalLinks);
  d.views.main.collapsedActors=['team'];
  const g=L.layout(d);
  assert(!g.states.has('a0')); assert(!g.states.has('b0'));
  for(const id of ['confirm-report','incomplete-report','recall']) assert(g.edges.find(e=>e.id===id)?.proxy);
  assert.equal(JSON.stringify(d.causalLinks),before);
});

test('Gap view shows the unresolved technology while Technology view retains the full catalog annotations', () => {
  const d=sample.research();
  const gap=R.render(d,L.layout(d));
  assert.equal((gap.match(/class="technology-tag"/g)||[]).length,1);
  assert(gap.includes('妨害源追尾制御 · TRL 4'));
  d.views.main.mode='technology';
  assert.equal((R.render(d,L.layout(d)).match(/class="technology-tag"/g)||[]).length,d.bindings.length);
});

test('all shipped samples load in the editor and render their complete State and Task sets', async t => {
  for(const [,create] of cases) {
    const d=create(), app=await openApp(d);
    try {
      assert.deepEqual(app.errors,[]);
      assert.equal(app.d.querySelectorAll('.state .body').length,d.states.length);
      assert.equal(app.d.querySelectorAll('.edge.task').length,d.tasks.length);
      assert.equal(app.savedDoc().title,d.title);
    } finally { app.close(); }
  }
});
