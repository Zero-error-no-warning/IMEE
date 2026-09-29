/* Direct manipulation controller. Classic scripts keep file:// usable. */
(function () {
  "use strict";
  const M = window.ME,
    L = window.MELayout,
    R = window.MERender,
    $ = (s) => document.querySelector(s),
    esc = R.esc,
    KEY = "imee.document.v2";
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
    gapIds = null;
  try {
    history = new M.History(
      localStorage.getItem(KEY)
        ? M.parse(localStorage.getItem(KEY))
        : createSample(),
    );
  } catch (e) {
    history = new M.History(createSample());
    setTimeout(() => toast("保存データを読み込めません: " + e.message), 0);
  }
  const doc = () => history.doc;
  function toast(message) {
    $("#toast").textContent = message;
    $("#toast").hidden = false;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => ($("#toast").hidden = true), 4500);
    $("#status").textContent = message;
  }
  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(doc()));
      $("#save-status").textContent = "このブラウザに保存";
    } catch (e) {
      $("#save-status").textContent = "自動保存できません";
    }
  }
  function change(fn) {
    const next = M.clone(doc());
    try {
      const result = fn(next);
      history.commit(next);
      render();
      persist();
      return result;
    } catch (e) {
      toast(e.message);
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
    selection = selection.filter((s) => M.get(doc(), s.type, s.id));
    const d = doc();
    geometry = L.layout(
      d,
      Math.max(320, $("#canvas-scroll").clientWidth || window.innerWidth - 48),
    );
    const current = selected();
    chain = null;
    gapIds = null;
    if (
      current?.type === "task" &&
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
      connecting: !!connecting,
      chain,
      gapIds: d.views.main.mode === "gap" ? gapIds : null,
    });
    const svg = holder.firstChild;
    const target = $("#timeline");
    for (const a of [...svg.attributes])
      if (!["id"].includes(a.name)) target.setAttribute(a.name, a.value);
    target.innerHTML = svg.innerHTML;
    $("#document-title").textContent = d.title;
    $("#counts").textContent =
      `${d.actors.length} Actor / ${d.states.length} State / ${d.tasks.length} Task`;
    $("#undo").disabled = !history.past.length;
    $("#redo").disabled = !history.future.length;
    $("#view-mode").value = d.views.main.mode;
    const v = d.views.main,
      r = v.visibleTimeRange,
      span = r.end - r.start;
    $("#zoom-label").textContent =
      Math.round((d.time.duration / span) * 100) + "%";
    $("#time-pan").max = d.time.duration - span;
    $("#time-pan").value = r.start;
    $("#time-pan").disabled = span >= d.time.duration;
    $("#time-window").textContent =
      `T+${+r.start.toFixed(2)} — T+${+r.end.toFixed(2)}`;
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
      ? "接続先のStateまたはTaskをクリック · Escで取消"
      : "空白をダブルクリックでState追加 · 点をドラッグで時刻移動 · Alt / Option＋ドラッグで接続";
    renderInspector();
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
        `<h2 class="panel-title">${selection.length ? selection.length + "件を選択" : "Taskと因果を描く"}</h2><p class="muted">Stateは時点、Taskはその間の行為です。正の因果は実線、負の因果は波線で接続します。</p>`,
      );
      if (selection.length) {
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
      facts = `時刻 T+${x.time} / ${esc(M.get(doc(), "actor", x.actorId).name)}`;
    if (s.type === "task") {
      const w = M.taskWindow(doc(), x);
      facts = `開始 ${w.start} / 終了 ${w.end} / 所要時間 ${+(w.end - w.start).toFixed(4)} ${esc(doc().time.unit)}<br>Taskの時間変更は接続元・先Stateまたは分岐点の時刻変更です。`;
    }
    if (s.type === "causalLink") {
      facts = `${x.polarity === "negative" ? "負の因果（波線）" : "正の因果（実線）"}<br>発生 ${M.endpoint(doc(), x.source).time} → 到達 ${M.endpoint(doc(), x.target).time}<br>分類: ${esc(x.kind || "未指定")}`;
      const o = M.opportunity(doc(), x);
      if (o) facts += `<br>介入時間窓 ${o.start}〜${o.end} / ${esc(o.message)}`;
    }
    panel.insertAdjacentHTML(
      "beforeend",
      `<p class="notes">${facts}</p><p class="notes">${esc(x.notes || "")}</p>`,
    );
    const actions = document.createElement("div");
    actions.className = "panel-actions";
    actions.append(
      button("編集", () => edit(s)),
      button("削除", deleteSelection, "danger"),
    );
    if (["actor", "state"].includes(s.type))
      actions.append(button("複製", duplicate));
    if (["state", "task", "actor"].includes(s.type))
      actions.append(button("ここから接続", () => beginConnection(s)));
    if (s.type === "task")
      actions.append(button("分岐を追加", () => addResult(s.id)));
    if (s.type === "causalLink" && x.target.type === "task")
      actions.append(button("分岐を追加", () => addCausalResult(s.id)));
    if (s.type === "actor") {
      actions.append(
        button("子Actor追加", () => editActor(null, x.id)),
        button("グループ解除", () => change((d) => M.ungroupActor(d, x.id))),
      );
    }
    panel.append(actions);
    if (["actor", "state", "task", "causalLink"].includes(s.type)) {
      panel.append(button("技術を関連付け", () => editBinding(s)));
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
      s.type === "task" &&
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
  function field(name, label, value = "", type = "text") {
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
    $("#dialog-title").textContent = title;
    $("#dialog-fields").innerHTML = html;
    $("#dialog-error").textContent = "";
    $("#editor-form").onsubmit = (e) => {
      e.preventDefault();
      const values = Object.fromEntries(new FormData(e.target));
      try {
        apply(values);
        $("#editor-dialog").close();
      } catch (error) {
        $("#dialog-error").textContent = error.message;
      }
    };
    $("#editor-dialog").showModal();
    $("#dialog-fields input")?.focus();
  }
  function applyEdit(fn) {
    const next = M.clone(doc());
    const result = fn(next);
    history.commit(next);
    if (result?.type) selection = [result];
    render();
    persist();
    return result;
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
        field("time", "時刻", x.time, "number") +
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
        notes(x),
      (v) =>
        applyEdit((d) => {
          const s = { ...x, ...v, time: +v.time };
          if (sid) Object.assign(M.get(d, "state", sid), s);
          else d.states.push(s);
          return { type: "state", id: s.id };
        }),
    );
  }
  function editTask(tid) {
    const t = M.get(doc(), "task", tid),
      w = M.taskWindow(doc(), t);
    let html =
      field("label", "Task名", t.label) +
      field("kind", "分析分類（線種は変わりません）", t.kind || "") +
      `<p class="dialog-summary">開始 ${w.start} / 終了 ${w.end} / 所要時間 ${+(w.end - w.start).toFixed(4)}<br>開始の変更は接続元State、終了の変更は接続先Stateまたは分岐点を変更します。</p>` +
      field("start", "接続元Stateの時刻", w.start, "number");
    if (t.toStateId) html += field("end", "接続先Stateの時刻", w.end, "number");
    for (const [i, j] of (t.junctions || []).entries()) {
      html += field("j" + i, "分岐点 " + (i + 1) + " の時刻", j.time, "number");
      for (const [n, o] of j.outcomes.entries())
        html +=
          field(`label-${i}-${n}`, "結果ラベル", o.label) +
          choices(
            `target-${i}-${n}`,
            "結果State（削除も可能）",
            [
              ["", "この結果を削除"],
              ...doc()
                .states.filter(
                  (s) =>
                    s.actorId ===
                      M.get(doc(), "state", t.fromStateId).actorId &&
                    s.id !== t.fromStateId,
                )
                .map((s) => [s.id, `${s.name} (T+${s.time})`]),
            ],
            o.toStateId,
          );
    }
    dialog("Task", html + notes(t), (v) =>
      applyEdit((d) => {
        const x = M.get(d, "task", tid);
        x.label = v.label;
        x.kind = v.kind;
        x.notes = v.notes;
        M.get(d, "state", x.fromStateId).time = +v.start;
        if (x.toStateId) M.get(d, "state", x.toStateId).time = +v.end;
        const changedTimes = new Map(
          (x.junctions || []).map((j, i) => [j.time, +v["j" + i]]),
        );
        for (const c of d.causalLinks)
          for (const p of [c.source, c.target])
            if (p.type === "task" && p.id === tid && changedTimes.has(p.time))
              p.time = changedTimes.get(p.time);
        for (const [i, j] of (x.junctions || []).entries()) {
          j.time = +v["j" + i];
          j.outcomes = j.outcomes
            .map((o, n) => ({
              label: v[`label-${i}-${n}`],
              toStateId: v[`target-${i}-${n}`],
            }))
            .filter((o) => o.toStateId);
        }
        x.junctions = (x.junctions || []).filter((j) => j.outcomes.length);
      }),
    );
  }
  function addCausalResult(cid) {
    const cause = M.get(doc(), "causalLink", cid);
    if (cause?.target.type === "task")
      addResult(cause.target.id, {time:cause.target.time,fixedTime:true});
  }
  function addResult(tid, context = {}) {
    const t = M.get(doc(), "task", tid),
      s = M.get(doc(), "state", t.fromStateId),
      w = M.taskWindow(doc(), t),
      time = context.time ?? w.end,
      fixedTime = !!context.fixedTime,
      actor = M.get(doc(), "actor", s.actorId);
    if (time < w.start || time > w.end) {
      toast("作用時刻がTaskの実行期間外のため、分岐を追加できません。Taskの期間または作用時刻を編集してください。");
      return;
    }
    dialog(
      "分岐を追加",
      `<p class="dialog-summary">${esc(actor.name)} / ${esc(t.label)}<br>Taskの実行期間: ${w.start}〜${w.end}</p>` +
        '<p id="branch-related-causes" class="dialog-summary" hidden></p>' +
        field("time", "分岐する時刻", time, "number") +
        field("label", "結果ラベル", "別の結果") +
        choices("toStateId", "接続先State", [
          ["", "新しいStateを作成"],
          ...doc().states.filter(x => x.actorId === s.actorId && x.id !== s.id)
            .map(x => [x.id, `${x.name} (T+${x.time})`]),
        ], "") +
        '<div id="new-result-state">' +
        field("name", "新規State名", "") +
        field("stateTime", "新規Stateの時刻", time, "number") + '</div>' +
        '<p class="muted">元の到達先とTaskの終了時刻を保って、別の結果を追加します。同じ時刻の結果は1つの白丸へ集約します。新規Stateの時刻は、結果が現れる時刻に変更できます。</p>',
      (v) => applyEdit((d) => {
        const branchTime = fixedTime ? time : +v.time;
        let target = v.toStateId;
        if (!target) {
          target = M.id("state");
          d.states.push({id:target,actorId:s.actorId,name:v.name,time:+v.stateTime,activity:"active",phase:"other"});
        }
        M.addOutcome(d, tid, branchTime, target, v.label);
        return {type:"task",id:tid};
      }),
    );
    const timeInput = $('#dialog-fields [name="time"]');
    const updateRelatedCauses = () => {
      const causes = doc().causalLinks.filter(c => c.target.type === "task" && c.target.id === tid && c.target.time === +timeInput.value),
        summary = $('#branch-related-causes');
      summary.hidden = !causes.length;
      summary.innerHTML = causes.length
        ? `この時刻に到達する作用（T+${esc(timeInput.value)}）:<br>${causes.map(c => esc(c.label)).join("<br>")}<br><span class="muted">参考表示です。作用と分岐の紐付けや、分岐条件は設定されません。</span>`
        : "";
    };
    timeInput.readOnly = fixedTime;
    updateRelatedCauses();
    let previousTime = time;
    timeInput.oninput = () => {
      const stateTime = $('#dialog-fields [name="stateTime"]');
      if (+stateTime.value === previousTime) stateTime.value = timeInput.value;
      previousTime = +timeInput.value;
      updateRelatedCauses();
    };
    $('#dialog-fields [name="toStateId"]').onchange = (e) => {
      const fields = $('#new-result-state');
      fields.hidden = !!e.target.value;
      fields.querySelectorAll('input').forEach(input => { input.disabled = !!e.target.value; });
    };
    $('#dialog-fields [name="name"]').placeholder = "例：無力化、通信回復";
    $('#dialog-fields [name="label"]').focus();
  }
  function endpointFields(name, p) {
    const opts = [
      ...doc().states.map((s) => ["state:" + s.id, `State: ${s.name}`]),
      ...doc().tasks.map((t) => ["task:" + t.id, `Task: ${t.label}`]),
      ...doc().actors.map((a) => ["actor:" + a.id, `Actor: ${a.name}`]),
    ];
    return (
      choices(
        name,
        "因果の" + (name === "source" ? "作用元" : "到達先"),
        opts,
        p.type + ":" + p.id,
      ) +
      field(
        name + "Time",
        "Task / Actor上の時刻（Stateには適用しません）",
        M.endpoint(doc(), p).time,
        "number",
      )
    );
  }
  function editCausal(cid) {
    const c = M.get(doc(), "causalLink", cid);
    dialog(
      "因果リンク",
      field("label", "作用のラベル", c.label) +
        choices(
          "polarity",
          "因果の向き",
          [
            ["positive", "正の因果 — 実線"],
            ["negative", "負の因果 — 波線"],
          ],
          c.polarity,
        ) +
        endpointFields("source", c.source) +
        endpointFields("target", c.target) +
        field("kind", "分析分類", c.kind || "") +
        notes(c),
      (v) =>
        applyEdit((d) => {
          const x = M.get(d, "causalLink", cid);
          for (const name of ["source", "target"]) {
            const i = v[name].indexOf(":"),
              type = v[name].slice(0, i),
              id = v[name].slice(i + 1);
            x[name] = {
              type,
              id,
              ...(type === "state" ? {} : { time: +v[name + "Time"] }),
            };
          }
          Object.assign(x, {
            label: v.label,
            polarity: v.polarity,
            kind: v.kind,
            notes: v.notes,
          });
        }),
    );
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
    if (!doc().technologies.length) {
      editTechnology();
      toast("技術を登録してから、もう一度「技術を関連付け」を選んでください。");
      return;
    }
    dialog(
      "技術を関連付け",
      choices(
        "technologyId",
        "Technology",
        doc().technologies.map((t) => [t.id, t.name]),
        doc().technologies[0].id,
      ),
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
          button(x.name || x.label, () =>
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
  }
  function deleteSelection() {
    if (selection.length) change((d) => M.remove(d, selection));
    selection = [];
    render();
  }
  function copy(cut = false) {
    clipboard = M.fragment(doc(), selection);
    if (cut) deleteSelection();
    else toast("文書内クリップボードにコピーしました");
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
  function asEndpoint(s, time) {
    if (s.type === "state") return { type: s.type, id: s.id };
    if (s.type === "task") {
      const w = M.taskWindow(doc(), item(s));
      return {
        type: s.type,
        id: s.id,
        time: Math.max(w.start, Math.min(w.end, time ?? (w.start + w.end) / 2)),
      };
    }
    if (s.type === "actor")
      return {
        type: s.type,
        id: s.id,
        time: time ?? doc().views.main.visibleTimeRange.start,
      };
  }
  function beginConnection(s = selected(), time) {
    if (!s) return;
    connecting = asEndpoint(s, time);
    render();
  }
  function connect(target, time) {
    const source = connecting,
      end = asEndpoint(target, time);
    if (!source || !end) return;
    connecting = null;
    let result;
    try {
      applyEdit((d) => {
        result = M.createConnection(d, source, end);
        return result;
      });
    } catch (e) {
      toast(e.message);
      render();
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
    if (e.button !== 0) return;
    const p = point(e),
      s = targetInfo(e);
    if (e.target.closest("[data-collapse]")) return;
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
    if (e.altKey && s && ["state", "task", "actor"].includes(s.type)) {
      beginConnection(s, timeAt(p.x));
      drag = { kind: "connect", start: p };
      e.preventDefault();
      return;
    }
    if (connecting) return;
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
          Math.min(doc().time.duration - span, drag.range.start + delta),
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
  });
  window.addEventListener("pointerup", (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    $("#gesture-preview")?.remove();
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
        M.moveSelection(next, sel, delta, targetActorId);
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
  $("#timeline").addEventListener("click", (e) => {
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
      connect(s, timeAt(point(e).x));
      return;
    }
    select(s, e.ctrlKey || e.metaKey);
  });
  $("#timeline").addEventListener("dblclick", (e) => {
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
  });
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
      if (["state", "task", "actor"].includes(s.type))
        entries.push(["ここから接続", () => beginConnection(s, timeAt(p.x))]);
      if (s.type === "task") {
        const junction = e.target.closest(".junction[data-time]"),
          w = M.taskWindow(doc(), M.get(doc(), "task", s.id)),
          time = junction ? +junction.dataset.time : Math.max(w.start,Math.min(w.end,timeAt(p.x)));
        entries.push(["分岐を追加",
          () => addResult(s.id, {time,fixedTime:!!junction})]);
      }
      if (s.type === "causalLink" && M.get(doc(), "causalLink", s.id).target.type === "task")
        entries.push(["分岐を追加", () => addCausalResult(s.id)]);
      if (s.type === "actor")
        entries.push(
          ["子Actor追加", () => editActor(null, s.id)],
          ["子Group追加", () => editActor(null, s.id, true)],
          ["選択Actorをグループ化", group],
          ["グループ解除", () => change((d) => M.ungroupActor(d, s.id))],
          ["上へ", () => reorder(-1)],
          ["下へ", () => reorder(1)],
        );
      if (s.type !== "technology")
        entries.push(["技術を関連付け", () => editBinding(s)]);
    } else {
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
    history.undo();
    selection = [];
    render();
    persist();
  }
  function redo() {
    history.redo();
    selection = [];
    render();
    persist();
  }
  function setRange(start, end) {
    const duration = doc().time.duration,
      span = Math.max(duration / 1000, Math.min(duration, end - start));
    start = Math.max(0, Math.min(duration - span, start));
    change((d) => {
      d.views.main.visibleTimeRange = { start, end: start + span };
      d.views.main.zoom = duration / span;
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
          causalLink: "因果リンク",
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
          for (const key of ["technology", "causalLink", "quiet"])
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
      for (const type of ["actor", "state", "task"])
        for (const x of doc()
          [M.collections[type]].filter((x) =>
            (x.name || x.label).toLowerCase().includes(query),
          )
          .slice(0, 100))
          list.append(
            button(x.name || x.label, () => {
              const aid =
                type === "actor"
                  ? x.id
                  : type === "state"
                    ? x.actorId
                    : M.get(doc(), "state", x.fromStateId).actorId;
              doc().views.main.collapsedActors =
                doc().views.main.collapsedActors.filter(
                  (id) => !M.descendants(doc(), id).has(aid),
                );
              if (type !== "actor") {
                const t =
                    type === "state" ? x.time : M.taskWindow(doc(), x).start,
                  r = doc().views.main.visibleTimeRange,
                  span = r.end - r.start;
                if (t < r.start || t > r.end)
                  setRange(t - span / 2, t + span / 2);
              }
              select({ type, id: x.id });
              const row = geometry.rows.find((r) => r.actor.id === aid);
              canvas.scrollTo({ top: Math.max(0, row.y - 40) });
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
        field("duration", "全期間", d.time.duration, "number"),
      (v) =>
        applyEdit((next) => {
          next.title = v.title;
          next.time.unit = v.unit;
          next.time.duration = +v.duration;
          next.views.main.visibleTimeRange = { start: 0, end: +v.duration };
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
      new Blob([JSON.stringify(doc(), null, 2)], { type: "application/json" }),
      "mission-v2.json",
    );
  }
  function exportSource() {
    const d = M.clone(doc());
    d.views.main.mode = "mission";
    const g = L.layout(d, Math.max(1050, geometry.vp.width), { full: true });
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
    const d = M.parse(text);
    history.commit(d);
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
      M.parse(text);
      confirmReplace("JSONを読み込む", () => loadJSON(text));
    } catch (e) {
      toast(e.message);
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
    $("#editor-dialog").close();
  $("#more-btn").onclick = (e) =>
    menu(e, [
      ["SVG出力", exportSVG],
      ["PNG出力", exportPNG],
      ["Technologyカタログ", catalog],
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
        M.moveSelection(
          d,
          selection,
          (key === "arrowleft" ? -1 : 1) * d.time.snap,
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
    getDocument: () => M.clone(doc()),
    loadJSON,
    exportSource,
    exportSVG,
    exportPNG,
    undo,
    redo,
  };
  inspector(false);
  render();
  persist();
})();
