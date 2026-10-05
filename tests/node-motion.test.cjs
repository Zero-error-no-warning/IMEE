const {test}=require('node:test'),assert=require('node:assert/strict');
const M=require('../js/model'),A=require('../js/authoring'),L=require('../js/layout'),R=require('../js/render');
const {base,gate,state,link}=require('./fixtures/quality.cjs'),{openApp}=require('./dom-helper.cjs');
function inputs(){const d=base();d.states.push(state('extra','a',0));d.causalLinks.push(link('extra-input','extra','r0',10));return d;}
function branches(explicit=false){const d=gate();d.states.push(state('extra-effect','a',20));d.causalLinks.push(link('extra-hit','extra-effect',M.clone(d.causalLinks[0].target),1));if(explicit)d.tasks[0].timing={duration:15};M.validate(d);return d;}
function chained(explicit=false){
  const d=branches(explicit);
  M.get(d,'state','extra-effect').time=15;d.causalLinks[1].propagation.duration=6;
  M.get(d,'state','prepare').actorId='b';
  d.actors.push({id:'b',name:'Sender',side:'friendly'});
  d.states.push(state('sender','b',10),state('receiver','a',10));
  d.tasks.push({id:'send',label:'Send',fromStateId:'prepare',toStateId:'sender'});
  d.tasks[1].fromStateId='receiver';
  d.causalLinks.push(link('signal','sender','receiver',0));
  if(explicit){d.tasks[1].timing={duration:10};d.tasks[2].timing={duration:10};}
  M.validate(d);return d;
}
for(const constraint of ['task','fixed','all']){
  test(`an earlier source keeps its arrow attached to a receiver held by ${constraint}`,()=>{
    const d=inputs(),receiver=M.get(d,'state','r0');
    d.causalLinks[0].propagation.performanceModel={type:'cdf',curves:[{q:1,points:[{t:0,p:0,q:1},{t:2,p:1,q:1}]}]};
    if(constraint==='task')d.tasks.push({id:'local-input',label:'Local input',fromStateId:'extra',toStateId:'r0'}),M.get(d,'state','extra').actorId='b';
    if(constraint==='fixed')receiver.timing={mode:'fixed',at:10};
    const model=M.clone(d.causalLinks[0].propagation.performanceModel);
    M.validate(d);A.moveState(d,'s1',8);
    assert.equal(receiver.time,10);assert.equal(d.causalLinks[0].propagation.duration,2);
    assert.equal(M.causalArrivalTime(d,d.causalLinks[0]),receiver.time);
    const g=L.layout(d),edge=g.edges.find(e=>e.id==='report'),target=g.states.get('r0');
    assert.equal(edge.points.at(-1).x,target.x);
    assert(Math.abs(edge.points.at(-1).y-target.y)<=target.r);
    assert(!g.stateReceipts.some(r=>r.linkId==='report'));
    assert(R.render(d,g).includes(L.path(edge.points)));
    assert.deepEqual(d.causalLinks[0].propagation.performanceModel,model);M.validate(d);
  });
}
test('an existing asynchronous arrival remains independent when its source is moved earlier',()=>{
  const d=inputs();d.causalLinks[0].propagation.duration=2;M.get(d,'state','r0').time=12;M.get(d,'state','r1').time=22;
  M.get(d,'state','extra').time=4;d.causalLinks[1].propagation.duration=6;
  M.validate(d);A.moveState(d,'extra',2);
  assert.equal(d.causalLinks[1].propagation.duration,6);
  assert.equal(M.causalArrivalTime(d,d.causalLinks[1]),8);assert.equal(M.get(d,'state','r0').time,12);M.validate(d);
});
for(const explicit of [false,true])for(const [id,time,expected,delay] of [['sender',8,19,0],['receiver',12,23,2]]){
  test(`${id==='sender'?'moving an outgoing State backwards':'moving an incoming State forwards'} propagates across Task and shared junction (${explicit?'explicit':'legacy'})`,()=>{
    const d=chained(explicit),curves=M.clone(d.tasks[1].simulation.performanceModel);
    A.moveState(d,id,time);
    assert.equal(M.get(d,'state',id).time,time);
    assert.equal(M.get(d,'state','receiver').time,time);
    assert.equal(M.get(d,'state','effect').time,expected-1);
    assert.equal(M.get(d,'junction','point').time,expected);
    assert.equal(M.get(d,'state','killed').time,expected);
    assert.equal(M.get(d,'state','extra-effect').time,15);
    assert.deepEqual(d.causalLinks.slice(0,2).map(c=>M.causalArrivalTime(d,c)),[expected,expected]);
    assert.equal(d.causalLinks[0].propagation.duration,1);
    assert.equal(d.causalLinks[2].propagation.duration,delay);
    assert.equal(M.taskWindow(d,d.tasks[1]).end-M.taskWindow(d,d.tasks[1]).start,10);
    assert.deepEqual(d.tasks[1].simulation.performanceModel,curves);
    const g=L.layout(d);for(const c of d.causalLinks)assert(Math.abs(g.edges.find(e=>e.id===c.id).points.at(-1).x-g.vp.x(M.causalArrivalTime(d,c)))<4);
    M.validate(d);
  });
}
test('moving a containing Task earlier leaves a stationary effect and its result at the source arrival',()=>{
  const d=require('../js/tutorial-sample')();A.moveState(d,'s1',14);
  const c=M.get(d,'causalLink','negative');
  assert.equal(M.get(d,'state','i0').time,16);
  assert.equal(M.get(d,'state','r0').time,36);
  assert.equal(M.get(d,'state',c.source.id).time,49);
  assert.equal(c.propagation.duration,0);
  assert.equal(M.get(d,'junction',c.target.id).time,49);
  assert.equal(M.get(d,'state',c.target.outcomeStateId).time,56);M.validate(d);
});
for(const name of ['sample','simulation-sample','time-axis-sample','tutorial-sample']){
  test(`${name} keeps requested State positions and consistent effects in both reported drag directions`,()=>{
    const original=require('../js/'+name)();
    for(const c of original.causalLinks.filter(c=>c.target.type==='state')){
      for(const [id,delta] of [[c.source.id,-2],[c.target.id,2]]){
        const desired=M.get(original,'state',id).time+delta;if(desired<0)continue;
        const d=M.clone(original);A.moveState(d,id,desired);
        assert.equal(M.get(d,'state',id).time,desired,`${c.id} / ${id}`);
        if(delta<0 && Math.abs(M.causalArrivalTime(original,c)-M.endpoint(original,c.target).time)<1e-8){
          const moved=M.get(d,'causalLink',c.id),g=L.layout(d),edge=g.edges.find(e=>e.id===c.id);
          assert.equal(M.causalArrivalTime(d,moved),M.endpoint(d,moved.target).time,`${c.id} retains State attachment`);
          assert.equal(edge.points.at(-1).x,g.states.get(c.target.id).x,`${c.id} arrow ends on target State`);
          assert(!g.stateReceipts.some(r=>r.linkId===c.id));
        }
        for(const effect of d.causalLinks.filter(c=>c.target.type==='junction')){
          assert(effect.propagation.duration>=0);
          assert.equal(M.causalArrivalTime(d,effect),M.get(d,'junction',effect.target.id).time);
        }
        M.validate(d);
      }
    }
  });
}
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
for(const [id,delta,expected] of [['sender',-2,19],['receiver',2,23]]){
  test(`dragging ${id} keeps the downstream junction connected through preview, save and Undo/Redo`,async t=>{
    const a=await openApp(chained());t.after(()=>a.close());const before=a.savedDoc(),g=L.layout(before,1050),s=g.states.get(id),p={clientX:s.x+delta*g.vp.scale,clientY:s.y};
    a.event(a.$(`.state[data-id="${id}"]`),'pointerdown',{clientX:s.x,clientY:s.y});a.event(a.w,'pointermove',p);
    const preview=a.$('#drag-state-preview');assert(preview);assert.equal(a.$('.edit-error'),null);
    assert.deepEqual(a.savedDoc(),before);a.event(a.$('#timeline'),'pointerup',p);
    const d=a.savedDoc();assert.equal(d.tasks[0].junctions[0].time,expected);
    assert.deepEqual(d.causalLinks.slice(0,2).map(c=>a.w.ME.causalArrivalTime(d,c)),[expected,expected]);
    assert.equal(a.$('.edit-error'),null);assert(!a.$('#simulation-btn').disabled);
    a.w.IMEE.undo();assert.equal(a.savedDoc().tasks[0].junctions[0].time,21);
    a.w.IMEE.redo();assert.equal(a.savedDoc().tasks[0].junctions[0].time,expected);assert.equal(a.$('.edit-error'),null);assert.deepEqual(a.errors,[]);
  });
}
test('dragging a source backwards keeps both arrows on constrained receivers in preview, save and Undo/Redo',async t=>{
  const original=require('../js/simulation-sample')(),a=await openApp(original);t.after(()=>a.close());
  const before=a.savedDoc(),g=L.layout(before,1050),s=g.states.get('control-orders'),p={clientX:s.x-2*g.vp.scale,clientY:s.y};
  a.event(a.$('.state[data-id="control-orders"]'),'pointerdown',{clientX:s.x,clientY:s.y});a.event(a.w,'pointermove',p);
  const preview=a.$('#drag-state-preview');assert(preview);assert.deepEqual(a.savedDoc(),before);
  for(const c of before.causalLinks.filter(c=>c.source.id==='control-orders')){
    const expected=a.w.ME.clone(before);a.w.MEAuthoring.moveState(expected,'control-orders',48);
    const layout=a.w.MELayout.layout(expected,1050),edge=layout.edges.find(e=>e.id===c.id);
    assert.equal(edge.points.at(-1).x,layout.states.get(c.target.id).x);
    assert([...preview.querySelectorAll('path')].some(p=>p.getAttribute('d')===a.w.MELayout.path(edge.points)));
  }
  a.event(a.$('#timeline'),'pointerup',p);
  assert.deepEqual(a.savedDoc().causalLinks.filter(c=>c.source.id==='control-orders').map(c=>c.propagation.duration),[12,72]);
  assert.equal(a.$('.edit-error'),null);a.w.IMEE.undo();assert.deepEqual(a.savedDoc(),before);
  a.w.IMEE.redo();assert.equal(a.savedDoc().states.find(s=>s.id==='control-orders').time,48);assert.deepEqual(a.errors,[]);
});
