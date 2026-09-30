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
  assert(fallback.success && fallback.completion>=120 && fallback.completion<=150);
  assert.equal(fallback.times.get('midcourse-kill'),Infinity);
  assert(fallback.critical.has('terminal-intercept'));
  assert(!trial({'midcourse-intercept':.99,'terminal-intercept':.99}).success);
});
test('radar is a shared dependency and interceptors wait for orders and their flight phase',()=>{
  const failed=trial({detect:.99});
  assert(!failed.success);
  assert.equal(failed.taskTimes.get('midcourse-intercept').start,Infinity);
  assert.equal(failed.taskTimes.get('terminal-intercept').start,Infinity);
  const fast=trial();
  assert.equal(fast.taskTimes.get('midcourse-intercept').start,60);
  assert.equal(fast.taskTimes.get('terminal-intercept').status,'cancelled');
  const late=trial({detect:.979999,decide:.999999,'midcourse-intercept':.737499,'terminal-intercept':.787499});
  assert(late.taskTimes.get('midcourse-intercept').start>60);
  assert.equal(late.taskTimes.get('midcourse-intercept').start,late.times.get('control-orders'));
  assert(late.times.get('midcourse-kill')<120);
  assert.equal(late.times.get('terminal-kill'),Infinity);
});
test('layered success probability matches common detection times independent interception opportunities',()=>{
  const r=S.run(sample(),{iterations:20000});
  const analytic=.98*(1-(1-.7375)*(1-.7875));
  assert(Math.abs(r.successProbability-analytic)<.01);
});
