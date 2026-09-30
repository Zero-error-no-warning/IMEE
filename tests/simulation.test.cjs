const { test } = require("node:test");
const assert = require("node:assert/strict");
const P = require("../js/performance.js"), M = require("../js/model.js"), S = require("../js/simulation.js");
const fixture = require("./fixtures/simulation.cjs");
const close = (a,b,tolerance=1e-9) => assert(Math.abs(a-b) < tolerance, `${a} != ${b}`);
test("CDF interpolates time and w at the union of mismatched knots; infinity remains failure", () => {
  const sim = fixture().tasks[0].simulation;
  sim.performanceModel.curves[1].points = [{t: 4,p:.1},{t: 12,p:.3},{t: 30,p:.55}];
  sim.w = .5;
  P.validateTask(sim);
  const points = P.distribution(sim.performanceModel,.5);
  close(points.find(p=>p.t===10).p, (.6+.25)/2);
  close(points.at(-1).p, .725);
  assert.equal(P.sample(points,points.at(-1).p),Infinity);
  assert(Number.isFinite(P.sample(points,.724)));
  const atom = [{t:0,p:.2},{t:5,p:.2},{t:10,p:.8}];
  assert.equal(P.sample(atom,0),0);
  assert.equal(P.sample(atom,.1),0);
  assert.equal(P.sample(atom,.5),7.5);
  assert.equal(P.sample(atom,.8),Infinity);
});
test("malformed CDFs and dangling mission/dependency refs are rejected on import", () => {
  for (const mutate of [
    d=>d.tasks[0].simulation.performanceModel.curves[0].points[1].p=.1,
    d=>d.tasks[0].simulation.performanceModel.curves[0].points[1].t=5,
    d=>d.tasks[0].simulation.performanceModel.curves[0].pInfinity=.3,
    d=>d.tasks[0].simulation.w=.9+1,
    d=>d.tasks[0].simulation.performanceModel.curves[1].w=0,
    d=>d.tasks[0].simulation.performanceModel.curves[0].points[0].t=NaN,
    d=>d.tasks[0].simulation.performanceModel.curves[0].pInfinity=Infinity,
    d=>d.tasks[0].simulation.enabled="yes",
    d=>d.tasks[0].simulation.performanceModel=null,
    d=>d.tasks[1].simulation.waitForStateIds=["missing"],
    d=>d.simulation.successStateIds=["missing"],
    d=>d.simulation.iterations=1.5,
    d=>d.simulation.seed=-1,
    d=>d.simulation.deadline=Infinity,
  ]) { const d=fixture(); mutate(d); assert.throws(()=>M.validate(d)); }
});
test("explicit cross-actor waits propagate failures, without clamping to diagram times", () => {
  const d=fixture(), compiled=S.compile(d);
  const r=S.trial(compiled,()=>.2);
  close(r.taskTimes.get("detect").end,5);
  close(r.taskTimes.get("act").start,5);
  close(r.taskTimes.get("act").wait,5);
  close(r.completion,35);
  assert.equal(r.success,true);
  assert.deepEqual([...r.critical].sort(),["act","detect"]);
  const failed=S.trial(compiled,()=>.95);
  assert.equal(failed.taskTimes.get("act").start,Infinity);
  assert.equal(failed.completion,Infinity);
  assert.equal(failed.success,false);
  assert.equal(failed.critical.size,0);
});
test("serial analytic mission probability, completion quantiles, seeded and batched reproducibility", () => {
  const d=fixture(); d.simulation.deadline=40; d.simulation.iterations=20000;
  const r=S.run(d), again=S.run(d);
  close(r.successProbability,.6,.015); // detection <=10 then deterministic action =30
  close(r.reachProbability,.9,.015);
  close(r.completion.p50,38.125,.3); // F^-1(.9*.5) +30
  close(r.cdf.at(-1).p,r.reachProbability);
  assert.deepEqual(r,again);
  const batched=S.createRun(d);
  while (!batched.step(137).done) {}
  assert.deepEqual(batched.result(),r);
  const detect=r.tasks.find(t=>t.id==="detect"), act=r.tasks.find(t=>t.id==="act");
  close(detect.criticality,r.reachProbability);
  assert.equal(act.blocked,detect.failed);
  assert.equal(act.failed,0);
  assert.equal(detect.criticalityGivenSuccess,1);
  assert.equal(r.successInterval95.low < r.successProbability,true);
  assert.equal(r.successInterval95.high > r.successProbability,true);
});
test("parallel tasks join with AND, count tied critical paths and ignore unconfigured causal links", () => {
  const d=fixture();
  d.tasks[0].simulation.enabled=false;
  d.tasks[1].simulation.waitForStateIds=[];
  d.simulation.successStateIds=["s1","c1"];
  let r=S.run(d,{iterations:2});
  assert.equal(r.completion.p50,30);
  assert.equal(r.tasks[0].criticality,0);
  assert.equal(r.tasks[1].criticality,1);
  d.states[3].time=10;
  r=S.run(d,{iterations:2});
  assert(r.tasks.every(t=>t.criticality===1));
  d.tasks.push({id:"join",fromStateId:"s0",toStateId:"s1",label:"並列合流"});
  const trial=S.trial(S.compile(d),()=>0);
  assert(trial.critical.has("join") && trial.critical.has("detect"));
  d.causalLinks.push({id:"cause",source:{type:"state",id:"s1"},target:{type:"state",id:"c1"},polarity:"negative",label:"妨害"});
  r=S.run(d,{iterations:2});
  assert.equal(r.warnings.length,1);
  assert.equal(r.successProbability,1);
});
test("root times are releases; derived states use arrivals and unsupported branches/cycles fail", () => {
  const d=fixture(); d.tasks[0].simulation.enabled=false; d.states[0].time=3;
  const r=S.trial(S.compile(d),()=>0);
  assert.equal(r.taskTimes.get("detect").start,3);
  assert.equal(r.taskTimes.get("act").start,10);
  d.tasks[0].simulation.waitForStateIds=["c1"];
  assert.throws(()=>S.compile(d),/循環/);
  delete d.tasks[0].simulation.waitForStateIds;
  d.tasks[0].junctions=[{id:"junction",time:5,outcomes:[{toStateId:"s1",label:"alternative"}]}];
  assert.throws(()=>S.compile(d),/分岐Task/);
  assert.throws(()=>S.run(fixture(),{successStateIds:[]}),/成功State/);
  assert.throws(()=>S.run(fixture(),{iterations:100001}),/試行数/);
});
test("zero reach reports null quantiles and all-trial CI; zero duration and deadline zero work", () => {
  const d=fixture();
  d.tasks[0].simulation.performanceModel.curves=[{w:0,points:[{t:0,p:0}],pInfinity:1}];
  const r=S.run(d,{iterations:10});
  assert.equal(r.successProbability,0);
  assert.equal(r.completion.p90,null);
  assert.equal(r.tasks[1].blocked,10);
  assert.equal(r.tasks[1].criticalityGivenSuccess,null);
  assert(!JSON.stringify(r).includes("Infinity"));
  for (const state of d.states) state.time=0;
  d.tasks[0].simulation.enabled=false;
  assert.equal(S.run(d,{deadline:0,iterations:10}).successProbability,1);
});
test("simulation data survives parse, copy remaps internal dependencies, deletion cleans refs and undo restores", () => {
  const d=M.parse(JSON.stringify(fixture())), h=new M.History(d), next=M.clone(d);
  const f=M.fragment(next,next.actors.map(a=>({type:"actor",id:a.id})));
  M.paste(next,f);
  const copied=next.tasks.find(t=>t.id!=="act" && t.label==="判断・実行");
  assert(copied.simulation.waitForStateIds[0]!=="s1");
  assert.equal(next.simulation.successStateIds[0],"c1");
  M.remove(next,[{type:"state",id:"s1"},{type:"state",id:"c1"}]);
  assert.deepEqual(next.simulation.successStateIds,[]);
  h.commit(next); h.undo();
  assert.deepEqual(h.doc,d);
});
