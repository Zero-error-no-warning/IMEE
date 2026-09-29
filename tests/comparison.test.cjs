const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const M=require('../js/model'),L=require('../js/layout'),sample=require('../js/sample');
const {openApp}=require('./dom-helper.cjs');
const root=path.join(__dirname,'..');
const maps=require('../examples/comparison-v1/mapping.json');
const cases=[['coastal',sample],['submarine',sample.grouped],['research',sample.research]];
const read=(name)=>JSON.parse(fs.readFileSync(path.join(root,'examples/comparison-v1',name+'.json'),'utf8'));
for(const [name,create] of cases) {
  test(name+': same Actors, hierarchy, clock, all action intervals and terminal arrival times as v1',()=>{
    const old=read(name),d=create(),mapping=maps[name]; M.validate(d);
    assert.deepEqual(d.actors,old.actors); assert.deepEqual(d.time,old.time);
    assert.equal(d.title,old.title);
    assert.deepEqual(d.views.main.actorOrder,old.views.main.actorOrder);
    for(const s of old.states) {
      const m=mapping.stateMap[s.id],start=M.get(d,'state',s.id);
      assert.equal(start.time,s.start); assert.equal(start.status,s.status); assert.equal(start.activity,s.activity);
      assert.equal(m.start,s.start); assert.equal(m.end,s.end);
      if(m.type==='task') {
        const task=M.get(d,'task',m.id);
        assert.deepEqual(M.taskWindow(d,task),{start:s.start,end:s.end});
        assert.equal(task.label,s.name); assert.equal(task.status,s.status);
      } else assert(['e4','e5'].includes(s.id));
    }
    for(const t of old.transitions) {
      const m=mapping.transitionMap[t.id],a=old.states.find(s=>s.id===t.from),b=old.states.find(s=>s.id===t.to);
      if(m.type==='state') { assert.equal(a.end,b.start); assert.equal(M.get(d,'state',m.id).time,b.start); }
      else if(m.junctionId) {
        const branch=M.get(d,'task',m.id).junctions.find(j=>j.id===m.junctionId);
        assert(branch.outcomes.some(o=>o.toStateId===t.to)); assert.equal(branch.time,b.start);
        assert.equal(M.taskWindow(d,M.get(d,'task',m.id)).start,a.end);
      } else assert.deepEqual(M.taskWindow(d,M.get(d,'task',m.id)),{start:a.end,end:b.start});
    }
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'examples',name+'.json'),'utf8')),d);
  });
  test(name+': every original causal event retains Actor, source/target time, polarity, kind and label',()=>{
    const old=read(name),d=create();
    assert.equal(d.causalLinks.length,old.interactions.length);
    for(const i of old.interactions) {
      const c=M.get(d,'causalLink',i.id),source=M.endpoint(d,c.source),target=M.endpoint(d,c.target);
      const targetStateId=i.targetType==='transition'?old.transitions.find(t=>t.id===i.targetId).from:i.targetId;
      assert.deepEqual(source,{actorId:old.states.find(s=>s.id===i.fromStateId).actorId,time:i.sourceTime});
      assert.deepEqual(target,{actorId:old.states.find(s=>s.id===targetStateId).actorId,time:i.time});
      assert.equal(c.label,i.label);assert.equal(c.kind,i.kind);assert.equal(!!c.proposed,!!i.proposed);
      assert.equal(c.polarity,i.effect==='block'?'negative':'positive');
      if(i.outcomeStateId) assert(M.get(d,'task',c.target.id).junctions.some(j=>j.time===i.time && j.outcomes.some(o=>o.toStateId===i.outcomeStateId)));
    }
  });
}
test('research preserves the original technology catalog, bindings and both identified capability gaps',()=>{
  const old=read('research'),d=sample.research();
  assert.deepEqual(d.technologies,old.technologies);assert.equal(d.bindings.length,old.bindings.length);
  for(const b of old.bindings) {
    const actual=d.bindings.find(x=>x.id===b.id);
    assert.equal(actual.technologyId,b.technologyId);
    const m=b.targetType==='state'?maps.research.stateMap[b.targetId]:b.targetType==='transition'?maps.research.transitionMap[b.targetId]:{type:b.targetType==='interaction'?'causalLink':b.targetType,id:b.targetId};
    assert.equal(actual.targetId,m.id);assert.equal(actual.targetType,m.type);
  }
  const analysis=M.analyzeTask(d,'escape');
  assert(analysis.paths.some(p=>p.structural && p.window.at===46 && p.window.within));
  assert(analysis.paths.some(p=>p.structural && p.gaps.some(g=>g.name==='協調音響識別') && p.gaps.some(g=>g.name==='水中指令通信')));
  assert(analysis.paths.some(p=>p.window.at===54 && !p.window.within));
  assert.equal(analysis.some,false);
  d.technologies.forEach(t=>t.status='existing');
  assert(M.analyzeTask(d,'escape').some);
});
test('intervention preserves the full 44..52 escape window and separates the actual result from the planned path',()=>{
  const d=sample(),g=L.layout(d);
  assert.deepEqual(M.taskWindow(d,M.get(d,'task','escape')),{start:44,end:52});
  const j=g.junctions.get('escape@46');assert.equal(j.x,g.vp.x(46));
  assert.equal(g.states.get('e5').x,j.x);assert.notEqual(g.states.get('e5').y,j.y);
  assert.equal(g.states.get('e4').x,g.vp.x(52));
  assert.equal(M.get(d,'state','e4').status,'planned');assert.equal(M.get(d,'state','e5').status,'actual');
});
test('submarine collapse preserves the original sonar/torpedo hierarchy and timed intervention',()=>{
  const d=sample.grouped();d.views.main.collapsedActors=['uuv'];
  const g=L.layout(d),hit=g.edges.find(e=>e.id==='hit');
  assert(!g.states.has('s1'));assert(!g.states.has('t1'));assert(g.states.has('u1'));
  assert(hit.proxy);assert.equal(hit.points[0].x,g.vp.x(46));assert.equal(hit.points.at(-1).x,g.vp.x(46));
});
test('restored comparison samples and separate tutorial menu load without replacing each other',async()=>{
  for(const [,create] of cases) {
    const d=create(),app=await openApp(d);
    try {
      assert.deepEqual(app.errors,[]);assert.equal(app.savedDoc().title,d.title);
      assert.equal(app.d.querySelectorAll('.state .body').length,d.states.length);
      assert.equal(app.d.querySelectorAll('.edge.task').length,d.tasks.length);
      assert.equal(app.w.createSample().title,read('coastal').title);
      assert.notEqual(app.w.createTutorialSample().title,d.title);
    } finally {app.close();}
  }
});
test('fresh startup uses the restored mission; tutorial is an explicit, undoable menu choice',async()=>{
  const app=await openApp();
  try {
    const title=read('coastal').title;
    assert.equal(app.savedDoc().title,title);
    app.click(app.$('#more-btn'));
    const button=[...app.d.querySelectorAll('#context-menu button')].find(b=>b.textContent==='表現デモ（捜索・識別・通信）');
    assert(button);button.click();app.submit();
    assert.equal(app.savedDoc().title,app.w.createTutorialSample().title);
    app.key('z',{ctrlKey:true});assert.equal(app.savedDoc().title,title);
    assert.deepEqual(app.errors,[]);
  } finally {app.close();}
});
