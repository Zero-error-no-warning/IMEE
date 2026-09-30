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
    return durationCurves(duration);
  }
  function durationCurves(duration) {
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
      <p class="muted">CDFはTask開始から「${esc(t.toStateId?M.get(d,"state",t.toStateId).name:"分岐点")}」の達成までの時間と未達を表し、実線で表示します。無効時は図上の固定所要時間（FIX）を使い、二重線で表示します。時間単位：${unit(d)}。Taskは1回実行します。</p>
      <label class="simulation-check"><input type="checkbox" name="performanceEnabled" ${t.simulation?.enabled?"checked":""}>CDFを有効にする</label>
      <fieldset id="performance-cdf-fields"><label class="field"><span>固定の性能劣化度 w（0〜1）</span>${input("performanceW",t.simulation?.w??0,"性能劣化度",0,1)}</label>
      <p class="muted">時間方向・曲線間は線形補間します。最終点以降は一定で、1 − 最終確率が未達確率です。</p>
      <div id="cdf-curves">${curveFields(t.simulation?.performanceModel?.curves || defaultCurves(d,t))}</div>
      <button type="button" id="add-cdf-curve">＋ wの曲線</button><div id="cdf-preview"></div><p id="cdf-preview-error" role="status"></p></fieldset>
      <details><summary>追加依存State（すべてへの到達を待つ）</summary><p class="muted">接続元Stateに加えて、ここで選んだStateを待ちます。Actor間の実行依存も指定できます。作用線からは自動設定しません。</p>
      ${stateChoices(d,t.simulation?.waitForStateIds || [],"waitForStateIds",t.fromStateId)}</details>
      <details><summary>w入力・出力</summary><p class="muted">開始時点の入力wの最大値を使い、入力がなければ固定wを使います。開始後の入力は適用しません。選んだStateは到達を待ちます。出力wが空欄なら入力wを引き継ぎます。</p>
      <label class="simulation-check"><input type="checkbox" name="waitForWLinks" ${t.simulation?.wInput?.waitForLinks?"checked":""}>実行指定したw作用線すべての到着を待つ</label>
      ${stateChoices(d,t.simulation?.wInput?.stateIds || [],"wStateIds")}
      <label class="field"><span>固定出力w（任意）</span>${input("outputW",t.simulation?.outputW??"","固定出力w",0,1)}</label></details>
      <details><summary>中止条件（いずれかのState到達）</summary>${stateChoices(d,t.simulation?.cancelOnStateIds || [],"cancelOnStateIds")}</details></details>`;
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
    const values=new FormData(form);
    const sim = { ...M.clone(t.simulation || {}), enabled, waitForStateIds: values.getAll("waitForStateIds"),
      wInput:{stateIds:values.getAll("wStateIds"),waitForLinks:form.elements.waitForWLinks.checked,combine:"max"},
      cancelOnStateIds:values.getAll("cancelOnStateIds") };
    if(form.elements.outputW.value!=="")sim.outputW=Number(form.elements.outputW.value);else delete sim.outputW;
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
  function bindPerformance(form,d,options={}) {
    const holder=form.querySelector("#cdf-curves"), preview=form.querySelector("#cdf-preview"), error=form.querySelector("#cdf-preview-error");
    function update() {
      const enabled=options.enabled ? options.enabled() : form.elements.performanceEnabled.checked;
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
        const raw=form.elements[options.wName || "performanceW"].value;
        const sim={enabled:true,w:raw==="" ? (options.inheritW ? 0 : NaN) : Number(raw),performanceModel:{type:"cdf",curves:readCurves(form)}};
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
    const section=form.querySelector(options.section || ".simulation-performance");
    section.addEventListener("input",update); section.addEventListener("change",update); update();
  }
  function stateFields(s) {
    return `<details><summary>Simulation / State</summary><p class="muted">固定wが空欄なら到達したTaskやState到達作用線のwを引き継ぎます。生成元が複数ならANDはすべて、ORは最初の到達を待ちます。</p>
      <label class="field"><span>固定出力w（任意）</span>${input("stateW",s.simulation?.w??"","State出力w",0,1)}</label>
      <label class="field"><span>複数Task・State到達作用からの合流</span><select name="stateJoin"><option value="all">すべて（AND）</option><option value="any" ${s.simulation?.join==="any"?"selected":""}>いずれか（OR）</option></select></label></details>`;
  }
  function readState(form,s) {
    const sim={...M.clone(s.simulation || {}),join:form.elements.stateJoin.value};
    if(form.elements.stateW.value!=="")sim.w=Number(form.elements.stateW.value);else delete sim.w;
    return sim;
  }
  function junctionFields(t) {
    return (t.junctions || []).map((j,i)=>`<details><summary>分岐 ${i+1}の実行設定</summary>
      <label class="field"><span>実行モード</span><select name="branchMode-${i}"><option value="">未指定（表示のみ・実行時エラー）</option><option value="probability" ${j.simulation?.mode==="probability"?"selected":""}>確率分岐</option><option value="effect" ${j.simulation?.mode==="effect"?"selected":""}>作用線による分岐</option></select></label>
      <p class="muted">確率は分岐点へ到達した条件下の選択確率。残りは通常経路。作用分岐はTask実行中の入力で移り、元の接続先を取り消します。遅延が空欄なら図上の分岐点から結果Stateまでの時間です。</p>
      ${j.outcomes.map((o,n)=>`<div class="field-row"><label class="field"><span>${esc(o.label)} · 選択確率</span>${input(`branchP-${i}-${n}`,o.probability??"","分岐確率",0,1)}</label><label class="field"><span>結果到達までの遅延</span>${input(`branchDelay-${i}-${n}`,o.delay??"","分岐遅延")}</label></div>`).join("")}</details>`).join("");
  }
  function causalFields(d,c) {
    const sim=c.simulation || {}, p=sim.propagation || {}, duration=M.endpoint(d,c.target).time-M.endpoint(d,c.source).time;
    return `<details class="simulation-causal"><summary>Simulation / 作用線</summary><p class="muted">作用の実行タイプと伝搬時間を別々に設定します。Task出力端点は抽選したTask時間に比例して到達します。State到達作用は入力先Stateを成立させ、その後続Taskを開始できます。</p>
      <label class="field"><span>実行タイプ</span><select name="causalSimulationType"><option value="">表示のみ</option><option value="w" ${sim.enabled&&sim.type==="w"?"selected":""}>w伝播</option><option value="branch" ${sim.enabled&&sim.type==="branch"?"selected":""}>作用分岐</option><option value="state" ${sim.enabled&&sim.type==="state"?"selected":""}>State到達</option></select></label>
      <label class="field"><span>伝搬時間</span><select name="causalPropagationType"><option value="fixed">固定（FIX・二重線）</option><option value="cdf" ${p.enabled?"selected":""}>CDF（時間と未達を抽選・実線）</option></select></label>
      <label class="field"><span>固定の伝搬遅延（空欄なら図上の端点時刻の差）</span>${input("causalDelay",sim.delay??"","伝搬遅延")}</label>
      <fieldset id="performance-cdf-fields"><p class="muted">CDFのtは作用の発生から到着までの経過時間です。CDF使用時は固定遅延を加算しません。T=∞なら作用は届きません。時間単位：${unit(d)}。</p>
      <label class="field"><span>CDF入力w（空欄で発生元のwを引き継ぐ）</span>${input("causalPropagationW",p.w??"","伝搬CDFのw",0,1)}</label><p class="muted">入力wが空欄のプレビューはw=0。実行時は発生元のwで曲線を補間します。</p>
      <div id="cdf-curves">${curveFields(p.performanceModel?.curves || durationCurves(duration))}</div>
      <button type="button" id="add-cdf-curve">＋ wの曲線</button><div id="cdf-preview"></div><p id="cdf-preview-error" role="status"></p></fieldset>
      <label class="field"><span>受け手へ渡すw（空欄で発生元から引き継ぐ）</span>${input("causalW",sim.w??"","作用線w",0,1)}</label>
      <fieldset id="causal-branch-fields"><label class="field"><span>作用分岐の結果（入力先Taskの分岐）</span><select name="causalOutcome"></select></label>
      <label class="simulation-check"><input type="checkbox" name="stopTargetActor" ${sim.stopTargetActor?"checked":""}>分岐後、入力先Actorの他Taskを中止する</label>
      <label class="simulation-check"><input type="checkbox" name="holdUntilStart" ${sim.holdUntilStart?"checked":""}>開始前の作用を保持し、Task開始時に適用する</label></fieldset></details>`;
  }
  function bindCausal(form,d,c) {
    function update() {
      const selected=form.elements.causalOutcome.value, target=form.elements.target.value;
      const task=d.tasks.find(t=>target===`task:${t.id}`);
      form.elements.causalOutcome.innerHTML=`<option value="">選択してください</option>`+(task?.junctions || []).filter(j=>j.simulation?.mode==="effect").flatMap(j=>j.outcomes.map(o=>{
        const v=JSON.stringify([j.id,o.toStateId]);return `<option value="${esc(v)}">${esc(o.label)} → ${esc(M.get(d,"state",o.toStateId).name)}</option>`;
      })).join("");
      form.elements.causalOutcome.value=selected || JSON.stringify([c.simulation?.junctionId,c.simulation?.outcomeStateId]);
      const type=form.elements.causalSimulationType.value, cdf=form.elements.causalPropagationType.value==="cdf";
      form.elements.causalPropagationType.disabled=!type;
      form.elements.causalDelay.disabled=!type || cdf;form.elements.causalDelay.closest("label").hidden=cdf;
      form.elements.causalW.disabled=!["w","state"].includes(type);
      form.querySelector("#causal-branch-fields").hidden=type!=="branch";
      form.querySelector("#causal-branch-fields").disabled=type!=="branch";
    }
    for(const name of ["target","causalSimulationType","causalPropagationType"])form.elements[name].addEventListener("change",update);update();
    bindPerformance(form,d,{enabled:()=>!!form.elements.causalSimulationType.value && form.elements.causalPropagationType.value==="cdf",wName:"causalPropagationW",inheritW:true,section:".simulation-causal"});
  }
  function readCausal(form,c) {
    const type=form.elements.causalSimulationType.value;
    if(!type)return {...M.clone(c.simulation || {}),enabled:false};
    const sim={enabled:true,type};
    if(form.elements.causalDelay.value!=="")sim.delay=Number(form.elements.causalDelay.value);
    if(["w","state"].includes(type) && form.elements.causalW.value!=="")sim.w=Number(form.elements.causalW.value);
    if(form.elements.causalPropagationType.value==="cdf") {
      sim.propagation={enabled:true,performanceModel:{type:"cdf",degradationInput:"w",curves:readCurves(form)}};
      if(form.elements.causalPropagationW.value!=="")sim.propagation.w=Number(form.elements.causalPropagationW.value);
      P.validateTask(sim.propagation,"作用線の伝搬CDF");
    } else if(c.simulation?.propagation) sim.propagation={...M.clone(c.simulation.propagation),enabled:false};
    if(type==="branch") {
      if(!form.elements.causalOutcome.value)throw new Error("入力先Taskの作用分岐の結果を選んでください。");
      [sim.junctionId,sim.outcomeStateId]=JSON.parse(form.elements.causalOutcome.value);
      sim.stopTargetActor=form.elements.stopTargetActor.checked;sim.holdUntilStart=form.elements.holdUntilStart.checked;
    }
    return sim;
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
      <div class="simulation-table-scroll"><table class="simulation-table"><thead><tr><th>Task</th><th>開始 P50 / P90</th><th>終了 P50 / P90</th><th>追加依存待ち P50 / P90</th><th>未達 / 開始不能</th><th>分岐 / 中止</th><th>入力w P50 / P90</th><th>CI / 成功時CI</th></tr></thead><tbody>
      ${r.tasks.map(t=>`<tr><td>${esc(t.label)}</td><td>${fmt(t.start.p50)} / ${fmt(t.start.p90)}</td><td>${fmt(t.end.p50)} / ${fmt(t.end.p90)}</td><td>${fmt(t.wait.p50)} / ${fmt(t.wait.p90)}</td><td>${t.failed} / ${t.blocked}</td><td>${t.branched} / ${t.cancelled}</td><td>${fmt(t.w.p50)} / ${fmt(t.w.p90)}</td><td>${pct(t.criticality)} / ${pct(t.criticalityGivenSuccess)}</td></tr>`).join("")}</tbody></table></div>
      ${r.signals.length?`<h3>作用線の伝搬時間・適用状況</h3><p class="muted">伝搬時間は到着した作用（未適用も含む）の分布。未達はT=∞、未発生は出力元が作用を発生できなかった試行です。CIはMission完了を決めた因果経路に含まれた割合です。</p><div class="simulation-table-scroll"><table class="simulation-table"><thead><tr><th>作用線</th><th>伝搬時間 P50 / P90</th><th>CI / 成功時CI</th><th>適用</th><th>開始前・未適用</th><th>到着済み・未適用</th><th>保持したまま</th><th>未達 / 未発生</th></tr></thead><tbody>${r.signals.map(l=>`<tr><td>${esc(l.label)} · ${l.propagation==="cdf"?"CDF":"FIX"}</td><td>${fmt(l.delay.p50)} / ${fmt(l.delay.p90)}</td><td>${pct(l.criticality)} / ${pct(l.criticalityGivenSuccess)}</td><td>${l.accepted}</td><td>${l.early}</td><td>${l.late}</td><td>${l.held}</td><td>${l.failed} / ${l.unavailable}</td></tr>`).join("")}</tbody></table></div>`:""}
      <details><summary>第1試行の分岐・到達履歴</summary><p class="muted">代表値ではありません。結果JSONにはTask時刻・w・中止理由の状態区分も記録します。</p><ul>${r.trace.states.map(s=>`<li>${esc(s.id)} · ${fmt(s.time)}</li>`).join("")}</ul></details>
      <p class="muted">開始・待ち時間は開始できた試行、終了時刻は完了した試行の分布です。待ち時間は接続元State到達から追加依存がそろうまで。時間単位：${esc(r.unit)}。図上の時刻は変更しません。試行数 ${r.iterations.toLocaleString()} / Seed ${r.config.seed}。</p>`;
  }
  function sensitivityHTML(r,d) {
    const labels={bracketed:`要求を満たす上限の推定区間：${fmt(r.requirement.maxPassingValue)}〜${fmt(r.requirement.firstFailingValue)}（左端は達成、右端は未達）`,"all-tested-pass":`評価範囲の全点で要求達成。真の上限は未特定（最大評価値 ${fmt(r.requirement.maxPassingValue)}）`,"no-passing-sample":"評価範囲内に要求を満たす点がありません。範囲外の達成可否は未評価。",nonmonotone:"非単調な結果です。「この値以下なら達成」という上限は導出できません。"};
    const axis=r.config.parameter==="duration"?`Task完了時間 (${unit(d)})`:"入力劣化度 w";
    return `<h3>${esc(M.get(d,"task",r.config.taskId).label)}の感度と要求</h3>
      <p>基準成功率 ${pct(r.baseline.successProbability)} / 要求 ${pct(r.config.targetProbability)} / 成功率不足 ${pct(r.probabilityGap)}</p>
      <p><strong>${esc(labels[r.requirement.status])}</strong><br>${esc(axis)} · ${r.config.criterion==="lower95"?"95%区間下限":"推定値"}で判定</p>
      ${chart(r.points.map(p=>({t:p.value,p:p.probability})),"Task性能とMission成功率",axis).replace(`時間 (${esc(axis)})`,esc(axis))}
      <div class="simulation-table-scroll"><table class="simulation-table"><thead><tr><th>${esc(axis)}</th><th>Mission成功率</th><th>95%区間</th><th>要求達成</th></tr></thead><tbody>${r.points.map(p=>`<tr><td>${fmt(p.value)}</td><td>${pct(p.probability)}</td><td>${pct(p.interval95.low)}〜${pct(p.interval95.high)}</td><td>${(r.config.criterion==="lower95"?p.interval95.low:p.probability)>=r.config.targetProbability?"達成":"未達"}</td></tr>`).join("")}</tbody></table></div>
      <p class="muted">${esc(r.interpretation)} ${esc(r.scope)} グラフの線は評価点を結んだ表示です。評価点間の確率を保証しません。達成した評価点の範囲：${r.requirement.ranges.length?r.requirement.ranges.map(x=>`${fmt(x.min)}〜${fmt(x.max)}`).join("、"):"なし"}。各点 ${r.config.iterations.toLocaleString()}試行 / Seed ${r.config.seed}。</p>`;
  }
  function controller({getDocument,configure,loadDemo,download}) {
    const dialog=document.querySelector("#simulation-dialog"), setup=document.querySelector("#simulation-setup"), output=document.querySelector("#simulation-results"), error=document.querySelector("#simulation-error"), progress=document.querySelector("#simulation-progress"), runButton=document.querySelector("#simulation-run"), exportButton=document.querySelector("#simulation-export");
    const analysisForm=document.querySelector("#sensitivity-form"), analysisOutput=document.querySelector("#sensitivity-results"),analysisError=document.querySelector("#sensitivity-error"),analysisProgress=document.querySelector("#sensitivity-progress"),analysisRun=document.querySelector("#sensitivity-run"),analysisExport=document.querySelector("#sensitivity-export");
    let token=0, result=null, snapshot=null, signature=null, running=false,analysisToken=0,analysisResult=null,analysisSnapshot=null;
    function stopAnalysis(){analysisToken++;analysisRun.disabled=false;document.querySelector("#sensitivity-stop").hidden=true;}
    const fingerprint=d=>JSON.stringify({...d,views:undefined});
    function stop() { stopAnalysis(); token++; running=false; runButton.disabled=false; document.querySelector("#simulation-stop").hidden=true; }
    function setupHTML() {
      const d=getDocument(), sim=d.simulation;
      setup.innerHTML=`<p class="muted">外部解析で得たTask性能・作用線の伝搬時間をMission Threadへ伝播させます。各Taskを1回実行し、初期Stateの時刻から依存関係で進みます。TaskとState到達作用の同一Stateへの合流はState設定でAND/ORを指定します。作用分岐・w伝播・State到達は実行指定した作用線だけを使います。</p>
        <p><strong>成功条件：</strong>${sim?.successStateIds.length?sim.successStateIds.map(sid=>esc(M.get(d,"state",sid).name)).join(sim.successMode==="any"?" OR ":" AND "):"未設定"}<br>期限：${sim?.deadline==null?"なし":fmt(sim.deadline)+" "+unit(d)} / 試行数：${sim?.iterations??1000} / Seed：${sim?.seed??1}</p>`;
      const selected=analysisForm.elements.taskId.value;
      analysisForm.elements.taskId.innerHTML=d.tasks.map(t=>`<option value="${esc(t.id)}">${esc(t.label)}</option>`).join("");
      if(d.tasks.some(t=>t.id===selected))analysisForm.elements.taskId.value=selected;
      try { const c=S.compile(d); error.textContent=c.warnings.join("\n"); }
      catch(e) { error.textContent=e.message; }
    }
    function invalidate() {
      const next=fingerprint(getDocument());
      if (signature!==null && signature!==next) {
        stop(); result=null; snapshot=null; exportButton.disabled=true; analysisResult=null;analysisSnapshot=null;analysisExport.disabled=true;analysisOutput.innerHTML="";analysisProgress.textContent="文書が変わりました。再実行してください。";
        output.innerHTML=""; progress.textContent="文書が変わりました。再実行してください。";
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
    analysisForm.elements.parameter.onchange=()=>{
      const w=analysisForm.elements.parameter.value==="w";
      analysisForm.elements.minimum.value=0;analysisForm.elements.maximum.value=w?1:60;
      analysisForm.elements.maximum.max=w?1:1e9;analysisForm.elements.minimum.max=w?1:1e9;
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
    return {open,invalidate};
  }
  root.MESimulationUI={performanceFields,readPerformance,bindPerformance,stateFields,readState,junctionFields,causalFields,bindCausal,readCausal,settingsFields,readSettings,controller};
})(globalThis);
