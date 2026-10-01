(function (root) {
  "use strict";
  const M = root.ME, P = root.MEPerformance, S = root.MESimulation, esc = root.MERender.esc;
  const unit = d => ({ seconds: "秒", minutes: "分", hours: "時間" })[d.time.unit];
  const fmt = n => n == null ? "—" : Number(n.toFixed(3)).toLocaleString("ja-JP");
  const pct = n => n == null ? "—" : (n*100).toFixed(1)+"%";
  const input = (name, value, label, min=0, max=1e9) => `<input type="number" step="any" min="${min}" max="${max}" name="${name}" value="${esc(String(value))}" aria-label="${esc(label)}">`;
  function diagnostic(e){return (e.message || String(e))+(e.validationPath?"\nJSON path: "+e.validationPath:"")+(e.validationFragment!==undefined?"\nProblem JSON:\n"+JSON.stringify(e.validationFragment,null,2):"");}
  function stateChoices(d, checked, name, exclude) {
    return `<div class="simulation-state-list">${d.states.filter(s=>s.id!==exclude).map(s=>
      `<label><input type="checkbox" name="${name}" value="${esc(s.id)}" ${checked.includes(s.id)?"checked":""}>${esc(M.get(d,"actor",s.actorId).name)} / ${esc(s.name)}</label>`).join("")}</div>`;
  }
  function defaultCurves(d,t) {
    const duration = M.taskWindow(d,t).end-M.taskWindow(d,t).start;
    return durationCurves(duration);
  }
  function durationCurves(duration) {
    return [{q:1,points:duration ? [{t:duration/2,p:.2,q:1},{t:duration,p:.8,q:.9},{t:duration*1.5,p:.95,q:.8}] : [{t:0,p:1,q:1}]}];
  }
  function curveFields(curves) {
    return curves.map((c,i)=>`<fieldset class="cdf-curve" data-curve="${i}"><legend>曲線 ${i+1}</legend>
      <div class="cdf-curve-heading"><label>入力品質 ${input(`curve-${i}-q`,c.q,"曲線の入力品質",0,1)}</label><button type="button" data-remove-curve="${i}" ${curves.length===1?"disabled":""}>曲線を削除</button></div>
      <div class="cdf-direct-graph" data-curve-graph="${i}"></div><p class="muted">グラフの点をドラッグして時間・累積確率を調整できます。品質保持率は表で設定します。</p>
      <table class="simulation-table"><thead><tr><th>所要時間</th><th>この時間以内の達成確率 · 0〜1</th><th>品質保持率 · 0〜1</th><th></th></tr></thead><tbody>
      ${c.points.map((p,j)=>`<tr data-point="${j}"><td>${input(`curve-${i}-t-${j}`,p.t,"時間t")}</td><td>${input(`curve-${i}-p-${j}`,p.p,"累積確率",0,1)}</td><td>${input(`curve-${i}-qOut-${j}`,p.q,"品質保持率",0,1)}</td><td><button type="button" data-remove-point="${i}-${j}" ${c.points.length===1?"disabled":""} aria-label="点を削除">×</button></td></tr>`).join("")}</tbody></table>
      <button type="button" data-add-point="${i}">＋ 点</button><p class="muted cdf-infinity"></p></fieldset>`).join("");
  }
  function performanceFields(d,t) {
    return `<details class="simulation-performance"><summary>Simulation / Performance${t.simulation?.enabled?" · CDF有効":""}</summary>
      <p class="muted">CDFはTask開始から「${esc(t.toStateId?M.get(d,"state",t.toStateId).name:"分岐点")}」の達成までの時間と未達を表し、実線で表示します。無効時は図上の固定所要時間（FIX）を使い、二重線で表示します。時間単位：${unit(d)}。Taskは1回実行します。</p>
      <label class="field"><span>時間モデル</span><select name="performanceType"><option value="fixed">固定時間 (FIX)</option><option value="cdf" ${t.simulation?.enabled?'selected':''}>時間・未達の分布 (CDF)</option></select></label><input type="checkbox" name="performanceEnabled" ${t.simulation?.enabled?"checked":""} hidden>
      <fieldset id="performance-cdf-fields"><label class="field"><span>プレビュー用の入力品質 q（0〜1）・実行値は上流から受領</span>${input("performanceQ",t.simulation?.q??1,"性能品質",0,1)}</label>
      <p class="muted">時間方向・曲線間は線形補間します。最終点以降は一定で、1 − 最終確率が未達確率です。各点のqは品質保持率で、出力q＝入力q×保持率です。</p>
      <div id="cdf-curves">${curveFields(t.simulation?.performanceModel?.curves || defaultCurves(d,t))}</div>
      <button type="button" id="add-cdf-curve">＋ qの曲線</button><div id="cdf-preview"></div><p id="cdf-preview-error" role="status"></p></fieldset>
      <details><summary>追加依存State（すべてへの到達を待つ）</summary><p class="muted">接続元Stateに加えて、ここで選んだStateを待ちます。Actor間の実行依存も指定できます。作用線からは自動設定しません。</p>
      ${stateChoices(d,t.simulation?.waitForStateIds || [],"waitForStateIds",t.fromStateId)}</details>
      <details><summary>品質入力・保持率</summary><p class="muted">未選択時は接続元Stateのqを使います。選択した入力のANDは全到達を待って最小q、ORは到達済みの最大qです。開始後は変更しません。CDF有効時は各点の品質保持率を使います。</p>
      <label class="field"><span>入力条件</span><select name="qualityMode"><option value="all">すべて（AND・最小q）</option><option value="any" ${t.simulation?.qInput?.mode==="any"?"selected":""}>どれか（OR・最大q）</option></select></label>
      ${stateChoices(d,t.simulation?.qInput?.stateIds || [],"qStateIds")}
      <label class="field"><span>固定時間での品質保持率</span>${input("qualityRetention",t.simulation?.qualityRetention??1,"品質保持率",0,1)}</label></details>
      <details><summary>中止条件（いずれかのState到達）</summary>${stateChoices(d,t.simulation?.cancelOnStateIds || [],"cancelOnStateIds")}</details></details>`;
  }
  function readCurves(form) {
    return [...form.querySelectorAll("[data-curve]")].map(el=>{
      const i=el.dataset.curve;
      const numeric = name => { const raw=form.elements.namedItem(name).value; return raw==="" ? NaN : Number(raw); };
      const points=[...el.querySelectorAll("[data-point]")].map(row=>({t:numeric(`curve-${i}-t-${row.dataset.point}`),p:numeric(`curve-${i}-p-${row.dataset.point}`),q:numeric(`curve-${i}-qOut-${row.dataset.point}`)}));
      return {q:numeric(`curve-${i}-q`),points};
    });
  }
  function readPerformance(form,t) {
    const enabled=form.elements.performanceEnabled.checked;
    const values=new FormData(form);
    const sim = { ...M.clone(t.simulation || {}), enabled, waitForStateIds: values.getAll("waitForStateIds"),
      qInput:{stateIds:values.getAll("qStateIds"),mode:form.elements.qualityMode.value},
      cancelOnStateIds:values.getAll("cancelOnStateIds") };
    if(form.elements.qualityRetention.value!=="")sim.qualityRetention=Number(form.elements.qualityRetention.value);else delete sim.qualityRetention;
    if (enabled) {
      const raw=form.elements.performanceQ.value;
      delete sim.q;
      sim.performanceModel={type:"cdf",qualityInput:"q",curves:readCurves(form)};
    } else if (t.simulation?.performanceModel) {
      // Turning CDF off keeps the last saved valid model for later reactivation.
      delete sim.q;
      sim.performanceModel=M.clone(t.simulation.performanceModel);
    }
    P.validateTask(sim,t.label);
    return sim;
  }
  function chart(points,label,timeUnit,deadline,band) {
    const max=Math.max(1e-9,points.at(-1).t,deadline??0,band?.maxTime??0), x=t=>50+t/max*520, y=p=>190-p*155;
    if(points.at(-1).t<max) points=[...points,{t:max,p:points.at(-1).p}];
    const path=points.map((p,i)=>`${i?"L":"M"}${x(p.t)},${y(p.p)}`).join(" ");
    const bound=line=>line.map((p,i)=>`${i?"L":"M"}${x(p.t)},${y(p.p)}`).join(" ");
    const area=band ? bound(band.upper)+" "+[...band.lower].reverse().map(p=>`L${x(p.t)},${y(p.p)}`).join(" ")+" Z" : "";
    return `<svg class="simulation-chart" viewBox="0 0 610 235" role="img" aria-label="${esc(label)}"><title>${esc(label)}</title>
      ${[0,.25,.5,.75,1].map(p=>`<path d="M50 ${y(p)} H570" stroke="#dce5e7"/><text x="43" y="${y(p)+4}" text-anchor="end">${p*100}%</text>`).join("")}
      ${band?`<path class="cdf-band" data-min-q="${band.minQ}" data-max-q="${band.maxQ}" d="${area}" fill="#cce7e4" fill-opacity=".6"/>
      <path class="cdf-bound cdf-upper" d="${bound(band.upper)}" fill="none" stroke="#79aaa5" stroke-width="1"/>
      <path class="cdf-bound cdf-lower" d="${bound(band.lower)}" fill="none" stroke="#79aaa5" stroke-width="1"/>`:""}
      <path d="M50 35 V190 H570" fill="none" stroke="#73858b"/><path class="${band?"cdf-current":"cdf-line"}" d="${path}" fill="none" stroke="#087f80" stroke-width="2.5"/>
      ${deadline==null?"":`<path d="M${x(deadline)} 35 V190" stroke="#c24e50" stroke-dasharray="5 4"/><text x="${x(deadline)}" y="25" text-anchor="middle">期限 ${fmt(deadline)}</text>`}
      ${[0,.25,.5,.75,1].map(f=>`<text x="${x(max*f)}" y="209" text-anchor="middle">${fmt(max*f)}</text>`).join("")}
      <text x="310" y="231" text-anchor="middle">時間 (${esc(timeUnit)})</text></svg>`;
  }
  function performanceChart(model,q,timeUnit,inherit=false) {
    const band=P.envelope(model),range=band.minQ===band.maxQ ? `q=${fmt(band.minQ)}のみ` : `q=${fmt(band.minQ)}〜${fmt(band.maxQ)}`;
    return `<div class="cdf-chart-legend"><span><i class="cdf-band-swatch"></i>${range}${band.minQ===band.maxQ?"（幅は未定義）":"の変化幅"}</span><span><i class="cdf-line-swatch"></i>表示q=${fmt(q)}</span></div>
      ${chart(P.distribution(model,q),`CDF · ${range} · 表示q=${q}`,timeUnit,null,band)}
      <p class="cdf-chart-note">${band.minQ===band.maxQ?"幅を表示するには別のqの曲線を追加します。":"帯はqによるCDFの上下限です。"}${inherit?" 表示qは基準値です。実行時は上流のqを引き継ぎます。":""}</p>`;
  }
  function hoverPreview({surface,getDocument,canShow=()=>true}) {
    const popup=document.createElement("div");popup.id="cdf-hover";popup.className="cdf-popover";
    popup.hidden=true;popup.setAttribute("role","tooltip");document.body.appendChild(popup);
    let current=null,timer=null,focusTimer=null,point=null,titles=[],describedBy=null;
    const eligible=target=>target?.closest?.(".edge.task,.edge.causal,.task-label,.causal-label");
    function hide() {
      clearTimeout(timer);timer=null;popup.hidden=true;
      clearTimeout(focusTimer);focusTimer=null;
      for(const [node,text] of titles)node.textContent=text;
      if(current) {if(describedBy===null)current.removeAttribute("aria-describedby");else current.setAttribute("aria-describedby",describedBy);}
      current=null;point=null;titles=[];describedBy=null;
    }
    function position() {
      if(!point || popup.hidden)return;
      const rect=popup.getBoundingClientRect(),width=rect.width || Math.min(360,window.innerWidth-24),height=rect.height || 280;
      let left=point.x+18,top=point.y+16;
      if(left+width>window.innerWidth-12)left=point.x-width-18;
      if(top+height>window.innerHeight-12)top=point.y-height-16;
      popup.style.left=Math.max(12,Math.min(left,window.innerWidth-width-12))+"px";
      popup.style.top=Math.max(12,Math.min(top,window.innerHeight-height-12))+"px";
    }
    function show() {
      if(!current?.isConnected || !canShow()) {hide();return;}
      const d=getDocument(),type=current.dataset.type,id=current.dataset.id,item=M.get(d,type,id);
      const sim=type==="task" ? item?.simulation : type==="causalLink" ? (item?.propagation?.performanceModel ? {enabled:true,performanceModel:item.propagation.performanceModel} : null) : null;
      if(!sim?.enabled || !sim.performanceModel) {hide();return;}
      const inherit=type==="causalLink" ? sim.q===undefined : item.simulation.q===undefined;
      try {
        P.validateTask(sim);
        popup.innerHTML=`<strong class="cdf-popover-title">${esc(item.label)}</strong><span class="cdf-popover-context">${type==="task"?"Task開始から達成まで":"作用の発生から到着まで"}のCDF</span>${performanceChart(sim.performanceModel,sim.q??1,unit(d),inherit)}`;
        popup.dataset.type=type;popup.dataset.id=id;popup.hidden=false;position();
      } catch(e) {hide();}
    }
    function enter(e,focus=false) {
      const el=eligible(e.target);
      if(e.pointerType==="touch" || e.buttons || !el || !canShow()) {hide();return;}
      const item=M.get(getDocument(),el.dataset.type,el.dataset.id),sim=el.dataset.type==="task" ? item?.simulation : el.dataset.type==="causalLink" && item?.propagation?.performanceModel ? {enabled:true,performanceModel:item.propagation.performanceModel} : null;
      if(!sim?.enabled || !sim.performanceModel) {hide();return;}
      if(focus){const rect=el.getBoundingClientRect();point={x:rect.right,y:rect.bottom};}
      else point={x:e.clientX,y:e.clientY};
      if(current===el){position();return;}
      const nextPoint=point;hide();current=el;point=nextPoint;
      describedBy=el.getAttribute("aria-describedby");
      el.setAttribute("aria-describedby",[describedBy,popup.id].filter(Boolean).join(" "));
      // Avoid a native SVG title appearing on top of the graph. Restore on exit.
      titles=[...el.querySelectorAll("title")].map(node=>[node,node.textContent]);
      for(const [node] of titles)node.textContent="";
      if(focus)show();else timer=setTimeout(show,240);
    }
    surface.addEventListener("pointerover",e=>enter(e));
    surface.addEventListener("pointermove",e=>enter(e));
    surface.addEventListener("pointerout",e=>{if(!current?.contains(e.relatedTarget))hide();});
    surface.addEventListener("pointerleave",hide);
    surface.addEventListener("focusin",e=>{
      hide();
      // Focus can scroll the SVG into view. Show after that initial scroll settles.
      focusTimer=setTimeout(()=>{focusTimer=null;enter(e,true);},40);
    });
    surface.addEventListener("focusout",hide);
    document.addEventListener("pointerdown",hide,true);
    document.addEventListener("keydown",e=>{if(e.key==="Escape")hide();});
    document.addEventListener("scroll",()=>{if(focusTimer===null)hide();},true);
    document.addEventListener("wheel",hide,{passive:true});
    window.addEventListener("resize",hide);window.addEventListener("blur",hide);
    return {hide};
  }
  function bindPerformance(form,d,options={}) {
    const holder=form.querySelector("#cdf-curves"), preview=form.querySelector("#cdf-preview"), error=form.querySelector("#cdf-preview-error");
    form._cdfAbort?.abort();const abort=new AbortController();form._cdfAbort=abort;
    if(form.elements.performanceType){form.elements.performanceType.onchange=()=>{form.elements.performanceEnabled.checked=form.elements.performanceType.value==='cdf';update();};form.elements.performanceEnabled.addEventListener('change',()=>{form.elements.performanceType.value=form.elements.performanceEnabled.checked?'cdf':'fixed';},{signal:abort.signal});}
    form.closest('dialog')?.addEventListener('close',()=>abort.abort(),{once:true,signal:abort.signal});
    const tools=document.createElement('div');tools.className='cdf-edit-tools';
    tools.innerHTML='<label>ひな型 <select data-cdf-preset><option value="baseline">基準時間から仮設定</option><option value="certain">基準時間までに100%達成（線形CDF）</option></select></label><button type="button" data-cdf-apply>ひな型を適用</button><button type="button" data-cdf-quality>低品質・高品質を設定</button><label>既存CDF <select data-cdf-copy><option value="">選択してください</option></select></label><button type="button" data-cdf-copy-apply>複製</button><p class="muted">ひな型の確率・保持率は仮置きです。計測値・推定値・仮置きの区別と根拠は備考に記録してください。</p>';
    holder.before(tools);
    const sources=[...d.tasks.filter(t=>t.simulation?.performanceModel).map(t=>({key:'task:'+t.id,label:root.MEAuthoring.label(d,'task',t.id),model:t.simulation.performanceModel})),...d.causalLinks.filter(c=>c.propagation.performanceModel).map(c=>({key:'causalLink:'+c.id,label:c.label,model:c.propagation.performanceModel}))];
    for(const s of sources){const opt=document.createElement('option');opt.value=s.key;opt.textContent=s.label;tools.querySelector('[data-cdf-copy]').append(opt);}
    const qInput=form.elements[options.qName||'performanceQ'],slider=document.createElement('input');slider.type='range';slider.min=0;slider.max=1;slider.step=.01;slider.value=qInput.value||1;slider.setAttribute('aria-label','プレビューの入力品質');qInput.after(slider);
    slider.oninput=()=>{qInput.value=slider.value;update();};qInput.addEventListener('input',()=>slider.value=qInput.value,{signal:abort.signal});
    let dragging=null;
    function graphs(curves){holder.querySelectorAll('[data-curve-graph]').forEach(el=>{const i=+el.dataset.curveGraph,c=curves[i],max=dragging?.curve===i?dragging.max:Math.max(1e-9,...c.points.map(p=>Number.isFinite(p.t)?p.t:0))*1.15,x=t=>40+t/max*490,y=p=>170-p*140;
      el.innerHTML=`<svg viewBox="0 0 570 205" data-graph-max="${max}" aria-label="曲線${i+1}を編集"><path d="M40 30 V170 H530" stroke="#84979e" fill="none"/>${[0,.5,1].map(p=>`<text x="33" y="${y(p)+4}" text-anchor="end" font-size="10">${p*100}%</text><path d="M40 ${y(p)} H530" stroke="#dce5e7"/>`).join('')}<path d="${[...(c.points[0].t>0?[{t:0,p:0}]:[]),...c.points,{t:max,p:c.points.at(-1).p}].map((p,j)=>(j?'L':'M')+x(p.t)+','+y(p.p)).join(' ')}" stroke="#087f80" stroke-width="2" fill="none"/>${c.points.map((p,j)=>`<circle data-cdf-handle="${i}:${j}" cx="${x(p.t)}" cy="${y(p.p)}" r="6" fill="white" stroke="#087f80" stroke-width="2" role="button" tabindex="0" aria-label="点${j+1}: ${p.t}以内に${(p.p*100).toFixed(1)}%。矢印キーで変更"><title>${p.t} ${unit(d)}以内に ${(p.p*100).toFixed(1)}%達成。保持率 ${p.q}</title></circle>`).join('')}<text x="40" y="192" font-size="10">0</text><text x="530" y="192" text-anchor="end" font-size="10">${fmt(max)} ${unit(d)}</text></svg>`;});}
    function update() {
      const enabled=options.enabled ? options.enabled() : form.elements.performanceEnabled.checked;
      form.querySelector("#performance-cdf-fields").hidden=!enabled;
      form.querySelector("#performance-cdf-fields").disabled=!enabled;
      const curves=readCurves(form);
      graphs(curves);
      holder.querySelectorAll(".cdf-curve").forEach(el=>{
        const value=1-curves[Number(el.dataset.curve)].points.at(-1).p;
        el.querySelector(".cdf-infinity").textContent="未達確率 P(T=∞)："+pct(Number.isFinite(value)?value:null);
      });
      preview.innerHTML=""; error.textContent="";
      if (!enabled) return;
      try {
        const raw=form.elements[options.qName || "performanceQ"].value;
        const sim={enabled:true,q:raw==="" ? (options.inheritQ ? 1 : NaN) : Number(raw),performanceModel:{type:"cdf",curves:readCurves(form)}};
        P.validateTask(sim);
        preview.innerHTML=performanceChart(sim.performanceModel,sim.q,unit(d),!!options.inheritQ && raw==="");
      } catch(e) { error.textContent=diagnostic(e); }
    }
    function replace(curves) { holder.innerHTML=curveFields(curves); update(); }
    tools.querySelector('[data-cdf-apply]').onclick=()=>{const branches=[...form.elements].filter(el=>/^j\d+$/.test(el.name)).map(el=>+el.value);const duration=options.duration??(form.elements.causalDelay?+form.elements.causalDelay.value:form.elements.end?Math.max(0,+form.elements.end.value-+form.elements.start.value):Math.max(0,...branches)-(+form.elements.start.value));replace(tools.querySelector('[data-cdf-preset]').value==='certain'?[{q:1,points:[{t:duration,p:1,q:1}]}]:durationCurves(duration));};
    tools.querySelector('[data-cdf-quality]').onclick=()=>{const curves=readCurves(form),model=M.clone(curves.at(-1));replace([{...M.clone(model),q:0},{...model,q:1}]);};
    tools.querySelector('[data-cdf-copy-apply]').onclick=()=>{const source=sources.find(s=>s.key===tools.querySelector('[data-cdf-copy]').value);if(source)replace(M.clone(source.model.curves));};
    function movePoint(curve,index,t,p){
      const c=readCurves(form)[curve],prev=c.points[index-1],next=c.points[index+1],scale=Math.max(1e-9,Math.abs(t),Math.abs(prev?.t??0),Math.abs(next?.t??0)),epsilon=Number.EPSILON*scale*16;
      const lo=prev?prev.t+epsilon:0,hi=next?next.t-epsilon:1e9;if(lo>hi)return;
      t=Math.max(lo,Math.min(hi,Number(t.toPrecision(12))));p=Math.max(prev?.p??0,Math.min(next?.p??1,Number(p.toFixed(4))));
      form.elements[`curve-${curve}-t-${index}`].value=t;form.elements[`curve-${curve}-p-${index}`].value=p;update();
    }

    holder.addEventListener('pointerdown',e=>{const h=e.target.closest('[data-cdf-handle]');if(!h)return;const [curve,index]=h.dataset.cdfHandle.split(':').map(Number),svg=h.closest('svg');dragging={curve,index,max:+svg.dataset.graphMax,box:svg.getBoundingClientRect()};e.preventDefault();},{signal:abort.signal});
    root.addEventListener('pointermove',e=>{if(!dragging||!dragging.box.width)return;const {curve,index,max,box}=dragging;movePoint(curve,index,Math.max(0,((e.clientX-box.left)/box.width*570-40)/490*max),Math.max(0,Math.min(1,(170-(e.clientY-box.top)/box.height*205)/140)));},{signal:abort.signal});
    root.addEventListener('pointerup',()=>{if(dragging){dragging=null;update();}},{signal:abort.signal});
    holder.addEventListener('keydown',e=>{const h=e.target.closest('[data-cdf-handle]');if(!h||!e.key.startsWith('Arrow'))return;e.preventDefault();const [curve,index]=h.dataset.cdfHandle.split(':').map(Number),p=readCurves(form)[curve].points[index],step=d.time.snap;movePoint(curve,index,p.t+(e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0),p.p+(e.key==='ArrowUp' ? .01 : e.key==='ArrowDown' ? -.01 : 0));holder.querySelector(`[data-cdf-handle="${curve}:${index}"]`)?.focus();},{signal:abort.signal});
    holder.addEventListener("click",event=>{
      const target=event.target.closest("button"); if (!target) return;
      const curves=readCurves(form);
      if (target.dataset.removeCurve!==undefined) curves.splice(Number(target.dataset.removeCurve),1);
      if (target.dataset.addPoint!==undefined) {
        const points=curves[Number(target.dataset.addPoint)].points, last=points.at(-1);
        if (points.length>=1000) return;
        points.push({t:(Number.isFinite(last.t)?last.t:0)+1,p:Number.isFinite(last.p)?last.p:0,q:Number.isFinite(last.q)?last.q:1});
      }
      if (target.dataset.removePoint!==undefined) {
        const [i,j]=target.dataset.removePoint.split("-").map(Number); curves[i].points.splice(j,1);
      }
      replace(curves);
    });
    form.querySelector("#add-cdf-curve").onclick=()=>{
      const curves=readCurves(form); if(curves.length>=100) return;
      const ws=curves.map(c=>c.q).filter(Number.isFinite).sort((a,b)=>a-b);
      let q=!ws.includes(1)?1:!ws.includes(0)?0:null;
      if (q===null) { let gap=-1; for(let i=1;i<ws.length;i++) if(ws[i]-ws[i-1]>gap) {gap=ws[i]-ws[i-1];q=(ws[i]+ws[i-1])/2;} }
      curves.push({...M.clone(curves.at(-1)),q}); curves.sort((a,b)=>a.q-b.q); replace(curves);
    };
    const section=form.querySelector(options.section || ".simulation-performance");
    if(!options.section){const chooser=document.createElement('details');chooser.className='dependency-chooser';chooser.innerHTML='<summary>図から開始条件・品質入力・中止条件を選ぶ</summary><label>選ぶ条件 <select data-dependency-kind><option value="waitForStateIds">追加開始条件</option><option value="qStateIds">品質入力</option><option value="cancelOnStateIds">中止条件</option></select></label><div class="dependency-map"></div><p class="muted">Stateをクリックして選択・解除します。</p>';section.append(chooser);
      const map=chooser.querySelector('.dependency-map'),kind=chooser.querySelector('select');const draw=()=>{const ids=[...form.querySelectorAll(`[name="${kind.value}"]:checked`)].map(x=>x.value),g=root.MELayout.layout(d,1000,{full:true});map.innerHTML=root.MERender.render(d,g,{selection:ids.map(id=>({type:'state',id}))});};kind.onchange=draw;map.onclick=e=>{const state=e.target.closest('.state[data-id]');if(!state)return;const checkbox=[...form.querySelectorAll(`[name="${kind.value}"]`)].find(x=>x.value===state.dataset.id);if(checkbox){checkbox.checked=!checkbox.checked;checkbox.dispatchEvent(new Event('change',{bubbles:true}));draw();}};chooser.addEventListener('toggle',()=>{if(chooser.open)draw();});}
    section.addEventListener("input",update); section.addEventListener("change",update); update();
  }
  function stateFields(s) {
    return `<details><summary>Simulation / State</summary><p class="muted">初期qは外生Stateだけに使います。到達した結果は品質を保持し、固定値で上書きしません。生成元が複数ならANDはすべて、ORは最初の到達を待ちます。</p>
      <label class="field"><span>初期Stateの品質q（既定1）</span>${input("stateQ",s.simulation?.q??"","State出力q",0,1)}</label>
      <label class="field"><span>複数Task・State到達作用からの合流</span><select name="stateJoin"><option value="all">すべて（AND）</option><option value="any" ${s.simulation?.join==="any"?"selected":""}>いずれか（OR）</option></select></label><div id="join-preview"></div></details>`;
  }
  function bindState(form,d,s){const arrivals=[...d.causalLinks.filter(c=>c.target.type==='state'&&c.target.id===s.id).map(c=>({label:c.label,time:M.causalArrivalTime(d,c)})),...d.tasks.filter(t=>t.toStateId===s.id).map(t=>({label:t.label,time:s.time}))],out=form.querySelector('#join-preview');
    const update=()=>{if(!arrivals.length){out.innerHTML='<p class="muted">初期Stateです。指定した時刻に成立し、初期品質を使用します。</p>';return;}const any=form.elements.stateJoin.value==='any',time=(any?Math.min:Math.max)(...arrivals.map(a=>a.time)),max=Math.max(1e-9,...arrivals.map(a=>a.time)),x=t=>75+t/max*380;
      out.innerHTML=`<p><strong>基準成立時刻 T+${fmt(time)}</strong>（${any?'最初の入力で成立':'全入力を待つ'}）</p><svg viewBox="0 0 500 ${arrivals.length*28+10}" role="img" aria-label="合流の成立時刻">${arrivals.map((a,i)=>`<text x="2" y="${i*28+18}" font-size="10">入力${i+1}</text><path d="M75 ${i*28+14} H${x(time)}" stroke="#84979e" stroke-dasharray="3 3"/><circle cx="${x(a.time)}" cy="${i*28+14}" r="4" fill="${a.time>time?'#aab8bb':'#087f80'}"/><title>${esc(a.label)} T+${a.time}</title>`).join('')}</svg><p class="muted">${any?'成立後の入力は品質を更新しません。成立時点までに届いた入力の最大品質を使います。':'成立時点で全入力の最小品質を使います。'} 対象活動の開始待ちがある場合、その条件も必要です。実際の時刻・品質は試行ごとに変わります。初期品質欄は到達した品質を上書きしません。</p>`;};form.elements.stateJoin.addEventListener('change',update);update();}
  function readState(form,s) {
    const sim={...M.clone(s.simulation || {}),join:form.elements.stateJoin.value};
    if(form.elements.stateQ.value!=="")sim.q=Number(form.elements.stateQ.value);else delete sim.q;
    return sim;
  }
  function junctionFields(t,d) {
    return (t.junctions || []).map((j,i)=>`<details open class="branch-editor" data-branch-index="${i}"><summary>分岐 ${i+1}：結果と実行条件</summary>
      <label class="field"><span>分岐の基準時刻</span>${input('j'+i,j.time,'分岐時刻')}</label>
      <label class="field"><span>実行モード</span><select name="branchMode-${i}"><option value="">未指定（表示のみ・実行時エラー）</option><option value="probability" ${j.simulation?.mode==="probability"?"selected":""}>確率分岐</option><option value="effect" ${j.simulation?.mode==="effect"?"selected":""}>作用線による分岐</option></select></label>
      <p class="muted">確率は分岐点へ到達した条件下の選択確率。残りは通常経路。作用分岐はTask実行中の入力で移り、元の接続先を取り消します。遅延が空欄なら図上の分岐点から結果Stateまでの時間です。</p>
      <div class="branch-table-scroll"><table class="simulation-table branch-table"><thead><tr><th>結果名</th><th>到達State</th><th>選択確率 (0〜1)</th><th>到達までの時間</th></tr></thead><tbody>${j.outcomes.map((o,n)=>`<tr><td><input name="label-${i}-${n}" value="${esc(o.label)}" aria-label="結果名"></td><td><select name="target-${i}-${n}" aria-label="結果State"><option value="">この結果を削除</option>${(d?.states||[]).filter(s=>s.actorId===M.get(d,'state',t.fromStateId).actorId&&s.id!==t.fromStateId).map(s=>`<option value="${esc(s.id)}" ${s.id===o.toStateId?'selected':''}>${esc(root.MEAuthoring.label(d,'state',s.id))}</option>`).join('')}</select></td><td>${input(`branchP-${i}-${n}`,o.probability??"","分岐確率",0,1)}</td><td>${input(`branchDelay-${i}-${n}`,o.delay??"","分岐遅延")}</td></tr>`).join('')}</tbody></table></div><p class="branch-remainder" role="status"></p></details>`).join("");
  }
  function causalFields(d,c) {
    const sim=c.simulation || {},p=c.propagation || {},duration=p.duration ?? 0;
    return `<details class="simulation-causal"><summary>作用線 / 時間・品質</summary>
      <p class="muted">StateからStateまたは分岐点へ接続します。到達は発生時刻＋所要時間、出力qは入力q×品質保持率です。分岐作用の起点Stateは対象Taskの開始を暗黙に待ちます。</p>
      <label class="field"><span>基準伝搬時間</span>${input("causalDelay",duration,"伝搬時間")}</label>
      <label class="field"><span>伝搬モデル</span><select name="causalPropagationType"><option value="fixed">固定（FIX）</option><option value="cdf" ${p.performanceModel?"selected":""}>CDF</option></select></label>
      <label class="field"><span>固定時間での品質保持率</span>${input("causalRetention",p.qualityRetention ?? 1,"品質保持率",0,1)}</label>
      <fieldset id="performance-cdf-fields"><label class="field"><span>プレビュー用入力q</span>${input("causalPreviewQ",1,"入力q",0,1)}</label>
      <div id="cdf-curves">${curveFields(p.performanceModel?.curves || durationCurves(duration))}</div>
      <button type="button" id="add-cdf-curve">＋ 入力qの曲線</button><div id="cdf-preview"></div><p id="cdf-preview-error" role="status"></p></fieldset>
      <label class="simulation-check"><input type="checkbox" name="causalEnabled" ${sim.enabled?"checked":""}>実行する作用（OFFなら説明用）</label>
      <fieldset id="causal-branch-fields"><label class="field"><span>分岐結果</span><select name="causalOutcome"></select></label>
      <label class="simulation-check"><input type="checkbox" name="stopTargetActor" ${sim.stopTargetActor?"checked":""}>分岐後、対象Actorの他Taskを中止する</label></fieldset></details>`;
  }
  function bindCausal(form,d,c) {
    function update(){
      const selected=form.elements.causalOutcome.value,raw=form.elements.target.value;
      const i=raw.indexOf(":"),id=raw.slice(i+1),j=raw.startsWith("junction:")?M.get(d,"junction",id):null;
      form.elements.causalOutcome.innerHTML=(j?.outcomes || []).map(o=>`<option value="${esc(o.toStateId)}">${esc(o.label)} → ${esc(M.get(d,"state",o.toStateId).name)}</option>`).join("");
      if(j?.outcomes.some(o=>o.toStateId===(selected || c.target.outcomeStateId)))form.elements.causalOutcome.value=selected || c.target.outcomeStateId;
      form.querySelector("#causal-branch-fields").hidden=!j;form.querySelector("#causal-branch-fields").disabled=!j;
    }
    form.elements.target.addEventListener("change",update);update();
    bindPerformance(form,d,{enabled:()=>form.elements.causalPropagationType.value==="cdf",qName:"causalPreviewQ",inheritQ:true,section:".simulation-causal"});
  }
  function readCausal(form,c) {
    const propagation={duration:Number(form.elements.causalDelay.value),qualityRetention:Number(form.elements.causalRetention.value)};
    if(form.elements.causalPropagationType.value==="cdf"){
      propagation.performanceModel={type:"cdf",qualityInput:"q",curves:readCurves(form)};
      try { P.validateTask({enabled:true,performanceModel:propagation.performanceModel},"作用線のCDF"); }
      catch(e) {e.validationPath="$.causalLinks";e.validationFragment={...c,propagation};throw e;}
    }
    const simulation={enabled:form.elements.causalEnabled.checked};
    if(form.elements.target.value.startsWith("junction:"))simulation.stopTargetActor=form.elements.stopTargetActor.checked;
    return {propagation,simulation};
  }
  function settingsFields(d) {
    const sim=d.simulation || {};
    return `<p class="muted">成功条件は選んだStateすべてへの到達（AND）、またはいずれかへの到達（OR）です。期限はMission開始からの時刻で、空欄なら期限なし。時間単位：${unit(d)}。</p>
      <label class="field"><span>成功条件の組み合わせ</span><select name="successMode"><option value="all" ${sim.successMode!=="any"?"selected":""}>すべてに到達（AND）</option><option value="any" ${sim.successMode==="any"?"selected":""}>いずれかに到達（OR）</option></select></label>
      ${stateChoices(d,sim.successStateIds || [],"successStateIds")}
      <label class="field"><span>Mission期限（任意）</span>${input("deadline",sim.deadline??"","Mission期限")}</label>
      <div class="field-row"><label class="field"><span>試行数</span>${input("iterations",sim.iterations??1000,"試行数",1,100000)}</label>
      <label class="field"><span>Seed（再現用）</span>${input("seed",sim.seed??1,"Seed",0,4294967295)}</label></div>`;
  }
  function readSettings(form) {
    const values=new FormData(form);
    const numeric = name => values.get(name)==="" ? NaN : Number(values.get(name));
    return {successStateIds:values.getAll("successStateIds"),successMode:values.get("successMode"),deadline:values.get("deadline")===""?null:numeric("deadline"),iterations:numeric("iterations"),seed:numeric("seed")};
  }
  function resultHTML(r) {
    return `<div class="simulation-metrics">
      <div><span>Mission成功率</span><strong>${pct(r.successProbability)}</strong><small>95%区間 ${pct(r.successInterval95.low)}〜${pct(r.successInterval95.high)}</small></div>
      <div><span>成功条件の到達率</span><strong>${pct(r.reachProbability)}</strong><small>期限超過も到達に含む</small></div>
      <div><span>完了時間 P50 / P90</span><strong>${fmt(r.completion.p50)} / ${fmt(r.completion.p90)}</strong><small>到達した試行のみ・${esc(r.unit)}</small></div></div>
      <h3>Mission完了の累積確率</h3><p class="muted">縦軸は全試行を分母にした「この時刻までに成功条件（${r.config.successMode==="any"?"OR・いずれかへの到達":"AND・すべてへの到達"}）が成立する確率」。未達試行の確率は残ります。</p>
      ${chart(r.cdf,"Mission完了時間の累積確率",{seconds:"秒",minutes:"分",hours:"時間"}[r.unit],r.config.deadline)}
      <h3>Task別の時間・Criticality</h3><p class="muted">CIは完了時間を決めたTaskの試行数 ÷ 全試行数。未達試行ではCritical Pathを定義しません。成功時CIは期限内成功を分母にします。同率の経路はすべて数えます。</p>
      <div class="simulation-table-scroll"><table class="simulation-table"><thead><tr><th>Task</th><th>開始 P50 / P90</th><th>終了 P50 / P90</th><th>追加依存待ち P50 / P90</th><th>未達 / 開始不能</th><th>分岐 / 中止</th><th>入力q P50 / P90</th><th>CI / 成功時CI</th></tr></thead><tbody>
      ${r.tasks.map(t=>`<tr><td>${esc(t.label)}</td><td>${fmt(t.start.p50)} / ${fmt(t.start.p90)}</td><td>${fmt(t.end.p50)} / ${fmt(t.end.p90)}</td><td>${fmt(t.wait.p50)} / ${fmt(t.wait.p90)}</td><td>${t.failed} / ${t.blocked}</td><td>${t.branched} / ${t.cancelled}</td><td>${fmt(t.q.p50)} / ${fmt(t.q.p90)}</td><td>${pct(t.criticality)} / ${pct(t.criticalityGivenSuccess)}</td></tr>`).join("")}</tbody></table></div>
      ${r.signals.length?`<h3>作用線の伝搬時間・適用状況</h3><p class="muted">伝搬時間は到着した作用（未適用も含む）の分布。未達はT=∞、未発生は出力元が作用を発生できなかった試行です。CIはMission完了を決めた因果経路に含まれた割合です。</p><div class="simulation-table-scroll"><table class="simulation-table"><thead><tr><th>作用線</th><th>伝搬時間 P50 / P90</th><th>CI / 成功時CI</th><th>適用</th><th>到着済み・未適用</th><th>未達 / 未発生</th></tr></thead><tbody>${r.signals.map(l=>`<tr><td>${esc(l.label)} · ${l.propagation==="cdf"?"CDF":"FIX"}</td><td>${fmt(l.delay.p50)} / ${fmt(l.delay.p90)}</td><td>${pct(l.criticality)} / ${pct(l.criticalityGivenSuccess)}</td><td>${l.accepted}</td><td>${l.late}</td><td>${l.failed} / ${l.unavailable}</td></tr>`).join("")}</tbody></table></div>`:""}
      <details><summary>第1試行の分岐・到達履歴</summary><p class="muted">代表値ではありません。結果JSONにはTask時刻・q・中止理由の状態区分も記録します。</p><ul>${r.trace.states.map(s=>`<li>${esc(s.id)} · ${fmt(s.time)}</li>`).join("")}</ul></details>
      <p class="muted">開始・待ち時間は開始できた試行、終了時刻は完了した試行の分布です。待ち時間は接続元State到達から追加依存がそろうまで。時間単位：${esc(r.unit)}。図上の時刻は変更しません。試行数 ${r.iterations.toLocaleString()} / Seed ${r.config.seed}。</p>`;
  }
  function sensitivityHTML(r,d) {
    const labels={bracketed:`要求を満たす上限の推定区間：${fmt(r.requirement.maxPassingValue)}〜${fmt(r.requirement.firstFailingValue)}（左端は達成、右端は未達）`,"all-tested-pass":`評価範囲の全点で要求達成。真の上限は未特定（最大評価値 ${fmt(r.requirement.maxPassingValue)}）`,"no-passing-sample":"評価範囲内に要求を満たす点がありません。範囲外の達成可否は未評価。",nonmonotone:"非単調な結果です。「この値以下なら達成」という上限は導出できません。"};
    if(r.config.parameter==="q"){labels.bracketed=`要求を満たす品質下限の推定区間：${fmt(r.requirement.lastFailingValue)}〜${fmt(r.requirement.minPassingValue)}（左端は未達、右端は達成）`;labels["all-tested-pass"]="評価範囲の全点で要求達成。範囲外の品質下限は未評価。";labels.nonmonotone="非単調な結果です。品質下限は導出できません。";}
    const axis=r.config.parameter==="duration"?`Task完了時間 (${unit(d)})`:"入力品質 q";
    return `<h3>${esc(M.get(d,"task",r.config.taskId).label)}の感度と要求</h3>
      <p>基準成功率 ${pct(r.baseline.successProbability)} / 要求 ${pct(r.config.targetProbability)} / 成功率不足 ${pct(r.probabilityGap)}</p>
      <p><strong>${esc(labels[r.requirement.status])}</strong><br>${esc(axis)} · ${r.config.criterion==="lower95"?"95%区間下限":"推定値"}で判定</p>
      ${chart(r.points.map(p=>({t:p.value,p:p.probability})),"Task性能とMission成功率",axis).replace(`時間 (${esc(axis)})`,esc(axis))}
      <div class="simulation-table-scroll"><table class="simulation-table"><thead><tr><th>${esc(axis)}</th><th>Mission成功率</th><th>95%区間</th><th>要求達成</th></tr></thead><tbody>${r.points.map(p=>`<tr><td>${fmt(p.value)}</td><td>${pct(p.probability)}</td><td>${pct(p.interval95.low)}〜${pct(p.interval95.high)}</td><td>${(r.config.criterion==="lower95"?p.interval95.low:p.probability)>=r.config.targetProbability?"達成":"未達"}</td></tr>`).join("")}</tbody></table></div>
      <p class="muted">${esc(r.interpretation)} ${esc(r.scope)} グラフの線は評価点を結んだ表示です。評価点間の確率を保証しません。達成した評価点の範囲：${r.requirement.ranges.length?r.requirement.ranges.map(x=>`${fmt(x.min)}〜${fmt(x.max)}`).join("、"):"なし"}。各点 ${r.config.iterations.toLocaleString()}試行 / Seed ${r.config.seed}。</p>`;
  }
  function controller({getDocument,configure,loadDemo,download,onOverlayChange=()=>{}}) {
    const dialog=document.querySelector("#simulation-dialog"), setup=document.querySelector("#simulation-setup"), output=document.querySelector("#simulation-results"), error=document.querySelector("#simulation-error"), progress=document.querySelector("#simulation-progress"), runButton=document.querySelector("#simulation-run"), exportButton=document.querySelector("#simulation-export");
    const analysisForm=document.querySelector("#sensitivity-form"), analysisOutput=document.querySelector("#sensitivity-results"),analysisError=document.querySelector("#sensitivity-error"),analysisProgress=document.querySelector("#sensitivity-progress"),analysisRun=document.querySelector("#sensitivity-run"),analysisExport=document.querySelector("#sensitivity-export");
    const overlayToggle=document.querySelector("#simulation-overlay-toggle"),applyButton=document.querySelector("#simulation-apply");
    let token=0, result=null, snapshot=null, signature=null, running=false,analysisToken=0,analysisResult=null,analysisSnapshot=null,overlayVisible=false;
    let previousRun=null;
    const history=document.createElement('section');history.id='simulation-history';output.after(history);
    function remember(){if(result)previousRun={result:M.clone(result),snapshot:M.clone(snapshot)};}
    function drawHistory(){history.innerHTML=previousRun?`<details class="analysis-history"><summary>変更前の成功率 ${pct(previousRun.result.successProbability)}${result?` → 現在 ${pct(result.successProbability)}`:''}</summary><p>旧設定の結果です。現在の図へは適用しません。</p><button type="button" id="simulation-previous-export">変更前の結果JSON保存</button>${resultHTML(previousRun.result)}</details>`:'';const b=history.querySelector('button');if(b)b.onclick=()=>download(new Blob([JSON.stringify({mission:previousRun.snapshot,result:previousRun.result},null,2)],{type:'application/json'}),'mission-simulation-previous.json');}
    function syncOverlay() {
      overlayToggle.disabled=applyButton.disabled=!result;
      overlayToggle.setAttribute("aria-pressed",String(overlayVisible));
      overlayToggle.textContent=overlayVisible?"結果表示 ON":"結果表示";
      overlayToggle.title=result?"全試行を分母に線幅と割合を表示／解除":"Monte Carlo実行後に結果を図へ反映できます";
    }
    function showOverlay(value) {
      invalidate();overlayVisible=!!value && !!result;syncOverlay();onOverlayChange();
    }
    overlayToggle.onclick=()=>showOverlay(!overlayVisible);
    applyButton.onclick=()=>{showOverlay(true);dialog.close();};
    syncOverlay();
    function stopAnalysis(){analysisToken++;analysisRun.disabled=false;document.querySelector("#sensitivity-stop").hidden=true;}
    const fingerprint=d=>root.MEAuthoring.fingerprint(d);
    function stop() { stopAnalysis(); token++; running=false; runButton.disabled=false; document.querySelector("#simulation-stop").hidden=true; }
    function setupHTML() {
      const d=getDocument(), sim=d.simulation;
      setup.innerHTML=`<p class="muted">外部解析で得たTask性能・作用線の伝搬時間をMission Threadへ伝播させます。各Taskを1回実行し、初期Stateの時刻から依存関係で進みます。TaskとState到達作用の同一Stateへの合流はState設定でAND/ORを指定します。作用分岐・State到達と品質伝搬は実行指定した作用線だけを使います。</p>
        <p><strong>成功条件：</strong>${sim?.successStateIds.length?sim.successStateIds.map(sid=>esc(M.get(d,"state",sid).name)).join(sim.successMode==="any"?" OR ":" AND "):"未設定"}<br>期限：${sim?.deadline==null?"なし":fmt(sim.deadline)+" "+unit(d)} / 試行数：${sim?.iterations??1000} / Seed：${sim?.seed??1}</p>`;
      const selected=analysisForm.elements.taskId.value;
      analysisForm.elements.taskId.innerHTML=d.tasks.map(t=>`<option value="${esc(t.id)}">${esc(t.label)}</option>`).join("");
      if(d.tasks.some(t=>t.id===selected))analysisForm.elements.taskId.value=selected;
      try { const c=S.compile(d); error.textContent=c.warnings.join("\n"); }
      catch(e) { error.textContent=diagnostic(e); }
    }
    function invalidate() {
      const next=fingerprint(getDocument());
      if (signature!==null && signature!==next) {
        remember();
        stop(); result=null; snapshot=null; exportButton.disabled=true; overlayVisible=false;syncOverlay(); analysisResult=null;analysisSnapshot=null;analysisExport.disabled=true;analysisOutput.innerHTML="";analysisProgress.textContent="文書が変わりました。再実行してください。";
        output.innerHTML=""; progress.textContent="文書が変わりました。再実行してください。";
        drawHistory();
        if(dialog.open) setupHTML();
      }
      signature=next;
    }
    function open() { invalidate(); setupHTML(); dialog.showModal(); }
    function cancel() { if(running) progress.textContent="実行を中断しました。"; if(analysisRun.disabled)analysisProgress.textContent="分析を中断しました。"; stop(); }
    document.querySelector("#simulation-close").onclick=()=>{cancel();dialog.close();};
    dialog.addEventListener("cancel",cancel); dialog.addEventListener("close",cancel);
    document.querySelector("#simulation-configure").onclick=()=>{stop();dialog.close();configure();};
    document.querySelector("#simulation-demo").onclick=()=>{stop();dialog.close();loadDemo();};
    document.querySelector("#simulation-stop").onclick=()=>{stop();progress.textContent="実行を中断しました。";};
    runButton.onclick=()=>{
      remember();stop(); result=null; output.innerHTML=""; exportButton.disabled=true; snapshot=getDocument(); signature=fingerprint(snapshot);drawHistory();
      overlayVisible=false;syncOverlay();onOverlayChange();
      let job;
      try { job=S.createRun(snapshot); error.textContent=job.compiled.warnings.join("\n"); }
      catch(e) { error.textContent=diagnostic(e); return; }
      running=true; runButton.disabled=true; document.querySelector("#simulation-stop").hidden=false;
      const current=++token, batch=Math.max(1,Math.min(128,Math.floor(20000/job.compiled.order.length)||1));
      progress.textContent="実行中…";
      function tick() {
        if(current!==token || !running) return;
        try {
          const status=job.step(batch); progress.textContent=`${status.completed.toLocaleString()} / ${status.total.toLocaleString()} 試行`;
          if(!status.done) {setTimeout(tick,0);return;}
          result=job.result(); stop(); output.innerHTML=resultHTML(result); exportButton.disabled=false;syncOverlay();drawHistory();
        } catch(e) {stop();error.textContent=diagnostic(e);}
      }
      setTimeout(tick,0);
    };
    exportButton.onclick=()=>{
      if(result && signature===fingerprint(getDocument())) download(new Blob([JSON.stringify({mission:snapshot,result},null,2)],{type:"application/json"}),"mission-simulation.json");
    };
    analysisForm.elements.parameter.onchange=()=>{
      const q=analysisForm.elements.parameter.value==="q";
      analysisForm.elements.minimum.value=0;analysisForm.elements.maximum.value=q?1:60;
      analysisForm.elements.maximum.max=q?1:1e9;analysisForm.elements.minimum.max=q?1:1e9;
    };
    document.querySelector("#sensitivity-stop").onclick=()=>{stopAnalysis();analysisProgress.textContent="分析を中断しました。";};
    analysisForm.onsubmit=event=>{
      event.preventDefault(); stop();analysisResult=null;analysisExport.disabled=true;analysisOutput.innerHTML="";analysisError.textContent="";
      const f=analysisForm.elements,min=Number(f.minimum.value),max=Number(f.maximum.value),steps=Number(f.steps.value);
      let job;
      try {
        if(!Number.isInteger(steps)||steps<2||steps>25||max<=min)throw new Error("最小値より大きい最大値と、2〜25の整数の評価点数を指定してください。");
        analysisSnapshot=getDocument();signature=fingerprint(analysisSnapshot);
        job=root.MESensitivity.createSensitivity(analysisSnapshot,{taskId:f.taskId.value,parameter:f.parameter.value,values:Array.from({length:steps},(_,i)=>min+(max-min)*i/(steps-1)),iterations:Number(f.iterations.value),seed:analysisSnapshot.simulation?.seed??1,targetProbability:Number(f.targetProbability.value),criterion:f.criterion.value});
      }catch(e){analysisError.textContent=e.message;return;}
      analysisRun.disabled=true;document.querySelector("#sensitivity-stop").hidden=false;const current=++analysisToken;
      function tick(){
        if(current!==analysisToken)return;
        try { const status=job.step(32);analysisProgress.textContent=`${status.completed.toLocaleString()} / 最大 ${status.total.toLocaleString()} 試行`;
          if(!status.done){setTimeout(tick,0);return;}
          analysisResult=job.result();stopAnalysis();analysisOutput.innerHTML=sensitivityHTML(analysisResult,analysisSnapshot);analysisExport.disabled=false;
        }catch(e){stopAnalysis();analysisError.textContent=e.message;}
      }
      setTimeout(tick,0);
    };
    analysisExport.onclick=()=>{if(analysisResult && signature===fingerprint(getDocument()))download(new Blob([JSON.stringify({mission:analysisSnapshot,sensitivity:analysisResult},null,2)],{type:"application/json"}),"mission-sensitivity.json");};
    return {open,invalidate,getOverlayResult:()=>overlayVisible?result:null};
  }
  root.MESimulationUI={performanceFields,readPerformance,bindPerformance,hoverPreview,stateFields,bindState,readState,junctionFields,causalFields,bindCausal,readCausal,settingsFields,readSettings,controller};
})(globalThis);
