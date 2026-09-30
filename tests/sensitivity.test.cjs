const {test}=require('node:test'),assert=require('node:assert/strict');
const A=require('../js/sensitivity.js'),S=require('../js/simulation.js'),fixture=require('./fixtures/simulation.cjs');
const config={taskId:'act',parameter:'duration',values:[0,10,20,30,40,50],iterations:1000,seed:17,targetProbability:.8,criterion:'estimate',refineSteps:6};
test('duration intervention matches an analytic deadline boundary and brackets verified samples without overclaiming',()=>{
  const d=fixture();d.tasks[0].simulation.enabled=false;d.simulation.deadline=45;
  const r=A.run(d,config);assert.equal(r.baseline.successProbability,1);assert.equal(r.requirement.status,'bracketed');assert.equal(r.requirement.maxPassingValue,35);assert(r.requirement.firstFailingValue>35&&r.requirement.firstFailingValue<35.2);assert.equal(r.probabilityGap,0);
  for(const p of r.points)assert.equal(p.probability,p.value<=35?1:0);
  assert.equal(r.points.find(p=>p.value===30).probability,S.run(d,{iterations:1000,seed:17}).successProbability);
});
test('seeded paired analysis is stable in batches; input w interventions retain CDF failure mass',()=>{
  const d=fixture(),options={...config,taskId:'detect',parameter:'w',values:[0,.5,1],refineSteps:0};
  const r=A.run(d,options),job=A.createSensitivity(d,options);while(!job.step(7).done){}assert.deepEqual(job.result(),r);
  assert(r.points[0].probability>r.points[2].probability);assert(r.points[2].probability<1);
  assert.equal(r.points[0].probability,r.baseline.successProbability);
});
test('duration fixes finite achievement; baseline probability gap is explicit and CI does not replace sensitivity',()=>{
  const d=fixture();d.tasks[0].simulation.performanceModel.curves=[{w:0,points:[{t:0,p:0}],pInfinity:1}];
  const r=A.run(d,{...config,taskId:'detect',values:[0,10],refineSteps:0});assert.equal(r.baseline.successProbability,0);assert.equal(r.probabilityGap,.8);assert(r.points.every(p=>p.probability===1));assert.equal(r.requirement.status,'all-tested-pass');assert(r.interpretation.includes('未達確率'));
});
test('requirement reports nonmonotone, no pass, all pass, and conservative confidence-bound decisions',()=>{
  const points=ps=>ps.map((p,value)=>({value,probability:p,interval95:{low:p-.1,high:Math.min(1,p+.1)}}));
  assert.equal(A.requirement(points([.9,.4,.9]),.8,'estimate').status,'nonmonotone');
  assert.equal(A.requirement(points([.4,.5]),.8).status,'no-passing-sample');
  assert.equal(A.requirement(points([.9,.9]),.8,'estimate').status,'all-tested-pass');
  assert.equal(A.requirement(points([.9,.85]),.8).status,'bracketed');
});
test('analysis refuses invalid grids, absent tasks, uncovered w, invalid confidence mode and excessive total work',()=>{
  for(const options of [{values:[0,0]},{values:[1,0]},{values:[0,NaN]},{taskId:'missing'},{parameter:'quantity'},{targetProbability:1.1},{refineSteps:9},{criterion:'guess'},{parameter:'w',values:[0,2]},{iterations:100000,refineSteps:8,values:Array.from({length:25},(_,i)=>i)}])assert.throws(()=>A.createSensitivity(fixture(),{...config,...options}));
});
test('real effect-window sensitivity can be nonmonotone and does not derive a universal maximum',()=>{
  const d=fixture();d.tasks[1].simulation.waitForStateIds=[];d.states[2].time=10;
  d.states.push({id:'effect-result',actorId:'command',name:'Effect received',time:20});
  d.tasks[1].junctions=[{id:'effect-junction',time:20,simulation:{mode:'effect'},outcomes:[{label:'interrupt',toStateId:'effect-result',delay:0}]}];
  d.causalLinks=[{id:'effect',source:{type:'state',id:'s1'},target:{type:'task',id:'act',time:20},polarity:'negative',label:'effect',simulation:{enabled:true,type:'branch',delay:0,junctionId:'effect-junction',outcomeStateId:'effect-result'}}];
  d.simulation.successStateIds=['effect-result'];
  const r=A.run(d,{...config,taskId:'detect',values:[0,15,25,35],iterations:50});
  assert.deepEqual(r.points.map(p=>p.probability),[0,1,1,0]);assert.equal(r.requirement.status,'nonmonotone');assert.equal(r.requirement.maxPassingValue,null);
});
