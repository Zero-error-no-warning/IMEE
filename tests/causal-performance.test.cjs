const {test}=require('node:test'), assert=require('node:assert/strict');
const M=require('../js/model'), S=require('../js/simulation');
const {JSDOM}=require('jsdom'), L=require('../js/layout'), R=require('../js/render');
const {openApp}=require('./dom-helper.cjs');
const model=(end=20,p=1)=>({type:'cdf',degradationInput:'w',curves:[{w:0,points:[{t:end,p}],pInfinity:1-p}]});
function fixture() {
  return M.defaults({version:2,title:'作用線CDF',time:{unit:'seconds',duration:100,snap:1},
    actors:[{id:'source',name:'発生元',side:'hostile'},{id:'receiver',name:'受け手',side:'friendly'}],
    states:[{id:'launched',actorId:'source',name:'発射',time:0},{id:'flying',actorId:'source',name:'飛行継続',time:60},
      {id:'ready',actorId:'receiver',name:'準備',time:0},{id:'detected',actorId:'receiver',name:'目標探知',time:20},
      {id:'done',actorId:'receiver',name:'判断完了',time:30}],
    tasks:[{id:'flight',fromStateId:'launched',toStateId:'flying',label:'基準飛行'},
      {id:'followup',fromStateId:'detected',toStateId:'done',label:'判断',simulation:{enabled:false,wInput:{stateIds:['detected']}}}],
    causalLinks:[{id:'observation',source:{type:'state',id:'launched'},target:{type:'state',id:'detected'},polarity:'positive',label:'探知',
      simulation:{enabled:true,type:'state',propagation:{enabled:true,performanceModel:model()}}}],
    simulation:{successStateIds:['done'],deadline:50,iterations:10000,seed:17}});
}
const trial=(d,u=.25)=>S.trial(S.compile(d),()=>u);
const close=(a,b,tol=1e-9)=>assert(Math.abs(a-b)<tol,`${a} != ${b}`);

test('link CDF creates a destination State on arrival and continues the source independently',()=>{
  const d=fixture(),r=trial(d);
  assert.equal(r.times.get('detected'),5);assert.equal(r.taskTimes.get('followup').start,5);
  assert.equal(r.completion,15);assert.equal(r.times.get('flying'),60);
  assert(r.criticalLinks.has('observation'));assert(r.critical.has('followup'));assert(!r.critical.has('flight'));
  assert.deepEqual(r.signalEvents[0],{linkId:'observation',emittedAt:0,delay:5,w:0,time:5,status:'accepted'});
  assert.equal(d.states.find(s=>s.id==='detected').time,20);
});

test('unreached link mass never creates a root State; failed and unavailable are distinct',()=>{
  const d=fixture();d.causalLinks[0].simulation.propagation.performanceModel=model(20,.8);
  const r=trial(d,.9);assert.equal(r.times.get('detected'),Infinity);assert.equal(r.taskTimes.get('followup').status,'blocked');
  assert(!r.success);assert.equal(r.times.get('flying'),60);assert.equal(r.signalEvents[0].status,'failed');assert.equal(r.signalEvents[0].time,null);
  d.tasks[0].simulation={enabled:true,performanceModel:model(60,0)};
  d.states.push({id:'never',actorId:'receiver',name:'未発生の入力先',time:60});
  d.causalLinks.push({...M.clone(d.causalLinks[0]),id:'unavailable',source:{type:'state',id:'flying'},target:{type:'state',id:'never'}});
  const result=S.run(d,{iterations:10});assert.equal(result.signals.find(s=>s.id==='unavailable').unavailable,10);
  assert.equal(result.signals.find(s=>s.id==='unavailable').failed,0);assert(!result.trace.states.some(s=>s.id==='never'));
});

