const {test}=require('node:test'),assert=require('node:assert/strict');
const M=require('../js/model.js'),S=require('../js/simulation.js'),sample=require('../js/simulation-sample.js');
function trial(d,overrides={}){const c=S.compile(d),draws=c.order.filter(n=>n.type==='task').flatMap(n=>[overrides[n.id]??.25,...n.junctions.map(()=>overrides['branch:'+n.id]??.25)]);let i=0;return S.trial(c,()=>draws[i++]);}
function simple(){const d=sample();d.tasks=d.tasks.filter(t=>t.id==='boost-flight'||t.id==='midcourse-flight');d.states=d.states.filter(s=>s.actorId==='missile'&&s.id!=='missile-impact'&&s.id!=='missile-destroyed-terminal');d.actors=d.actors.filter(a=>a.id==='missile');d.views.main.actorOrder=['missile'];d.causalLinks=[];d.tasks[1].junctions[0].time=90;d.states.find(s=>s.id==='missile-destroyed-mid').time=90;d.simulation.successStateIds=['missile-destroyed-mid'];return d;}
test('probability branches execute at sampled progress, suppress ordinary destination, and preserve residual continuation',()=>{
  const d=simple(),t=d.tasks[1],j=t.junctions[0];j.simulation.mode='probability';j.outcomes[0].probability=.4;
  let r=trial(d);assert.equal(r.times.get('missile-destroyed-mid'),90);assert.equal(r.times.get('missile-terminal'),Infinity);assert.equal(r.taskTimes.get(t.id).status,'branched');assert(r.critical.has(t.id));
  r=trial(d,{'branch:midcourse-flight':.9});assert.equal(r.times.get('missile-terminal'),120);assert(!r.success);
  t.simulation={enabled:false};r=S.trial(S.compile(d,{taskOverrides:{'midcourse-flight':{duration:20}}}),()=>.25);assert.equal(r.times.get('missile-destroyed-mid'),70);
  j.outcomes[0].delay=5;assert.equal(trial(d).times.get('missile-destroyed-mid'),95);
});
test('an unselected branch is never an initial state; OR joins accept alternatives while AND joins wait for all producers',()=>{
  const d=simple(),j=d.tasks[1].junctions[0];j.simulation.mode='probability';j.outcomes[0].probability=0;
  assert.equal(trial(d).times.get('missile-destroyed-mid'),Infinity);
  d.tasks.push({id:'other',fromStateId:'missile-launched',toStateId:'missile-destroyed-mid',label:'alternative'});
  assert.equal(trial(d).times.get('missile-destroyed-mid'),Infinity);
  d.states.find(s=>s.id==='missile-destroyed-mid').simulation={join:'any'};
  assert.equal(trial(d).times.get('missile-destroyed-mid'),90);
});
test('effects interrupt running flight, cancel remaining actor tasks, and move kill states to the target',()=>{
  const r=trial(sample());assert(r.success);assert(Number.isFinite(r.times.get('missile-destroyed-mid')));
  assert.equal(r.times.get('missile-terminal'),Infinity);assert.equal(r.times.get('missile-impact'),Infinity);
  assert.equal(r.taskTimes.get('terminal-flight').status,'cancelled');assert.equal(r.taskTimes.get('terminal-intercept').status,'cancelled');
  assert(r.critical.has('midcourse-intercept'));assert(!r.critical.has('midcourse-flight'));
});
test('early and late effects are reported; early effects can explicitly be held until start; exact-end effects win',()=>{
  const d=sample(),l=d.causalLinks.find(l=>l.id==='midcourse-effect');
  l.source={type:'state',id:'missile-launched'};l.simulation.stopTargetActor=false;
  let r=trial(d);assert.equal(r.signalEvents.find(e=>e.linkId===l.id).status,'early');
  l.simulation.holdUntilStart=true;r=trial(d);assert.equal(r.times.get('missile-destroyed-mid'),60);
  l.simulation.holdUntilStart=false;l.simulation.delay=121;r=trial(d);assert.equal(r.signalEvents.find(e=>e.linkId===l.id).status,'late');
  l.simulation.delay=120;r=trial(d);assert.equal(r.times.get('missile-destroyed-mid'),120);assert.equal(r.times.get('missile-terminal'),Infinity);
});
test('w crosses State, command and causal inputs; task snapshots w at start and required missing signals block',()=>{
  const d=sample();let r=trial(d);assert.equal(r.taskTimes.get('decide').w,.25);assert.equal(r.taskTimes.get('command').w,.25);assert.equal(r.taskTimes.get('midcourse-intercept').w,.25);
  const l=d.causalLinks.find(l=>l.id==='track-information');l.simulation.w=.7;r=trial(d);assert.equal(r.taskTimes.get('midcourse-intercept').w,.7);
  l.simulation.delay=100;d.tasks.find(t=>t.id==='decide').simulation.wInput.waitForLinks=false;
  r=trial(d);assert.equal(r.taskTimes.get('decide').w,0);assert.equal(r.signalEvents.find(e=>e.linkId===l.id).status,'late');
  d.tasks.find(t=>t.id==='decide').simulation.wInput.waitForLinks=true;r=trial(d,{detect:.99});assert.equal(r.taskTimes.get('decide').status,'blocked');
});
test('task output ports follow sampled time, and do not emit beyond interruption',()=>{
  const d=simple();d.causalLinks=[{id:'port',source:{type:'task',id:'midcourse-flight',time:100},target:{type:'state',id:'missile-terminal'},polarity:'positive',label:'port',simulation:{enabled:true,type:'w',delay:0,w:.4}}];
  d.tasks[1].junctions[0].simulation.mode='probability';d.tasks[1].junctions[0].outcomes[0].probability=1;
  assert.equal(trial(d).signalEvents.length,0);
  d.tasks[1].junctions[0].outcomes[0].probability=0;
  const r=S.trial(S.compile(d,{taskOverrides:{'midcourse-flight':{duration:30}}}),()=>.25);assert.equal(r.signalEvents[0].time,80);
});
test('invalid references, modes, probabilities, w domains and active ports fail before execution; copy/delete remap links',()=>{
  for(const mutate of [d=>d.tasks[1].junctions[0].simulation.mode='unknown',d=>d.tasks[1].junctions[0].outcomes[0].delay=-1,d=>d.causalLinks[4].simulation.outcomeStateId='missing',d=>d.tasks[0].simulation={enabled:false,wInput:{stateIds:['missing']}},d=>d.tasks[0].simulation={enabled:false,cancelOnStateIds:['missing']},d=>d.states[0].simulation={w:2}]){const d=sample();mutate(d);assert.throws(()=>M.validate(d));}
  const bad=sample();bad.tasks.find(t=>t.id==='decide').simulation.performanceModel.curves.pop();assert.throws(()=>S.compile(bad),/範囲外/);
  const d=sample();const f=M.fragment(d,d.actors.map(a=>({type:'actor',id:a.id})));M.paste(d,f);const link=d.causalLinks.find(l=>l.id!=='midcourse-effect'&&l.label==='中間撃破作用');assert.notEqual(link.simulation.junctionId,'mid-effect-junction');assert.notEqual(link.simulation.outcomeStateId,'missile-destroyed-mid');M.validate(d);
  M.remove(d,[{type:'state',id:'missile-destroyed-mid'}]);assert(!d.causalLinks.some(l=>l.id==='midcourse-effect'));M.validate(d);
});
test('simultaneous source completion interrupts the receiver regardless of document task order',()=>{
  const d=sample();d.tasks.find(t=>t.id==='midcourse-intercept').simulation.enabled=false;d.states.find(s=>s.id==='midcourse-kill').time=120;d.causalLinks.find(l=>l.id==='midcourse-effect').source={type:'state',id:'midcourse-kill'};
  // Nominal attachment at 90 would violate the existing drawing chronology; move junction and input together.
  d.tasks.find(t=>t.id==='midcourse-flight').junctions[0].time=120;d.states.find(s=>s.id==='missile-destroyed-mid').time=120;d.causalLinks.find(l=>l.id==='midcourse-effect').target.time=120;
  for(const reverse of [false,true]){if(reverse)d.tasks.reverse();const r=trial(d);assert.equal(r.times.get('missile-destroyed-mid'),120);assert.equal(r.times.get('missile-terminal'),Infinity);}
});
test('multiple w inputs use max; explicit output override and fixed State output have precedence',()=>{
  const d=sample(), t=d.tasks.find(t=>t.id==='midcourse-intercept');t.simulation.wInput.stateIds.push('radar-track');
  d.causalLinks.find(l=>l.id==='midcourse-command').simulation.w=.6;
  assert.equal(trial(d).taskTimes.get(t.id).w,.6);
  d.states.find(s=>s.id==='control-orders').simulation={w:.8};delete d.causalLinks.find(l=>l.id==='midcourse-command').simulation.w;
  assert.equal(trial(d).taskTimes.get(t.id).w,.8);
  delete d.states.find(s=>s.id==='control-orders').simulation;d.tasks.find(t=>t.id==='command').simulation.outputW=.9;
  assert.equal(trial(d).taskTimes.get(t.id).w,.9);
});
