const {test}=require('node:test'),assert=require('node:assert/strict');
const M=require('../js/model'),L=require('../js/layout');
const fixture=require('./fixtures/mission.cjs'),{openApp}=require('./dom-helper.cjs');
function scenario(polarity='negative') {
  const d=fixture();
  d.causalLinks.push({id:'effect',source:{type:'actor',id:'enemy',time:8},target:{type:'task',id:'search',time:10.5},label:'外部作用',polarity});
  d.causalLinks.push({id:'later',source:{type:'actor',id:'enemy',time:9},target:{type:'task',id:'search',time:15},label:'後続作用',polarity:'positive'});
  return M.validate(d);
}
async function app(t,d=scenario()) {
  const a=await openApp(d);t.after(()=>{assert.deepEqual(a.errors,[]);a.close();});return a;
}
function context(a,el,label) {
  a.event(el,'contextmenu',{clientX:900,clientY:400});
  const button=[...a.d.querySelectorAll('#context-menu button')].find(b=>b.textContent===label);
  assert(button,label);button.click();
}
for(const polarity of ['positive','negative'])test(`${polarity} causal action carries arrival time and preserves Task destination and intervention windows`,async t=>{
  const d=scenario(polarity),a=await app(t,d),before=M.taskWindow(d,d.tasks[0]);
  context(a,a.$('[data-id="effect"] .line'),'分岐を追加');
  assert.equal(a.$('[name="time"]').value,'10.5');assert(a.$('[name="time"]').readOnly);
  assert.equal(a.$('[name="stateTime"]').value,'10.5');assert.equal(a.$('[name="label"]').value,'別の結果');
  assert.match(a.$('.dialog-summary').textContent,/ソナー.*捜索/);
  a.fill('label','作用成立');a.fill('name','作用後の状態');a.fill('stateTime',12);a.submit();
  const after=a.savedDoc(),task=after.tasks[0],outcome=task.junctions[0].outcomes[0];
  assert.equal(task.toStateId,'s1');assert.equal(task.junctions[0].time,10.5);
  assert.deepEqual(M.taskWindow(after,task),before);
  assert.equal(M.opportunity(after,M.get(after,'causalLink','later')).within,true);
  assert.deepEqual(after.causalLinks,d.causalLinks);
  const state=M.get(after,'state',outcome.toStateId);assert.equal(state.actorId,'sensor');assert.equal(state.time,12);
  const g=L.layout(after);assert.equal(g.tasks.get('search').points.at(-1).x,g.vp.x(16));
  assert.equal(g.edges.find(e=>e.id==='search'&&e.part==='outcome').points[0].x,g.vp.x(10.5));
  a.key('z',{ctrlKey:true});assert.deepEqual(a.savedDoc().tasks,d.tasks);assert.equal(a.savedDoc().states.length,d.states.length);
  a.key('z',{ctrlKey:true,shiftKey:true});assert.deepEqual(a.savedDoc().tasks,after.tasks);
  assert.deepEqual(M.parse(JSON.stringify(after)),after);
});

test('white action point uses its exact fractional time, independently of pointer position and snap',async t=>{
  const a=await app(t);
  context(a,a.$('.junction[data-id="search"][data-time="10.5"] circle'),'分岐を追加');
  assert.equal(a.$('[name="time"]').value,'10.5');
  a.fill('toStateId','s1');a.$('[name="toStateId"]').dispatchEvent(new a.w.Event('change'));
  assert(a.$('#new-result-state').hidden);assert(a.$('[name="name"]').disabled);
  a.fill('label','既存状態へ');a.submit();
  const d=a.savedDoc();assert.equal(d.states.length,scenario().states.length);
  assert.equal(d.tasks[0].junctions[0].time,10.5);assert.equal(d.tasks[0].junctions[0].outcomes[0].toStateId,'s1');
  assert.equal(a.d.querySelectorAll('.junction[data-id="search"][data-time="10.5"]').length,1);
});

