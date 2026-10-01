const {test}=require('node:test'), assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const M=require('../js/model'),L=require('../js/layout'),R=require('../js/render');
const sample=require('./fixtures/mission.cjs'), restored=require('../js/sample');
const contains=(b,p)=>p.x>=b.x&&p.x<=b.x+b.width&&p.y>=b.y&&p.y<=b.y+b.height;

function clearAnnotations(g) {
  const segments=g.edges.flatMap(e=>L.routeSegments(e.points));
  for(const tag of g.technologyTags) {
    assert(!tag.overflow,tag.binding.id+' overflow');
    assert(tag.box.y>=0 && tag.box.y+tag.box.height<=g.height);
    assert(tag.box.x>=g.vp.left && tag.box.x+tag.box.width<=g.vp.width);
    for(const obstacle of g.occupied) if(obstacle!==tag.box)
      assert(!L.overlaps(tag.box,obstacle),tag.binding.id+' bubble collides with node/caption/tag');
    for(const line of segments) assert.equal(L.segmentInsideBox(line,tag.box),0,tag.binding.id+' crosses graph line');
    for(const line of L.routeSegments(tag.leader)) for(const obstacle of g.occupied) {
      // The source body is the only obstacle a leader may originate inside.
      const padded={x:obstacle.x-3,y:obstacle.y-3,width:obstacle.width+6,height:obstacle.height+6};
      if(obstacle===tag.box || contains(padded,tag.anchor))continue;
      assert(L.segmentInsideBox(line,obstacle)<0.01,tag.binding.id+' leader crosses node/caption/tag');
    }
  }
}

test('folding projects children to one parent timeline and color, without child-specific lanes',()=>{
  const d=sample(), original=M.clone(d), expanded=L.layout(d,1200);
  d.views.main.collapsedActors=['group'];const g=L.layout(d,1200);
  // Consecutive activities from different children share the same parent lane.
  assert.equal(g.states.get('s0').y,g.states.get('i0').y);
  assert.equal(g.states.get('i0').y,g.states.get('r0').y);
  assert.equal(g.rows.length,2);
  const parent=g.rows.find(r=>r.actor.id==='group');
  assert(parent.height<expanded.rows.filter(r=>r.actor.id!=='enemy').reduce((sum,r)=>sum+r.height,0));
  const xml=new JSDOM(R.render(d,g),{contentType:'image/svg+xml'}).window.document;
  const color=M.get(d,'actor','group').color;
  for(const s of d.states.filter(s=>s.actorId!=='enemy')) {
    assert.equal(xml.querySelector(`[data-id="${s.id}"] .body`).getAttribute('fill'),color);
    assert.equal(g.states.get(s.id).x,g.vp.x(s.time));
  }
  for(const id of ['search','identify','transmit'])
    for(const line of xml.querySelectorAll(`[data-id="${id}"] .line`))assert.equal(line.getAttribute('stroke'),color);
  assert.equal(xml.querySelectorAll('.actor').length,2);
  assert(!xml.querySelector('.actor[data-id="sensor"]'));
  assert.deepEqual(d.states,original.states);assert.deepEqual(d.tasks,original.tasks);
  d.views.main.collapsedActors=[];
  assert.deepEqual(L.layout(d,1200).edges,expanded.edges);
});

