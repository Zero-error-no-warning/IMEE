/* Direct manipulation controller. Classic scripts keep file:// usable. */
(function () {
  "use strict";
  const M = window.ME,
    A = window.MEAuthoring,
    L = window.MELayout,
    R = window.MERender,
    $ = (s) => document.querySelector(s),
    esc = R.esc,
    KEY = "imee.document.v3";
  let importPreview=null,editPreview=null;
  const editDiagnostics=new Map();
  const D=window.MEImportDiagnostics;
  let allCDFPanel=null;
  let authoringUI=null;
  let provisionalConnection=null;
  const workspace=window.MEWorkspace.create(localStorage);
  let history,
    selection = [],
    clipboard = null,
    geometry,
    connecting = null,
    drag = null,
    space = false,
    swallowClick = false,
    saveTimer,
    chain = null,
    gapIds = null,
    simulationPanel = null,
    cdfHover = null;
  try {
    const saved=localStorage.getItem(KEY);
    const inspected=saved?D.inspect(saved):null;
    const editing=localStorage.getItem(KEY+".editing");
    if(inspected?.errors.length && !editing)importPreview=inspected;
    history=new M.History(inspected&&!inspected.errors.length&&!editing?inspected.document:
      localStorage.getItem(KEY+".last-valid")?JSON.parse(localStorage.getItem(KEY+".last-valid")):createSample());
    if(inspected && editing && !importPreview){
      history.commit(inspected.original,{draft:true});
      const errors=inspected.errors.length?inspected.errors:JSON.parse(editing).errors;
      editPreview={...inspected,errors,source:"edit"};
      if(!inspected.errors.length)editDiagnostics.set(JSON.stringify(history.doc),errors);
    }
  } catch (e) {
    history = new M.History(createSample());
    setTimeout(() => toast("保存データを読み込めません:\n" + errorText(e)), 0);
  }
  const doc = () => importPreview?.document || history.doc;
  function errorText(error) {
    let text = error?.message || String(error);
    if (error?.validationPath) text += "\nJSON path: " + error.validationPath;
    if (error?.validationFragment !== undefined) {
      let fragment;
      try { fragment = JSON.stringify(error.validationFragment, null, 2); }
      catch (_) { fragment = String(error.validationFragment); }
      text += "\nProblem JSON:\n" + fragment;
    }
    return text;
  }
  function toast(message) {
    $("#toast").textContent = message;
    $("#toast").hidden = false;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => ($("#toast").hidden = true), 4500);
    $("#status").textContent = message;
  }
  function persist() {
    if(importPreview||provisionalConnection)return;
    try {
      localStorage.setItem(KEY, JSON.stringify(doc()));
      if(editPreview&&!editPreview.operationOnly)localStorage.setItem(KEY+".editing",JSON.stringify({errors:editPreview.errors}));
      else {localStorage.removeItem(KEY+".editing");localStorage.setItem(KEY+".last-valid",JSON.stringify(doc()));}
      workspace.update(doc());
      $("#save-status").textContent = "このブラウザに保存";
    } catch (e) {
      $("#save-status").textContent = "自動保存できません";
    }
  }
  function refreshEditPreview(){
    const inspected=D.inspect(JSON.stringify(history.doc));
    const errors=inspected.errors.length?inspected.errors:editDiagnostics.get(JSON.stringify(history.doc));
    editPreview=errors?.length?{...inspected,errors,source:"edit"}:null;
  }
  function retainEdit(next,error,target=selected()){
    const changed=JSON.stringify(next)!==JSON.stringify(history.doc);
    if(changed){
      // An interrupted time edit must not redefine legacy Task durations from
      // temporarily inconsistent endpoint times. Keep their previous duration.
      for(const t of next.tasks){
        const old=M.get(history.doc,"task",t.id);
        if(!t.timing&&old&&old.fromStateId===t.fromStateId&&old.toStateId===t.toStateId){
          const w=M.taskWindow(history.doc,old),duration=w.end-w.start;
          if(Number.isFinite(duration)&&duration>=0)t.timing={duration};
        }
      }
      history.commit(next,{draft:true});
    }
    refreshEditPreview();
    if(!editPreview){
      editPreview={original:M.clone(next),document:M.clone(next),source:"edit",operationOnly:!changed,
        errors:[{message:error.message,path:error.validationPath||"$",fragment:error.validationFragment,target}]};
    }
    if(changed&&!D.inspect(JSON.stringify(next)).errors.length)editDiagnostics.set(JSON.stringify(history.doc),editPreview.errors);
    connecting=null;
    render();persist();
    return changed;
  }
  function change(fn) {
    if(importPreview){toast("エラーのある文書は診断表示中です。元JSONを修正して再読み込みしてください。Undoで前の文書に戻れます。");return false;}
    const next = M.clone(doc());
    try {
      const result = fn(next);
      history.commit(next);
      editDiagnostics.delete(JSON.stringify(history.doc));
      editPreview=null;
      render();
      persist();
      return result;
    } catch (e) {
      retainEdit(next,e);
      return false;
    }
  }
  function selected() {
    return selection.length === 1 ? selection[0] : null;
  }
  function item(s = selected()) {
    return s && M.get(doc(), s.type, s.id);
  }
  function select(s, add = false) {
    if (!s) {
      selection = [];
    } else if (add) {
      selection = selection.some((x) => x.id === s.id)
        ? selection.filter((x) => x.id !== s.id)
        : [...selection, s];
    } else selection = [s];
    render();
  }
  function render() {
    cdfHover?.hide();
    if(!provisionalConnection){simulationPanel?.invalidate();allCDFPanel?.invalidate();}
    selection = selection.filter((s) => M.get(doc(), s.type, s.id));
    const d = editPreview?.document || doc();
    geometry = L.layout(
      d,
      Math.max(320, $("#canvas-scroll").clientWidth || window.innerWidth - 48),
      {simulationResult:simulationPanel?.getOverlayResult(),cdfResult:simulationPanel?.getResult(),cdfSelection:selection},
    );
    const current = selected();
    chain = null;
    gapIds = null;
    if (
      !editPreview && current?.type === "task" &&
      M.get(d, "actor", M.get(d, "state", item().fromStateId).actorId).side ===
        "hostile"
    ) {
      const analysis = M.analyzeTask(d, current.id);
      chain = new Set([
        current.id,
        ...analysis.paths.flatMap((p) => p.nodes.map((n) => n.id)),
      ]);
      gapIds = new Set(analysis.paths.flatMap((p) => p.gaps.map((g) => g.id)));
    }
    const holder = document.createElement("div");
    holder.innerHTML = R.render(d, geometry, {
      selection,
      connecting:editPreview?null:connecting,
      chain,
      gapIds: d.views.main.mode === "gap" ? gapIds : null,
    });
    const svg = holder.firstChild;
    const target = $("#timeline");
    if(!svg.hasAttribute("data-result-iterations")) target.removeAttribute("data-result-iterations");
    for (const a of [...svg.attributes])
      if (!["id"].includes(a.name)) target.setAttribute(a.name, a.value);
    target.innerHTML = svg.innerHTML;
    const cdfAnalysis=allCDFPanel?.getState();
    if(cdfAnalysis?.result)target.insertAdjacentHTML("beforeend",window.MEAllCDFUI.markers(geometry,cdfAnalysis.result,cdfAnalysis.selected));
    const diagnostic=importPreview||editPreview;
    if(diagnostic){
      target.insertAdjacentHTML("beforeend",D.bubbles(diagnostic,geometry,esc));
      const bubbles=[...target.querySelectorAll(".import-error foreignObject")];
      const bottom=Math.max(geometry.height,...bubbles.map(b=>+b.getAttribute("y")+110));
      target.setAttribute("viewBox",`0 0 ${geometry.vp.width} ${bottom}`);target.setAttribute("height",bottom);
      $("#status").textContent=importPreview?`読み込みエラー ${importPreview.errors.length}件：図は診断表示中。元JSONを修正して再読み込みしてください。`:
        `編集エラー ${editPreview.errors.length}件：${editPreview.errors[0].message} 編集内容を保持しています。修正またはUndoで戻してください。`;
    }
    $("#document-title").textContent = d.title;
    $("#counts").textContent =
      `${d.actors.length} Actor / ${d.states.length} State / ${d.tasks.length} Task`;
    $("#axis-cdf-mode").value=d.views.main.cdfMode||"config";
    $("#axis-cdf-scope").value=d.views.main.cdfScope||"selected";
    $("#axis-cdf-q").value=d.views.main.cdfQ??1;
    $("#axis-cdf-q-value").textContent=Number(d.views.main.cdfQ??1).toFixed(2);
    $("#axis-cdf-q").disabled=d.views.main.cdfMode==="results";
    $("#axis-cdf-status").textContent=d.views.main.cdfMode==="results"&&!simulationPanel?.getResult()?"結果CDF：Simulationを実行してください":"横＝共通の時間 / 縦＝主体・接続";
    $("#undo").disabled = !importPreview && !editPreview?.operationOnly && !history.past.length;
    $("#simulation-btn").disabled=!!diagnostic;
    $("#redo").disabled = !history.future.length;
    $("#view-mode").value = d.views.main.mode;
    const v = d.views.main,
      r = v.visibleTimeRange,
      span = r.end - r.start;
    $("#zoom-label").textContent =
      Math.round((d.time.duration / span) * 100) + "%";
    const horizon=Math.max(d.time.duration,...geometry.axis.curves.map(c=>c.start+(c.points.at(-1)?.t||0)));
    $("#time-pan").max = Math.max(0,horizon - span);
    $("#time-pan").value = r.start;
    $("#time-pan").disabled = span >= horizon;
    $("#time-window").textContent =
      `T+${+r.start.toPrecision(6)} — T+${+r.end.toPrecision(6)}`;
    $("#snap").innerHTML = [...new Set([0.1, 0.5, 1, 5, 10, d.time.snap])]
      .filter((n) => n <= d.time.duration)
      .sort((a, b) => a - b)
      .map(
        (n) => `<option ${n === d.time.snap ? "selected" : ""}>${n}</option>`,
      )
      .join("");
    document
      .querySelectorAll(".time-unit")
      .forEach(
        (el) =>
          (el.textContent = { seconds: "秒", minutes: "分", hours: "時間" }[
            d.time.unit
          ]),
      );
    $("#mode-hint").textContent = connecting
      ? "接続先を選択：同じ主体は活動、別の主体は作用、Task上は作用分岐を作成 · Escで取消"
      : "空白をダブルクリックでState追加 · 点をドラッグで時刻移動 · Alt / Option＋ドラッグで接続";
    renderInspector();
    authoringUI?.render(geometry);
  }
  function inspector(open) {
    $("#inspector").classList.toggle("hidden", !open);
    $("#inspector-toggle").setAttribute("aria-expanded", String(open));
  }
  const button = (label, fn, cls = "") => {
    const b = document.createElement("button");
    b.textContent = label;
    b.className = cls;
    b.onclick = fn;
    return b;
  };
  function renderInspector() {
    const panel = $("#inspector");
    panel.innerHTML =
      '<div class="inspector-heading"><span class="panel-eyebrow">DETAILS</span><button id="close-inspector" aria-label="詳細を閉じる">×</button></div>';
    $("#close-inspector").onclick = () => inspector(false);
    const s = selected(),
      x = item();
    if (!x) {
      panel.insertAdjacentHTML(
        "beforeend",
        `<h2 class="panel-title">${selection.length ? selection.length + "件を選択" : "Taskと因果を描く"}</h2><p class="muted">Stateは時点、Taskはその間の行為です。CDF有効Taskは実線、固定所要時間（FIX）のTask・分岐後の線は二重線です。作用線はStateからStateまたは明示的な分岐点へ接続します。</p>`,
      );
      if (selection.length) {
        renderSelectionScope(panel);
        panel.append(
          button("複製", duplicate),
          button("削除", deleteSelection),
        );
      }
      panel.append(button("Technologyカタログ", catalog));
      return;
    }
    panel.insertAdjacentHTML(
      "beforeend",
      `<h2 class="panel-title">${esc(x.name || x.label)}</h2><p class="panel-subtitle">${esc(s.type)}${s.type === "technology" ? " · " + esc(x.status) : ""}</p>`,
    );
    let facts = "";
    if (s.type === "state")
      facts = `${M.nodeTiming(doc(),x).mode==='fixed'?'▼ Fixed-time Node':'● Relative Node'} / H+${x.time} / ${esc(M.get(doc(), "actor", x.actorId).name)}`;
    if (s.type === "task") {
      const w = M.taskWindow(doc(), x);
      facts = `開始 ${w.start} / 終了 ${w.end} / 所要時間 ${+(w.end - w.start).toFixed(4)} ${esc(doc().time.unit)}<br>${x.simulation?.enabled ? "CDF：実線・達成までの所要時間と未達を抽選" : "FIX：二重線・所要時間固定（開始時刻は依存条件で変動）"}<br>${x.timing?"所要時間の変更を後続Relativeへ反映します。Fixedの指定時刻は保持します。":"接続元・先Stateまたは分岐点から所要時間を計算する従来モデルです。"}`;
    }
    if (s.type === "causalLink") {
      facts = `作用線<br>発生 ${M.endpoint(doc(), x.source).time} + 伝搬 ${x.propagation.duration} → 基準到達 ${M.causalArrivalTime(doc(), x)}<br>分類: ${esc(x.kind || "未指定")}`;
      facts += `<br>${x.simulation?.enabled ? `${x.target.type==="junction"?"作用分岐・暗黙の開始依存あり":"State成立・品質伝搬"} / ${x.propagation?.performanceModel ? "CDF：実線・伝搬時間と未達を抽選" : "FIX：二重線・伝搬時間固定"}` : "表示のみ（シミュレーション実行なし）"}`;
      const o = M.opportunity(doc(), x);
      if (o) facts += `<br>介入時間窓 ${o.start}〜${o.end} / ${esc(o.message)}`;
    }
    panel.insertAdjacentHTML(
      "beforeend",
      `<p class="notes">${facts}</p><p class="notes">${esc(x.notes || "")}</p>`,
    );
    renderSelectionScope(panel);
    const actions = document.createElement("div");
    actions.className = "panel-actions";
    actions.append(
      button("編集", () => edit(s)),
      button("削除", deleteSelection, "danger"),
    );
    if (["actor", "state"].includes(s.type))
      actions.append(button("複製", duplicate));
    if (s.type === "state")
      actions.append(button("ここから接続", () => beginConnection(s)));
    if (s.type === "task")
      actions.append(button("分岐を追加", () => addResult(s.id)));
    if (s.type === "causalLink" && x.target.type === "junction")
      actions.append(button("分岐を追加", () => addCausalResult(s.id)));
    if (s.type === "actor") {
      actions.append(
        button("子Actor追加", () => editActor(null, x.id)),
        button("グループ解除", () => change((d) => M.ungroupActor(d, x.id))),
      );
    }
    panel.append(actions);
    if (["actor", "state", "task", "causalLink"].includes(s.type)) {
      if(s.type !== "state") panel.append(button("技術を関連付け", () => editBinding(s)));
      const bindings=doc().bindings.filter(b=>b.targetType===s.type && b.targetId===s.id);
      if(s.type === "actor" && bindings.length)
        panel.insertAdjacentHTML("beforeend",'<p class="muted">Actor全体の技術・装備</p>');
      if(s.type === "state" && bindings.length)
        panel.insertAdjacentHTML("beforeend",'<p class="muted">旧Stateへの技術紐付けを保持しています。対応するTask・作用への付け先変更ができます。</p>');
      for (const b of doc().bindings.filter(
        (b) => b.targetType === s.type && b.targetId === s.id,
      )) {
        const t = M.get(doc(), "technology", b.technologyId),
          card = document.createElement("div");
        card.className = "tech-card";
        card.style.borderColor = R.techColors[t.status];
        card.innerHTML = `<strong>${esc(t.name)}</strong><small>${t.status} · TRL ${t.trl ?? "未評価"}</small>`;
        card.append(
          button("編集", () => editTechnology(t.id)),
          button("付け先変更", () => retargetBinding(b.id)),
          button("解除", () =>
            change(
              (d) => (d.bindings = d.bindings.filter((x) => x.id !== b.id)),
            ),
          ),
        );
        panel.append(card);
      }
    }
    if (
      !editPreview && s.type === "task" &&
      M.get(doc(), "actor", M.get(doc(), "state", x.fromStateId).actorId)
        .side === "hostile"
    ) {
      const a = M.analyzeTask(doc(), x.id);
      panel.insertAdjacentHTML(
        "beforeend",
        `<div class="panel-section"><h3>介入経路</h3><p>SOME: ${a.some ? "充足" : "未充足"} / ALL: ${a.all ? "充足" : "未確認・未充足"}${a.truncated ? "（探索打ち切り）" : ""}</p><p class="muted">観測 → 判断 → 指令 → 攻撃を経路ごとに評価。技術未登録・未成熟・時間窓外で条件未充足になります。</p></div>`,
      );
      for (const p of a.paths) {
        const card = document.createElement("div");
        card.className = "path-card" + (p.complete ? " complete" : "");
        card.innerHTML = `<strong>${p.complete ? "条件充足" : p.structural ? "技術・時刻にGap" : "役割経路が未完結"}</strong><p>${p.nodes.map((n) => esc(M.get(doc(), n.type, n.id).name || M.get(doc(), n.type, n.id).label)).join(" → ")}</p><p>${esc(p.window?.message || "")}<br>${p.gaps.map((g) => esc(M.get(doc(), g.type, g.id).name || M.get(doc(), g.type, g.id).label) + ": " + esc(g.name) + " (" + g.status + ")").join(" / ")}</p>`;
        panel.append(card);
      }
    }
    if (
      doc().views.main.mode === "technology" ||
      doc().views.main.mode === "gap"
    )
      panel.append(button("Technologyカタログ", catalog));
  }
  function renderSelectionScope(panel) {
    if(!selection.length||importPreview||editPreview)return;
    const info=A.selectionInfo(doc(),selection),names={actors:'主体',states:'State',tasks:'活動',causalLinks:'作用',technologies:'技術',bindings:'技術の関連付け'},counts=x=>Object.entries(names).filter(([k])=>x[k]?.length||typeof x[k]==='number'&&x[k]>0).map(([k,n])=>`${n} ${typeof x[k]==='number'?x[k]:x[k].length}`).join(' / ')||'対象なし';
    panel.insertAdjacentHTML('beforeend',`<div class="selection-scope muted">複製範囲：${counts(info.copied)}<br>削除範囲：${counts(info.deleted)}<br>範囲外の開始・品質・中止条件への参照は複製時に維持します。${info.error?`<p class="danger">削除できません：${esc(info.error)}</p>`:''}</div>`);
  }
  function field(name, label, value = "", type = "text") {
    if (type === "color")
      return `<label class="field"><span>${esc(label)}</span><span class="color-control"><span class="color-swatch" aria-hidden="true"></span><span class="color-value" aria-hidden="true"></span><input name="${name}" type="color" value="${esc(value)}" aria-label="${esc(label)}"></span></label>`;
    return `<label class="field"><span>${esc(label)}</span><input name="${name}" type="${type}" value="${esc(value)}" ${type === "number" ? 'step="any"' : ""}></label>`;
  }
  function choices(name, label, values, value) {
    return `<label class="field"><span>${esc(label)}</span><select name="${name}">${values
      .map((v) => {
        const [id, text] = Array.isArray(v) ? v : [v, v];
        return `<option value="${esc(id)}"${id === value ? " selected" : ""}>${esc(text)}</option>`;
      })
      .join("")}</select></label>`;
  }
  const notes = (x) =>
    `<label class="field"><span>備考</span><textarea name="notes">${esc(x.notes || "")}</textarea></label>`;
  function dialog(title, html, apply) {
    $("#editor-form").oninput = null;
    $("#editor-form").onchange = null;
    $("#dialog-fields").onclick = null;
    $("#dialog-title").textContent = title;
    $("#dialog-fields").innerHTML = html;
    for(const select of $('#dialog-fields').querySelectorAll('select'))if(select.options.length>10){const filter=document.createElement('input');filter.type='search';filter.className='candidate-search';filter.placeholder='候補を検索';filter.setAttribute('aria-label','候補の絞り込み');select.before(filter);filter.oninput=()=>{const q=filter.value.toLowerCase();for(const option of select.options)option.hidden=!!q&&!option.textContent.toLowerCase().includes(q)&&option.value!==select.value;};}
    document.querySelectorAll("#dialog-fields .color-control").forEach(control => {
      const input = control.querySelector('input[type="color"]');
      const sync = () => {
        control.querySelector('.color-swatch').style.backgroundColor = input.value;
        control.querySelector('.color-value').textContent = input.value.toUpperCase();
      };
      input.addEventListener("input", sync);
      input.addEventListener("change", sync);
      sync();
    });
    $("#dialog-error").textContent = "";
    $("#editor-form").onsubmit = (e) => {
      e.preventDefault();
      const values = Object.fromEntries(new FormData(e.target));
      try {
        apply(values);
        $("#editor-dialog").close();
      } catch (error) {
        $("#dialog-error").textContent = errorText(error);
      }
    };
    $("#editor-dialog").showModal();
    $("#dialog-fields input")?.focus();
  }
  function applyEdit(fn) {
    if(importPreview)throw new Error("診断表示中は編集できません。元JSONを修正して再読み込みしてください。");
    const next = M.clone(doc());
    try {
      const result = fn(next);
      finishProvisional();
      history.commit(next);
      editDiagnostics.delete(JSON.stringify(history.doc));
      editPreview=null;
      if (result?.type) selection = [result];
      render();persist();
      return result;
    } catch(error) {
      finishProvisional();
      if(!retainEdit(next,error))throw error;
      return false;
    }
  }
  function finishProvisional(){
    if(!provisionalConnection)return;
    history.doc=provisionalConnection.document;history.past=provisionalConnection.past;history.future=provisionalConnection.future;
    provisionalConnection=null;
  }

  function editActor(aid, parentId = null, isGroup = false) {
    const x = aid
      ? M.get(doc(), "actor", aid)
      : {
          id: M.id("actor"),
          name: isGroup ? "新しいグループ" : "新しいActor",
          side: "neutral",
          parentId,
          isGroup,
        };
    const excluded = aid ? M.descendants(doc(), aid) : new Set();
    dialog(
      isGroup ? "グループ" : "Actor",
      field("name", "名前", x.name) +
        field("color", "Actorの色", M.actorColor(doc(), x), "color") +
        choices(
          "side",
          "所属",
          [
            ["friendly", "味方"],
            ["hostile", "敵"],
            ["neutral", "中立・環境"],
          ],
          x.side,
        ) +
        choices(
          "parentId",
          "親Actor",
          [
            ["", "なし"],
            ...doc()
              .actors.filter((a) => !excluded.has(a.id))
              .map((a) => [a.id, a.name]),
          ],
          x.parentId || "",
        ) +
        notes(x),
      (v) =>
        applyEdit((d) => {
          const a = { ...x, ...v, parentId: v.parentId || null };
          if (aid) Object.assign(M.get(d, "actor", aid), a);
          else {
            d.actors.push(a);
            d.views.main.actorOrder.push(a.id);
          }
          return { type: "actor", id: a.id };
        }),
    );
  }
  function editState(sid, actorId, time = 0) {
    const x = sid
      ? M.get(doc(), "state", sid)
      : {
          id: M.id("state"),
          actorId,
          name: "新しいState",
          time,
          activity: "active",
          phase: "other",
        };
    dialog(
      "State — 到達時点",
      field("name", "State名", x.name) +
        choices(
          "actorId",
          "Actor",
          doc().actors.map((a) => [a.id, a.name]),
          x.actorId,
        ) +
        choices("nodeTiming","時間種別",[["relative","● Relative Node：入力から時刻が決まる"],["fixed","▼ Fixed-time Node：指定時刻に成立"]],sid?M.nodeTiming(doc(),x).mode:"fixed") +
        '<p class="dialog-summary">Fixedは指定時刻までに条件が揃えば成立し、間に合わなければ未成立です。時刻はシナリオ開始からの経過時間（H+）で入力します。</p>' +
        field("time", "時刻 / H+", x.time, "number") +
        (sid&&A.incomingRelations(doc(),sid).length>1?choices("incomingTiming","Relativeの時刻調整に使う入力",[["","すべての作用線を連動"],...A.incomingRelations(doc(),sid).map(r=>[r.id,r.label+" / H+"+r.time])],"")+'<p class="muted">通常はすべての作用線を同じ時間差だけ移動します。入力を選ぶと個別に調整します。Fixedでは入力Taskの所要時間を保持します。</p>':"") +
        choices("timePolicy", "時刻変更時の後続", [["follow","後続の所要時間を保って移動"],["keep","後続の基準時刻を維持"]], "follow") +
        choices(
          "activity",
          "表示",
          [
            ["active", "通常"],
            ["quiet", "控えめ"],
          ],
          x.activity,
        ) +
        choices(
          "phase",
          "分析上の役割",
          [
            ["other", "その他"],
            ["decision", "判断"],
          ],
          x.phase,
        ) +
        notes(x) + window.MESimulationUI.stateFields(x),
      (v) =>
        applyEdit((d) => {
          if(sid && v.nodeTiming!==M.nodeTiming(doc(),x).mode)A.setNodeTiming(d,sid,v.nodeTiming,+v.time);
          else if(sid && +v.time!==x.time)A.moveState(d,sid,+v.time,v.timePolicy,v.incomingTiming||undefined);
          const before=M.clone(d);
          const s = {
            ...x, name: v.name, actorId: v.actorId, activity: v.activity,
            phase: v.phase, notes: v.notes, time: sid?M.get(d,"state",sid).time:+v.time,
            timing:sid?M.get(d,"state",sid).timing:(v.nodeTiming==="fixed"?{mode:"fixed",at:+v.time}:{mode:"relative"}),
            simulation: window.MESimulationUI.readState($("#editor-form"), x),
          };
          if (sid) {Object.assign(M.get(d, "state", sid), s);if((x.simulation?.join||'all')!==v.stateJoin)A.reconcile(d,before);}
          else d.states.push(s);
          return { type: "state", id: s.id };
        }),
    );
    if(sid)authoringUI?.preview((d,v)=>{if(v.nodeTiming!==M.nodeTiming(doc(),x).mode)A.setNodeTiming(d,sid,v.nodeTiming,+v.time);else if(+v.time!==x.time)A.moveState(d,sid,+v.time,v.timePolicy,v.incomingTiming||undefined);const before=M.clone(d);M.get(d,'state',sid).simulation=window.MESimulationUI.readState($("#editor-form"),x);if((x.simulation?.join||'all')!==v.stateJoin)A.reconcile(d,before);});
    window.MESimulationUI.bindState($('#editor-form'),doc(),x);
  }
  function editTask(tid) {
    const t = M.get(doc(), "task", tid),
      w = M.taskWindow(doc(), t);
    let html =
      field("label", "Task名", t.label) +
      field("kind", "分析分類（線種は変わりません）", t.kind || "") +
      `<p class="dialog-summary">開始 ${w.start} / 終了 ${w.end} / 所要時間 ${+(w.end - w.start).toFixed(4)}<br>開始の変更は接続元State、終了の変更は接続先Stateまたは分岐点を変更します。</p>` +
      field("start", "接続元Stateの時刻", w.start, "number");
    html+=choices('timePolicy','時間変更時の後続',[['follow','後続の所要時間を保って移動'],['keep','後続の基準時刻を維持']],'follow')+
      field('taskDuration','基準所要時間',w.end-w.start,'number')+choices('timeAnchor','固定する値',[['start','開始を固定して所要時間を変更'],['end','終了を固定して所要時間を変更'],['manual','開始・終了を直接指定']],'start');
    html += field("end", t.toStateId ? "接続先Stateの時刻" : "最終分岐の時刻", w.end, "number");
    const updateTask=(d,v)=>{
        const x = M.get(d, "task", tid);
        const beforeEdit=M.clone(d);
        x.label = v.label;
        x.kind = v.kind;
        x.notes = v.notes;
        x.simulation = window.MESimulationUI.readPerformance($("#editor-form"), t);
        if(+v.start!==w.start)A.moveState(d,x.fromStateId,+v.start,v.timePolicy);
        if(x.timing){x.timing.duration=+v.end-+v.start;}
        else if(x.toStateId && +v.end!==M.get(d,'state',x.toStateId).time)A.moveState(d,x.toStateId,+v.end,v.timePolicy);
        const changedTimes = new Map(
          (x.junctions || []).map((j, i) => [j.time, +v["j" + i]]),
        );
        for (const c of d.causalLinks) {
          const oldArrival = M.causalArrivalTime(d, c);
          if(c.target.type==="junction" && c.target.taskId===tid && changedTimes.has(oldArrival))c.propagation.duration+=changedTimes.get(oldArrival)-oldArrival;
        }
        for (const [i, j] of (x.junctions || []).entries()) {
          j.time = +v["j" + i];
          if (v[`branchMode-${i}`]) j.simulation = { mode: v[`branchMode-${i}`] };
          else delete j.simulation;
          j.outcomes = j.outcomes
            .map((o, n) => ({
              ...o,
              probability:v[`branchP-${i}-${n}`]===""?undefined:Number(v[`branchP-${i}-${n}`]),
              delay:v[`branchDelay-${i}-${n}`]===""?undefined:Number(v[`branchDelay-${i}-${n}`]),
              label: v[`label-${i}-${n}`],
              toStateId: v[`target-${i}-${n}`],
            }))
            .filter((o) => o.toStateId);
        }
        x.junctions = (x.junctions || []).filter((j) => j.outcomes.length);
        d.causalLinks = d.causalLinks.filter(c =>
          c.target.taskId !== tid || x.junctions.some(j => j.id === c.target.id && j.outcomes.some(o => o.toStateId === c.target.outcomeStateId)));
        d.bindings = d.bindings.filter(b => M.get(d, b.targetType, b.targetId));
        const changedSchedule=+v.start!==w.start||(t.toStateId&&+v.end!==w.end)||
          JSON.stringify(x.simulation?.waitForStateIds||[])!==JSON.stringify(t.simulation?.waitForStateIds||[])||
          JSON.stringify(x.simulation?.qInput?.stateIds||[])!==JSON.stringify(t.simulation?.qInput?.stateIds||[])||
          ((x.simulation?.qInput?.stateIds?.length||0)>0&&(x.simulation?.qInput?.mode||'all')!==(t.simulation?.qInput?.mode||'all'))||
          x.junctions.length!==(t.junctions||[]).length||(t.junctions||[]).some((j,i)=>{
            const next=x.junctions[i];return !next||next.time!==j.time||next.outcomes.length!==j.outcomes.length||next.outcomes.some((o,n)=>o.toStateId!==j.outcomes[n]?.toStateId||(o.delay??M.get(beforeEdit,'state',o.toStateId).time-next.time)!==(j.outcomes[n]?.delay??M.get(beforeEdit,'state',j.outcomes[n]?.toStateId)?.time-j.time));});
        if(changedSchedule)A.reconcile(d,beforeEdit,A.timing(d));
    };
    dialog("活動 / Task", html + notes(t) + window.MESimulationUI.junctionFields(t,doc()) + window.MESimulationUI.performanceFields(doc(), t), v => applyEdit(d=>updateTask(d,v)));
    window.MESimulationUI.bindPerformance($("#editor-form"), doc());
    const form=$('#editor-form');
    for(const block of form.querySelectorAll('.branch-editor')){const i=block.dataset.branchIndex,update=()=>{const mode=form.elements['branchMode-'+i].value,sum=[...block.querySelectorAll(`[name^="branchP-${i}-"]`)].reduce((n,input)=>n+(+input.value||0),0),message=block.querySelector('.branch-remainder');message.textContent=mode==='probability'?`通常継続 ${(100-sum*100).toFixed(1)}% / 分岐合計 ${(sum*100).toFixed(1)}%`:'作用が届かなければ通常経路を継続します。';message.classList.toggle('danger',sum>1&&mode==='probability');};block.addEventListener('input',update);block.addEventListener('change',update);update();}
    const syncDuration=()=>{if(!form.elements.end)return;const anchor=form.elements.timeAnchor.value,n=+form.elements.taskDuration.value;
      form.elements.start.readOnly=anchor==='end';form.elements.end.readOnly=anchor==='start';form.elements.taskDuration.readOnly=anchor==='manual';
      if(anchor==='start')form.elements.end.value=(+form.elements.start.value)+n;
      if(anchor==='end')form.elements.start.value=(+form.elements.end.value)-n;
      if(anchor==='manual')form.elements.taskDuration.value=(+form.elements.end.value)-(+form.elements.start.value);
      const start=+form.elements.start.value,duration=+form.elements.end.value-start;
      for(const [i,j] of (t.junctions||[]).entries()){const progress=w.end===w.start?1:(j.time-w.start)/(w.end-w.start);form.elements['j'+i].value=start+duration*progress;}
    };
    form.elements.taskDuration.oninput=syncDuration;form.elements.timeAnchor.onchange=syncDuration;form.elements.start.oninput=syncDuration;if(form.elements.end)form.elements.end.oninput=syncDuration;
    syncDuration();
    authoringUI?.preview(updateTask);
  }
  function addCausalResult(cid) {
    const cause = M.get(doc(), "causalLink", cid);
    if (cause?.target.type === "junction")
      addResult(cause.target.taskId, {time:M.causalArrivalTime(doc(),cause),fixedTime:true});
  }
  function addResult(tid, context = {}) {
    return authoringUI.branch(tid, context);
  }
  function endpointFields(name,p){
    const opts=doc().states.map(s=>["state:"+s.id,A.label(doc(),'state',s.id)]);
    if(name==="target")for(const t of doc().tasks)for(const j of t.junctions || [])opts.push(["junction:"+j.id,`分岐点: ${t.label} / T+${j.time}`]);
    return choices(name,name==="source"?"作用元State":"到達先State・分岐点",opts,p.type+":"+p.id);
  }
  function editCausal(cid) {
    const c = M.get(doc(), "causalLink", cid);
    dialog(
      "因果リンク",
      field("label", "作用のラベル", c.label) +
        endpointFields("source", c.source) +
        endpointFields("target", c.target) +
        field("kind", "分析分類", c.kind || "") +
        notes(c) + window.MESimulationUI.causalFields(doc(),c),
      (v) =>
        applyEdit((d) => {
          const beforeEdit=M.clone(d);
          const x = M.get(d, "causalLink", cid);
          {
            const i = v.source.indexOf(":"), type = v.source.slice(0,i), id = v.source.slice(i+1);
            x.source = {type,id};
          }
          {
            const i = v.target.indexOf(":"), type = v.target.slice(0,i), id = v.target.slice(i+1);
            x.target = {type,id};
            if(type==="junction"){x.target.taskId=d.tasks.find(t=>t.junctions?.some(j=>j.id===id)).id;x.target.outcomeStateId=v.causalOutcome;}
          }
          const causal = window.MESimulationUI.readCausal($("#editor-form"),c);
          x.propagation = causal.propagation;
          x.simulation = causal.simulation;
          Object.assign(x, {
            label: v.label,
            kind: v.kind,
            notes: v.notes,
          });
          const changedTiming=x.source.id!==c.source.id||x.target.type!==c.target.type||x.target.id!==c.target.id||x.propagation.duration!==c.propagation.duration;
          if(changedTiming){if(x.target.type==='junction')A.propagation(d,x.id,x.propagation.duration);
          else A.reconcile(d,beforeEdit);}
        }),
    );
    window.MESimulationUI.bindCausal($("#editor-form"),doc(),c);
    authoringUI?.preview((d,v)=>{if(v.source===c.source.type+':'+c.source.id&&v.target===c.target.type+':'+c.target.id&&+v.causalDelay!==c.propagation.duration)A.propagation(d,cid,+v.causalDelay);});
  }
  function editTechnology(tid) {
    const t = tid
      ? M.get(doc(), "technology", tid)
      : { id: M.id("tech"), name: "新しい技術", status: "unknown", trl: null };
    dialog(
      "Technology / R&D",
      field("name", "技術名", t.name) +
        choices("status", "成熟状況", M.technologyStatuses, t.status) +
        field("trl", "TRL 1〜9（未評価は空欄）", t.trl ?? "", "number") +
        notes(t),
      (v) =>
        applyEdit((d) => {
          const x = { ...t, ...v, trl: v.trl === "" ? null : +v.trl };
          if (tid) Object.assign(M.get(d, "technology", tid), x);
          else d.technologies.push(x);
        }),
    );
  }
  function editBinding(s) {
    if(s.type === "state") return;
    if (!doc().technologies.length) {
      createAndBind(s);
      return;
    }
    dialog(
      "技術を関連付け",
      choices(
        "technologyId",
        "Technology",
        doc().technologies.map((t) => [t.id, t.name]),
        doc().technologies[0].id,
      )+ '<button type="button" id="binding-new-tech">新しい技術を登録して関連付け</button><p class="muted">技術の関連付けは性能を自動変更しません。時間・品質は対象の性能設定で指定します。</p>',
      (v) =>
        applyEdit((d) => {
          if (
            !d.bindings.some(
              (b) =>
                b.targetType === s.type &&
                b.targetId === s.id &&
                b.technologyId === v.technologyId,
            )
          )
            d.bindings.push({
              id: M.id("binding"),
              targetType: s.type,
              targetId: s.id,
              technologyId: v.technologyId,
            });
        }),
    );
    $('#binding-new-tech').onclick=()=>createAndBind(s);
  }
  function createAndBind(s){dialog('技術を登録して関連付け',field('name','技術名','')+choices('status','成熟状況',M.technologyStatuses,'unknown')+field('trl','TRL 1〜9（未評価は空欄）','','number')+notes({}),v=>applyEdit(d=>{const id=M.id('tech');d.technologies.push({id,name:v.name,status:v.status,trl:v.trl===''?null:+v.trl,notes:v.notes});d.bindings.push({id:M.id('binding'),technologyId:id,targetType:s.type,targetId:s.id});}));}
  function retargetBinding(id) {
    const b=M.get(doc(),"binding",id),tech=M.get(doc(),"technology",b.technologyId);
    const targets=[...doc().tasks.map(t=>{
        const actor=M.get(doc(),"actor",M.get(doc(),"state",t.fromStateId).actorId),w=M.taskWindow(doc(),t);
        return ["task:"+t.id,`Task: ${actor.name} / ${t.label} (T+${w.start}〜${w.end})`];
      }),
      ...doc().causalLinks.map(c=>["causalLink:"+c.id,`作用: ${c.label} (T+${M.endpoint(doc(),c.source).time}→${M.causalArrivalTime(doc(),c)})`]),
      ...doc().actors.map(a=>["actor:"+a.id,`Actor: ${a.name}`])];
    dialog("技術の付け先変更",`<p class="dialog-summary">${esc(tech.name)}</p>`+
      choices("target","付け先",[["","選択してください"],...targets],
        b.targetType==='state' ? "" : b.targetType+":"+b.targetId),v=>applyEdit(d=>{
          if(!v.target) throw Error("付け先を選択してください。");
          const split=v.target.indexOf(":"),targetType=v.target.slice(0,split),targetId=v.target.slice(split+1);
          const duplicate=d.bindings.find(x=>x.id!==id && x.technologyId===b.technologyId && x.targetType===targetType && x.targetId===targetId);
          if(duplicate) d.bindings=d.bindings.filter(x=>x.id!==id);
          else Object.assign(M.get(d,"binding",id),{targetType,targetId});
          return {type:targetType,id:targetId};
        }));
  }
  function catalog() {
    inspector(true);
    const p = $("#inspector");
    p.innerHTML =
      '<div class="inspector-heading"><h3>Technology</h3><button id="close-catalog">×</button></div>';
    $("#close-catalog").onclick = () => renderInspector();
    p.append(button("＋ 技術追加", () => editTechnology()));
    for (const t of doc().technologies) {
      const card = document.createElement("div");
      card.className = "tech-card";
      card.style.borderColor = R.techColors[t.status];
      card.innerHTML = `<strong>${esc(t.name)}</strong><small>${t.status} / TRL ${t.trl ?? "未評価"}</small>`;
      card.append(
        button("編集", () => editTechnology(t.id)),
        button("削除", () =>
          change((d) => M.remove(d, [{ type: "technology", id: t.id }])),
        ),
      );
      for (const b of doc().bindings.filter((b) => b.technologyId === t.id)) {
        const x = M.get(doc(), b.targetType, b.targetId);
        card.append(
          button((b.targetType === "state" ? "旧State: " : "")+(x.name || x.label), () =>
            select({ type: b.targetType, id: b.targetId }),
          ),
        );
      }
      p.append(card);
    }
  }
  function edit(s = selected()) {
    if (!s) return;
    ({
      actor: () => editActor(s.id),
      state: () => editState(s.id),
      task: () => editTask(s.id),
      causalLink: () => editCausal(s.id),
      technology: () => editTechnology(s.id),
    })[s.type]?.();
    if(editPreview)for(const details of $("#dialog-fields").querySelectorAll("details"))details.open=true;
  }
  function deleteSelection() {
    if (selection.length){const before=M.clone(doc());change((d) => M.remove(d, selection));const removed=Object.values(M.collections).map(k=>({k,n:before[k].length-doc()[k].length})).filter(x=>x.n>0);toast('削除：'+removed.map(x=>x.k+' '+x.n+'件').join(' / ')+'。Undoで戻せます。');}
    selection = [];
    render();
  }
  function copy(cut = false) {
    clipboard = M.fragment(doc(), selection);
    if (cut) deleteSelection();
    else toast(`コピー：主体 ${clipboard.actors.length} / State ${clipboard.states.length} / 活動 ${clipboard.tasks.length} / 作用 ${clipboard.causalLinks.length}`);
  }
  function paste() {
    if (!clipboard) return;
    const result = change((d) => M.paste(d, clipboard));
    if (result) {
      selection = result;
      render();
    }
  }
  function duplicate() {
    const f = M.fragment(doc(), selection);
    const result = change((d) => M.paste(d, f));
    if (result) {
      selection = result;
      render();
    }
  }
  function group() {
    const ids = selection.filter((s) => s.type === "actor").map((s) => s.id);
    if (!ids.length) return toast("まとめるActorを複数選択してください");
    const id = change((d) => M.groupActors(d, ids));
    if (id) select({ type: "actor", id });
  }
  function asEndpoint(s,time){
    if(s.type==="state")return {type:"state",id:s.id};
    if(s.type==="task"){
      const t=M.get(doc(),"task",s.id),j=t.junctions?.find(j=>Math.abs(j.time-time)<doc().time.snap/2+1e-7);
      if(j)return {type:"junction",taskId:t.id,id:j.id,outcomeStateId:j.outcomes[0].toStateId};
    }
  }
  function beginConnection(s=selected()){
    if(importPreview||editPreview){toast("問題箇所を修正してから接続してください。");return;}
    if(s?.type!=="state"){toast("作用の起点はStateです。途中出力はStateを設けてTaskを分けてください。");return;}
    connecting={type:"state",id:s.id};render();
  }
  function connect(target, time) {
    const source = connecting,
      end = asEndpoint(target, time);
    if(!source)return;
    const hint=A.connectionHints(doc(),source)(target?.type,target?.id);
    if(!hint.allowed&&!end){retainEdit(M.clone(doc()),new Error(hint.message),target);return;}
    if(!end){connecting=null;render();if(target?.type==='task'&&authoringUI){authoringUI.branch(target.id,{time},source);return;}toast("接続先はStateまたは既存の分岐点です。Taskには先に分岐を追加してください。");return;}
    connecting = null;
    let result;
    const draft=M.clone(doc());
    try {
      provisionalConnection={document:M.clone(doc()),past:[...history.past],future:[...history.future]};
      result=M.createConnection(draft,source,end,{retainInvalid:true});
      if(result.type==='causalLink')M.get(draft,result.type,result.id).simulation={enabled:true};
      history.doc=draft;selection=[result];render();
    } catch (e) {
      finishProvisional();
      const added=draft.causalLinks.find(c=>!doc().causalLinks.some(x=>x.id===c.id))||draft.tasks.find(t=>!doc().tasks.some(x=>x.id===t.id));
      if(added){if(added.source)added.simulation={enabled:true};selection=[{type:added.source?"causalLink":"task",id:added.id}];}
      retainEdit(draft,e,target);
      return;
    }
    edit(result);
  }
  function point(e) {
    const svg = $("#timeline"),
      screen = svg.getScreenCTM?.();
    if (screen) {
      // Pointer events are in viewport CSS pixels; paths and hit geometry use
      // SVG user units. Include viewBox alignment, CSS scaling and scrolling.
      const inverse = screen.inverse();
      return {
        x: inverse.a * e.clientX + inverse.c * e.clientY + inverse.e,
        y: inverse.b * e.clientX + inverse.d * e.clientY + inverse.f,
      };
    }
    // Non-rendering DOM hosts (including jsdom) have no SVG screen matrix.
    const b = svg.getBoundingClientRect();
    return { x: e.clientX - b.left, y: e.clientY - b.top };
  }
  function targetInfo(e) {
    const el = e.target.closest("[data-type][data-id]");
    return el ? { type: el.dataset.type, id: el.dataset.id } : null;
  }
  function rowAt(y) {
    return geometry.rows.find((r) => y >= r.y && y < r.y + r.height);
  }
  function timeAt(x) {
    return Math.max(
      0,
      Math.min(
        doc().time.duration,
        M.snap(geometry.vp.time(x), doc().time.snap),
      ),
    );
  }
  const canvas = $("#canvas-scroll");
  $("#timeline").addEventListener("pointerdown", (e) => {
    if(e.target.closest(".import-error,.cdf-map-marker,.authoring-handle,.axis-cdf"))return;
    if (e.button !== 0) return;
    const p = point(e),
      s = targetInfo(e);
    if (e.target.closest("[data-collapse]")) return;
    if (e.target.closest(".technology-summary")) inspector(true);
    if (space) {
      drag = {
        kind: "pan",
        start: p,
        range: M.clone(doc().views.main.visibleTimeRange),
        scroll: canvas.scrollTop,
      };
      e.preventDefault();
      return;
    }
    if (e.altKey && s && s.type === "state") {
      beginConnection(s, timeAt(p.x));
      drag = { kind: "connect", start: p };
      e.preventDefault();
      return;
    }
    if (connecting) return;
    const junction=e.target.closest('.junction[data-junction-id]');
    if(junction?.dataset.junctionId&&s?.type==='task'){
      select(s);
      drag={kind:'junction',start:p,taskId:s.id,junctionId:junction.dataset.junctionId,
        time:M.get(doc(),'junction',junction.dataset.junctionId).time};
      e.preventDefault();return;
    }
    if (s) {
      if (!selection.some((x) => x.id === s.id) && !e.ctrlKey && !e.metaKey)
        select(s);
      if (s.type === "state" || s.type === "actor")
        drag = {
          kind: s.type,
          start: p,
          selection: M.clone(selection),
          source: s,
          copy: e.ctrlKey || e.metaKey,
        };
    } else if (p.x >= geometry.vp.left)
      drag = {
        kind: "marquee",
        start: p,
        add: e.ctrlKey || e.metaKey,
        selection: M.clone(selection),
      };
  });
  window.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const p = point(e);
    drag.last = p;
    const moved = Math.hypot(p.x - drag.start.x, p.y - drag.start.y) > 4;
    if (!moved) return;
    drag.moved = true;
    $("#gesture-preview")?.remove();
    const ns = "http://www.w3.org/2000/svg",
      preview = document.createElementNS(
        ns,
        drag.kind === "marquee" ? "rect" : "path",
      );
    preview.id = "gesture-preview";
    preview.setAttribute("pointer-events", "none");
    preview.setAttribute("stroke", "#138b89");
    preview.setAttribute(
      "fill",
      drag.kind === "marquee" ? "#138b8915" : "none",
    );
    if (drag.kind === "marquee") {
      for (const [k, v] of Object.entries({
        x: Math.min(drag.start.x, p.x),
        y: Math.min(drag.start.y, p.y),
        width: Math.abs(p.x - drag.start.x),
        height: Math.abs(p.y - drag.start.y),
      }))
        preview.setAttribute(k, v);
    } else if (drag.kind === "pan") {
      const delta = (drag.start.x - p.x) / geometry.vp.scale,
        span = drag.range.end - drag.range.start,
        start = Math.max(
          0,
          Math.min(Math.max(doc().time.duration,...geometry.axis.curves.map(c=>c.start+(c.points.at(-1)?.t||0))) - span, drag.range.start + delta),
        );
      doc().views.main.visibleTimeRange = { start, end: start + span };
      canvas.scrollTop = drag.scroll + drag.start.y - p.y;
      render();
      return;
    } else
      preview.setAttribute(
        "d",
        `M${drag.start.x},${drag.start.y} L${p.x},${p.y}`,
      );
    $("#timeline").append(preview);
    if(drag.kind==='state'||drag.kind==='junction'){
      const delta=M.snap((p.x-drag.start.x)/geometry.vp.scale,doc().time.snap),next=M.clone(doc());
      $('#drag-state-preview')?.remove();
      try{
        const states=drag.kind==='state'?drag.selection.filter(s=>s.type==='state'):[];
        if(drag.kind==='junction')A.moveJunction(next,drag.taskId,drag.junctionId,drag.time+delta,e.shiftKey?'keep':'follow');
        else if(states.length===1)A.moveState(next,states[0].id,M.get(doc(),'state',states[0].id).time+delta,e.shiftKey?'keep':'follow');
        else A.moveSelection(next,drag.selection,delta,e.shiftKey?'keep':'follow');
        const g=L.layout(next,geometry.vp.width),group=document.createElementNS(ns,'g');group.id='drag-state-preview';
        const nodes=drag.kind==='junction'?[...g.junctions.values()].filter(j=>j.explicit===drag.junctionId):states.map(s=>g.states.get(s.id)).filter(Boolean);
        group.innerHTML=nodes.map(q=>`<circle cx="${q.x}" cy="${q.y}" r="12" fill="#087f8030" stroke="#087f80"/><text x="${q.x+15}" y="${q.y-12}" fill="#087f80">T+${q.time}</text>`).join('')+
          g.edges.filter(edge=>{const old=geometry.edges.find(e=>e.type===edge.type&&e.id===edge.id&&e.part===edge.part&&e.junctionId===edge.junctionId&&e.outcomeIndex===edge.outcomeIndex);return old&&L.path(old.points)!==L.path(edge.points);})
            .map(edge=>`<path d="${L.path(edge.points)}" fill="none" stroke="#087f80" stroke-width="2" stroke-dasharray="4 3" opacity=".65" pointer-events="none"/>`).join('');
        $('#timeline').append(group);$('#status').textContent=`${delta>=0?'+':''}${delta} ${doc().time.unit} · ${e.shiftKey?'後続時刻を維持':'後続の所要時間を維持'}`;
      }catch(err){preview.setAttribute('stroke','#b42318');$('#status').textContent=err.message;}
    }
    if(drag.kind==='actor'){const row=rowAt(p.y);if(row&&row.actor.id!==drag.source.id){const ratio=(p.y-row.y)/row.height;preview.setAttribute('d',ratio<.25||ratio>.75?`M0,${ratio<.25?row.y:row.y+row.height} H${geometry.vp.width}`:`M2,${row.y+2} H${geometry.vp.left-5} V${row.y+row.height-2} H2 Z`);$('#status').textContent=ratio<.25?'この行の上へ移動':ratio>.75?'この行の下へ移動':`${row.actor.name}の子にする`;}}
  });
  window.addEventListener("pointerup", (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    $("#gesture-preview")?.remove();
    $('#drag-state-preview')?.remove();
    if (!d.moved && d.kind !== "connect") return;
    swallowClick = true;
    setTimeout(() => (swallowClick = false), 0);
    const p = point(e),
      target = targetInfo(e);
    if (d.kind === "connect") {
      if (target) connect(target, timeAt(p.x));
      return;
    }
    if (d.kind === "marquee") {
      const box = {
        x: Math.min(d.start.x, p.x),
        y: Math.min(d.start.y, p.y),
        width: Math.abs(p.x - d.start.x),
        height: Math.abs(p.y - d.start.y),
      };
      selection = d.add ? d.selection : [];
      for (const s of geometry.states.values())
        if (
          s.x >= box.x &&
          s.x <= box.x + box.width &&
          s.y >= box.y &&
          s.y <= box.y + box.height &&
          !selection.some((x) => x.id === s.id)
        )
          selection.push({ type: "state", id: s.id });
      render();
      return;
    }
    if(d.kind==='junction'){
      const delta=M.snap((p.x-d.start.x)/geometry.vp.scale,doc().time.snap);
      change(next=>A.moveJunction(next,d.taskId,d.junctionId,d.time+delta,e.shiftKey?'keep':'follow'));
    }
    if (d.kind === "state") {
      const delta = M.snap(
        (p.x - d.start.x) / geometry.vp.scale,
        doc().time.snap,
      );
      const row = rowAt(p.y);
      const targetActorId =
        row?.actor.id !== geometry.states.get(d.source.id)?.displayActorId
          ? row?.actor.id
          : null;
      const result = change((next) => {
        let sel = d.selection;
        if (d.copy) sel = M.paste(next, M.fragment(next, sel));
        const states=sel.filter(s=>s.type==='state');
        if(states.length===1&&!d.copy){A.moveState(next,states[0].id,M.get(next,'state',states[0].id).time+delta,e.shiftKey?'keep':'follow');if(targetActorId)M.get(next,'state',states[0].id).actorId=targetActorId;M.validate(next);}
        else A.moveSelection(next,sel,delta,e.shiftKey?'keep':'follow',targetActorId);
        return sel;
      });
      if (result) {
        selection = result;
        render();
      }
    }
    if (d.kind === "actor") {
      const row = rowAt(p.y);
      if (row && row.actor.id !== d.source.id) {
        const ratio = (p.y - row.y) / row.height,
          position =
            ratio < 0.25 ? "before" : ratio > 0.75 ? "after" : "inside";
        change((next) => {
          const ids = d.selection
            .filter((s) => s.type === "actor")
            .map((s) => s.id)
            .filter(
              (id) =>
                !d.selection.some(
                  (s) =>
                    s.type === "actor" &&
                    s.id !== id &&
                    M.descendants(next, s.id).has(id),
                ),
            );
          for (const aid of ids)
            M.placeActor(next, aid, row.actor.id, position);
        });
      }
    }
    if (d.kind === "pan") persist();
  });
  $("#timeline").addEventListener("click", async (e) => {
    const cdfMarker=e.target.closest(".cdf-map-marker");
    if(cdfMarker){allCDFPanel.focus(cdfMarker.dataset.cdfKey);return;}
    const editButton=e.target.closest("[data-edit-error]");
    if(editButton){const ref=D.target(editPreview,editPreview.errors[+editButton.dataset.editError]);if(ref){select(ref);edit(ref);}return;}
    if(e.target.closest(".undo-edit-error")){undo();return;}
    const copyButton=e.target.closest(".copy-import-error");
    if(copyButton){
      const text=copyButton.closest(".import-error").querySelector(".import-error-detail").textContent;
      try {
        if(!navigator.clipboard?.writeText)throw new Error("clipboard unavailable");
        await navigator.clipboard.writeText(text);
        copyButton.textContent="コピー済み";
      }catch(_){
        const field=document.createElement("textarea");field.value=text;field.readOnly=true;
        field.style.cssText="position:fixed;left:0;top:0;width:1px;height:1px;opacity:0";
        document.body.append(field);field.select();
        let copied=false;try{copied=!!document.execCommand?.("copy");}catch(_){}field.remove();
        if(copied)copyButton.textContent="コピー済み";
        else {
          const detail=copyButton.closest(".import-error").querySelector(".import-error-detail"),range=document.createRange();
          detail.focus();range.selectNodeContents(detail);const selectedText=window.getSelection();selectedText.removeAllRanges();selectedText.addRange(range);
          toast("自動コピーできませんでした。選択されたエラー詳細をCtrl+C / ⌘Cでコピーしてください。");
        }
      }
      return;
    }
    if(e.target.closest(".import-error"))return;
    if (swallowClick) return;
    const toggle = e.target.closest("[data-collapse]");
    if (toggle) {
      change((d) => {
        const v = d.views.main,
          aid = toggle.dataset.collapse;
        v.collapsedActors = v.collapsedActors.includes(aid)
          ? v.collapsedActors.filter((x) => x !== aid)
          : [...v.collapsedActors, aid];
      });
      return;
    }
    const s = targetInfo(e);
    if (connecting && s) {
      connect(s,e.target.closest(".junction[data-time]") ? +e.target.closest(".junction[data-time]").dataset.time : timeAt(point(e).x));
      return;
    }
    // Selection redraw can detach the pressed SVG node and suppress the native
    // dblclick. The second click still carries the browser's click count.
    if (e.detail === 2) {
      doubleClick(e);
      return;
    }
    if(e.target.closest(".technology-summary")) inspector(true);
    select(s, e.ctrlKey || e.metaKey);
  });
  function doubleClick(e) {
    if(e.target.closest(".import-error,.cdf-map-marker"))return;
    if (document.querySelector("dialog[open]")) return;
    const summary = e.target.closest("[data-expand-group]");
    if (summary) {
      change(d => { d.views.main.collapsedActors = d.views.main.collapsedActors.filter(id => id !== summary.dataset.expandGroup); });
      return;
    }
    const s = targetInfo(e);
    if (s) edit(s);
    else {
      const p = point(e),
        row = rowAt(p.y);
      if (row && p.x >= geometry.vp.left)
        editState(null, row.actor.id, timeAt(p.x));
    }
  }
  $("#timeline").addEventListener("dblclick", doubleClick);
  function menu(e, entries) {
    const el = $("#context-menu");
    el.replaceChildren();
    for (const [label, fn] of entries)
      el.append(
        button(label, () => {
          el.hidden = true;
          fn();
        }),
      );
    el.hidden = false;
    el.style.left =
      Math.max(8, Math.min(e.clientX, window.innerWidth - 220)) + "px";
    el.style.top =
      Math.max(
        8,
        Math.min(e.clientY, window.innerHeight - el.offsetHeight - 10),
      ) + "px";
  }
  $("#timeline").addEventListener("contextmenu", (e) => {
    if(e.target.closest(".import-error"))return;
    if(e.target.closest(".cdf-map-marker")){e.preventDefault();return;}
    e.preventDefault();
    const s = targetInfo(e),
      p = point(e),
      row = rowAt(p.y),
      entries = [];
    if (s) {
      if (!selection.some((x) => x.id === s.id)) select(s);
      entries.push(["編集", () => edit(s)], ["削除", deleteSelection]);
      if (["state", "actor"].includes(s.type))
        entries.push(
          ["複製", duplicate],
          ["コピー", () => copy()],
          ["切り取り", () => copy(true)],
        );
      if (s.type === "state")
        entries.push(["ここから接続", () => beginConnection(s, timeAt(p.x))]);
      if(s.type==='state')entries.push(['次の活動を追加',()=>authoringUI.activity(M.get(doc(),'state',s.id).actorId,s.id)],
        [doc().simulation?.successStateIds?.includes(s.id)?'達成目標を解除':'達成目標にする',()=>authoringUI.goals(s.id)],
        ['合流条件を切り替え (AND / OR)',()=>change(d=>{const before=M.clone(d),st=M.get(d,'state',s.id);st.simulation={...st.simulation,join:st.simulation?.join==='any'?'all':'any'};A.reconcile(d,before);})]);
      if (s.type === "task") {
        entries.push(['途中の成果を追加',()=>authoringUI.split(s.id,timeAt(p.x))]);
        const junction = e.target.closest(".junction[data-time]"),
          w = M.taskWindow(doc(), M.get(doc(), "task", s.id)),
          time = junction ? +junction.dataset.time : Math.max(w.start,Math.min(w.end,timeAt(p.x)));
        entries.push(["分岐を追加",
          () => addResult(s.id, {time,fixedTime:!!junction})]);
      }
      if (s.type === "causalLink" && M.get(doc(), "causalLink", s.id).target.type === "junction")
        entries.push(["分岐を追加", () => addCausalResult(s.id)]);
      if (s.type === "actor")
        entries.push(
          ['活動を追加',()=>authoringUI.activity(s.id)],
          ["子Actor追加", () => editActor(null, s.id)],
          ["子Group追加", () => editActor(null, s.id, true)],
          ["選択Actorをグループ化", group],
          ["グループ解除", () => change((d) => M.ungroupActor(d, s.id))],
          ["上へ", () => reorder(-1)],
          ["下へ", () => reorder(1)],
        );
      if (["actor","task","causalLink"].includes(s.type))
        entries.push(["技術を関連付け", () => editBinding(s)]);
    } else {
      if (row)
        entries.push(['活動を追加',()=>authoringUI.activity(row.actor.id,null,timeAt(p.x))]);
      if (row)
        entries.push([
          "State追加",
          () => editState(null, row.actor.id, timeAt(p.x)),
        ]);
      entries.push(
        ["Actor追加", () => editActor()],
        ["貼り付け", paste],
        ["SVG出力", exportSVG],
        ["PNG出力", exportPNG],
      );
    }
    menu(e, entries);
  });
  window.addEventListener("pointerdown", (e) => {
    if (!e.target.closest("#context-menu")) $("#context-menu").hidden = true;
  });
  function reorder(direction) {
    const s = selected();
    if (s?.type !== "actor") return;
    const order = M.hierarchy(doc(), true),
      i = order.findIndex((r) => r.actor.id === s.id),
      target = order[i + direction];
    if (target)
      change((d) =>
        M.placeActor(
          d,
          s.id,
          target.actor.id,
          direction < 0 ? "before" : "after",
        ),
      );
  }
  function undo() {
    if(importPreview)importPreview=null;else if(!editPreview?.operationOnly)history.undo();
    refreshEditPreview();
    selection = [];
    render();
    persist();
  }
  function redo() {
    if(importPreview)return;
    history.redo();
    refreshEditPreview();
    selection = [];
    render();
    persist();
  }
  function setRange(start, end) {
    const duration = Math.max(doc().time.duration,...(geometry?.axis?.curves||[]).map(c=>c.start+(c.points.at(-1)?.t||0))),
      span = Math.max(duration / 1000, Math.min(duration, end - start));
    start = Math.max(0, Math.min(duration - span, start));
    change((d) => {
      d.views.main.visibleTimeRange = { start, end: start + span };
      d.views.main.zoom = Math.max(1,d.time.duration / span);
    });
  }
  function zoom(factor) {
    const r = doc().views.main.visibleTimeRange,
      center = (r.start + r.end) / 2,
      span = (r.end - r.start) / factor;
    setRange(center - span / 2, center + span / 2);
  }
  function viewSettings() {
    const v = doc().views.main;
    dialog(
      "表示設定",
      field(
        "laneHeight",
        "通常のサブレーン間隔（52〜160px）",
        v.laneHeight,
        "number",
      ) +
        choices("collapsedLayout", "折りたたみ表示", [
          ["compact", "コンパクト（間隔28px）"],
          ["single", "1本に集約"],
          ["spaced", "通常間隔"],
        ], v.collapsedLayout) +
        '<p class="dialog-summary">コンパクトではState名、1本ではState・Task名をホバーで確認できます。1本の集約表示はダブルクリックで展開して編集できます。</p>' +
        Object.entries({
          technology: "Technology",
          causalLink: "作用線",
          implicitDependencies: "暗黙の開始依存（破線）",
          quiet: "控えめなState",
        })
          .map(([key, label]) =>
            choices(
              key,
              label,
              [
                ["true", "表示"],
                ["false", "非表示"],
              ],
              String(v.filters[key]),
            ),
          )
          .join(""),
      (values) =>
        applyEdit((d) => {
          d.views.main.laneHeight = +values.laneHeight;
          d.views.main.collapsedLayout = values.collapsedLayout;
          for (const key of ["technology", "causalLink", "quiet", "implicitDependencies"])
            d.views.main.filters[key] = values[key] === "true";
        }),
    );
  }
  function search() {
    inspector(true);
    $("#inspector").innerHTML =
      '<div class="inspector-heading"><h3>検索</h3><button id="search-close">×</button></div><input class="search-input" id="search-input" placeholder="Actor・State・Taskを検索"><div class="search-results"></div>';
    $("#search-close").onclick = () => renderInspector();
    const update = () => {
      const query = $("#search-input").value.toLowerCase(),
        list = $(".search-results");
      list.replaceChildren();
      for (const type of ["actor", "state", "task", "causalLink", "technology"])
        for (const x of doc()
          [M.collections[type]].filter((x) =>
            [x.name,x.label,x.notes,x.id].filter(Boolean).join(' ').toLowerCase().includes(query),
          )
          .slice(0, 100))
          list.append(
            button(`${type} · ${A.label(doc(),type,x.id)}`, () => {
              const aid =
                type === "actor"
                  ? x.id
                  : type === "state"
                    ? x.actorId
                    : type==='task'?M.get(doc(), "state", x.fromStateId).actorId:type==='causalLink'?M.get(doc(),'state',x.source.id).actorId:null;
              doc().views.main.collapsedActors =
                doc().views.main.collapsedActors.filter(
                  (id) => !M.descendants(doc(), id).has(aid),
                );
              if (type !== "actor" && type !== "technology") {
                const t =
                    type === "state" ? x.time : type==='task'?M.taskWindow(doc(), x).start:M.get(doc(),'state',x.source.id).time,
                  r = doc().views.main.visibleTimeRange,
                  span = r.end - r.start;
                if (t < r.start || t > r.end)
                  setRange(t - span / 2, t + span / 2);
              }
              select({ type, id: x.id });
              const row = geometry.rows.find((r) => r.actor.id === aid);
              if(row)canvas.scrollTo({ top: Math.max(0, row.y - 40) });
              persist();
            }),
          );
    };
    $("#search-input").oninput = update;
    update();
    $("#search-input").focus();
  }
  function documentSettings() {
    const d = doc();
    dialog(
      "ミッション設定",
      field("title", "タイトル", d.title) +
        choices(
          "unit",
          "時間単位",
          ["seconds", "minutes", "hours"],
          d.time.unit,
        ) +
        choices('unitPolicy','変更時の扱い',[['convert','同じ実時間を保って換算'],['reinterpret','数値を保って単位変更']],'convert')+
        field("duration", "全期間", d.time.duration, "number"),
      (v) =>
        applyEdit((next) => {
          next.title = v.title;
          const factor=A.convertUnit(next,v.unit,v.unitPolicy==='convert');
          next.time.duration = +v.duration*factor;
          next.views.main.visibleTimeRange = { start: 0, end: next.time.duration };
          next.views.main.zoom = 1;
        }),
    );
  }
  function download(blob, name) {
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function saveJSON() {
    download(
      new Blob([JSON.stringify(importPreview?.original || doc(), null, 2)], { type: "application/json" }),
      "mission-v3.json",
    );
  }
  function exportSource() {
    const d = M.clone(doc());
    d.views.main.mode = "mission";
    simulationPanel?.invalidate();
    const g = L.layout(d, Math.max(1050, geometry.vp.width), { full: true, simulationResult:simulationPanel?.getOverlayResult(),cdfResult:simulationPanel?.getResult(),cdfSelection:selection });
    return {
      svg: R.render(d, g, { export: true, full: true }),
      width: g.vp.width,
      height: g.height,
    };
  }
  function exportSVG() {
    const result = exportSource();
    download(
      new Blob([result.svg], { type: "image/svg+xml;charset=utf-8" }),
      "mission.svg",
    );
    toast("全期間・全階層のSVGを出力しました");
  }
  async function exportPNG() {
    let url;
    try {
      const source = exportSource(),
        scale = Math.min(
          2,
          16384 / source.width,
          16384 / source.height,
          Math.sqrt(32000000 / (source.width * source.height)),
        ),
        width = Math.max(1, Math.floor(source.width * scale)),
        height = Math.max(1, Math.floor(source.height * scale));
      const svg = source.svg.replace(
        /width="[^"]+" height="[^"]+"/,
        `width="${width}" height="${height}"`,
      );
      url = URL.createObjectURL(
        new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
      );
      const image = new Image();
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () =>
          reject(new Error("SVG画像を読み込めませんでした。"));
        image.src = url;
      });
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvasを利用できません。");
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(image, 0, 0, width, height);
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (!blob) throw new Error("PNGへの変換に失敗しました。");
      download(blob, "mission.png");
      toast("PNGを出力しました");
    } catch (e) {
      toast(e.message);
    } finally {
      if (url) URL.revokeObjectURL(url);
    }
  }
  function loadJSON(text) {
    const inspected=D.inspect(text);
    editPreview=null;
    if(inspected.errors.length)importPreview=inspected;
    else {history.commit(inspected.document);importPreview=null;}
    selection = [];
    connecting = null;
    render();
    persist();
  }
  function confirmReplace(title, fn) {
    dialog(
      title,
      "<p>現在の文書を置き換えます。置き換え後はUndoで戻せます。</p>",
      () => fn(),
    );
  }
  $("#file-input").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      if (file.size > 8 * 1024 * 1024)
        throw new Error("JSONは8MiB以下にしてください。");
      const text = await file.text();
      D.inspect(text);
      confirmReplace("JSONを読み込む", () => loadJSON(text));
    } catch (e) {
      toast(errorText(e));
    }
    e.target.value = "";
  };
  $("#open-btn").onclick = () => $("#file-input").click();
  $("#save-btn").onclick = saveJSON;
  $("#document-title").onclick = documentSettings;
  $("#add-actor").onclick = () => editActor();
  $("#add-group").onclick = () => editActor(null, null, true);
  $("#undo").onclick = undo;
  $("#redo").onclick = redo;
  $("#group-selected").onclick = group;
  $("#view-settings").onclick = viewSettings;
  $("#view-mode").onchange = (e) => {
    change((d) => (d.views.main.mode = e.target.value));
    if (["technology", "gap"].includes(doc().views.main.mode)) inspector(true);
  };
  $("#snap").onchange = (e) => change((d) => (d.time.snap = +e.target.value));
  $("#zoom-in").onclick = () => zoom(1.5);
  $("#zoom-out").onclick = () => zoom(1 / 1.5);
  $("#fit").onclick = () => setRange(0, doc().time.duration);
  $("#time-pan").oninput = (e) => {
    const span =
      doc().views.main.visibleTimeRange.end -
      doc().views.main.visibleTimeRange.start;
    setRange(+e.target.value, +e.target.value + span);
  };
  for (const [id, sign] of [
    ["time-prev", -1],
    ["time-next", 1],
  ])
    $("#" + id).onclick = () => {
      const r = doc().views.main.visibleTimeRange,
        delta = (r.end - r.start) * 0.25 * sign;
      setRange(r.start + delta, r.end + delta);
    };
  $("#time-window").onclick = () => {
    const r = doc().views.main.visibleTimeRange;
    dialog(
      "表示時間範囲",
      field("start", "開始", r.start, "number") +
        field("end", "終了", r.end, "number"),
      (v) => {
        if (+v.end <= +v.start)
          throw new Error("終了は開始より後にしてください");
        setRange(+v.start, +v.end);
      },
    );
  };
  $("#search-btn").onclick = search;
  $("#inspector-toggle").onclick = () =>
    inspector($("#inspector").classList.contains("hidden"));
  $("#help-btn").onclick = () => $("#help-dialog").showModal();
  $("#help-close").onclick = () => $("#help-dialog").close();
  $("#dialog-close").onclick = $("#dialog-cancel").onclick = () =>
    {rollbackConnection();$("#editor-dialog").close();};
  function rollbackConnection(){if(!provisionalConnection)return;history.doc=provisionalConnection.document;history.past=provisionalConnection.past;history.future=provisionalConnection.future;provisionalConnection=null;selection=[];render();persist();}
  $('#editor-dialog').addEventListener('cancel',rollbackConnection);
  $("#more-btn").onclick = (e) =>
    menu(e, [
      ["SVG出力", exportSVG],
      ["PNG出力", exportPNG],
      ['新しいシナリオ',()=>authoringUI.newDocument()],
      ['文書・別案・保存時点',()=>authoringUI.documents()],
      ["Technologyカタログ", catalog],
      ["共通時間軸デモ（図上CDF・固定時刻）",()=>confirmReplace("共通時間軸デモへ置き換え",()=>loadJSON(JSON.stringify(createTimeAxisSample())))],
      ["表現デモ（捜索・識別・通信）", () =>
        confirmReplace("表現デモへ置き換え", () =>
          loadJSON(JSON.stringify(createTutorialSample())))],
      [
        "基本サンプル",
        () =>
          confirmReplace("サンプルへ置き換え", () =>
            loadJSON(JSON.stringify(createSample())),
          ),
      ],
      [
        "階層サンプル",
        () =>
          confirmReplace("サンプルへ置き換え", () =>
            loadJSON(JSON.stringify(createGroupedSample())),
          ),
      ],
      [
        "技術・Gapサンプル",
        () =>
          confirmReplace("サンプルへ置き換え", () =>
            loadJSON(JSON.stringify(createResearchSample())),
          ),
      ],
    ]);
  window.addEventListener("keydown", (e) => {
    if (
      e.target.closest(".import-error") ||
      e.target.matches("input,textarea,select") ||
      document.querySelector("dialog[open]")
    )
      return;
    const ctrl = e.ctrlKey || e.metaKey,
      key = e.key.toLowerCase();
    if (key === "escape") {
      connecting = null;
      drag = null;
      $("#context-menu").hidden = true;
      render();
      return;
    }
    if (key === " ") {
      space = true;
      e.preventDefault();
      return;
    }
    if (ctrl) {
      const actions = {
        z: e.shiftKey ? redo : undo,
        y: redo,
        d: duplicate,
        c: () => copy(),
        x: () => copy(true),
        v: paste,
        s: saveJSON,
        g: e.shiftKey
          ? () =>
              change((d) =>
                selection
                  .filter((s) => s.type === "actor")
                  .forEach((s) => M.ungroupActor(d, s.id)),
              )
          : group,
      };
      if (actions[key]) {
        e.preventDefault();
        actions[key]();
        return;
      }
    }
    if (key === "delete" || key === "backspace") {
      e.preventDefault();
      deleteSelection();
    }
    if (key === "enter") edit();
    if (key === "c") beginConnection();
    if (key === "f") {
      e.preventDefault();
      search();
    }
    if (key === "arrowleft" || key === "arrowright") {
      e.preventDefault();
      change((d) =>
        selection.length===1&&selection[0].type==='state'?A.moveState(d,selection[0].id,M.get(d,'state',selection[0].id).time+(key==='arrowleft'?-1:1)*d.time.snap,e.shiftKey?'keep':'follow'):A.moveSelection(
          d,
          selection,
          (key === "arrowleft" ? -1 : 1) * d.time.snap,
          e.shiftKey ? 'keep' : 'follow',
        ),
      );
    }
    if (key === "arrowup" || key === "arrowdown") {
      e.preventDefault();
      reorder(key === "arrowup" ? -1 : 1);
    }
  });
  window.addEventListener("keyup", (e) => {
    if (e.key === " ") space = false;
  });
  window.addEventListener("blur", () => {
    space = false;
    drag = null;
  });
  window.addEventListener("resize", render);
  // Small public integration surface for embedding, importers, and deterministic tests.
  window.IMEE = {
    getDocument: () => M.clone(importPreview?.original || doc()),
    getImportErrors: () => M.clone(importPreview?.errors || []),
    getEditErrors: () => M.clone(editPreview?.errors || []),
    loadJSON,
    exportSource,
    exportSVG,
    exportPNG,
    undo,
    redo,
    authoring:A,
    select:s=>{select(s);inspector(true);},
    getWorkspace:()=>workspace.list(),
  };
  function navigate(s){
    const x=M.get(doc(),s.type,s.id);if(!x)return;
    const aid=s.type==='actor'?x.id:s.type==='state'?x.actorId:s.type==='task'?M.get(doc(),'state',x.fromStateId).actorId:s.type==='causalLink'?M.get(doc(),'state',x.source.id).actorId:null;
    let start=0,end=doc().time.duration;
    if(s.type==='state'){start=x.time-doc().time.snap*5;end=x.time+doc().time.snap*5;}
    if(s.type==='task'){const w=M.taskWindow(doc(),x);start=w.start;end=w.end;}
    if(s.type==='causalLink'){start=M.get(doc(),'state',x.source.id).time;end=M.causalArrivalTime(doc(),x);}
    change(d=>{if(aid)d.views.main.collapsedActors=d.views.main.collapsedActors.filter(id=>!M.descendants(d,id).has(aid));const padding=Math.max(d.time.snap,(end-start)*.2);d.views.main.visibleTimeRange={start:Math.max(0,start-padding),end:Math.min(d.time.duration,Math.max(start+padding,end+padding))};});
    select(s);inspector(true);const row=geometry.rows.find(r=>r.actor.id===aid);if(row)canvas.scrollTo({top:Math.max(0,row.y-40)});
  }
  function loadDocument(document){const inspected=D.inspect(JSON.stringify(document));importPreview=null;editPreview=null;if(inspected.errors.length){history.commit(document,{draft:true});refreshEditPreview();}else{history=new M.History(document);}selection=[];connecting=null;render();persist();}
  authoringUI=window.MEAuthoringUI.controller({getDocument:doc,change,applyEdit,dialog,field,choices,select,selected,edit,beginConnection,addActor:()=>editActor(),navigate,workspace,loadDocument,getImport:()=>importPreview,getDiagnostics:()=>importPreview||editPreview,
    repairImport:d=>{workspace.checkpoint('読み込み修正前の原文',importPreview.original);loadJSON(JSON.stringify(d));},toast,geometry:()=>geometry,render,
    pan:time=>{const span=doc().views.main.visibleTimeRange.end-doc().views.main.visibleTimeRange.start;setRange(time-span/2,time+span/2);}});
  allCDFPanel=window.MEAllCDFUI.controller({getDocument:()=>M.clone(doc()),download,onHighlight:render,
    onEditTarget:t=>{const s={type:t.type,id:t.id};navigate(s);edit(s);},
    onShowTarget:t=>{selection=[{type:t.type,id:t.id}];change(d=>{d.views.main.collapsedActors=[];d.views.main.visibleTimeRange={start:0,end:d.time.duration};});
      const node=[...$("#timeline").querySelectorAll("[data-type][data-id]")].find(e=>e.dataset.type===t.type&&e.dataset.id===t.id);node?.scrollIntoView?.({block:"center",inline:"center"});}
  });
  $("#all-cdf-open").onclick=()=>{$("#simulation-dialog").close();allCDFPanel.open();};
  $("#timeline").addEventListener("keydown",e=>{if(["Enter"," "].includes(e.key)&&e.target.closest(".cdf-map-marker")){e.preventDefault();e.stopPropagation();allCDFPanel.focus(e.target.closest(".cdf-map-marker").dataset.cdfKey);}});
  simulationPanel = window.MESimulationUI.controller({
    getDocument: () => M.clone(doc()), download,onOverlayChange:render,
    configure: () => dialog("Simulation設定", window.MESimulationUI.settingsFields(doc()), () => {
      applyEdit(d => {
        d.simulation = window.MESimulationUI.readSettings($("#editor-form"));
        if (!d.simulation.successStateIds.length) throw new Error("成功Stateを1件以上選択してください。");
      });
      setTimeout(() => simulationPanel.open(), 0);
    }),
    loadDemo: () => confirmReplace("シミュレーション例へ置き換え", () => {
      loadJSON(JSON.stringify(createSimulationSample()));
      setTimeout(() => simulationPanel.open(), 0);
    }),
  });
  $("#simulation-btn").onclick = ()=>{if(!importPreview&&!editPreview)simulationPanel.open();};
  $("#axis-cdf-fit").onclick=()=>setRange(0,Math.max(doc().time.duration,...geometry.axis.curves.map(c=>c.start+(c.points.at(-1)?.t||0))));
  $("#timeline").addEventListener("pointermove",e=>{
    $("#axis-cdf-cursor")?.remove();if(drag||connecting)return;
    const p=point(e),c=geometry.cdfCharts?.find(c=>p.y>=c.y-c.height-5&&p.y<=c.y+5&&p.x>=c.startX&&p.x<=Math.max(c.endX,c.startX+8));
    if(!c)return;
    const absolute=geometry.vp.time(p.x),t=absolute-c.start,ps=c.distribution;
    let probability=0,left={t:0,p:0};
    for(const right of ps){if(t<right.t){if(c.kind==='config')probability=left.p+(right.p-left.p)*(t-left.t)/(right.t-left.t);else probability=left.p;break;}probability=right.p;left=right;}
    const textX=Math.max(geometry.vp.left+4,Math.min(p.x+6,geometry.vp.width-160));
    $('#timeline').insertAdjacentHTML('beforeend',`<g id="axis-cdf-cursor" pointer-events="none"><path d="M${p.x},${c.y-c.height} V${c.y}" stroke="#087f80" stroke-dasharray="2 2"/><rect x="${textX-3}" y="${c.y-c.height-23}" width="158" height="18" rx="3" fill="white"/><text x="${textX}" y="${c.y-c.height-10}" font-size="10">H+${Number(absolute.toFixed(2))} : ${(probability*100).toFixed(1)}%</text></g>`);
  });
  $("#timeline").addEventListener("pointerleave",()=>$("#axis-cdf-cursor")?.remove());

  for(const [id,key] of [["axis-cdf-mode","cdfMode"],["axis-cdf-scope","cdfScope"],["axis-cdf-q","cdfQ"]])$("#"+id).addEventListener(id==="axis-cdf-q"?"input":"change",e=>change(d=>{d.views.main[key]=key==="cdfQ"?+e.target.value:e.target.value;}));
  cdfHover=window.MESimulationUI.hoverPreview({surface:$("#timeline"),getDocument:doc,
    canShow:()=>!drag && !connecting && !space && !document.querySelector("dialog[open]")});
  inspector(false);
  render();
  persist();
})();
