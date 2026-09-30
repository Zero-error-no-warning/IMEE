(function (root) {
  "use strict";
  const M = root.ME, P = root.MEPerformance, S = root.MESimulation, esc = root.MERender.esc;
  const unit = d => ({ seconds: "秒", minutes: "分", hours: "時間" })[d.time.unit];
  const fmt = n => n == null ? "—" : Number(n.toFixed(3)).toLocaleString("ja-JP");
  const pct = n => n == null ? "—" : (n*100).toFixed(1)+"%";
  const input = (name, value, label, min=0, max=1e9) => `<input type="number" step="any" min="${min}" max="${max}" name="${name}" value="${esc(String(value))}" aria-label="${esc(label)}">`;
  function stateChoices(d, checked, name, exclude) {
    return `<div class="simulation-state-list">${d.states.filter(s=>s.id!==exclude).map(s=>
      `<label><input type="checkbox" name="${name}" value="${esc(s.id)}" ${checked.includes(s.id)?"checked":""}>${esc(M.get(d,"actor",s.actorId).name)} / ${esc(s.name)}</label>`).join("")}</div>`;
  }
  function defaultCurves(d,t) {
    const duration = M.taskWindow(d,t).end-M.taskWindow(d,t).start;
    return [{ w:0, points: duration ? [{t:duration/2,p:.2},{t:duration,p:.8},{t:duration*1.5,p:.95}] : [{t:0,p:1}], pInfinity:duration ? .05 : 0 }];
  }
  function curveFields(curves) {
    return curves.map((c,i)=>`<fieldset class="cdf-curve" data-curve="${i}"><legend>曲線 ${i+1}</legend>
      <div class="cdf-curve-heading"><label>w ${input(`curve-${i}-w`,c.w,"曲線の劣化度w",0,1)}</label><button type="button" data-remove-curve="${i}" ${curves.length===1?"disabled":""}>曲線を削除</button></div>
      <table class="simulation-table"><thead><tr><th>時間 t</th><th>累積確率 F(t) · 0〜1</th><th></th></tr></thead><tbody>
      ${c.points.map((p,j)=>`<tr data-point="${j}"><td>${input(`curve-${i}-t-${j}`,p.t,"時間t")}</td><td>${input(`curve-${i}-p-${j}`,p.p,"累積確率",0,1)}</td><td><button type="button" data-remove-point="${i}-${j}" ${c.points.length===1?"disabled":""} aria-label="点を削除">×</button></td></tr>`).join("")}</tbody></table>
      <button type="button" data-add-point="${i}">＋ 点</button><p class="muted cdf-infinity"></p></fieldset>`).join("");
  }
  function performanceFields(d,t) {
    return `<details class="simulation-performance"><summary>Simulation / Performance${t.simulation?.enabled?" · CDF有効":""}</summary>
      <p class="muted">CDFを有効にするとTaskの時間を抽選します。無効時は図上の所要時間を使います。時間単位：${unit(d)}。Taskは1回実行し、未達なら後続は実行できません。</p>
      <label class="simulation-check"><input type="checkbox" name="performanceEnabled" ${t.simulation?.enabled?"checked":""}>CDFを有効にする</label>
      <fieldset id="performance-cdf-fields"><label class="field"><span>固定の性能劣化度 w（0〜1）</span>${input("performanceW",t.simulation?.w??0,"性能劣化度",0,1)}</label>
      <p class="muted">時間方向・曲線間は線形補間します。最終点以降は一定で、1 − 最終確率が未達確率です。</p>
      <div id="cdf-curves">${curveFields(t.simulation?.performanceModel?.curves || defaultCurves(d,t))}</div>
      <button type="button" id="add-cdf-curve">＋ wの曲線</button><div id="cdf-preview"></div><p id="cdf-preview-error" role="status"></p></fieldset>
      <details><summary>追加依存State（すべてへの到達を待つ）</summary><p class="muted">接続元Stateに加えて、ここで選んだStateを待ちます。Actor間の実行依存も指定できます。作用線からは自動設定しません。</p>
      ${stateChoices(d,t.simulation?.waitForStateIds || [],"waitForStateIds",t.fromStateId)}</details></details>`;
  }
  function readCurves(form) {
    return [...form.querySelectorAll("[data-curve]")].map(el=>{
      const i=el.dataset.curve;
      const numeric = name => { const raw=form.elements.namedItem(name).value; return raw==="" ? NaN : Number(raw); };
      const points=[...el.querySelectorAll("[data-point]")].map(row=>({t:numeric(`curve-${i}-t-${row.dataset.point}`),p:numeric(`curve-${i}-p-${row.dataset.point}`)}));
      return {w:numeric(`curve-${i}-w`),points,pInfinity:1-points.at(-1).p};
    });
  }
  function readPerformance(form,t) {
    const enabled=form.elements.performanceEnabled.checked;
    const sim = { enabled, waitForStateIds: new FormData(form).getAll("waitForStateIds") };
    if (enabled) {
      const raw=form.elements.performanceW.value;
      sim.w=raw==="" ? NaN : Number(raw);
      sim.performanceModel={type:"cdf",degradationInput:"w",curves:readCurves(form)};
    } else if (t.simulation?.performanceModel) {
      // Turning CDF off keeps the last saved valid model for later reactivation.
      sim.w=t.simulation.w??0;
      sim.performanceModel=M.clone(t.simulation.performanceModel);
    }
    P.validateTask(sim,t.label);
    return sim;
  }
  function chart(points,label,timeUnit,deadline) {
    const max=Math.max(1,...points.map(p=>p.t),deadline??0), x=t=>50+t/max*520, y=p=>190-p*155;
    if(points.at(-1).t<max) points=[...points,{t:max,p:points.at(-1).p}];
    const path=points.map((p,i)=>`${i?"L":"M"}${x(p.t)},${y(p.p)}`).join(" ");
    return `<svg class="simulation-chart" viewBox="0 0 610 235" role="img" aria-label="${esc(label)}"><title>${esc(label)}</title>
      ${[0,.25,.5,.75,1].map(p=>`<path d="M50 ${y(p)} H570" stroke="#dce5e7"/><text x="43" y="${y(p)+4}" text-anchor="end">${p*100}%</text>`).join("")}
      <path d="M50 35 V190 H570" fill="none" stroke="#73858b"/><path d="${path}" fill="none" stroke="#087f80" stroke-width="2.5"/>
      ${deadline==null?"":`<path d="M${x(deadline)} 35 V190" stroke="#c24e50" stroke-dasharray="5 4"/><text x="${x(deadline)}" y="25" text-anchor="middle">期限 ${fmt(deadline)}</text>`}
      ${[0,.25,.5,.75,1].map(f=>`<text x="${x(max*f)}" y="209" text-anchor="middle">${fmt(max*f)}</text>`).join("")}
      <text x="310" y="231" text-anchor="middle">時間 (${esc(timeUnit)})</text></svg>`;
  }
  function bindPerformance(form,d) {
    const holder=form.querySelector("#cdf-curves"), preview=form.querySelector("#cdf-preview"), error=form.querySelector("#cdf-preview-error");
    function update() {
      const enabled=form.elements.performanceEnabled.checked;
      form.querySelector("#performance-cdf-fields").hidden=!enabled;
      form.querySelector("#performance-cdf-fields").disabled=!enabled;
      const curves=readCurves(form);
      holder.querySelectorAll(".cdf-curve").forEach(el=>{
        const value=curves[Number(el.dataset.curve)].pInfinity;
        el.querySelector(".cdf-infinity").textContent="未達確率 P(T=∞)："+pct(Number.isFinite(value)?value:null);
      });
      preview.innerHTML=""; error.textContent="";
      if (!enabled) return;
      try {
        const sim={enabled:true,w:Number(form.elements.performanceW.value),performanceModel:{type:"cdf",curves:readCurves(form)}};
        if (form.elements.performanceW.value==="") sim.w=NaN;
        P.validateTask(sim);
        preview.innerHTML=chart(P.distribution(sim.performanceModel,sim.w),`F(t | w=${sim.w})`,unit(d));
      } catch(e) { error.textContent=e.message; }
    }
    function replace(curves) { holder.innerHTML=curveFields(curves); update(); }
    holder.addEventListener("click",event=>{
      const target=event.target.closest("button"); if (!target) return;
      const curves=readCurves(form);
      if (target.dataset.removeCurve!==undefined) curves.splice(Number(target.dataset.removeCurve),1);
      if (target.dataset.addPoint!==undefined) {
        const points=curves[Number(target.dataset.addPoint)].points, last=points.at(-1);
        if (points.length>=1000) return;
        points.push({t:(Number.isFinite(last.t)?last.t:0)+1,p:Number.isFinite(last.p)?last.p:0});
      }
      if (target.dataset.removePoint!==undefined) {
        const [i,j]=target.dataset.removePoint.split("-").map(Number); curves[i].points.splice(j,1);
      }
      replace(curves);
    });
    form.querySelector("#add-cdf-curve").onclick=()=>{
      const curves=readCurves(form); if(curves.length>=100) return;
      const ws=curves.map(c=>c.w).filter(Number.isFinite).sort((a,b)=>a-b);
      let w=!ws.includes(1)?1:!ws.includes(0)?0:null;
      if (w===null) { let gap=-1; for(let i=1;i<ws.length;i++) if(ws[i]-ws[i-1]>gap) {gap=ws[i]-ws[i-1];w=(ws[i]+ws[i-1])/2;} }
      curves.push({...M.clone(curves.at(-1)),w}); curves.sort((a,b)=>a.w-b.w); replace(curves);
    };
    const section=form.querySelector(".simulation-performance");
    section.addEventListener("input",update); section.addEventListener("change",update); update();
  }
  function settingsFields(d) {
    const sim=d.simulation || {};
    return `<p class="muted">成功条件は選んだStateすべてへの到達（AND）です。期限はMission開始からの時刻で、空欄なら期限なし。時間単位：${unit(d)}。</p>
      ${stateChoices(d,sim.successStateIds || [],"successStateIds")}
      <label class="field"><span>Mission期限（任意）</span>${input("deadline",sim.deadline??"","Mission期限")}</label>
      <div class="field-row"><label class="field"><span>試行数</span>${input("iterations",sim.iterations??1000,"試行数",1,100000)}</label>
      <label class="field"><span>Seed（再現用）</span>${input("seed",sim.seed??1,"Seed",0,4294967295)}</label></div>`;
  }
  function readSettings(form) {
    const values=new FormData(form);
    const numeric = name => values.get(name)==="" ? NaN : Number(values.get(name));
    return {successStateIds:values.getAll("successStateIds"),deadline:values.get("deadline")===""?null:numeric("deadline"),iterations:numeric("iterations"),seed:numeric("seed")};
  }
  function resultHTML(r) {
    return `<div class="simulation-metrics">
      <div><span>Mission成功率</span><strong>${pct(r.successProbability)}</strong><small>95%区間 ${pct(r.successInterval95.low)}〜${pct(r.successInterval95.high)}</small></div>
      <div><span>成功Stateへの到達率</span><strong>${pct(r.reachProbability)}</strong><small>期限超過も到達に含む</small></div>
      <div><span>完了時間 P50 / P90</span><strong>${fmt(r.completion.p50)} / ${fmt(r.completion.p90)}</strong><small>到達した試行のみ・${esc(r.unit)}</small></div></div>
      <h3>Mission完了の累積確率</h3><p class="muted">縦軸は全試行を分母にした「この時刻までに成功Stateすべてへ到達する確率」。未達試行の確率は残ります。</p>
      ${chart(r.cdf,"Mission完了時間の累積確率",{seconds:"秒",minutes:"分",hours:"時間"}[r.unit],r.config.deadline)}
      <h3>Task別の時間・Criticality</h3><p class="muted">CIは完了時間を決めたTaskの試行数 ÷ 全試行数。未達試行ではCritical Pathを定義しません。成功時CIは期限内成功を分母にします。同率の経路はすべて数えます。</p>
      <div class="simulation-table-scroll"><table class="simulation-table"><thead><tr><th>Task</th><th>開始 P50 / P90</th><th>終了 P50 / P90</th><th>追加依存待ち P50 / P90</th><th>未達 / 開始不能</th><th>CI / 成功時CI</th></tr></thead><tbody>
      ${r.tasks.map(t=>`<tr><td>${esc(t.label)}</td><td>${fmt(t.start.p50)} / ${fmt(t.start.p90)}</td><td>${fmt(t.end.p50)} / ${fmt(t.end.p90)}</td><td>${fmt(t.wait.p50)} / ${fmt(t.wait.p90)}</td><td>${t.failed} / ${t.blocked}</td><td>${pct(t.criticality)} / ${pct(t.criticalityGivenSuccess)}</td></tr>`).join("")}</tbody></table></div>
      <p class="muted">開始・待ち時間は開始できた試行、終了時刻は完了した試行の分布です。待ち時間は接続元State到達から追加依存がそろうまで。時間単位：${esc(r.unit)}。図上の時刻は変更しません。試行数 ${r.iterations.toLocaleString()} / Seed ${r.config.seed}。</p>`;
  }
  function controller({getDocument,configure,loadDemo,download}) {
    const dialog=document.querySelector("#simulation-dialog"), setup=document.querySelector("#simulation-setup"), output=document.querySelector("#simulation-results"), error=document.querySelector("#simulation-error"), progress=document.querySelector("#simulation-progress"), runButton=document.querySelector("#simulation-run"), exportButton=document.querySelector("#simulation-export");
    let token=0, result=null, snapshot=null, signature=null, running=false;
    const fingerprint=d=>JSON.stringify({...d,views:undefined});
    function stop() { token++; running=false; runButton.disabled=false; document.querySelector("#simulation-stop").hidden=true; }
    function setupHTML() {
      const d=getDocument(), sim=d.simulation;
      setup.innerHTML=`<p class="muted">外部解析で得たTask性能をMission Threadへ伝播させます。各Taskを1回実行し、初期Stateの時刻から依存関係で進みます。複数Taskの同一Stateへの合流はANDです。</p>
        <p><strong>成功条件：</strong>${sim?.successStateIds.length?sim.successStateIds.map(sid=>esc(M.get(d,"state",sid).name)).join(" AND "):"未設定"}<br>期限：${sim?.deadline==null?"なし":fmt(sim.deadline)+" "+unit(d)} / 試行数：${sim?.iterations??1000} / Seed：${sim?.seed??1}</p>`;
      try { const c=S.compile(d); error.textContent=c.warnings.join("\n"); }
      catch(e) { error.textContent=e.message; }
    }
    function invalidate() {
      const next=fingerprint(getDocument());
      if (signature!==null && signature!==next) {
        stop(); result=null; snapshot=null; exportButton.disabled=true;
        output.innerHTML=""; progress.textContent="文書が変わりました。再実行してください。";
        if(dialog.open) setupHTML();
      }
      signature=next;
    }
    function open() { invalidate(); setupHTML(); dialog.showModal(); }
    function cancel() { if(running) progress.textContent="実行を中断しました。"; stop(); }
    document.querySelector("#simulation-close").onclick=()=>{cancel();dialog.close();};
    dialog.addEventListener("cancel",cancel); dialog.addEventListener("close",cancel);
    document.querySelector("#simulation-configure").onclick=()=>{stop();dialog.close();configure();};
    document.querySelector("#simulation-demo").onclick=()=>{stop();dialog.close();loadDemo();};
    document.querySelector("#simulation-stop").onclick=()=>{stop();progress.textContent="実行を中断しました。";};
    runButton.onclick=()=>{
      stop(); result=null; output.innerHTML=""; exportButton.disabled=true; snapshot=getDocument(); signature=fingerprint(snapshot);
      let job;
      try { job=S.createRun(snapshot); error.textContent=job.compiled.warnings.join("\n"); }
      catch(e) { error.textContent=e.message; return; }
      running=true; runButton.disabled=true; document.querySelector("#simulation-stop").hidden=false;
      const current=++token, batch=Math.max(1,Math.min(128,Math.floor(20000/job.compiled.order.length)||1));
      progress.textContent="実行中…";
      function tick() {
        if(current!==token || !running) return;
        try {
          const status=job.step(batch); progress.textContent=`${status.completed.toLocaleString()} / ${status.total.toLocaleString()} 試行`;
          if(!status.done) {setTimeout(tick,0);return;}
          result=job.result(); stop(); output.innerHTML=resultHTML(result); exportButton.disabled=false;
        } catch(e) {stop();error.textContent=e.message;}
      }
      setTimeout(tick,0);
    };
    exportButton.onclick=()=>{
      if(result && signature===fingerprint(getDocument())) download(new Blob([JSON.stringify({mission:snapshot,result},null,2)],{type:"application/json"}),"mission-simulation.json");
    };
    return {open,invalidate};
  }
  root.MESimulationUI={performanceFields,readPerformance,bindPerformance,settingsFields,readSettings,controller};
})(globalThis);
