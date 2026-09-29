const {test}=require('node:test'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const M=require('../js/model'),L=require('../js/layout'),R=require('../js/render');
const sample=require('../js/sample'),fixture=require('./fixtures/mission.cjs');
const {openApp}=require('./dom-helper.cjs');

test('Task and outcome frames sit on their routes and avoid nodes even on short intervals',()=>{
  const d=sample(),g=L.layout(d,1200);
  let shortened=0,hidden=0,outcomes=0;
  for(const edge of g.edges.filter(e=>e.type==='task')) {
    const b=edge.labelInfo;
    if(!b) {hidden++;continue;}
    if(edge.part==='outcome') outcomes++;
    if(b.text!==b.fullText) shortened++;
    assert.equal(b.x+b.width/2,b.anchor.x);assert.equal(b.y+b.height/2,b.anchor.y);
    assert.equal(b.leader,false);
    assert(L.routeSegments(edge.points).some(({a,b:end})=>{
      const cross=(b.anchor.x-a.x)*(end.y-a.y)-(b.anchor.y-a.y)*(end.x-a.x);
      return Math.abs(cross)<1e-6 && b.anchor.x>=Math.min(a.x,end.x)-1e-6 && b.anchor.x<=Math.max(a.x,end.x)+1e-6 &&
        b.anchor.y>=Math.min(a.y,end.y)-1e-6 && b.anchor.y<=Math.max(a.y,end.y)+1e-6;
    }));
    for(const s of g.states.values())
      assert(!L.overlaps(b,{x:s.x-s.r,y:s.y-s.r,width:s.r*2,height:s.r*2}));
  }
  assert(outcomes>0);assert(shortened>0);assert(hidden>0);
});

test('label frames and underlines match their line colors in Views, folded groups and exports',()=>{
  for(const mode of ['mission','causality','technology','gap']) for(const folded of [false,true]) {
    const d=sample.grouped();d.views.main.mode=mode;
    if(folded)d.views.main.collapsedActors=['uuv'];
    const before=JSON.stringify(d),g=L.layout(d,1200);
    for(const exporting of [false,true]) {
      const svg=new JSDOM(R.render(d,g,{export:exporting}),{contentType:'image/svg+xml'}).window.document;
      const labels=[...svg.querySelectorAll('.edge-label')],edges=g.edges.filter(e=>e.labelInfo);
      assert.equal(labels.length,edges.length);
      edges.forEach((e,i)=>{
        const label=labels[i],color=M.actorColor(d,M.get(d,'actor',e.actorId));
        assert.equal(label.querySelector('title').textContent,e.label);
        if(e.type==='task') {
          const frame=label.querySelector('.label-frame');assert(frame);
          assert.equal(frame.getAttribute('stroke'),color);assert.equal(frame.getAttribute('fill'),'white');
          assert.equal(frame.getAttribute('fill-opacity'),'1');assert(!label.querySelector('.label-underline'));
        } else {
          assert.equal(label.querySelector('.label-underline').getAttribute('stroke'),color);
          assert(!label.querySelector('.label-frame'));assert(!label.querySelector('rect').hasAttribute('stroke'));
        }
      });
    }
    assert.equal(JSON.stringify(d),before);
  }
});

test('labels stay selectable and Actor color edits update frame and underline together',async t=>{
  const a=await openApp(fixture());t.after(()=>a.close());
  a.click(a.$('.task-label[data-id="search"] text'));
  assert(a.$('.edge[data-id="search"]').classList.contains('selected'));
  a.click(a.$('.causal-label[data-id="report"] text'));
  assert(a.$('.edge[data-id="report"]').classList.contains('selected'));
  a.event(a.$('.actor[data-id="sensor"]'),'dblclick');a.fill('color','#267abc');a.submit();
  assert.equal(a.$('.task-label[data-id="search"] .label-frame').getAttribute('stroke'),'#267abc');
  assert.equal(a.$('.causal-label[data-id="report"] .label-underline').getAttribute('stroke'),'#267abc');
  assert.deepEqual(a.errors,[]);
});
