const {test}=require('node:test'),assert=require('node:assert/strict');
const M=require('../js/model'),A=require('../js/authoring'),S=require('../js/simulation'),L=require('../js/layout'),R=require('../js/render');
const {base,gate,cdf,state,task,link,trial}=require('./fixtures/quality.cjs');
function fixed(d,id,at){A.setNodeTiming(d,id,'fixed',at);return M.get(d,'state',id);}
function histogram(r,type,id,event){return r.eventDistributions.find(h=>h.type===type&&h.id===id&&h.event===event);}
test('a fixed node waits for its schedule, keeps task duration, and fails late input',()=>{
  const d=base();fixed(d,'s1',15);
  assert.equal(d.tasks[0].timing.duration,10);
  assert.equal(trial(d).times.get('s1'),15);
  A.moveState(d,'s1',8);
  assert.equal(d.tasks[0].timing.duration,10);
  assert.equal(trial(d).times.get('s1'),Infinity);
  assert.equal(S.run(d).successProbability,0);
});
test('OR quality is frozen at readiness while waiting for a fixed event',()=>{
  const d=base();d.states.push(state('early','a',0,.2),state('later','a',5,.9));
  d.causalLinks.push(link('earlyInput','early','r0',0),link('lateInput','later','r0',0));
  M.get(d,'state','r0').simulation={join:'any'};fixed(d,'r0',12);
  const r=trial(d);assert.equal(r.times.get('r0'),12);assert.equal(r.stateQ.get('r0'),.2);
});
test('AND includes arrivals exactly at F and zero-time task and fixed-to-fixed chains close at F',()=>{
  const d=base();fixed(d,'s1',10);fixed(d,'r0',10);fixed(d,'r1',10);d.tasks[1].timing.duration=0;
  d.states.reverse();M.validate(d);
  const r=trial(d);assert.equal(r.times.get('r1'),10);assert(Math.abs(r.stateQ.get('r1')-.24)<1e-12);
});
test('fixed scheduling respects mandatory task-start gates without sliding to a later start',()=>{
  const d=gate();fixed(d,'effect',12);
  assert.equal(trial(d).times.get('effect'),Infinity);
  assert.equal(trial(d).signalEvents.length,0);
});
test('explicit relative roots can be saved as drafts but cannot run without an anchor',()=>{
  const d=base();M.get(d,'state','s0').timing={mode:'relative'};
  M.validate(d);assert.throws(()=>S.compile(d),/Fixed-time/);
});
test('relative times include additional starts, while fixed destinations keep their schedule',()=>{
  const d=base();fixed(d,'s0',0);d.states.push({...state('wait','a',7),timing:{mode:'fixed',at:7}});
  d.tasks[0].simulation.waitForStateIds=['wait'];A.reconcile(d);
  assert.deepEqual(M.taskWindow(d,d.tasks[0]),{start:7,end:17});
  assert.equal(M.get(d,'state','s1').time,17);
});
test('new authoring uses anchored starts and relative outcomes; splitting and unit conversion retain durations',()=>{
  const d=A.empty();d.actors.push({id:'a',name:'A',side:'friendly'});
  const ref=A.activity(d,{actorId:'a',start:2,duration:10}),t=M.get(d,'task',ref.id);
  assert.equal(d.states[0].timing.mode,'fixed');assert.equal(d.states[1].timing.mode,'relative');
  A.split(d,t.id,6,'middle');assert.deepEqual(d.tasks.map(t=>t.timing.duration),[4,6]);
  A.convertUnit(d,'seconds');assert.equal(d.states[0].timing.at,120);assert.deepEqual(d.tasks.map(t=>t.timing.duration),[240,360]);
  const fragment=M.fragment(d,d.actors.map(a=>({type:'actor',id:a.id})));M.paste(d,fragment,60);M.validate(d);
  assert.equal(d.states.find(s=>s.id!==fragment.states[0].id&&s.timing?.mode==='fixed'&&s.actorId!=='a').timing.at,180);
});
test('all lines stay orthogonal, horizontal intervals do not overlap, and node X stays on the clock',()=>{
  const d=require('../js/sample')(),g=L.layout(d,1200),horizontal=[];
  for(const e of g.edges)for(const s of L.routeSegments(e.points)){
    assert(s.a.x===s.b.x||s.a.y===s.b.y);
    assert(s.b.x>=s.a.x);
    if(s.a.y===s.b.y)horizontal.push(s);
  }
  for(const [i,a]of horizontal.entries())for(const b of horizontal.slice(i+1))if(a.a.y===b.a.y)assert(Math.min(a.b.x,b.b.x)<=Math.max(a.a.x,b.a.x));
  for(const s of g.states.values())assert.equal(s.x,g.vp.x(s.time));
});
function chain(count){
  return M.defaults({version:3,title:'horizontal chain',time:{unit:'minutes',duration:100,snap:1},
    actors:[{id:'a',name:'A',side:'friendly'}],
    states:Array.from({length:count+1},(_,i)=>state('s'+i,'a',i*5)),
    tasks:Array.from({length:count},(_,i)=>task('t'+i,'s'+i,'s'+(i+1))),causalLinks:[]});
}
test('serial Tasks remain on their node baseline and do not add routing rows',()=>{
  const short=L.layout(chain(1),2400),d=chain(12),before=M.clone(d);
  for(const mode of ['off','config','results']){
    d.views.main.cdfMode=mode;const g=L.layout(d,2400);
    assert.equal(g.rows[0].height,short.rows[0].height);
    for(const e of g.edges){assert.equal(e.points.length,2);assert.equal(e.points[0].y,e.points[1].y);}
    assert.equal(g.axis.tracks.get('a').length,0);
  }
  assert.deepEqual(d.states,before.states);assert.deepEqual(d.tasks,before.tasks);
});
test('an inline Task CDF uses the horizontal Task as its axis without a vertical detour',()=>{
  const d=chain(2);d.views.main.cdfScope='all';
  d.tasks[0].simulation={enabled:true,performanceModel:cdf([{t:0,p:0,q:1},{t:5,p:.8,q:1}])};
  const g=L.layout(d,2400),e=g.edges.find(e=>e.id==='t0'),c=g.cdfCharts[0];
  assert.equal(e.points.length,2);assert.equal(e.points[0].y,g.states.get('s0').y);assert.equal(e.points[1].y,g.states.get('s1').y);
  assert.equal(c.y,e.points[0].y);assert.equal(g.axis.tracks.get('a').length,0);
  d.views.main.cdfMode='off';const off=L.layout(d,2400);assert.equal(off.rows[0].height,L.layout(chain(2),2400).rows[0].height);
});
test('overlapping CDF tails reserve another chart lane while ordinary Tasks stay horizontal',()=>{
  const d=chain(3);d.views.main.cdfScope='all';
  for(const t of d.tasks.slice(0,2))t.simulation={enabled:true,performanceModel:cdf([{t:0,p:0,q:1},{t:20,p:.8,q:1}])};
  const g=L.layout(d,2400),charts=g.cdfCharts;
  assert.equal(charts.length,2);assert(Math.abs(charts[0].y-charts[1].y)>=64);
  const plain=g.edges.find(e=>e.id==='t2');assert.equal(plain.points.length,2);
});
test('hidden interactions and hidden CDF Tasks do not allocate empty rows',()=>{
  const d=base();d.views.main.cdfScope='all';d.views.main.filters.causalLink=false;
  let g=L.layout(d);assert.equal(g.axis.specs.has('causalLink:report'),false);
  d.tasks[0].activity='quiet';d.tasks[0].simulation={enabled:true,performanceModel:cdf([{t:0,p:0,q:1},{t:20,p:1,q:1}])};d.views.main.filters.quiet=false;
  g=L.layout(d);assert.equal(g.cdfCharts.length,0);assert.equal(g.rows[0].height,d.views.main.laneHeight+6);
});
test('configured CDF is unscaled, includes t=0 atoms and missing mass, and exports on the same axis',()=>{
  const d=base();d.views.main.cdfScope='all';d.tasks[0].simulation={enabled:true,performanceModel:cdf([{t:0,p:.2,q:1},{t:30,p:.7,q:1}])};
  const g=L.layout(d),c=g.cdfCharts.find(c=>c.id==='produce');
  assert.equal(c.endX,g.vp.x(30));assert.equal(g.states.get('s1').x,g.vp.x(10));assert.equal(c.finalP,.7);assert.equal(c.height,24);
  assert.equal(c.points[0].x,c.points[1].x);assert.notEqual(c.points[0].y,c.points[1].y);
  const svg=R.render(d,g,{export:true});assert(svg.includes('class="cdf-curve"'));assert(svg.includes('未達・未成立 30.0%'));assert(svg.includes('data-probability="0.5"'));assert(svg.includes('data-probability="1"'));assert(svg.includes('>50%</text>'));assert(svg.includes('>100%</text>'));
});
test('absolute event distributions include upstream delays and retain all trials in their denominator',()=>{
  const d=base();d.tasks[0].simulation={enabled:true,performanceModel:cdf([{t:0,p:0,q:1},{t:40,p:.5,q:1}])};
  const r=S.run(d),taskCDF=histogram(r,'task','consume','completed'),nodeCDF=histogram(r,'state','r1','established');
  assert.equal(taskCDF.total,16);assert.equal(taskCDF.count,r.tasks.find(t=>t.id==='consume').finished);
  assert.equal(taskCDF.points.at(-1).p,taskCDF.count/16);assert.deepEqual(taskCDF.points,nodeCDF.points);
  d.views.main.cdfMode='results';d.views.main.cdfScope='all';const g=L.layout(d,1050,{cdfResult:r});
  assert.equal(g.cdfCharts.find(c=>c.type==='task'&&c.id==='consume').startX,g.vp.x(0));
  assert.equal(g.states.get('r1').x,g.vp.x(20));
});
test('fixed result CDF jumps only at F, and unreachable targets still show zero',()=>{
  const d=base();d.tasks[0].simulation={enabled:true,performanceModel:cdf([{t:0,p:0,q:1},{t:20,p:.5,q:1}])};fixed(d,'s1',12);
  const h=histogram(S.run(d),'state','s1','established');assert.equal(h.step,0);assert.equal(h.points[0].t,12);assert(h.points[0].p<1);
  d.tasks[0].simulation.performanceModel=cdf([{t:0,p:0,q:1}]);const zero=histogram(S.run(d),'state','s1','established');assert.equal(zero.count,0);assert.equal(zero.points[0].p,0);
});
test('explicit relative caches cannot contradict their producers',()=>{
  const d=base();fixed(d,'s0',0);M.get(d,'state','s1').timing={mode:'relative'};M.get(d,'state','s1').time=12;
  assert.throws(()=>M.validate(d),/基準成立時刻/);
});

test('causal vertical spines separate when their time anchors coincide, including zero-duration lines',()=>{
  const d=base();d.actors.push({id:'c',name:'C',side:'neutral'});
  d.states.push(state('c0','c',10));d.causalLinks.push(link('another','s1','c0',0));
  const before=M.clone(d),g=L.layout(d),edges=g.edges.filter(e=>e.type==='causalLink');
  const verticals=edges.flatMap(e=>L.routeSegments(e.points).filter(s=>s.a.x===s.b.x));
  assert(verticals.length>=2);
  for(const [i,a]of verticals.entries())for(const b of verticals.slice(i+1))
    if(Math.max(Math.min(a.a.y,a.b.y),Math.min(b.a.y,b.b.y))<Math.min(Math.max(a.a.y,a.b.y),Math.max(b.a.y,b.b.y)))assert(Math.abs(a.a.x-b.a.x)>=5);
  for(const e of edges){assert.equal(e.points[0].x,g.vp.x(10));assert.equal(e.points.at(-1).x,g.vp.x(10));for(const s of L.routeSegments(e.points))assert(s.a.x===s.b.x||s.a.y===s.b.y);}
  assert.deepEqual(d,before);
});