test('propagation w interpolates from the source independently of output w overrides',()=>{
  const d=fixture(),l=d.causalLinks[0];d.states[0].simulation={w:.5};
  l.simulation.propagation.performanceModel.curves.push({w:1,points:[{t:40,p:1}],pInfinity:0});
  l.simulation.w=.9;
  // CDF interpolation mixes F20 and F40; it does not interpolate their quantiles.
  let r=trial(d,.5);close(r.times.get('detected'),40/3);assert.equal(r.taskTimes.get('followup').w,.9);assert.equal(r.signalEvents[0].w,.5);
  l.simulation.propagation.w=0;r=trial(d,.5);assert.equal(r.times.get('detected'),10);assert.equal(r.taskTimes.get('followup').w,.9);
  delete l.simulation.w;delete l.simulation.propagation.w;r=trial(d,.5);assert.equal(r.taskTimes.get('followup').w,.5);
});

test('fixed and disabled propagation preserve legacy delay rules without adding delays to CDF draws',()=>{
  const d=fixture(),l=d.causalLinks[0];l.simulation.delay=7;
  assert.equal(trial(d).times.get('detected'),5);
  l.simulation.propagation.enabled=false;assert.equal(trial(d).times.get('detected'),7);
  delete l.simulation.delay;assert.equal(trial(d).times.get('detected'),20);
  delete l.simulation.propagation;assert.equal(trial(d).times.get('detected'),20);
  l.simulation.enabled=false;assert.equal(trial(d).times.get('detected'),20); // now a diagram-time initial State
});

test('State links participate in AND/OR joins with other links and Tasks',()=>{
  const d=fixture();d.states.push({id:'second',actorId:'source',name:'第二入力',time:5});
  const l={...M.clone(d.causalLinks[0]),id:'second-input',source:{type:'state',id:'second'},simulation:{enabled:true,type:'state',delay:2}};
  d.causalLinks.push(l);assert.equal(trial(d).times.get('detected'),7);
  d.states.find(s=>s.id==='detected').simulation={join:'any'};
  let r=trial(d);assert.equal(r.times.get('detected'),5);assert.equal(r.signalEvents.find(e=>e.linkId===l.id).status,'late');
  d.causalLinks[0].simulation.propagation.performanceModel=model(20,0);r=trial(d);assert.equal(r.times.get('detected'),7);
  d.states.find(s=>s.id==='detected').simulation={join:'all'};assert.equal(trial(d).times.get('detected'),Infinity);
  d.causalLinks[0].simulation.propagation.performanceModel=model();
  d.tasks.push({id:'preparation',fromStateId:'ready',toStateId:'detected',label:'準備からも到達'});
  r=trial(d);assert.equal(r.times.get('detected'),20);assert(r.critical.has('preparation'));assert(!r.criticalLinks.has('observation'));
  d.tasks.pop();l.simulation.delay=0;r=trial(d);assert.equal(r.times.get('detected'),5);
  assert(r.criticalLinks.has('observation')&&r.criticalLinks.has('second-input'));
});

test('w links use CDF arrival times for readiness; missing arrival blocks only explicit waiting',()=>{
  const d=fixture(),l=d.causalLinks[0],t=d.tasks[1];
  t.fromStateId='ready';t.simulation.wInput={waitForLinks:true};l.target={type:'task',id:t.id,time:20};l.simulation.type='w';l.simulation.w=.7;
  let r=trial(d);assert.equal(r.taskTimes.get(t.id).start,5);assert.equal(r.taskTimes.get(t.id).w,.7);
  l.simulation.propagation.performanceModel=model(20,0);assert.equal(trial(d).taskTimes.get(t.id).status,'blocked');
  t.simulation.wInput.waitForLinks=false;l.simulation.propagation.performanceModel=model();r=trial(d);
  assert.equal(r.taskTimes.get(t.id).start,0);assert.equal(r.taskTimes.get(t.id).w,0);assert.equal(r.signalEvents[0].status,'late');
});

