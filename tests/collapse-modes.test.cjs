const {test}=require('node:test'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const M=require('../js/model'),L=require('../js/layout'),R=require('../js/render'),S=require('../js/sample');
const {openApp}=require('./dom-helper.cjs');
const doc=()=>{const d=S.grouped();d.views.main.collapsedActors=['uuv'];return d;};

test('compact is the default and folded spacing is 28px without changing expanded spacing',()=>{
  const d=doc();assert.equal(d.views.main.collapsedLayout,'compact');
  const compact=L.layout(d,1200),row=compact.rows.find(r=>r.actor.id==='uuv');
  const ys=[...new Set([...compact.states.values()].filter(s=>s.displayActorId==='uuv').map(s=>s.y))].sort((a,b)=>a-b);
  for(let i=1;i<ys.length;i++)assert.equal(ys[i]-ys[i-1],28);
  d.views.main.collapsedLayout='spaced';const spaced=L.layout(d,1200);
  assert(row.height<spaced.rows.find(r=>r.actor.id==='uuv').height);
  assert.equal(compact.states.get('e1').y,spaced.states.get('e1').y);
  assert([...compact.states.values()].filter(s=>s.displayActorId==='uuv').every(s=>s.lines.length===0));
  assert([...spaced.states.values()].filter(s=>s.displayActorId==='uuv').every(s=>s.lines.length>0));
});

test('single mode draws one parent line and one circle per timestamp, with exact external causal times',()=>{
  const d=doc();d.views.main.collapsedLayout='single';const before=JSON.stringify(d),g=L.layout(d,1200);
  const row=g.rows.find(r=>r.actor.id==='uuv'),states=[...g.states.values()].filter(s=>s.displayActorId==='uuv');
  assert(states.every(s=>s.y===row.center && s.lane===0));
  const summary=g.edges.filter(e=>e.summaryActorId==='uuv');assert.equal(summary.length,1);
  assert(summary.every(e=>e.points.length===2&&e.points.every(p=>p.y===row.center)));
  assert.equal(summary[0].points[0].x,g.vp.x(0));assert.equal(summary[0].points[1].x,g.vp.x(48));
  const xml=new JSDOM(R.render(d,g),{contentType:'image/svg+xml'}).window.document;
  assert.equal(xml.querySelectorAll('.state[data-expand-group="uuv"]').length,new Set(states.map(s=>s.time)).size);
  assert.equal(xml.querySelectorAll('.state[data-expand-group="uuv"] text,.edge-label[data-expand-group="uuv"]').length,0);
  for(const e of g.edges.filter(e=>e.type==='causalLink')){
    const c=M.get(d,'causalLink',e.id);
    assert.equal(e.points[0].x,g.vp.x(M.endpoint(d,c.source).time));
    assert.equal(e.points.at(-1).x,g.vp.x(M.causalArrivalTime(d,c)));
  }
  assert.equal(JSON.stringify(d),before);
});

test('single mode preserves actual gaps between activity intervals',()=>{
  const d=M.defaults({version:2,title:'空白期間',time:{unit:'minutes',duration:20,snap:1},actors:[
    {id:'g',name:'親',side:'friendly'},{id:'a',name:'子A',side:'friendly',parentId:'g'},{id:'b',name:'子B',side:'friendly',parentId:'g'}],
    states:[{id:'s1',actorId:'a',name:'1',time:0},{id:'s2',actorId:'a',name:'2',time:4},{id:'s3',actorId:'b',name:'3',time:10},{id:'s4',actorId:'b',name:'4',time:14}],
    tasks:[{id:'t1',fromStateId:'s1',toStateId:'s2',label:'前半'},{id:'t2',fromStateId:'s3',toStateId:'s4',label:'後半'}],causalLinks:[]});
  d.views.main.collapsedActors=['g'];d.views.main.collapsedLayout='single';
  const g=L.layout(d);assert.deepEqual(g.edges.map(e=>e.points.map(p=>Math.round(g.vp.time(p.x)))),[[0,4],[10,14]]);
});

test('view setting switches modes, persists JSON and supports Undo/Redo',async t=>{
  const app=await openApp(doc());t.after(()=>app.close());
  app.click('#view-settings');assert.equal(app.$('[name="collapsedLayout"]').value,'compact');
  app.fill('collapsedLayout','single');app.submit();
  assert.equal(app.savedDoc().views.main.collapsedLayout,'single');assert(app.$('.edge[data-expand-group="uuv"]'));
  app.key('z',{ctrlKey:true});assert.equal(app.savedDoc().views.main.collapsedLayout,'compact');
  app.key('z',{ctrlKey:true,shiftKey:true});assert.equal(app.savedDoc().views.main.collapsedLayout,'single');
  assert.equal(M.parse(JSON.stringify(app.savedDoc())).views.main.collapsedLayout,'single');
  app.click('#view-settings');app.fill('collapsedLayout','spaced');app.submit();
  assert.equal(app.savedDoc().views.main.collapsedLayout,'spaced');assert.equal(app.$('[data-expand-group]'),null);
  assert.deepEqual(app.errors,[]);
});

test('double-click a merged element expands for editing without changing underlying data',async t=>{
  const d=doc();d.views.main.collapsedLayout='single';const app=await openApp(d);t.after(()=>app.close());
  app.event(app.$('.state[data-expand-group="uuv"]'),'dblclick');
  const saved=app.savedDoc();assert(!saved.views.main.collapsedActors.includes('uuv'));
  assert.deepEqual(saved.states,d.states);assert.deepEqual(saved.tasks,d.tasks);
  assert.equal(app.$('#editor-dialog')?.open||false,false);assert.deepEqual(app.errors,[]);
});

test('all three modes retain technology bindings and full export ignores folding display mode',()=>{
  const d=doc();d.views.main.filters.technology=true;d.technologies=[{id:'t',name:'技術',status:'research',trl:4}];
  d.bindings=[{id:'b',targetType:'task',targetId:d.tasks.find(t=>M.get(d,'state',t.fromStateId).actorId==='sensor').id,technologyId:'t'}];
  let baseline;
  for(const mode of ['single','compact','spaced']){
    d.views.main.collapsedLayout=mode;const g=L.layout(d,1200);
    assert.equal(g.technologyTags.length,1);
    for(const e of g.edges)for(const segment of L.routeSegments(e.points))assert.equal(L.segmentInsideBox(segment,g.technologyTags[0].box),0);
    const output=R.render(d,L.layout(d,1200,{full:true}),{full:true,export:true});
    if(baseline)assert.equal(output,baseline);else baseline=output;
  }
  d.views.main.collapsedLayout='unknown';assert.throws(()=>M.validate(d),/折りたたみ表示/);
});
