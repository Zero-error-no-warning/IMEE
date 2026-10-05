const {test}=require('node:test'),assert=require('node:assert/strict');
const M=require('../js/model'),L=require('../js/layout'),R=require('../js/render');
const {base,state,link,trial}=require('./fixtures/quality.cjs');
function sample(mode){const d=base();d.tasks=[];d.states=[state('one','a',5,.2),state('two','b',10,.8),{...state('receipt','e',mode==='all'?15:12),simulation:{join:mode}}];d.causalLinks=[link('first','one','receipt',7),link('second','two','receipt',5)];d.simulation.successStateIds=['receipt'];return d;}
for(const mode of ['all','any']){
 test(`${mode} accepts asynchronous nominal receipts and aggregates time and quality`,()=>{const d=sample(mode);M.validate(d);const r=trial(d);assert.equal(r.times.get('receipt'),mode==='all'?15:12);assert.equal(r.stateQ.get('receipt'),.2);assert.equal(r.signalEvents[1].status,mode==='any'?'late':'accepted');});
 test(`${mode} scenario-only accepts asynchronous receipts and rejects an incorrect establishment time`,()=>{const d=sample(mode);delete d.simulation;for(const c of d.causalLinks)delete c.simulation;M.validate(d);d.states[2].time=14;assert.throws(()=>M.validate(d),e=>e.validationPath==='$.states[2]' && e.validationFragment.arrivals.join(',')==='12,15');});
 test(`${mode} draws each actual nominal arrival separately from State establishment`,()=>{const d=sample(mode),g=L.layout(d);for(const c of d.causalLinks){const e=g.edges.find(e=>e.id===c.id);assert(Math.abs(e.points.at(-1).x-g.vp.x(M.causalArrivalTime(d,c)))<4);}assert.equal(g.stateReceipts.length,1);assert.equal(g.stateReceipts[0].late,mode==='any');assert(R.render(d,g).includes('class="state-receipt"'));});
}