test('nested collapsed groups retain external State, Task and Actor causal anchors at exact times',()=>{
  const d=sample();
  const subgroup=M.groupActors(d,['sensor','control'],'内側');
  d.states.push({id:'control-event',actorId:'control',name:'事象',time:40},{id:'group-start',actorId:'group',name:'開始',time:1});
  M.get(d,'task','jam').junctions=[{id:'jam-point',time:41,outcomes:[{toStateId:'e1',label:'結果'}]}];
  d.causalLinks.push(
    {id:'out-state',source:{type:'state',id:'s1'},target:{type:'state',id:'e0'},propagation:{duration:8},label:'外部へ',},
    {id:'out-actor',source:{type:'state',id:'control-event'},target:{type:'junction',taskId:'jam',id:'jam-point',outcomeStateId:'e1'},propagation:{duration:1},label:'Actorから',},
    {id:'parent-internal',source:{type:'state',id:'group-start'},target:{type:'state',id:'s0'},propagation:{duration:1},label:'内部',});
  d.views.main.collapsedActors=['group',subgroup];
  const g=L.layout(d);
  assert.deepEqual(g.edges.filter(e=>e.type==='causalLink').map(e=>e.id),['negative','out-state','out-actor']);
  for(const id of ['negative','out-state','out-actor']) {
    const c=M.get(d,'causalLink',id),e=g.edges.find(e=>e.id===id);
    assert.equal(e.points[0].x,g.vp.x(M.endpoint(d,c.source).time));
    assert.equal(e.points.at(-1).x,g.vp.x(M.causalArrivalTime(d,c)));
  }
  assert.equal(g.edges.find(e=>e.id==='out-state').actorId,'group');
  assert.equal(g.edges.find(e=>e.id==='out-actor').actorId,'group');
  assert.equal(g.edges.find(e=>e.id==='negative').actorId,'enemy');
  assert.equal(L.layout(d,1050,{full:true}).edges.filter(e=>e.type==='causalLink').length,d.causalLinks.length);
});

for(const width of [640,1050])for(const folded of [false,true])
  test(`technology bubbles avoid nodes, text, graph lines and each other at ${width}px, folded=${folded}`,()=>{
    const d=restored.research();d.views.main.mode='technology';d.views.main.filters.technology=true;
    if(folded)d.views.main.collapsedActors=['uuv'];
    const before=JSON.stringify(d),g=L.layout(d,width);
    assert(g.technologyTags.length>0);
    const represented=g.technologyGroups.flatMap(group=>group.compact?group.items:group.tags).map(t=>t.binding.id);
    const expected=d.bindings.filter(b=>['task','causalLink'].includes(b.targetType) &&
      (b.targetType==='task' || g.edges.some(e=>e.id===b.targetId))).map(b=>b.id);
    assert.deepEqual(represented.sort(),expected.sort());
    for(const group of g.technologyGroups.filter(g=>!g.compact)) {
      group.tags.forEach((tag,i)=>{
        assert.equal(tag.box.y,group.caption.y+group.caption.height+5+i*24);
        assert(Math.abs(tag.box.x+tag.box.width/2-group.caption.x-group.caption.width/2)<1e-6);
      });
    }
    clearAnnotations(g);
    assert.equal(JSON.stringify(d),before);
    const xml=new JSDOM(R.render(d,g),{contentType:'image/svg+xml'}).window.document;
    assert.equal(xml.querySelectorAll('.technology-leader').length,0);
    assert.equal(xml.querySelectorAll('.technology-tag').length,g.technologyTags.length);
  });

test('many bindings on one Task use a local summary without stretching a distant annotation band',()=>{
  const d=sample();
  for(let i=0;i<18;i++){
    d.technologies.push({id:'tech'+i,name:'高密度技術注記'+i,status:'research',trl:4});
    d.bindings.push({id:'bind'+i,technologyId:'tech'+i,targetType:'task',targetId:'search'});
  }
  const g=L.layout(d,640);
  const summary=g.technologyGroups.find(g=>g.edge.id==='search');assert(summary.compact);assert.equal(summary.items.length,18);
  assert.equal(g.technologyTags.length,0);clearAnnotations(g);
  d.views.main.filters.technology=false;const compact=L.layout(d,640);
  assert.equal(compact.technologyTags.length,0);assert(g.height>compact.height);assert(g.height-compact.height<200);
  for(const s of d.states)assert.equal(g.states.get(s.id).x,compact.states.get(s.id).x);
});
