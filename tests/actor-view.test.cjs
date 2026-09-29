const {test}=require('node:test'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const M=require('../js/model'),L=require('../js/layout'),R=require('../js/render');
const sample=require('./fixtures/mission.cjs'), restored=require('../js/sample');
const {openApp}=require('./dom-helper.cjs');
const xml=(d,g,opts={})=>new JSDOM(R.render(d,g,opts),{contentType:'image/svg+xml'}).window.document;

test('State, Task, outcome and all causal endpoint types use the originating Actor color',()=>{
  const d=sample();d.actors.forEach((a,i)=>a.color=['#b51f40','#147863','#4b53c1','#975212','#79518b'][i]);
  d.causalLinks.push({id:'actor-source',source:{type:'actor',id:'enemy',time:40},target:{type:'task',id:'transmit',time:49},polarity:'positive',label:'Actorから'});
  const g=L.layout(d),dom=xml(d,g,{selection:[{type:'task',id:'search'}],gapIds:new Set(['negative'])});
  g.edges.forEach((e,i)=>{
    const owner=e.type==='task'?M.get(d,'state',M.get(d,'task',e.id).fromStateId).actorId:M.endpoint(d,M.get(d,'causalLink',e.id).source).actorId;
    assert.equal(dom.querySelectorAll('.edge .line')[i].getAttribute('stroke'),M.get(d,'actor',owner).color);
  });
  for(const s of d.states) assert.equal(dom.querySelector(`[data-id="${s.id}"] .body`).getAttribute('fill'),M.get(d,'actor',s.actorId).color);
  const exported=xml(d,g,{export:true});
  assert.deepEqual([...exported.querySelectorAll('.edge .line')].map(p=>p.getAttribute('stroke')),[...dom.querySelectorAll('.edge .line')].map(p=>p.getAttribute('stroke')));
});
test('Actor color edit supports save, undo, redo and recursive copy',async t=>{
  const a=await openApp(sample());t.after(()=>a.close());
  const old=a.savedDoc().actors.find(x=>x.id==='sensor').color;
  a.event(a.$('[data-id="sensor"]'),'dblclick');
  assert.equal(a.$('[name="color"]').type,'color');a.fill('color','#ff3366');a.submit();
  assert.equal(a.savedDoc().actors.find(x=>x.id==='sensor').color,'#ff3366');
  assert.equal(a.$('[data-id="search"] .line').getAttribute('stroke'),'#ff3366');
  a.key('z',{ctrlKey:true});assert.equal(a.savedDoc().actors.find(x=>x.id==='sensor').color,old);
  a.key('z',{ctrlKey:true,shiftKey:true});assert.equal(a.savedDoc().actors.find(x=>x.id==='sensor').color,'#ff3366');
  const d=a.savedDoc(),f=M.fragment(d,[{type:'actor',id:'sensor'}]);M.paste(d,f);
  assert.equal(d.actors.at(-1).color,'#ff3366');assert.deepEqual(M.parse(JSON.stringify(d)),d);assert.deepEqual(a.errors,[]);
});
test('invalid color data is rejected before reaching SVG attributes',()=>{
  const d=sample();for(const bad of ['red','url(javascript:bad)','" onload="bad','#12345']){d.actors[0].color=bad;assert.throws(()=>M.validate(d),/色/);}
});
test('positive and negative arrowheads follow the routed centerline in every direction and after a bend',()=>{
  for(const polarity of ['positive','negative']) for(const points of [
    [{x:300,y:100},{x:500,y:100}], [{x:500,y:100},{x:300,y:100}],
    [{x:300,y:100},{x:300,y:250}], [{x:300,y:250},{x:300,y:100}],
    [{x:300,y:100},{x:450,y:230}], [{x:300,y:100},{x:430,y:100},{x:430,y:230}],
  ]) {
    const d=sample(),g=L.layout(d),edge=g.edges.find(e=>e.id==='negative');
    edge.polarity=polarity;edge.points=points;edge.path=L.wave(points,2.8,15,null,polarity==='positive'?'triangle':'sine');
    const last=L.routeSegments(points).at(-1),expected=Math.atan2(last.b.y-last.a.y,last.b.x-last.a.x)*180/Math.PI;
    const dom=xml(d,g),p=dom.querySelector('[data-id="negative"] .line');
    const marker=dom.querySelector(p.getAttribute('marker-end').slice(4,-1));
    assert(Math.abs(+marker.getAttribute('orient')-expected)<1e-8);
    assert.equal(marker.querySelector('path').getAttribute('fill'),p.getAttribute('stroke'));
    const values=edge.path.match(/-?\d+(?:\.\d+)?/g).map(Number),end=values.slice(-2);
    let i=values.length-4;while(i>=0&&values[i]===end[0]&&values[i+1]===end[1]) i-=2;
    const tailAngle=Math.atan2(end[1]-values[i+1],end[0]-values[i])*180/Math.PI;
    assert(Math.abs(tailAngle-expected)<0.5);
  }
});
test('nested collapse projects children to parent color and hides internal causes only',()=>{
  const d=sample(),before=M.clone(d);
  d.actors.push({id:'external',name:'外部',side:'neutral',color:'#888888'});d.views.main.actorOrder.push('external');
  d.states.push({id:'ext',actorId:'external',name:'外部State',time:46});
  d.causalLinks.push({id:'unrelated',source:{type:'state',id:'e0'},target:{type:'state',id:'ext'},polarity:'positive',label:'外部因果'});
  const subgroup=M.groupActors(d,['sensor','control'],'内側');
  d.views.main.collapsedActors=['group',subgroup];
  const g=L.layout(d);assert.equal(g.states.size,d.states.length);assert.equal(g.tasks.size,d.tasks.length);
  for(const s of d.states){const p=g.states.get(s.id);assert.equal(p.actorId,s.actorId);assert.equal(p.x,g.vp.x(s.time));}
  for(const id of ['s0','i0','r0']) assert.equal(g.states.get(id).displayActorId,'group');
  assert.deepEqual(g.edges.filter(e=>e.type==='causalLink').map(e=>e.id),['negative','unrelated']);
  assert.deepEqual(d.causalLinks.slice(0,3),before.causalLinks);
  d.views.main.collapsedActors=[];assert.equal(L.layout(d).edges.filter(e=>e.type==='causalLink').length,4);
});
test('dragging an aggregated child State changes time without reparenting it',async t=>{
  const d=sample();d.views.main.collapsedActors=['group'];const a=await openApp(d);t.after(()=>a.close());
  const g=L.layout(a.savedDoc(),1050),s=g.states.get('s0');
  a.event(a.$('[data-id="s0"]'),'pointerdown',{clientX:s.x,clientY:s.y});
  a.event(a.w,'pointermove',{clientX:s.x+g.vp.scale,clientY:s.y});
  a.event(a.$('[data-id="s0"]'),'pointerup',{clientX:s.x+g.vp.scale,clientY:s.y});
  const result=a.savedDoc().states.find(x=>x.id==='s0');assert.equal(result.actorId,'sensor');assert.equal(result.time,3);assert.deepEqual(a.errors,[]);
});
test('mission status controls are absent, legacy statuses do not affect analysis and timing gaps remain',async t=>{
  const d=sample.research(),c=M.get(d,'causalLink','blue-action');d.technologies.forEach(x=>x.status='existing');
  c.proposed=true;d.tasks.forEach(x=>x.status='proposed');assert(M.analyzeTask(d,'jam').some);
  c.target.time=50;assert(!M.analyzeTask(d,'jam').some);assert.equal(M.opportunity(d,c).within,false);
  const a=await openApp(sample());t.after(()=>a.close());
  for(const id of ['s0','search','negative']) {
    a.event(a.$(`[data-id="${id}"]`),'dblclick');
    assert.equal(a.$('[name="status"]'),null);assert.equal(a.$('[name="proposed"]'),null);a.$('#dialog-cancel').click();
  }
  assert.deepEqual(a.errors,[]);
});
test('folded original scenario keeps all actions with their original owners and time endpoints',()=>{
  const d=restored.grouped(),before=M.clone(d);d.views.main.collapsedActors=['uuv'];
  const g=L.layout(d);assert.equal(g.states.size,d.states.length);assert.equal(g.tasks.size,d.tasks.length);
  for(const t of d.tasks){const p=g.tasks.get(t.id);assert.equal(p.from.actorId,M.get(d,'state',t.fromStateId).actorId);assert.equal(p.points[0].x,g.vp.x(p.window.start));assert.equal(p.points.at(-1).x,g.vp.x(p.window.end));}
  assert.deepEqual(d.states,before.states);assert.deepEqual(d.tasks,before.tasks);
});
