const {test}=require('node:test'),assert=require('node:assert/strict');
const M=require('../js/model'),A=require('../js/authoring'),L=require('../js/layout');
const {base,gate,state,link}=require('./fixtures/quality.cjs'),{openApp}=require('./dom-helper.cjs');
function inputs(){const d=base();d.states.push(state('extra','a',0));d.causalLinks.push(link('extra-input','extra','r0',10));return d;}
function branches(explicit=false){const d=gate();d.states.push(state('extra-effect','a',20));d.causalLinks.push(link('extra-hit','extra-effect',M.clone(d.causalLinks[0].target),1));if(explicit)d.tasks[0].timing={duration:15};M.validate(d);return d;}
test('moving a State shifts all incoming causal arrivals and retains downstream duration',()=>{
  const d=inputs();A.moveState(d,'r0',12);
  assert.deepEqual(d.causalLinks.map(c=>M.causalArrivalTime(d,c)),[12,12]);
  assert.equal(M.get(d,'state','r1').time,22);M.validate(d);
  const g=L.layout(d);for(const c of d.causalLinks)assert.equal(g.edges.find(e=>e.id===c.id).points.at(-1).x,g.states.get('r0').x);
});
test('State movement preserves asynchronous arrival gaps, including display-only lines',()=>{
  const d=inputs();d.causalLinks[1].propagation.duration=8;
  d.causalLinks.push({...link('display','extra','r0',10),simulation:{enabled:false}});
  M.get(d,'state','r0').timing={mode:'relative'};A.moveState(d,'r0',12);
  assert.deepEqual(d.causalLinks.map(c=>M.causalArrivalTime(d,c)),[12,10,12]);M.validate(d);
});
test('Fixed State movement shifts all causal endpoints without changing input Task duration',()=>{
  const d=inputs();M.get(d,'state','r0').timing={mode:'fixed',at:10};
  d.tasks[1].timing={duration:10};A.moveState(d,'r0',12);
  assert.deepEqual(d.causalLinks.map(c=>M.causalArrivalTime(d,c)),[12,12]);
  assert.equal(d.tasks[1].timing.duration,10);assert.equal(M.get(d,'state','r1').time,22);M.validate(d);
});
test('explicit input selection still permits adjusting a single causal arrival',()=>{
  const d=inputs();d.causalLinks[1].propagation.duration=8;A.moveState(d,'r0',12,'follow','causalLink:report');
  assert.deepEqual(d.causalLinks.map(c=>M.causalArrivalTime(d,c)),[12,8]);M.validate(d);
});
for(const explicit of [false,true]){
  test(`moving a junction synchronizes every incoming effect and preserves outcome delay (${explicit?'explicit':'legacy'} Task)`,()=>{
    const d=branches(explicit);d.tasks[0].junctions[0].outcomes[0].delay=3;M.get(d,'state','killed').time=24;
    const curves=M.clone(d.tasks[1].simulation.performanceModel);A.moveJunction(d,'flight','point',23);
    assert.equal(M.get(d,'junction','point').time,23);assert.deepEqual(d.causalLinks.map(c=>M.causalArrivalTime(d,c)),[23,23]);
    assert.equal(M.get(d,'state','killed').time,26);assert.equal(M.get(d,'state','end').time,30);
    assert.deepEqual(d.tasks[1].simulation.performanceModel,curves);M.validate(d);
  });
  test(`moving an effect source also moves its junction and other attached effects (${explicit?'explicit':'legacy'} Task)`,()=>{
    const d=branches(explicit);A.moveState(d,'effect',22);
    assert.equal(M.get(d,'junction','point').time,23);assert.deepEqual(d.causalLinks.map(c=>M.causalArrivalTime(d,c)),[23,23]);
    assert.equal(d.causalLinks[0].propagation.duration,1);assert.equal(M.get(d,'state','killed').time,23);M.validate(d);
  });
}
test('Shift movement preserves branch result time by adjusting its delay',()=>{
  const d=branches();d.tasks[0].junctions[0].outcomes[0].delay=3;M.get(d,'state','killed').time=24;
  A.moveJunction(d,'flight','point',23,'keep');assert.equal(M.get(d,'state','killed').time,24);
  assert.equal(d.tasks[0].junctions[0].outcomes[0].delay,1);M.validate(d);
});
test('junction drag previews without saving and supports Undo and Redo',async t=>{
  const a=await openApp(branches());t.after(()=>a.close());const g=L.layout(a.savedDoc(),1050),j=[...g.junctions.values()].find(j=>j.explicit==='point'),p={clientX:j.x+2*g.vp.scale,clientY:j.y};
  a.event(a.$('.junction[data-junction-id="point"]'),'pointerdown',{clientX:j.x,clientY:j.y});a.event(a.w,'pointermove',p);
  assert(a.$('#drag-state-preview').textContent.includes('T+23'));assert.equal(a.savedDoc().tasks[0].junctions[0].time,21);
  a.event(a.$('#timeline'),'pointerup',p);assert.equal(a.savedDoc().tasks[0].junctions[0].time,23);
  assert.deepEqual(a.savedDoc().causalLinks.map(c=>a.w.ME.causalArrivalTime(a.savedDoc(),c)),[23,23]);
  a.w.IMEE.undo();assert.equal(a.savedDoc().tasks[0].junctions[0].time,21);a.w.IMEE.redo();assert.equal(a.savedDoc().tasks[0].junctions[0].time,23);
  assert.equal(a.$('#drag-state-preview'),null);assert.deepEqual(a.errors,[]);
});
test('invalid junction drag retains its attempted position and located diagnostics',async t=>{
  const a=await openApp(branches());t.after(()=>a.close());const g=L.layout(a.savedDoc(),1050),j=[...g.junctions.values()].find(j=>j.explicit==='point'),p={clientX:j.x-2*g.vp.scale,clientY:j.y};
  a.event(a.$('.junction[data-junction-id="point"]'),'pointerdown',{clientX:j.x,clientY:j.y});a.event(a.w,'pointermove',p);a.event(a.$('#timeline'),'pointerup',p);
  assert.equal(a.savedDoc().tasks[0].junctions[0].time,19);assert(a.$('.edit-error'));assert(a.$('#simulation-btn').disabled);
  a.w.IMEE.undo();assert.equal(a.savedDoc().tasks[0].junctions[0].time,21);assert.equal(a.$('.edit-error'),null);assert.deepEqual(a.errors,[]);
});
test('a State drag moves all attached causal endpoints in the preview and saved diagram',async t=>{
  const a=await openApp(inputs());t.after(()=>a.close());const g=L.layout(a.savedDoc(),1050),s=g.states.get('r0'),p={clientX:s.x+2*g.vp.scale,clientY:s.y};
  a.event(a.$('.state[data-id="r0"]'),'pointerdown',{clientX:s.x,clientY:s.y});a.event(a.w,'pointermove',p);
  assert(a.$('#drag-state-preview').querySelectorAll('path').length>=2);a.event(a.$('#timeline'),'pointerup',p);
  assert.deepEqual(a.savedDoc().causalLinks.map(c=>a.w.ME.causalArrivalTime(a.savedDoc(),c)),[12,12]);assert.deepEqual(a.errors,[]);
});
