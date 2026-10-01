const {test}=require('node:test'),assert=require('node:assert/strict');
const P=require('../js/performance'), M=require('../js/model'), {openApp}=require('./dom-helper.cjs');
const fixture=require('./fixtures/simulation.cjs');
const close=(a,b)=>assert(Math.abs(a-b)<1e-9,`${a} != ${b}`);
const curve=(w,points)=>({w,points,pInfinity:1-points.at(-1).p});
const cdf=(points,t)=>P.curveCDF({points},t);
const wait=()=>new Promise(resolve=>setTimeout(resolve,290));
const focusWait=()=>new Promise(resolve=>setTimeout(resolve,65));

test('w envelope includes exact curve crossings, origin atoms and unequal time knots',()=>{
  const model={type:'cdf',curves:[
    curve(0,[{t:0,p:.2},{t:10,p:.4},{t:20,p:.9}]),
    curve(1,[{t:0,p:0},{t:10,p:.8},{t:20,p:.85}])
  ]};
  const before=JSON.stringify(model),band=P.envelope(model);
  assert.equal(band.minW,0);assert.equal(band.maxW,1);
  close(band.upper.find(p=>p.t>0&&p.t<10).t,10/3);
  close(band.upper.find(p=>p.t>10&&p.t<20).t,170/9);
  close(cdf(band.upper,0),.2);close(cdf(band.lower,0),0);
  model.curves[1]=curve(1,[{t:4,p:.05},{t:12,p:.8},{t:25,p:.85}]);
  const unequal=P.envelope(model);assert.equal(unequal.maxTime,25);
  for(let t=0;t<=30;t+=.25) {
    const values=model.curves.map(c=>P.curveCDF(c,t));
    close(cdf(unequal.lower,t),Math.min(...values));close(cdf(unequal.upper,t),Math.max(...values));
  }
  assert.equal(JSON.stringify(model.curves[0]),JSON.stringify(JSON.parse(before).curves[0]));
});

test('intermediate w knots can set either bound; no extrapolation for partial or single-w definitions',()=>{
  const model={type:'cdf',curves:[curve(.2,[{t:10,p:.8}]),curve(.5,[{t:10,p:.3}]),curve(.8,[{t:10,p:.6}])]};
  const copy=JSON.stringify(model),band=P.envelope(model);
  assert.equal(band.minW,.2);assert.equal(band.maxW,.8);close(cdf(band.lower,10),.3);close(cdf(band.upper,10),.8);
  for(const w of [.2,.3,.5,.6,.8])for(const t of [0,2.5,5,10,20]) {
    const value=cdf(P.distribution(model,w),t);
    assert(value>=cdf(band.lower,t)-1e-10&&value<=cdf(band.upper,t)+1e-10);
  }
  assert.equal(JSON.stringify(model),copy);
  const one=P.envelope({type:'cdf',curves:[curve(.4,[{t:0,p:.7}])]});
  assert.equal(one.minW,one.maxW);assert.deepEqual(one.lower,one.upper);assert.equal(one.maxTime,1);
});

test('Task editor draws the w band and updates only the selected overlay when input w changes',async t=>{
  const a=await openApp(fixture());t.after(()=>a.close());
  a.event(a.$('.task-label[data-id="detect"] text'),'dblclick');
  const band=a.$('#cdf-preview .cdf-band');assert.equal(band.dataset.minW,'0');assert.equal(band.dataset.maxW,'1');
  assert(band.getAttribute('d').endsWith(' Z'));assert(a.$('#cdf-preview').textContent.includes('表示w=0'));
  const area=band.getAttribute('d'),current=a.$('#cdf-preview .cdf-current').getAttribute('d');
  a.fill('performanceW',.5);a.event(a.$('[name="performanceW"]'),'input');
  assert.equal(a.$('#cdf-preview .cdf-band').getAttribute('d'),area);
  assert.notEqual(a.$('#cdf-preview .cdf-current').getAttribute('d'),current);
  assert(a.$('#cdf-preview').textContent.includes('表示w=0.5'));assert.equal(a.savedDoc().tasks[0].simulation.w,0);
  a.fill('curve-0-p-1',.1);a.event(a.$('[name="curve-0-p-1"]'),'input');
  assert(!a.$('#cdf-preview svg'));assert(a.$('#cdf-preview-error').textContent);
  assert.deepEqual(a.errors,[]);
});