test('branch links sample propagation but still respect the receiver active window',()=>{
  const d=fixture(),l=d.causalLinks[0];d.tasks=d.tasks.slice(0,1);
  d.states.push({id:'destroyed',actorId:'source',name:'撃破',time:60});
  d.tasks[0].junctions=[{id:'effect',time:60,simulation:{mode:'effect'},outcomes:[{label:'撃破',toStateId:'destroyed',delay:0}]}];
  l.target={type:'task',id:'flight',time:60};Object.assign(l.simulation,{type:'branch',junctionId:'effect',outcomeStateId:'destroyed'});
  d.simulation.successStateIds=['destroyed'];d.simulation.deadline=null;
  l.simulation.propagation.performanceModel=model(80);
  let r=trial(d,.75);assert.equal(r.times.get('destroyed'),60);assert.equal(r.times.get('flying'),Infinity);assert(r.criticalLinks.has(l.id));
  r=trial(d,.8);assert.equal(r.times.get('destroyed'),Infinity);assert.equal(r.signalEvents[0].status,'late');assert.equal(r.times.get('flying'),60);
  l.simulation.propagation.performanceModel=model(80,0);r=trial(d);assert.equal(r.signalEvents[0].status,'failed');assert.equal(r.times.get('flying'),60);
});

test('same-time completion through a CDF State link precedes the receiving flight completion',()=>{
  const d=fixture();d.states.find(s=>s.id==='detected').time=60;d.states.find(s=>s.id==='done').time=60;
  d.states.push({id:'destroyed',actorId:'source',name:'撃破',time:60});
  d.tasks[0].junctions=[{id:'effect',time:60,simulation:{mode:'effect'},outcomes:[{label:'撃破',toStateId:'destroyed',delay:0}]}];
  d.tasks=d.tasks.slice(0,1);d.tasks.push({id:'work',fromStateId:'ready',toStateId:'done',label:'作用発生準備'});
  d.causalLinks[0].source={type:'state',id:'done'};d.causalLinks[0].simulation.propagation.performanceModel=model(0);
  d.causalLinks.push({id:'effect-link',source:{type:'state',id:'detected'},target:{type:'task',id:'flight',time:60},label:'分岐作用',polarity:'negative',
    simulation:{enabled:true,type:'branch',delay:0,junctionId:'effect',outcomeStateId:'destroyed'}});
  d.simulation.successStateIds=['destroyed'];d.simulation.deadline=null;
  for(const reverse of [false,true]) {
    if(reverse){d.tasks.reverse();d.causalLinks.reverse();}
    const r=trial(d);assert.equal(r.times.get('destroyed'),60);assert.equal(r.times.get('flying'),Infinity);
    assert(r.critical.has('work'));assert(r.criticalLinks.has('observation'));assert(r.criticalLinks.has('effect-link'));
  }
});

test('malformed propagation CDFs, wrong State targets, uncovered source w and State-link cycles fail early',()=>{
  for(const mutate of [d=>d.causalLinks[0].simulation.propagation.enabled='yes',
    d=>delete d.causalLinks[0].simulation.propagation.performanceModel,
    d=>d.causalLinks[0].simulation.propagation.performanceModel.curves[0].pInfinity=.5,
    d=>d.causalLinks[0].simulation.propagation.performanceModel.curves[0].points.push({t:30,p:.1}),
    d=>d.causalLinks[0].target={type:'task',id:'followup',time:20}]) {
    const d=fixture();mutate(d);assert.throws(()=>M.validate(d));
  }
  const d=fixture();d.states[0].simulation={w:.7};assert.throws(()=>S.compile(d),/範囲外/);
  const cycle=fixture();cycle.causalLinks[0].source={type:'state',id:'detected'};assert.throws(()=>S.compile(cycle),/循環/);
});

test('seeded link-only probability, quantiles, criticality and batched runs match analytic values',()=>{
  const d=fixture();d.causalLinks[0].simulation.propagation.performanceModel=model(20,.8);
  d.simulation.deadline=20;
  const r=S.run(d);close(r.successProbability,.4,.015);close(r.reachProbability,.8,.015);
  close(r.completion.p50,20,.3);close(r.completion.p90,28,.3);
  const s=r.signals[0];close(s.delay.p50,10,.3);close(s.criticality,r.reachProbability);assert.equal(s.criticalityGivenSuccess,1);
  assert.equal(s.failed+s.accepted,d.simulation.iterations);assert.equal(s.unavailable,0);
  const job=S.createRun(d);while(!job.step(137).done){}assert.deepEqual(job.result(),r);assert.deepEqual(S.run(d),r);
  assert(!JSON.stringify(r).includes('Infinity'));assert(!('delays' in s));
});

