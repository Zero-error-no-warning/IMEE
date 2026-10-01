const {test}=require('node:test'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const M=require('../js/model'),L=require('../js/layout'),R=require('../js/render');
const fixture=require('./fixtures/simulation.cjs'),{openApp}=require('./dom-helper.cjs');
const svg=(d,opts={})=>new JSDOM(R.render(d,L.layout(d,1200,{full:!!opts.export}),opts),{contentType:'image/svg+xml'}).window.document;

test('CDF Tasks and fixed durations remain distinguishable in every View and standalone exports',()=>{
  const d=M.defaults(fixture());
  // The result delay is fixed even when its parent Task samples a CDF.
  d.tasks[0].junctions=[{id:'port',time:5,outcomes:[{label:'result',toStateId:'s1'}]}];
  for(const mode of ['mission','causality','technology','gap'])for(const exporting of [false,true]){
    d.views.main.mode=mode;const g=L.layout(d,1200),xml=svg(d,{export:exporting,selection:[{type:'task',id:'act'}]});
    const groups=[...xml.querySelectorAll('.edge')];
    g.edges.forEach((edge,i)=>{
      const group=groups[i],cdf=edge.part==='task'&&edge.id==='detect';
      assert.equal(group.dataset.performance,cdf?'cdf':'fixed');
      assert.equal(group.querySelectorAll('.line').length,1);
      assert.equal(group.querySelector('.line').getAttribute('d'),edge.path);
      if(cdf){assert(group.querySelector('.line-cdf'));assert(!group.querySelector('.line-gap'));}
      else {assert(group.querySelector('.line-fixed'));assert.equal(group.querySelector('.line-gap').getAttribute('d'),edge.path);assert.equal(group.querySelector('.line-arrow').getAttribute('stroke'),group.querySelector('.line').getAttribute('stroke'));assert(group.querySelector('.line-arrow').getAttribute('marker-end'));}
    });
    assert.equal(xml.querySelector('.edge.outcome').dataset.performance,'fixed');
    assert(xml.querySelector('.edge.outcome title').textContent.includes('分岐後の遅延は固定'));
  }
});

test('retained but disabled CDF curves draw as FIX without moving time anchors',()=>{
  const d=M.defaults(fixture()),before=L.layout(d,1200);
  d.tasks[0].simulation.enabled=false;const after=L.layout(d,1200),xml=svg(d);
  assert.deepEqual(after.edges.map(e=>e.points),before.edges.map(e=>e.points));
  assert.deepEqual([...after.states].map(([id,s])=>[id,s.x,s.y]),[...before.states].map(([id,s])=>[id,s.x,s.y]));
  const task=xml.querySelector('.edge.task[data-id="detect"]');assert.equal(task.dataset.performance,'fixed');assert(task.querySelector('.line-fixed'));assert(task.querySelector('title').textContent.includes('開始時刻は依存条件で変動'));
  assert(d.tasks[0].simulation.performanceModel);
});

test('single collapsed lines identify mixed CDF/FIX summaries, while all-fixed summaries retain double rails',()=>{
  const d=M.defaults(fixture()),group=M.groupActors(d,d.actors.map(a=>a.id),'group');d.views.main.collapsedActors=[group];d.views.main.collapsedLayout='single';
  let xml=svg(d),summary=xml.querySelector('.edge[data-expand-group]');
  assert.equal(summary.dataset.performance,'mixed');assert(summary.querySelector('.line-cdf'));assert(summary.querySelector('title').textContent.includes('CDF / FIX'));
  d.tasks[0].simulation.enabled=false;xml=svg(d);summary=xml.querySelector('.edge[data-expand-group]');assert.equal(summary.dataset.performance,'fixed');assert(summary.querySelector('.line-fixed'));
  const exported=svg(d,{export:true});assert.equal(exported.querySelectorAll('.edge.task .line-fixed').length,2);
});

test('turning CDF off and undoing updates the visible line and legend immediately',async t=>{
  const a=await openApp(fixture());t.after(()=>a.close());
  assert(a.$('.edge.task[data-id="detect"] .line-cdf'));assert(a.$('.legend').textContent.includes('CDF Task'));assert(a.$('.legend').textContent.includes('FIX Task'));
  a.event(a.$('.task-label[data-id="detect"] text'),'dblclick');a.$('[name="performanceEnabled"]').checked=false;a.submit();
  assert(a.$('.edge.task[data-id="detect"] .line-fixed'));assert(a.savedDoc().tasks[0].simulation.performanceModel);
  a.w.IMEE.undo();assert(a.$('.edge.task[data-id="detect"] .line-cdf'));assert.deepEqual(a.errors,[]);
});
