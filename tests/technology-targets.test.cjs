const {test}=require('node:test'),assert=require('node:assert/strict');
const M=require('../js/model'),L=require('../js/layout'),R=require('../js/render');
const fixture=require('./fixtures/mission.cjs'),{openApp}=require('./dom-helper.cjs');
function scenario(){
  const d=fixture();
  d.technologies.push({id:'legacy-tech',name:'旧紐付け技術',status:'existing',trl:9});
  d.bindings.push({id:'legacy-state',technologyId:'legacy-tech',targetType:'state',targetId:'s0'},
    {id:'actor-equipment',technologyId:'legacy-tech',targetType:'actor',targetId:'sensor'});
  return d;
}
const button=(a,text)=>[...a.d.querySelectorAll('#inspector button')].find(b=>b.textContent===text);

test('Actor equipment and old State bindings remain in data but not on the timeline',()=>{
  const d=scenario(),before=M.clone(d),g=L.layout(d);
  assert.equal(g.technologyTags.length,0);assert.equal(g.technologyGroups.length,0);
  assert.deepEqual(d,before);
  d.views.main.filters.technology=false;
  assert.equal(g.height,L.layout(d).height);
  assert.deepEqual(M.parse(JSON.stringify(before)).bindings,before.bindings);
});

test('State binding creation is absent; existing bindings can be retargeted with cancel and undo',async t=>{
  const d=scenario(),a=await openApp(d);t.after(()=>{assert.deepEqual(a.errors,[]);a.close();});
  a.click(a.$('.actor[data-id="sensor"]'));assert.match(a.$('#inspector').textContent,/Actor全体の技術・装備/);
  assert(button(a,'技術を関連付け'));
  a.click(a.$('.state[data-id="s0"]'));assert(!button(a,'技術を関連付け'));
  assert.match(a.$('#inspector').textContent,/旧State/);assert(button(a,'付け先変更'));
  a.event(a.$('.state[data-id="s0"]'),'contextmenu',{clientX:220,clientY:100});
  assert(![...a.d.querySelectorAll('#context-menu button')].some(b=>b.textContent==='技術を関連付け'));
  button(a,'付け先変更').click();a.fill('target','task:search');a.$('#dialog-cancel').click();
  assert.deepEqual(a.savedDoc().bindings,d.bindings);
  button(a,'付け先変更').click();a.submit();assert.match(a.$('#dialog-error').textContent,/付け先を選択/);
  a.fill('target','task:search');a.submit();
  assert.equal(a.savedDoc().bindings.find(b=>b.id==='legacy-state').targetType,'task');
  assert.equal(a.savedDoc().bindings.find(b=>b.id==='legacy-state').targetId,'search');
  a.key('z',{ctrlKey:true});assert.deepEqual(a.savedDoc().bindings,d.bindings);
  a.key('z',{ctrlKey:true,shiftKey:true});assert.equal(a.savedDoc().bindings.find(b=>b.id==='legacy-state').targetId,'search');
});

test('a dense technology summary identifies its target and opens all bindings in details',async t=>{
  const d=fixture();
  for(let i=0;i<6;i++){
    d.technologies.push({id:'dense'+i,name:'高密度技術'+i,status:'research',trl:4});
    d.bindings.push({id:'bind'+i,technologyId:'dense'+i,targetType:'task',targetId:'search'});
  }
  const a=await openApp(d);t.after(()=>{assert.deepEqual(a.errors,[]);a.close();});
  const summary=a.$('.technology-summary[data-id="search"]');assert(summary);assert.match(summary.textContent,/技6/);
  a.click(summary);assert(!a.$('#inspector').classList.contains('hidden'));
  for(let i=0;i<6;i++)assert.match(a.$('#inspector').textContent,new RegExp('高密度技術'+i));
  assert.equal(a.$('#inspector').querySelectorAll('.tech-card').length,6);
  assert(R.render(d,L.layout(d),{export:true}).includes('高密度技術5'));
});