test('link draws are reserved even when another link never emits',()=>{
  const d=fixture();d.states.push({id:'relay',actorId:'receiver',name:'別の到達',time:60});
  d.causalLinks.unshift({...M.clone(d.causalLinks[0]),id:'relay-link',source:{type:'state',id:'flying'},target:{type:'state',id:'relay'}});
  const run=()=>{let i=0;return S.trial(S.compile(d),()=>++i/20);};
  const r=run();d.tasks[0].simulation={enabled:true,performanceModel:model(60,0)};
  const failed=run();assert.equal(r.signalEvents.find(e=>e.linkId==='observation').delay,failed.signalEvents[0].delay);
  assert(!failed.signalEvents.some(e=>e.linkId==='relay-link'));
});

test('CDF and fixed causal wave shapes are preserved in every View and SVG export',()=>{
  const d=fixture();d.causalLinks.push({...M.clone(d.causalLinks[0]),id:'fixed',polarity:'negative',simulation:{enabled:true,type:'state',delay:0}});
  for(const mode of ['mission','causality','technology','gap'])for(const exporting of [false,true]) {
    d.views.main.mode=mode;const layout=L.layout(d,1200), xml=new JSDOM(R.render(d,layout,{export:exporting}),{contentType:'image/svg+xml'}).window.document;
    const groups=[...xml.querySelectorAll('.edge.causal')];assert.equal(groups[0].dataset.performance,'cdf');assert(groups[0].querySelector('.line-cdf'));
    assert.equal(groups[1].dataset.performance,'fixed');assert(groups[1].querySelector('.line-fixed'));assert(groups[1].querySelector('.line-gap'));
    const edges=layout.edges.filter(e=>e.type==='causalLink');edges.forEach((e,i)=>assert.equal(groups[i].querySelector('.line').getAttribute('d'),e.path));
    assert.equal(groups[0].querySelector('.line').getAttribute('data-polarity'),'positive');assert.equal(groups[1].querySelector('.line').getAttribute('data-polarity'),'negative');
  }
});

test('causal editor previews, validates, preserves disabled CDFs, and redraws through Undo and JSON',async t=>{
  const a=await openApp(fixture());t.after(()=>a.close());
  const edit=()=>a.event(a.$('.edge.causal[data-id="observation"]'),'dblclick');edit();
  assert.equal(a.$('[name="causalSimulationType"]').value,'state');assert.equal(a.$('[name="causalPropagationType"]').value,'cdf');assert(a.$('#cdf-preview svg'));
  a.fill('curve-0-t-0',40);a.fill('curve-0-p-0',.8);a.$('#editor-form').dispatchEvent(new a.w.Event('input',{bubbles:true}));
  a.submit();close(a.savedDoc().causalLinks[0].simulation.propagation.performanceModel.curves[0].pInfinity,.2);
  edit();a.fill('causalPropagationType','fixed');a.$('[name="causalPropagationType"]').dispatchEvent(new a.w.Event('change',{bubbles:true}));
  a.fill('causalDelay',3);a.submit();assert(a.$('.edge.causal[data-id="observation"] .line-fixed'));
  assert.equal(a.savedDoc().causalLinks[0].simulation.propagation.enabled,false);assert.equal(a.savedDoc().causalLinks[0].simulation.propagation.performanceModel.curves[0].points[0].t,40);
  a.w.IMEE.undo();assert(a.$('.edge.causal[data-id="observation"] .line-cdf'));assert.equal(a.savedDoc().causalLinks[0].simulation.propagation.enabled,true);
  edit();a.fill('curve-0-t-0',-1);a.submit();assert(a.$('#editor-dialog').hasAttribute('open'));assert(a.$('#dialog-error').textContent);
  assert.deepEqual(a.errors,[]);assert.equal(M.parse(JSON.stringify(a.savedDoc())).causalLinks[0].simulation.propagation.performanceModel.curves[0].points[0].t,40);
});
