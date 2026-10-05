const {test}=require('node:test'),assert=require('node:assert/strict');
const {openApp}=require('./dom-helper.cjs'),{base}=require('./fixtures/quality.cjs');
function json(value){return JSON.parse(JSON.stringify(value));}
test('a time-reversing State edit stays visible and saved, supports Undo/Redo and repair',async t=>{
  const a=await openApp(base());t.after(()=>a.close());
  a.event(a.$('.state[data-id="r0"]'),'dblclick');a.fill('time',5);a.submit();
  assert.equal(a.savedDoc().states.find(s=>s.id==='r0').time,5);
  assert.equal(a.savedDoc().causalLinks[0].propagation.duration,-5);
  assert(a.$('.edit-error'));assert(a.$('.causal-label[data-id="report"]'));
  assert(a.$('#simulation-btn').disabled);assert(!a.$('#editor-dialog').hasAttribute('open'));
  a.w.IMEE.undo();assert.equal(a.$('.edit-error'),null);assert.equal(a.savedDoc().states.find(s=>s.id==='r0').time,10);
  a.w.IMEE.redo();assert(a.$('.edit-error'));assert.equal(a.savedDoc().states.find(s=>s.id==='r0').time,5);
  a.event(a.$('.state[data-id="r0"]'),'dblclick');a.fill('time',12);a.submit();
  assert.equal(a.$('.edit-error'),null);assert.equal(a.savedDoc().causalLinks[0].propagation.duration,2);
  assert.equal(a.savedDoc().states.find(s=>s.id==='r1').time,22);assert(!a.$('#simulation-btn').disabled);
  assert.deepEqual(a.errors,[]);
});
test('a backwards connection remains a located editable draft and Undo removes only that attempt',async t=>{
  const a=await openApp(base());t.after(()=>a.close());
  a.click('.state[data-id="r1"]');a.key('c');a.click('.state[data-id="s0"]');
  const draft=json(a.w.IMEE.getDocument()),created=draft.causalLinks.at(-1);
  assert.equal(draft.causalLinks.length,2);assert.equal(created.propagation.duration,-20);
  assert(a.$(`.edge.causal[data-id="${created.id}"]`));assert(a.$('.edit-error'));
  a.click('[data-edit-error]');assert(a.$('#editor-dialog').hasAttribute('open'));
  a.click('#dialog-cancel');assert.equal(a.savedDoc().causalLinks.length,2);
  a.click('.undo-edit-error');assert.equal(a.savedDoc().causalLinks.length,1);assert.equal(a.$('.edit-error'),null);
  assert.deepEqual(a.errors,[]);
});
test('editing diagnostics survive reload and retain an editable document and valid Undo baseline',async t=>{
  const a=await openApp(base());t.after(()=>a.close());
  a.event(a.$('.causal-label[data-id="report"]'),'dblclick');a.fill('causalDelay',-2);a.submit();
  assert(a.$('.edit-error'));const draft=a.savedDoc();
  const storage=Object.fromEntries(['imee.document.v3','imee.document.v3.editing','imee.document.v3.last-valid'].map(key=>[key,a.w.localStorage.getItem(key)]));
  const b=await openApp(draft,storage);t.after(()=>b.close());
  assert(b.$('.edit-error'));assert.deepEqual(json(b.w.IMEE.getDocument()),draft);
  assert.equal(b.w.IMEE.getImportErrors().length,0);
  b.w.IMEE.undo();assert.equal(b.$('.edit-error'),null);assert.equal(b.savedDoc().causalLinks[0].propagation.duration,0);
  assert.deepEqual(a.errors,[]);assert.deepEqual(b.errors,[]);
});