test('white result point without incoming cause offers branching at that point and preserves branch-only window',async t=>{
  const d=fixture(),a=await app(t,d);
  context(a,a.$('.junction[data-id="identify"][data-time="29"]'),'分岐を追加');
  assert(a.$('#branch-related-causes').hidden);
  assert.equal(a.$('[name="time"]').value,'29');assert(a.$('[name="time"]').readOnly);
  a.fill('toStateId','i2');a.fill('label','追加結果');a.submit();
  const result=a.savedDoc();assert.equal(result.tasks[1].junctions.length,1);
  assert.equal(result.tasks[1].junctions[0].outcomes.length,3);
  assert.deepEqual(M.taskWindow(result,result.tasks[1]),M.taskWindow(d,d.tasks[1]));
});

test('causal inspector provides the same action and cancelled or invalid additions leave data unchanged',async t=>{
  const a=await app(t),before=a.savedDoc();
  a.click(a.$('[data-id="effect"] .line'));
  const action=()=>[...a.d.querySelectorAll('#inspector button')].find(b=>b.textContent==='分岐を追加');
  assert(action());action().click();a.$('#dialog-cancel').click();assert.deepEqual(a.savedDoc(),before);
  action().click();a.fill('name','早すぎる結果');a.fill('stateTime',9);a.submit();
  assert(a.$('#editor-dialog').hasAttribute('open'));assert(a.$('#dialog-error').textContent);
  assert.deepEqual(a.savedDoc(),before);
});

test('multiple incoming causes share one action and are listed as context from either entry point',async t=>{
  const d=scenario();d.causalLinks.push({...M.clone(d.causalLinks.find(c=>c.id==='effect')),id:'effect2',label:'支援作用',polarity:'positive'});
  const a=await app(t,d);
  for(const selector of ['.junction[data-id="search"][data-time="10.5"]','[data-id="effect"] .line']) {
    a.event(a.$(selector),'contextmenu',{clientX:900,clientY:400});
    const actions=[...a.d.querySelectorAll('#context-menu button')].filter(b=>/分岐|結果を追加/.test(b.textContent));
    assert.equal(actions.length,1);assert.equal(actions[0].textContent,'分岐を追加');actions[0].click();
    const related=a.$('#branch-related-causes');assert(!related.hidden);
    assert.match(related.textContent,/外部作用/);assert.match(related.textContent,/支援作用/);
    assert.doesNotMatch(related.textContent,/後続作用/);
    assert.match(related.textContent,/分岐条件は設定されません/);
    assert.equal(a.$('[name="time"]').value,'10.5');assert.equal(a.$('[name="label"]').value,'別の結果');
    a.$('#dialog-cancel').click();
  }
});

test('out-of-window causal action does not create a branch or change the Task period',async t=>{
  const d=scenario();d.causalLinks.find(c=>c.id==='effect').target.time=18;
  const a=await app(t,d),before=a.savedDoc();
  context(a,a.$('[data-id="effect"]'),'分岐を追加');
  assert.match(a.$('#toast').textContent,/実行期間外/);assert(!a.$('#editor-dialog').hasAttribute('open'));
  assert.deepEqual(a.savedDoc(),before);
  const copy=M.clone(d);assert.throws(()=>M.addOutcome(copy,'search',18,'s1','結果'),/実行期間内/);
  assert.deepEqual(copy,d);
});

test('generic Task context action starts at the clicked time and keeps new result time in sync',async t=>{
  const a=await app(t),g=L.layout(a.savedDoc(),1050),point=g.tasks.get('search');
  a.event(a.$('[data-id="search"] .line'),'contextmenu',{clientX:g.vp.x(12),clientY:point.from.y});
  [...a.d.querySelectorAll('#context-menu button')].find(b=>b.textContent==='分岐を追加').click();
  assert.equal(a.$('[name="time"]').value,'12');assert(!a.$('[name="time"]').readOnly);
  assert(a.$('#branch-related-causes').hidden);
  a.fill('time',15);a.$('[name="time"]').dispatchEvent(new a.w.Event('input'));
  assert(!a.$('#branch-related-causes').hidden);assert.match(a.$('#branch-related-causes').textContent,/後続作用/);
  a.fill('time',13);a.$('[name="time"]').dispatchEvent(new a.w.Event('input'));
  assert.equal(a.$('[name="stateTime"]').value,'13');assert(a.$('#branch-related-causes').hidden);
  a.fill('name','追加結果');a.submit();assert.equal(a.savedDoc().tasks[0].junctions[0].time,13);
});
