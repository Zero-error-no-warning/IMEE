const {test}=require('node:test'),assert=require('node:assert/strict');
const {openApp}=require('./dom-helper.cjs'),sample=require('../js/time-axis-sample'),M=require('../js/model');
async function waitFor(f){for(let i=0;i<100;i++){if(f())return;await new Promise(r=>setTimeout(r,10));}throw Error('timeout');}
test('fixed time edits, task duration edits, undo, and config previews retain their separate constraints',async t=>{
  const a=await openApp(sample());t.after(()=>a.close());
  assert.equal(a.d.querySelectorAll('.fixed-time-node').length,2);assert.equal(a.d.querySelectorAll('#timeline .axis-cdf').length,2);
  a.event(a.$('.state[data-id="decision"]'),'dblclick');a.fill('time',32);a.submit();
  assert.equal(a.savedDoc().states.find(s=>s.id==='decision').timing.at,32);assert.equal(a.savedDoc().tasks[1].timing.duration,6);
  a.event(a.$('.edge[data-id="assess"]'),'dblclick');a.fill('taskDuration',8);a.$('[name="taskDuration"]').dispatchEvent(new a.w.Event('input',{bubbles:true}));a.submit();
  assert.equal(a.$('#editor-dialog').open,false);assert.equal(a.savedDoc().tasks[1].timing.duration,8);assert.equal(a.savedDoc().states.find(s=>s.id==='decision').time,32);
  a.w.IMEE.undo();assert.equal(a.savedDoc().tasks[1].timing.duration,6);
  const before=M.clone(a.savedDoc().tasks);a.$('#axis-cdf-q').value='.5';a.$('#axis-cdf-q').dispatchEvent(new a.w.Event('input',{bubbles:true}));
  assert.deepEqual(a.savedDoc().tasks,before);assert.equal(a.$('#axis-cdf-q-value').textContent,'0.50');assert.deepEqual(a.errors,[]);
});
test('results CDFs require a current run and disappear after computational changes',async t=>{
  const d=sample();d.simulation.iterations=16;const a=await openApp(d);t.after(()=>a.close());
  a.click('#simulation-btn');a.click('#simulation-run');await waitFor(()=>!a.$('#simulation-export').disabled);a.click('#simulation-close');
  a.$('#axis-cdf-mode').value='results';a.$('#axis-cdf-mode').dispatchEvent(new a.w.Event('change',{bubbles:true}));
  assert(a.$('#timeline .axis-cdf[data-cdf-kind="results"]'));assert(a.$('#axis-cdf-q').disabled);
  const next=a.w.IMEE.getDocument();next.tasks[1].timing.duration=5;a.w.IMEE.loadJSON(JSON.stringify(next));
  assert(!a.$('#timeline .axis-cdf'));assert.match(a.$('#axis-cdf-status').textContent,/実行/);assert.deepEqual(a.errors,[]);
});
test('the clock can fit CDF tails beyond the authoring period without moving nodes',async t=>{
  const d=sample();d.tasks[0].simulation.performanceModel.curves[1].points.at(-1).t=80;
  const a=await openApp(d);t.after(()=>a.close());a.click('#axis-cdf-fit');
  assert.equal(a.savedDoc().views.main.visibleTimeRange.end,80);assert.equal(a.savedDoc().time.duration,40);assert.equal(a.savedDoc().states[1].time,14);
  a.click('#more-btn');const svg=[...a.d.querySelectorAll('#context-menu button')].find(b=>b.textContent==='SVG出力');a.click(svg);
  const source=await a.readBlob(a.downloads.at(-1).blob);assert(source.includes('cdf-curve'));assert(source.includes('Fixed-time Node'));
});