test('single-w editor reports undefined width and expands the band when another w curve is added',async t=>{
  const d=fixture();d.tasks[0].simulation.performanceModel.curves.pop();
  const a=await openApp(d);t.after(()=>a.close());a.event(a.$('.task-label[data-id="detect"] text'),'dblclick');
  assert(a.$('#cdf-preview').textContent.includes('w=0のみ'));assert(a.$('#cdf-preview').textContent.includes('幅は未定義'));
  a.click('#add-cdf-curve');assert.equal(a.$('#cdf-preview .cdf-band').dataset.maxW,'1');
  assert(a.$('#cdf-preview').textContent.includes('w=0〜1'));
});

test('hover and keyboard focus show CDF bands; exit, click, Escape, scroll and model changes dismiss them',async t=>{
  const a=await openApp(fixture());t.after(()=>a.close());const before=a.savedDoc();
  let edge=a.$('.edge.task[data-id="detect"]'),title=edge.querySelector('title').textContent;
  a.event(edge.querySelector('.line'),'pointerover',{clientX:1400,clientY:900});await wait();
  const popup=a.$('#cdf-hover');assert(!popup.hidden);assert.equal(popup.dataset.id,'detect');assert(popup.querySelector('.cdf-band'));
  assert(popup.textContent.includes('Task開始から達成まで'));assert(popup.textContent.includes('表示w=0'));
  assert(Number.parseFloat(popup.style.left)>=12);assert(Number.parseFloat(popup.style.left)+360<=a.w.innerWidth-12);
  const left=popup.style.left;a.event(edge.querySelector('.line'),'pointermove',{clientX:50,clientY:50});assert.notEqual(popup.style.left,left);
  edge.dispatchEvent(new a.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert(popup.hidden);
  assert.equal(edge.querySelector('title').textContent,title);assert(!edge.hasAttribute('aria-describedby'));
  edge=a.$('.edge.task[data-id="detect"]'); // Escape also redraws the canvas.
  a.event(edge,'focusin');await focusWait();assert(!popup.hidden);a.event(edge,'focusout');assert(popup.hidden);
  a.event(edge,'pointerover');await wait();a.d.dispatchEvent(new a.w.Event('scroll'));assert(popup.hidden);
  a.event(edge,'focusin');await focusWait();assert(!popup.hidden);edge.dispatchEvent(new a.w.WheelEvent('wheel',{deltaY:100,bubbles:true}));assert(popup.hidden);
  a.event(edge,'pointerover');a.event(edge,'pointerleave');await wait();assert(popup.hidden);
  a.event(edge,'pointerover');await wait();a.event(edge,'pointerdown');assert(popup.hidden);
  assert.deepEqual(a.savedDoc(),before);
  edge=a.$('.edge.task[data-id="detect"]');a.event(edge,'focusin');await focusWait();assert(!popup.hidden);
  const disabled=M.clone(before);disabled.tasks[0].simulation.enabled=false;a.w.IMEE.loadJSON(JSON.stringify(disabled));assert(popup.hidden);
  a.event(a.$('.edge.task[data-id="detect"]'),'pointerover');await wait();assert(popup.hidden);
  assert.deepEqual(a.errors,[]);
});

test('causal hover uses propagation CDF, excludes outcome legs, and stays hidden behind dialogs',async t=>{
  const d=fixture();d.causalLinks=[{id:'information',source:{type:'state',id:'s1'},target:{type:'task',id:'act',time:10},label:'情報伝搬',polarity:'positive',
    simulation:{enabled:true,type:'w',propagation:{enabled:true,performanceModel:M.clone(d.tasks[0].simulation.performanceModel)}}}];
  const a=await openApp(d);t.after(()=>a.close());
  const edge=a.$('.edge.causal[data-id="information"]');a.event(edge,'focusin');await focusWait();
  assert(!a.$('#cdf-hover').hidden);assert(a.$('#cdf-hover').textContent.includes('作用の発生から到着まで'));
  assert(a.$('#cdf-hover').textContent.includes('上流のw'));assert.equal(a.$('#cdf-hover .cdf-band').dataset.maxW,'1');
  a.event(edge,'focusout');a.event(a.$('.edge.task[data-id="act"]'),'focusin');assert(a.$('#cdf-hover').hidden);
  a.event(a.$('.task-label[data-id="detect"] text'),'dblclick');a.event(edge,'focusin');assert(a.$('#cdf-hover').hidden);
  a.click('#dialog-cancel');
  const branched=M.clone(d);branched.tasks[0].junctions=[{id:'port',time:5,outcomes:[{label:'result',toStateId:'s1'}]}];
  a.w.IMEE.loadJSON(JSON.stringify(branched));a.event(a.$('.edge.outcome'),'focusin');assert(a.$('#cdf-hover').hidden);
  assert.deepEqual(a.errors,[]);
});
