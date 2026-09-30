const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const sample=require('../js/simulation-sample.js'),S=require('../js/simulation.js');
function trial(overrides={}) {
  const compiled=S.compile(sample()),draws=compiled.order.filter(n=>n.type==='task').flatMap(n=>[overrides[n.id]??.25,...n.junctions.map(()=>.25)]);
  let i=0; return S.trial(compiled,()=>draws[i++]);
}
test('missile demo has precisely one hostile missile and four friendly actors; JSON stays synchronized',()=>{
  const d=sample();
  assert.deepEqual(d.actors.map(a=>a.name),['弾道ミサイル本体','広域レーダー','中央管制','中間軌道撃破用ユニット','終末軌道撃破用ユニット']);
  assert.deepEqual(d.actors.filter(a=>a.side==='hostile').map(a=>a.id),['missile']);
  assert.equal(d.simulation.successMode,'any');
  assert.deepEqual(JSON.parse(fs.readFileSync(require.resolve('../examples/simulation.json'),'utf8')),d);
  assert.equal(d.tasks.filter(t=>t.junctions?.length).length,2);
  assert(d.simulation.successStateIds.every(id=>d.states.find(s=>s.id===id).actorId==='missile'));
});
test('midcourse kill wins first; terminal kill recovers failed midcourse; both failures lose',()=>{
  const early=trial({'terminal-intercept':.99});
  assert(early.success && early.completion<120);
  assert(early.critical.has('midcourse-intercept'));
  assert(!early.critical.has('terminal-intercept'));
  const fallback=trial({'midcourse-intercept':.99});
  assert(fallback.success && fallback.completion>=120 && fallback.completion<=160);
  assert.equal(fallback.times.get('midcourse-kill'),Infinity);
  assert(fallback.critical.has('terminal-intercept'));
  assert(!trial({'midcourse-intercept':.99,'terminal-intercept':.99}).success);
});
test('radar is a shared dependency and launch directives wait for orders and flight phase; interceptors follow launch completion',()=>{
  const failed=trial({detect:.99});
  assert(!failed.success);
  assert.equal(failed.taskTimes.get('midcourse-intercept').start,Infinity);
  assert.equal(failed.taskTimes.get('terminal-intercept').start,Infinity);
  const fast=trial();
  assert.equal(fast.taskTimes.get('midcourse-launch').start,60);
  assert.equal(fast.times.get('midcourse-launched'),70);
  assert.equal(fast.taskTimes.get('midcourse-intercept').start,70);
  assert.equal(fast.taskTimes.get('midcourse-launch').w,.25);
  assert.equal(fast.taskTimes.get('terminal-intercept').status,'cancelled');
  const late=trial({detect:.979999,decide:.999999,'midcourse-intercept':.737499,'terminal-intercept':.787499});
  assert(late.taskTimes.get('midcourse-intercept').start>60);
  assert.equal(late.taskTimes.get('midcourse-launch').start,late.times.get('control-orders'));
  assert.equal(late.taskTimes.get('midcourse-intercept').start,late.times.get('control-orders')+10);
  assert(late.times.get('midcourse-kill')<120);
  assert.equal(late.times.get('terminal-kill'),Infinity);
});
test('layered success probability matches common detection times independent interception opportunities',()=>{
  const r=S.run(sample(),{iterations:20000});
  const analytic=.98*(1-(1-.7375)*(1-.7875));
  assert(Math.abs(r.successProbability-analytic)<.01);
});

test('unit actors explicitly separate fixed launch directives from probabilistic interception',()=>{
  const d=sample();
  for(const id of ['midcourse','terminal']){
    const launch=d.tasks.find(t=>t.id===id+'-launch'),intercept=d.tasks.find(t=>t.id===id+'-intercept');
    assert.equal(launch.fromStateId,id+'-ready');assert.equal(launch.toStateId,id+'-launched');assert.equal(launch.label,'発射指示');assert.equal(launch.simulation.enabled,false);
    assert.equal(intercept.fromStateId,launch.toStateId);assert.equal(intercept.simulation.enabled,true);assert(intercept.notes.includes('発射から敵ミサイルの撃破達成まで'));
    assert.equal(d.states.find(s=>s.id===launch.toStateId).name,'迎撃ミサイル発射');assert.equal(d.states.find(s=>s.id===intercept.toStateId).name,'迎撃');
    const signal=d.causalLinks.find(l=>l.id===id+'-command');assert.equal(signal.target.id,launch.id);assert(launch.simulation.wInput.waitForLinks);assert.deepEqual(intercept.simulation.wInput.stateIds,[launch.toStateId]);
  }
  const fallback=trial({'midcourse-intercept':.99});assert.equal(fallback.times.get('terminal-launched'),130);assert.equal(fallback.taskTimes.get('terminal-intercept').start,130);assert.equal(fallback.taskTimes.get('terminal-intercept').w,.25);
  const killed=trial();assert.equal(killed.taskTimes.get('terminal-launch').status,'cancelled');assert.equal(killed.times.get('terminal-launched'),Infinity);
});
