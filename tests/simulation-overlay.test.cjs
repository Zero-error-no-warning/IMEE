const {test}=require('node:test'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const M=require('../js/model'),S=require('../js/simulation'),L=require('../js/layout'),R=require('../js/render'),O=require('../js/simulation-overlay');
const fixture=require('./fixtures/simulation.cjs'),sample=require('../js/simulation-sample'),{openApp}=require('./dom-helper.cjs');
const xml=(d,g,options={})=>new JSDOM(R.render(d,g,options),{contentType:'image/svg+xml'}).window.document;
const counts=(g,id,part='task')=>g.edges.find(e=>e.id===id&&e.part===part).resultSegments.map(p=>p.metric.count);
async function ready(a){const until=Date.now()+5000;while(a.$('#simulation-apply').disabled){if(Date.now()>until)throw new Error('Simulation did not finish');await new Promise(r=>a.w.setTimeout(r,5));}}

test('rates use all trials, preserve seeded statistics and semantic geometry, and display zero separately from unconfigured links',()=>{
  const d=M.defaults(fixture());
  d.causalLinks=[{id:'display-only',label:'表示のみ',polarity:'positive',source:{type:'state',id:'s0'},target:{type:'state',id:'c0'}}];
  const before=JSON.stringify(d),r=S.run(d),baseline=L.layout(d,1050),g=L.layout(d,1050,{simulationResult:r});
  assert.deepEqual(counts(g,'detect'),[r.tasks[0].finished]);
  assert.equal(g.edges.find(e=>e.id==='detect').resultSegments[0].metric.ratio,r.tasks[0].finished/r.iterations);
  assert.equal(g.edges.find(e=>e.id==='display-only').resultSegments.length,0);
  assert.deepEqual(g.edges.map(e=>e.points),baseline.edges.map(e=>e.points));
  assert.deepEqual([...g.states].map(([id,s])=>[id,s.x,s.y]),[...baseline.states].map(([id,s])=>[id,s.x,s.y]));
  assert.equal(JSON.stringify(d),before);
  assert.deepEqual(S.run(d),r);
  for(const c of d.tasks[0].simulation.performanceModel.curves){c.points.forEach(p=>p.p=0);c.pInfinity=1;}
  const zero=L.layout(d,1050,{simulationResult:S.run(d)}),z=xml(d,zero);
  assert.deepEqual(counts(zero,'detect'),[0]);assert.deepEqual(counts(zero,'act'),[0]);
  assert.equal(z.querySelector('.simulation-result-segment .line').getAttribute('stroke'),'#aebbc0');
  assert([...z.querySelectorAll('.simulation-rate-label text')].every(t=>t.textContent==='0%'));
});

test('effect branches reduce the continuation width and match chosen outcomes and applied signals',()=>{
  const d=sample(),r=S.run(d,{iterations:1000}),g=L.layout(d,1200,{simulationResult:r});
  const mid=r.branches.find(b=>b.taskId==='midcourse-flight').count,
    term=r.branches.find(b=>b.taskId==='terminal-flight').count,
    midNormal=r.tasks.find(t=>t.id==='midcourse-flight').finished,
    termNormal=r.tasks.find(t=>t.id==='terminal-flight').finished;
  assert.deepEqual(counts(g,'midcourse-flight'),[mid+midNormal,midNormal]);
  assert.deepEqual(counts(g,'terminal-flight'),[term+termNormal,termNormal]);
  assert.deepEqual(counts(g,'midcourse-flight','outcome'),[mid]);
  const effect=g.edges.find(e=>e.id==='midcourse-effect');
  assert.equal(effect.resultSegments[0].metric.count,r.signals.find(l=>l.id===effect.id).accepted);
  assert.equal(effect.resultSegments[0].metric.count,mid);
  assert.equal(mid+term+termNormal,r.iterations);
  const parts=g.edges.find(e=>e.id==='midcourse-flight').resultSegments;
  assert.equal(parts[0].points.at(-1).x,g.vp.x(100));
  assert.deepEqual(parts[0].points.at(-1),parts[1].points[0]);
  assert(parts[0].metric.width>parts[1].metric.width);
});

test('probability-only Tasks count the reached trunk and multiple branches remove only diverted paths',()=>{
  const d=M.defaults({version:2,title:'分岐率',time:{unit:'seconds',duration:30,snap:1},actors:[{id:'a',name:'Actor',side:'friendly'}],
    states:[['start',0],['first',5],['second',10],['normal',20]].map(([id,time])=>({id,actorId:'a',name:id,time})),
    tasks:[{id:'choice',fromStateId:'start',toStateId:'normal',label:'選択',junctions:[
      {id:'j1',time:5,simulation:{mode:'probability'},outcomes:[{toStateId:'first',label:'先行',probability:.5,delay:0}]},
      {id:'j2',time:10,simulation:{mode:'probability'},outcomes:[{toStateId:'second',label:'後行',probability:.5,delay:0}]}]}],causalLinks:[],
    simulation:{successStateIds:['first','second','normal'],successMode:'any',iterations:1000,seed:17}});
  const r=S.run(d),first=r.branches.find(b=>b.junctionId==='j1').count,second=r.branches.find(b=>b.junctionId==='j2').count,
    normal=r.tasks[0].finished,g=L.layout(d,1050,{simulationResult:r});
  assert.deepEqual(counts(g,'choice'),[1000,1000-first,normal]);
  assert.equal(first+second+normal,1000);
  delete d.tasks[0].toStateId;
  d.tasks[0].junctions[1].outcomes[0].probability=1;
  const only=S.run(d),onlyG=L.layout(d,1050,{simulationResult:only});
  assert.equal(only.tasks[0].finished,0);
  assert.equal(counts(onlyG,'choice')[0],1000);
  assert.equal(counts(onlyG,'choice')[1],only.branches.find(b=>b.junctionId==='j2').count);
});

test('CDF failure, cancellation, unavailable or late effects never become a conditional success percentage',()=>{
  const d=sample(),r=S.run(d,{iterations:1000,taskOverrides:{'midcourse-intercept':{duration:180}}}),g=L.layout(d,1050,{simulationResult:r});
  assert(r.signals.find(l=>l.id==='midcourse-effect').late>0);
  assert.equal(g.edges.find(e=>e.id==='midcourse-effect').resultSegments[0].metric.count,0);
  assert.deepEqual(counts(g,'midcourse-flight','outcome'),[0]);
  assert.equal(counts(g,'terminal-intercept')[0],r.tasks.find(t=>t.id==='terminal-intercept').finished);
  assert.equal(g.edges.find(e=>e.id==='terminal-effect').resultSegments[0].metric.ratio,r.signals.find(l=>l.id==='terminal-effect').accepted/r.iterations);
});

test('single/double strokes, percentages, colors and arrow orientation survive every View and export',()=>{
  const d=sample(),r=S.run(d,{iterations:100});
  for(const mode of ['mission','technology','gap','causality'])for(const exporting of [false,true]){
    d.views.main.mode=mode;
    const g=L.layout(d,1200,{simulationResult:r,full:exporting}),out=xml(d,g,{export:exporting,selection:[{type:'task',id:'midcourse-intercept'}]});
    assert.equal(out.documentElement.dataset.resultIterations,'100');
    assert.equal(out.querySelectorAll('.simulation-rate-label').length,g.edges.flatMap(e=>e.resultSegments).filter(p=>p.labelInfo).length);
    for(const group of out.querySelectorAll('.simulation-result-segment')){
      const rate=Number(group.dataset.resultRate),line=group.querySelector('.line');
      assert.equal(Number(line.getAttribute('stroke-width')),O.lineWidth(rate));
      if(group.querySelector('.line-gap'))assert.equal(Number(group.querySelector('.line-gap').getAttribute('stroke-width')),O.lineWidth(rate)*.4);
      else assert(line.classList.contains('line-cdf'));
    }
    assert(out.querySelector('.simulation-result-legend').textContent.includes('分母：全試行'));
    assert(out.querySelector('.simulation-result-legend').textContent.includes('基準時刻'));
    assert(out.querySelector('.simulation-result-legend').textContent.includes('Mission成功 '+O.percent(r.successProbability)));
    if(exporting)assert.equal(out.querySelector('[data-type]'),null);
  }
});

test('folded single-line summaries never sum or average correlated marginal counts; exports retain individual rates',()=>{
  const d=M.defaults(fixture()),r=S.run(d),group=M.groupActors(d,d.actors.map(a=>a.id),'集約');
  d.views.main.collapsedActors=[group];
  for(const mode of ['compact','spaced','single']){
    d.views.main.collapsedLayout=mode;
    const g=L.layout(d,1050,{simulationResult:r});
    if(mode==='single'){
      assert(g.edges.filter(e=>e.summaryActorId).every(e=>e.resultSegments.length===0));
      assert(xml(d,g).querySelector('.edge title').textContent.includes('展開して確認'));
    }else assert(g.edges.filter(e=>e.type==='task').every(e=>e.resultSegments.length===1));
    const full=L.layout(d,1050,{full:true,simulationResult:r});
    assert.equal(full.edges.filter(e=>e.resultSegments.length).length,d.tasks.length);
  }
});

test('percentages remain exact at endpoints and do not round rare events to zero or certainty; labels stay inside narrow viewports',()=>{
  assert.equal(O.percent(0),'0%');assert.equal(O.percent(1),'100%');assert.equal(O.percent(.00001),'<0.1%');assert.equal(O.percent(.99999),'>99.9%');
  const d=sample(),r=S.run(d,{iterations:100});
  for(const width of [320,640,1050]){
    const g=L.layout(d,width,{simulationResult:r});
    for(const p of g.edges.flatMap(e=>e.resultSegments))if(p.labelInfo){
      const b=p.labelInfo;assert(b.x>=g.vp.left);assert(b.x+b.width<=g.vp.width);assert(b.y>=34);assert(b.y+b.height<g.resultOverlay.legendY);
    }
  }
  d.views.main.visibleTimeRange={start:120,end:180};
  const zoom=L.layout(d,640,{simulationResult:r});
  assert(zoom.edges.find(e=>e.id==='terminal-flight').resultSegments.every(p=>p.labelInfo));
  const instant=M.defaults(fixture());instant.states.find(s=>s.id==='s1').time=0;instant.tasks[0].simulation.enabled=false;
  const i=L.layout(instant,1050,{simulationResult:S.run(instant)});
  assert(i.edges.find(e=>e.id==='detect').resultSegments[0].labelInfo);
});

test('completed results can be applied, toggled, exported and retained through View changes without saving styles into the mission',async t=>{
  const a=await openApp(fixture());t.after(()=>{assert.deepEqual(a.errors,[]);a.close();});
  const before=a.savedDoc();assert(a.$('#simulation-overlay-toggle').disabled);assert(a.$('#simulation-apply').disabled);
  a.click('#simulation-btn');a.click('#simulation-run');await ready(a);
  assert(!a.$('#timeline').hasAttribute('data-result-iterations'));
  a.click('#simulation-apply');assert(!a.$('#simulation-dialog').open);
  assert.equal(a.$('#simulation-overlay-toggle').getAttribute('aria-pressed'),'true');
  assert.equal(a.$('#timeline').dataset.resultIterations,'2000');assert(a.$('.simulation-rate-label'));
  assert.deepEqual(a.savedDoc(),before);
  const source=a.w.IMEE.exportSource(),out=new JSDOM(source.svg,{contentType:'image/svg+xml'}).window.document;
  assert(out.querySelector('.simulation-rate-label'));assert(out.querySelector('.simulation-result-legend'));
  assert.equal(Number(out.documentElement.getAttribute('height')),source.height);
  a.click('#zoom-in');assert(a.$('.simulation-rate-label'));
  a.click('#simulation-overlay-toggle');assert(!a.$('.simulation-rate-label'));assert(!a.$('#timeline').hasAttribute('data-result-iterations'));
  a.click('#simulation-overlay-toggle');assert(a.$('.simulation-rate-label'));
  a.event(a.$('.task-label[data-id="detect"] text'),'dblclick');a.fill('label','編集後');a.submit();
  assert(a.$('#simulation-overlay-toggle').disabled);assert(!a.$('.simulation-rate-label'));assert(!a.$('#timeline').hasAttribute('data-result-iterations'));
});

test('rerun or cancellation clears the previous diagram and never enables partial results',async t=>{
  const d=fixture();d.simulation.iterations=100;
  const a=await openApp(d);t.after(()=>{assert.deepEqual(a.errors,[]);a.close();});
  a.click('#simulation-btn');a.click('#simulation-run');await ready(a);a.click('#simulation-apply');
  a.click('#simulation-btn');a.click('#simulation-run');
  assert(a.$('#simulation-overlay-toggle').disabled);assert(!a.$('.simulation-rate-label'));
  a.click('#simulation-stop');await new Promise(r=>a.w.setTimeout(r,30));assert(a.$('#simulation-apply').disabled);
  a.click('#simulation-run');await ready(a);a.click('#simulation-apply');assert(a.$('.simulation-rate-label'));
  const invalid=fixture();invalid.tasks[0].junctions=[{id:'bad',time:5,outcomes:[{toStateId:'s1',label:'未設定'}]}];
  a.w.IMEE.loadJSON(JSON.stringify(invalid));a.click('#simulation-btn');a.click('#simulation-run');
  assert(a.$('#simulation-overlay-toggle').disabled);assert(a.$('#simulation-apply').disabled);assert(!a.$('.simulation-rate-label'));
});
