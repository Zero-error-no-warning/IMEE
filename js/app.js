/* IMEE: no build step, dependencies, network requests, or server required. */
(() => {
  "use strict";
  const $ = (s) => document.querySelector(s),
    $$ = (s) => [...document.querySelectorAll(s)];
  const M = window.ME,
    KEY = "imee.document.v1",
    svg = $("#timeline"),
    scroll = $("#canvas-scroll");
  const esc = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const units = { seconds: "秒", minutes: "分", hours: "時間" };
  const sides = { friendly: "味方", hostile: "敵", neutral: "中立" };
  const kinds = {
    detection: "発見",
    command: "命令",
    information: "情報共有",
    support: "支援",
    attack: "攻撃",
    interference: "妨害",
  };
  let initial = createSample(),
    storageWarning = "";
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) initial = M.parse(saved);
  } catch (e) {
    storageWarning = `自動保存データを読み込めませんでした。${e.message}`;
  }
  const history = new M.History(initial);
  let selection = null,
    mode = "select",
    linkSource = null,
    scale = 16,
    layout,
    preview = null,
    drag = null,
    ignoreClick = false,
    spaceHeld = false,
    focusChain = false,
    inspectorHidden = innerWidth < 760,
    searchQuery = "";
  let dialogApply = null,
    toastTimer,
    renderedRelated = null;
  const doc = () => preview || history.doc;
  const item = (type, id, d = doc()) =>
    d[
      {
        actor: "actors",
        state: "states",
        transition: "transitions",
        interaction: "interactions",
      }[type]
    ]?.find((x) => x.id === id);
  const state = (id, d = doc()) => item("state", id, d);
  const fmt = (n) => Number(n.toFixed(3)).toString();
  const time = (n) => `T+${fmt(n)}`;
  function toast(message) {
    $("#toast").textContent = message;
    $("#toast").hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      $("#toast").hidden = true;
    }, 6500);
    $("#status").textContent = message;
  }
  function saveLocal() {
    try {
      localStorage.setItem(KEY, JSON.stringify(history.doc));
      $("#save-status").textContent = "このブラウザに保存済み";
    } catch {
      $("#save-status").textContent = "自動保存できません";
      toast(
        "ブラウザの保存領域が使えません。JSON保存でデータを保存してください。",
      );
    }
  }
  function commit(next, message = "変更しました") {
    const changed = history.commit(next);
    preview = null;
    if (changed) {
      saveLocal();
      $("#status").textContent = message;
    }
    render();
    return changed;
  }
  function change(fn, message) {
    const next = M.clone(history.doc);
    fn(next);
    return commit(next, message);
  }
  function safeChange(fn, message) {
    try {
      change(fn, message);
    } catch (e) {
      preview = null;
      render();
      toast(e.message);
    }
  }
  function setMode(value) {
    mode = value;
    linkSource = null;
    render();
  }
  function updateSelection() {
    const chain = focusChain && selection ? M.related(doc(), selection) : null;
    svg.querySelectorAll("[data-type]").forEach((el) => {
      el.classList.toggle("selected", el.dataset.id === selection?.id);
      el.classList.toggle(
        "dimmed",
        !!chain && el.dataset.type !== "actor" && !chain.has(el.dataset.id),
      );
    });
    svg.querySelectorAll(".selection-time").forEach((el) => el.remove());
    if (selection?.type === "state") {
      const s = state(selection.id),
        p = layout.positions.get(s.id);
      const text = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "text",
      );
      text.setAttribute("class", "selection-time");
      text.setAttribute("x", p.x);
      text.setAttribute("y", p.y - 7);
      text.setAttribute("font-size", "9");
      text.setAttribute("fill", "#087f80");
      text.textContent = `${time(s.start)} — ${time(s.end)}`;
      [...svg.querySelectorAll(".state")]
        .find((el) => el.dataset.id === s.id)
        ?.append(text);
    }
  }
  function select(type, id) {
    selection = { type, id };
    updateSelection();
    renderInspector();
  }
  function colors(side) {
    return side === "hostile"
      ? { stroke: "#be6667", fill: "#fae9e6", ink: "#8e4147" }
      : side === "neutral"
        ? { stroke: "#8595a3", fill: "#edf0f4", ink: "#526978" }
        : { stroke: "#5b9d97", fill: "#e1efeb", ink: "#226c65" };
  }
  function transitionPoint(t, at) {
    const a = state(t.from),
      b = state(t.to),
      p = layout.positions.get(a.id),
      q = layout.positions.get(b.id);
    return {
      x: 208 + at * scale,
      y: q.y + 16,
      x1: p.x + p.width,
      y1: p.y + 16,
      x2: q.x,
      y2: q.y + 16,
    };
  }
  function edgeClass(id) {
    const related = renderedRelated;
    return `${selection?.id === id ? " selected" : ""}${related && !related.has(id) ? " dimmed" : ""}`;
  }
  const svgStyle = `
    text{font-family:Inter,"Segoe UI","Noto Sans JP",sans-serif}.grid{stroke:#edf1f2;stroke-width:1}.tick{fill:#82949a;font-size:10px}.rowline{stroke:#e3eaec;stroke-width:1}.state{cursor:grab}.state:active{cursor:grabbing}.state .body{stroke-width:1.2}.state.selected .body{stroke:#087f80;stroke-width:2.4}.state:hover .body{stroke-width:2}.state text{pointer-events:none}.state .resize{cursor:ew-resize;fill:transparent}.state .handle-line{stroke:#69948d;opacity:0;pointer-events:none}.state:hover .handle-line,.state.selected .handle-line{opacity:1}.port{fill:white;stroke:#087f80;stroke-width:1.5;opacity:0;cursor:crosshair}.state:hover .port,.state.selected .port,.link-mode .port{opacity:1}.edge{cursor:pointer}.edge .hit{stroke:transparent;stroke-width:13;fill:none}.edge .line{fill:none;stroke-linejoin:round;stroke-linecap:round;stroke-width:1.6}.edge.selected .line{stroke-width:3}.edge:hover .line{stroke-width:2.6}.edge-label{font-size:10px;paint-order:stroke;stroke:#fff;stroke-width:5;stroke-linejoin:round;fill:#69878a}.edge.block .edge-label{fill:#b34c4d}.dimmed{opacity:.17}.actor-label{cursor:grab}.actor-label text{pointer-events:none}.actor-label:hover .actor-bg{fill:#edf5f3}.actor-label.selected .actor-bg{fill:#e4f1ec}.actor-label .actor-name{font-size:12px;fill:#27454e;font-weight:600}.blocked-cross{stroke:#c14d51;stroke-width:2.3;fill:none}.pending-ring{fill:none;stroke:#098784;stroke-width:2;stroke-dasharray:4 3}.drop-indicator{stroke:#087f80;stroke-width:3}.export-hide{display:none}
  `;
  function renderSVG() {
    const d = doc();
    layout = M.layout(d, scale);
    renderedRelated = focusChain && selection ? M.related(d, selection) : null;
    svg.setAttribute("width", layout.width);
    svg.setAttribute("height", layout.height);
    svg.classList.toggle(
      "link-mode",
      ["transition", "interaction", "block"].includes(mode),
    );
    const parts = [
      `<title>${esc(d.title)}</title><desc>横軸は時間（${units[d.time.unit]}）、縦軸はActor。状態の幅は継続時間。破線は予定、赤い×は阻止された遷移。</desc><style>${svgStyle}</style><defs><marker id="arrow-gray" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#8b9c9f"/></marker><marker id="arrow-teal" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#388c91"/></marker><marker id="arrow-red" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#c14d51"/></marker></defs><rect width="${layout.width}" height="${layout.height}" fill="white"/>`,
    ];
    const tickStep =
      [
        0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600,
        1200, 3600, 10000, 50000, 100000, 500000,
      ].find((n) => n * scale >= 65) || 1000000;
    for (const row of layout.rows)
      parts.push(
        `<rect data-row="${esc(row.actor.id)}" x="196" y="${row.top}" width="${layout.width - 196}" height="${row.height}" fill="${row.actor.side === "hostile" ? "#fffcfb" : "#fff"}"/><line class="rowline" x1="0" y1="${row.top + row.height}" x2="${layout.width}" y2="${row.top + row.height}"/>`,
      );
    for (let t = 0; t <= d.time.duration + 1e-7; t += tickStep) {
      const x = 208 + t * scale;
      parts.push(
        `<line class="grid" x1="${x}" y1="64" x2="${x}" y2="${layout.height - 28}"/>`,
      );
    }
    // Transitions are drawn behind states. A vertical branch does not alter its time coordinate.
    for (const t of d.transitions) {
      const a = layout.positions.get(t.from),
        b = layout.positions.get(t.to);
      if (!a || !b) continue;
      const blockers = d.interactions.filter(
        (i) => i.effect === "block" && i.targetId === t.id,
      );
      const path = `M ${a.x + a.width} ${a.y + 16} V ${b.y + 16} H ${b.x}`;
      parts.push(
        `<g data-type="transition" data-id="${esc(t.id)}" class="edge${blockers.length ? " block" : ""}${edgeClass(t.id)}"><title>${esc(state(t.from).name)} → ${esc(state(t.to).name)}${blockers.length ? "（阻止）" : t.status === "planned" ? "（予定）" : ""}</title><path class="hit" d="${path}"/><path class="line" d="${path}" stroke="${blockers.length ? "#c14d51" : "#8b9c9f"}" ${t.status === "planned" ? 'stroke-dasharray="5 4"' : ""} marker-end="url(#arrow-${blockers.length ? "red" : "gray"})"/>`,
      );
      if (t.label)
        parts.push(
          `<text class="edge-label" x="${(a.x + a.width + b.x) / 2}" y="${b.y + 42}" text-anchor="middle">${esc(t.label)}</text>`,
        );
      for (const block of blockers) {
        const p = transitionPoint(t, block.time);
        parts.push(
          `<path class="blocked-cross" d="M ${p.x - 5} ${p.y - 5} l 10 10 M ${p.x + 5} ${p.y - 5} l -10 10"/><text class="edge-label" x="${p.x}" y="${p.y + 15}" text-anchor="middle">阻止</text>`,
        );
      }
      parts.push("</g>");
    }
    for (const s of d.states) {
      const p = layout.positions.get(s.id),
        actor = item("actor", s.actorId),
        c = colors(actor.side),
        quiet = s.activity === "quiet",
        planned = s.status === "planned";
      const clipId = `clip-${d.states.indexOf(s)}`;
      parts.push(
        `<g class="state${edgeClass(s.id)}" data-type="state" data-id="${esc(s.id)}"><title>${esc(s.name)} · ${time(s.start)}–${time(s.end)} ${units[d.time.unit]} · ${planned ? "予定" : "実際"}${quiet ? " · 平常" : ""}</title><defs><clipPath id="${clipId}"><rect x="${p.x + 5}" y="${p.y}" width="${Math.max(0, p.width - 10)}" height="32"/></clipPath></defs><rect class="body" x="${p.x}" y="${p.y}" width="${p.width}" height="32" rx="5" fill="${quiet ? "#f6f8f8" : planned ? "#fff" : c.fill}" stroke="${quiet ? "#ced9dc" : planned ? "#b3bec1" : c.stroke}" ${planned ? 'stroke-dasharray="5 3"' : quiet ? 'stroke-dasharray="3 3"' : ""}/><text x="${p.x + p.width / 2}" y="${p.y + 20}" text-anchor="middle" fill="${quiet ? "#95a5aa" : planned ? "#87999e" : c.ink}" font-size="11" font-weight="${quiet ? "400" : "550"}" clip-path="url(#${clipId})">${esc(s.name)}${planned ? " · 予定" : ""}</text>`,
      );
      const h = Math.min(8, p.width / 3);
      parts.push(
        `<rect class="resize" data-handle="start" x="${p.x}" y="${p.y}" width="${h}" height="32"/><rect class="resize" data-handle="end" x="${p.x + p.width - h}" y="${p.y}" width="${h}" height="32"/><path class="handle-line" d="M ${p.x + 4} ${p.y + 11} v 10 M ${p.x + p.width - 4} ${p.y + 11} v 10"/>`,
      );
      if (selection?.id === s.id || linkSource === s.id)
        parts.push(
          `<text class="selection-time" x="${p.x}" y="${p.y - 7}" font-size="9" fill="#087f80">${time(s.start)} — ${time(s.end)}</text>`,
        );
      if (linkSource === s.id)
        parts.push(
          `<rect class="pending-ring" x="${p.x - 3}" y="${p.y - 3}" width="${p.width + 6}" height="38" rx="7"/>`,
        );
      parts.push(
        `<circle class="port" data-port="out" cx="${p.x + p.width + 7}" cy="${p.y + 16}" r="4.5"/></g>`,
      );
    }
    // An instantaneous transition has no horizontal length; a point marker makes it selectable.
    for (const t of d.transitions) {
      const a = state(t.from),
        b = state(t.to);
      if (a.end !== b.start) continue;
      const p = transitionPoint(t, b.start);
      parts.push(
        `<g data-type="transition" data-id="${esc(t.id)}" class="edge${edgeClass(t.id)}"><title>${esc(a.name)} → ${esc(b.name)} · 即時遷移</title><path d="M ${p.x} ${p.y - 5} l 5 5 -5 5 -5 -5 Z" fill="white" stroke="#8b9c9f" stroke-width="1.5"/></g>`,
      );
    }
    // Interactions share the same time scale. Their attachment points denote event times.
    for (const i of d.interactions) {
      const s = layout.positions.get(i.fromStateId);
      if (!s) continue;
      let target;
      if (i.targetType === "state") {
        const q = layout.positions.get(i.targetId);
        target = { x: q.x, y: q.y + 16 };
      } else target = transitionPoint(item("transition", i.targetId), i.time);
      const down = target.y > s.y + 16,
        x1 = 208 + i.sourceTime * scale,
        y1 = down ? s.y + 32 : s.y,
        x2 = 208 + i.time * scale,
        y2 = i.targetType === "state" ? target.y + (down ? -16 : 16) : target.y;
      const middleY = down ? y1 + 15 : y1 - 15,
        path = `M ${x1} ${y1} V ${middleY} H ${x2} V ${y2}`;
      const blocked = i.effect === "block",
        color = blocked ? "#c14d51" : "#388c91";
      parts.push(
        `<g class="edge${blocked ? " block" : ""}${edgeClass(i.id)}" data-type="interaction" data-id="${esc(i.id)}"><title>${esc(i.label)} · ${time(i.sourceTime)} → ${time(i.time)}</title><path class="hit" d="${path}"/><path class="line" d="${path}" stroke="${color}" ${blocked ? 'stroke-dasharray="5 3"' : ""} marker-end="url(#arrow-${blocked ? "red" : "teal"})"/><circle cx="${x1}" cy="${y1}" r="3" fill="white" stroke="${color}"/><text class="edge-label" x="${Math.max(x1, x2) + 7}" y="${middleY - 4}">${esc(i.label)}</text>`,
      );
      if (i.outcomeStateId) {
        const o = layout.positions.get(i.outcomeStateId);
        parts.push(
          `<path class="line" d="M ${x2} ${y2} H ${o.x - 9} V ${o.y + 16} H ${o.x}" stroke="${color}" stroke-dasharray="2 3"/>`,
        );
      }
      parts.push("</g>");
    }
    if (!d.actors.length)
      parts.push(
        '<text x="230" y="112" font-size="14" fill="#73858b">「＋ Actor」からミッションの登場主体を追加してください。</text>',
      );
    // Keep actor names and the time ruler visible while the canvas scrolls.
    parts.push('<g id="actor-labels">');
    for (const row of layout.rows) {
      const a = row.actor,
        c = colors(a.side);
      parts.push(
        `<g class="actor-label${selection?.id === a.id ? " selected" : ""}" data-type="actor" data-id="${esc(a.id)}"><rect class="actor-bg" x="0" y="${row.top}" width="196" height="${row.height}" fill="#fafcfc"/><line class="rowline" x1="0" y1="${row.top + row.height}" x2="196" y2="${row.top + row.height}"/><text x="15" y="${row.top + 48}" font-size="14" fill="#b8c7ca">⠿</text><rect x="35" y="${row.top + 33}" width="3" height="23" rx="1.5" fill="${c.stroke}"/><text class="actor-name" x="49" y="${row.top + 43}">${esc(a.name.length > 11 ? a.name.slice(0, 10) + "…" : a.name)}</text><text x="49" y="${row.top + 61}" font-size="9" fill="#90a0a5">${sides[a.side]} / ${String(d.actors.indexOf(a) + 1).padStart(2, "0")}</text><title>${esc(a.name)} · ドラッグで並べ替え</title></g>`,
      );
    }
    parts.push(
      `<line x1="196" y1="64" x2="196" y2="${layout.height}" stroke="#dde7e9"/></g><g id="time-ruler"><rect x="196" y="0" width="${layout.width - 196}" height="64" fill="#fafcfc"/><line class="rowline" x1="196" y1="64" x2="${layout.width}" y2="64"/><text x="208" y="21" font-size="9" letter-spacing="1.2" fill="#81969b">ELAPSED TIME / ${units[d.time.unit]}</text>`,
    );
    for (let t = 0; t <= d.time.duration + 1e-7; t += tickStep) {
      const x = 208 + t * scale;
      parts.push(
        `<text class="tick" x="${x}" y="44" text-anchor="middle">${time(t)}</text><line x1="${x}" y1="53" x2="${x}" y2="64" stroke="#dbe5e7"/>`,
      );
    }
    parts.push(
      '</g><g id="corner"><rect width="196" height="64" fill="#fafcfc"/><text x="28" y="39" font-size="9" letter-spacing="1.4" fill="#7d9299">ACTORS</text><line class="rowline" x1="0" y1="64" x2="196" y2="64"/></g>',
    );
    if (drag?.type === "actor" && drag.targetId) {
      const row = layout.rows.find((r) => r.actor.id === drag.targetId);
      if (row)
        parts.push(
          `<line class="drop-indicator" x1="0" y1="${row.top}" x2="${layout.width}" y2="${row.top}"/>`,
        );
    }
    svg.innerHTML = parts.join("");
    sticky();
  }
  function sticky() {
    $("#actor-labels")?.setAttribute(
      "transform",
      `translate(${scroll.scrollLeft} 0)`,
    );
    $("#time-ruler")?.setAttribute(
      "transform",
      `translate(0 ${scroll.scrollTop})`,
    );
    $("#corner")?.setAttribute(
      "transform",
      `translate(${scroll.scrollLeft} ${scroll.scrollTop})`,
    );
  }
  function render() {
    if (selection && !item(selection.type, selection.id)) selection = null;
    renderSVG();
    renderInspector();
    $("#document-title").textContent = doc().title;
    document.title = `${doc().title} | IMEE`;
    $("#counts").textContent =
      `${doc().actors.length} Actors · ${doc().states.length} States`;
    $("#undo").disabled = !history.past.length;
    $("#redo").disabled = !history.future.length;
    $$("[data-mode]").forEach((b) => {
      const active = b.dataset.mode === mode;
      b.classList.toggle("active", active);
      b.setAttribute("aria-pressed", active);
    });
    $("#zoom-label").textContent = `${Math.round((scale / 16) * 100)}%`;
    $$(".time-unit").forEach((el) => (el.textContent = units[doc().time.unit]));
    const snaps = [
      ...new Set([0.1, 0.5, 1, 2, 5, 10, 15, 30, 60, doc().time.snap]),
    ]
      .filter((n) => n <= doc().time.duration)
      .sort((a, b) => a - b);
    $("#snap").innerHTML = snaps
      .map(
        (n) =>
          `<option ${n === doc().time.snap ? "selected" : ""}>${n}</option>`,
      )
      .join("");
    $("#mode-hint").textContent = linkSource
      ? "接続先を選択してください · Escでキャンセル"
      : {
          select:
            "空白をダブルクリックでState追加 · ドラッグで移動 · 両端で伸縮",
          state: "Actorの行をクリックしてStateを追加",
          transition: "同じActorの接続元State → 接続先Stateの順に選択",
          interaction: "作用元State → 別Actorの作用先Stateの順に選択",
          block: "作用元State → 阻止したい予定Transitionの順に選択",
        }[mode];
    $("#inspector").classList.toggle("hidden", inspectorHidden);
    $("#inspector-toggle").setAttribute("aria-expanded", !inspectorHidden);
    $("#inspector-toggle").textContent = inspectorHidden
      ? "詳細パネル ⇤"
      : "詳細パネル ⇥";
  }
  const facts = (pairs) =>
    `<dl class="facts">${pairs.map(([a, b]) => `<dt>${esc(a)}</dt><dd>${esc(b)}</dd>`).join("")}</dl>`;
  function renderInspector() {
    const pane = $("#inspector"),
      d = doc();
    let html = '<div class="panel-eyebrow">INSPECTOR</div>';
    if (!selection) {
      const blocks = d.interactions.filter((i) => i.effect === "block");
      html +=
        '<div class="empty-graphic" aria-hidden="true">↗</div><h2 class="panel-title">状態から、<br>ミッションを読む。</h2><p class="panel-subtitle">Stateや矢印を選択すると、時間・接続・因果関係を確認できます。</p>';
      if (blocks.length) {
        const b = blocks[0],
          t = item("transition", b.targetId);
        html += `<div class="panel-section"><h3>ミッション阻止</h3><div class="block-card"><strong>${blocks.length} 件の予定遷移を阻止する作用</strong><p>${esc(state(t.from).name)} → ${esc(state(t.to).name)}<br>${esc(b.label)} / ${time(b.time)}</p><button data-jump="${esc(b.id)}" data-jump-type="interaction">因果を確認 →</button></div></div>`;
      }
      html +=
        '<div class="panel-section"><h3>直接操作で編集</h3><ul class="hint-list"><li><span class="keycap">double click</span> Stateを追加・編集</li><li><span class="keycap">Ctrl + drag</span> Stateを複製</li><li><span class="keycap">right click</span> 項目の操作メニュー</li></ul></div>';
    } else {
      const x = item(selection.type, selection.id),
        type = selection.type;
      html += `<h2 class="panel-title">${esc(x.name || x.label || "状態遷移")}</h2><div class="panel-subtitle">${{ state: "STATE", actor: "ACTOR", transition: "TRANSITION", interaction: "INTERACTION" }[type]}</div>`;
      if (type === "state") {
        const a = item("actor", x.actorId);
        html +=
          `<p><span class="pill ${a.side}">${sides[a.side]} · ${esc(a.name)}</span></p>` +
          facts([
            ["開始", `${time(x.start)} ${units[d.time.unit]}`],
            ["終了", `${time(x.end)} ${units[d.time.unit]}`],
            ["継続時間", `${fmt(x.end - x.start)} ${units[d.time.unit]}`],
            ["区分", x.status === "planned" ? "予定" : "実際"],
            ["表示", x.activity === "quiet" ? "平常・待機（控えめ）" : "活動"],
          ]);
      }
      if (type === "actor")
        html += facts([
          ["所属", sides[x.side]],
          ["States", d.states.filter((s) => s.actorId === x.id).length],
          ["順序", d.actors.indexOf(x) + 1],
        ]);
      if (type === "transition") {
        const a = state(x.from),
          b = state(x.to),
          blocks = d.interactions.filter(
            (i) => i.targetId === x.id && i.effect === "block",
          );
        html += facts([
          ["接続元", a.name],
          ["接続先", b.name],
          ["遷移開始", time(a.end)],
          ["遷移終了", time(b.start)],
          ["所要時間", `${fmt(b.start - a.end)} ${units[d.time.unit]}`],
          ["区分", x.status === "planned" ? "予定" : "実際"],
          ["妨害", blocks.length ? "阻止の作用あり" : "なし"],
        ]);
        blocks.forEach((i) => {
          html += `<div class="block-card"><strong>${esc(i.label)}</strong><p>${time(i.time)} で予定遷移を阻止</p><button data-jump="${esc(i.id)}" data-jump-type="interaction">作用を確認 →</button></div>`;
        });
      }
      if (type === "interaction") {
        const target =
          x.targetType === "state"
            ? state(x.targetId).name
            : (() => {
                const t = item("transition", x.targetId);
                return `${state(t.from).name} → ${state(t.to).name}`;
              })();
        html += facts([
          ["作用元", state(x.fromStateId).name],
          ["作用先", target],
          ["種類", kinds[x.kind]],
          ["発生", time(x.sourceTime)],
          ["到達", time(x.time)],
          ["効果", x.effect === "block" ? "予定遷移の阻止" : "状態変化の原因"],
        ]);
        if (x.effect === "block")
          html += `<div class="block-card"><strong>成立しなかった予定遷移</strong><p>${esc(target)}${x.outcomeStateId ? `<br>妨害後：${esc(state(x.outcomeStateId).name)}` : ""}</p></div>`;
      }
      html +=
        '<div class="panel-actions"><button data-action="edit">編集</button>' +
        (type === "state"
          ? '<button data-action="duplicate">複製</button>'
          : "") +
        '<button data-action="delete" class="danger">削除</button></div>';
      if (type === "actor")
        html +=
          '<div class="panel-actions"><button data-action="up">↑ 上へ</button><button data-action="down">↓ 下へ</button></div>';
      html += `<label class="focus-toggle"><input id="focus-chain" type="checkbox" ${focusChain ? "checked" : ""}>接続された因果関係を強調</label>`;
      if (x.notes)
        html += `<div class="panel-section"><h3>備考</h3><p class="notes">${esc(x.notes)}</p></div>`;
      if (type === "state") {
        const edges = [
          ...d.transitions
            .filter((t) => t.from === x.id || t.to === x.id)
            .map((t) => ({
              id: t.id,
              type: "transition",
              label: `${state(t.from).name} → ${state(t.to).name}`,
            })),
          ...d.interactions
            .filter(
              (i) =>
                i.fromStateId === x.id ||
                i.targetId === x.id ||
                i.outcomeStateId === x.id,
            )
            .map((i) => ({ id: i.id, type: "interaction", label: i.label })),
        ];
        if (edges.length)
          html += `<div class="panel-section"><h3>接続</h3><div class="search-results">${edges.map((e) => `<button data-jump="${esc(e.id)}" data-jump-type="${e.type}">${esc(e.label)}</button>`).join("")}</div></div>`;
      }
    }
    html += `<div class="panel-section"><h3>Stateを探す</h3><input id="search" class="search-input" type="search" placeholder="状態名・Actor名で検索" aria-label="状態を検索" value="${esc(searchQuery)}"><div id="search-results" class="search-results"></div></div>`;
    pane.innerHTML = html;
    renderSearch();
  }
  function renderSearch() {
    const q = searchQuery.trim().toLowerCase();
    $("#search-results").innerHTML = q
      ? doc()
          .states.filter((s) =>
            `${s.name} ${item("actor", s.actorId).name}`
              .toLowerCase()
              .includes(q),
          )
          .slice(0, 60)
          .map(
            (s) =>
              `<button data-jump="${esc(s.id)}" data-jump-type="state">${esc(s.name)} <span class="muted">· ${esc(item("actor", s.actorId).name)} / ${time(s.start)}</span></button>`,
          )
          .join("") || '<p class="muted">一致するStateがありません。</p>'
      : "";
  }
  function jump(type, id) {
    selection = { type, id };
    render();
    let s =
      type === "state"
        ? id
        : type === "interaction"
          ? item(type, id).fromStateId
          : type === "transition"
            ? item(type, id).from
            : null;
    const p = s && layout.positions.get(s);
    if (p)
      scroll.scrollTo({
        left: Math.max(0, p.x - 250),
        top: Math.max(0, p.y - 120),
        behavior: "smooth",
      });
  }
  const field = (label, name, value, type = "text", attrs = "") =>
    `<label class="field"><span>${esc(label)}</span><input name="${name}" type="${type}" value="${esc(value)}" ${attrs}></label>`;
  const selectField = (label, name, value, options) =>
    `<label class="field"><span>${esc(label)}</span><select name="${name}">${options.map(([v, l]) => `<option value="${esc(v)}" ${v === value ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
  const notesField = (value) =>
    `<label class="field"><span>備考</span><textarea name="notes" maxlength="10000">${esc(value || "")}</textarea></label>`;
  function dialog(title, html, apply) {
    $("#dialog-title").textContent = title;
    $("#dialog-fields").innerHTML = html;
    $("#dialog-error").textContent = "";
    dialogApply = apply;
    $("#editor-dialog").showModal();
    $("#dialog-fields input")?.focus();
  }
  function editActor(existing = null) {
    const a = existing || {
      id: M.id("actor"),
      name: "新しいActor",
      side: "friendly",
      notes: "",
    };
    dialog(
      existing ? "Actorを編集" : "Actorを追加",
      field("Actor名", "name", a.name, "text", 'required maxlength="300"') +
        selectField("所属", "side", a.side, Object.entries(sides)) +
        notesField(a.notes),
      (data) => {
        change((d) => {
          const value = { ...a, ...data };
          if (existing) Object.assign(item("actor", a.id, d), value);
          else d.actors.push(value);
        }, "Actorを保存しました");
        selection = { type: "actor", id: a.id };
      },
    );
  }
  function editState(existing = null, actorId = null, at = 0) {
    if (!doc().actors.length) {
      toast("先にActorを追加してください。");
      return;
    }
    const step = doc().time.snap,
      start = Math.max(
        0,
        Math.min(M.snap(at, step), doc().time.duration - step),
      );
    const s = existing || {
      id: M.id("state"),
      actorId: actorId || doc().actors[0].id,
      name: "新しい状態",
      start,
      end: Math.min(
        start + Math.max(step, doc().time.duration / 10),
        doc().time.duration,
      ),
      status: "actual",
      activity: "active",
      notes: "",
    };
    const unit = units[doc().time.unit];
    dialog(
      existing ? "Stateを編集" : "Stateを追加",
      field("状態名", "name", s.name, "text", 'required maxlength="300"') +
        selectField(
          "Actor",
          "actorId",
          s.actorId,
          doc().actors.map((a) => [a.id, a.name]),
        ) +
        `<div class="field-row">${field(`開始（${unit}）`, "start", s.start, "number", 'required min="0" step="any"')}${field(`終了（${unit}）`, "end", s.end, "number", 'required min="0" step="any"')}</div>` +
        `<div class="field-row">${selectField("区分", "status", s.status, [
          ["actual", "実際"],
          ["planned", "予定"],
        ])}${selectField("表示", "activity", s.activity, [
          ["active", "活動"],
          ["quiet", "平常・待機"],
        ])}</div>` +
        notesField(s.notes),
      (data) => {
        change((d) => {
          const value = {
            ...s,
            ...data,
            start: Number(data.start),
            end: Number(data.end),
          };
          if (existing) {
            Object.assign(item("state", s.id, d), value);
            followState(d, s, value);
          } else d.states.push(value);
        }, "Stateを保存しました");
        selection = { type: "state", id: s.id };
      },
    );
  }
  function followState(d, before, after) {
    const delta = after.start - before.start;
    for (const i of d.interactions) {
      if (i.fromStateId === after.id)
        i.sourceTime = Math.max(
          after.start,
          Math.min(after.end, i.sourceTime + delta),
        );
      if (i.targetType === "state" && i.targetId === after.id)
        i.time = after.start;
    }
  }
  function editTransition(existing = null, from = null, to = null) {
    const t = existing || {
      id: M.id("transition"),
      from,
      to,
      status: state(to)?.status || "actual",
      label: "",
    };
    if (state(t.from).actorId !== state(t.to).actorId) {
      toast(
        "Transitionは同一Actor内で接続してください。Actor間は「作用」を使います。",
      );
      return;
    }
    dialog(
      existing ? "Transitionを編集" : "Transitionを作成",
      `<div class="dialog-summary">${esc(state(t.from).name)} → ${esc(state(t.to).name)}<br>${time(state(t.from).end)} → ${time(state(t.to).start)}</div>` +
        field("ラベル（任意）", "label", t.label, "text", 'maxlength="300"') +
        selectField("遷移の区分", "status", t.status, [
          ["actual", "実際"],
          ["planned", "予定"],
        ]),
      (data) => {
        change((d) => {
          if (existing) Object.assign(item("transition", t.id, d), data);
          else d.transitions.push({ ...t, ...data });
        }, "Transitionを保存しました");
        selection = { type: "transition", id: t.id };
      },
    );
  }
  function editInteraction(
    existing = null,
    sourceId = null,
    targetType = "state",
    targetId = null,
    effect = "cause",
  ) {
    let i = existing;
    if (!i) {
      const source = state(sourceId),
        target =
          targetType === "state"
            ? state(targetId)
            : item("transition", targetId);
      const targetState = targetType === "state" ? target : state(target.to);
      if (source.actorId === targetState.actorId) {
        toast("Interactionは異なるActorの間で接続してください。");
        return;
      }
      if (effect === "block" && target.status !== "planned") {
        toast("妨害は「予定」のTransitionに接続してください。");
        return;
      }
      const at =
        targetType === "state"
          ? target.start
          : Math.max(
              state(target.from).end,
              Math.min(source.end, targetState.start),
            );
      i = {
        id: M.id("interaction"),
        fromStateId: sourceId,
        targetType,
        targetId,
        effect,
        label: effect === "block" ? "遷移阻止" : "情報共有",
        kind: effect === "block" ? "interference" : "information",
        sourceTime: Math.min(source.end, at),
        time: at,
        outcomeStateId: null,
        notes: "",
      };
    }
    const target =
        i.targetType === "state"
          ? state(i.targetId)
          : item("transition", i.targetId),
      targetActor =
        i.targetType === "state" ? target.actorId : state(target.to).actorId;
    const targetName =
      i.targetType === "state"
        ? target.name
        : `${state(target.from).name} → ${state(target.to).name}`;
    let html =
      `<div class="dialog-summary">${esc(state(i.fromStateId).name)} → ${esc(targetName)}<br>${i.effect === "block" ? "予定遷移の成立を阻止" : "状態変化の原因となる作用"}</div>` +
      field("作用名", "label", i.label, "text", 'required maxlength="300"') +
      selectField("作用の種類", "kind", i.kind, Object.entries(kinds)) +
      `<div class="field-row">${field("発生時刻", "sourceTime", i.sourceTime, "number", 'required min="0" step="any"')}${field("到達時刻", "time", i.time, "number", `required min="0" step="any" ${i.targetType === "state" ? "readonly" : ""}`)}</div>`;
    if (i.effect === "block")
      html += selectField(
        "妨害後のState（任意）",
        "outcomeStateId",
        i.outcomeStateId || "",
        [
          ["", "指定しない"],
          ...doc()
            .states.filter(
              (s) => s.actorId === targetActor && s.status === "actual",
            )
            .map((s) => [s.id, `${s.name} / ${time(s.start)}`]),
        ],
      );
    html += notesField(i.notes);
    dialog(
      existing
        ? "Interactionを編集"
        : i.effect === "block"
          ? "予定遷移を阻止"
          : "Interactionを作成",
      html,
      (data) => {
        change((d) => {
          const value = {
            ...i,
            ...data,
            sourceTime: Number(data.sourceTime),
            time: Number(data.time),
            outcomeStateId: data.outcomeStateId || null,
          };
          if (existing) Object.assign(item("interaction", i.id, d), value);
          else d.interactions.push(value);
        }, "Interactionを保存しました");
        selection = { type: "interaction", id: i.id };
      },
    );
  }
  function editSelected() {
    if (!selection) return;
    const x = item(selection.type, selection.id);
    ({
      actor: editActor,
      state: editState,
      transition: editTransition,
      interaction: editInteraction,
    })[selection.type](x);
  }
  function deleteSelected() {
    if (!selection) return;
    const selected = { ...selection },
      x = item(selected.type, selected.id);
    const execute = () => {
      change(
        (d) => M.remove(d, selected.type, selected.id),
        "削除しました（元に戻せます）",
      );
      selection = null;
    };
    if (
      selected.type === "actor" &&
      doc().states.some((s) => s.actorId === x.id)
    )
      dialog(
        "Actorを削除",
        `<p class="dialog-summary">「${esc(x.name)}」と、そのState・接続を削除します。Undoで元に戻せます。</p>`,
        execute,
      );
    else execute();
    render();
  }
  function duplicateSelected() {
    if (selection?.type !== "state") return;
    const s = state(selection.id),
      copy = {
        ...M.clone(s),
        id: M.id("state"),
        name: `${s.name} のコピー`.slice(0, 300),
      };
    safeChange((d) => d.states.push(copy), "Stateを複製しました");
    selection = { type: "state", id: copy.id };
    render();
  }
  function moveActor(delta) {
    if (selection?.type !== "actor") return;
    safeChange((d) => {
      const i = d.actors.findIndex((a) => a.id === selection.id),
        j = Math.max(0, Math.min(d.actors.length - 1, i + delta));
      d.actors.splice(j, 0, d.actors.splice(i, 1)[0]);
    }, "Actorを並べ替えました");
  }
  function documentSettings() {
    const d = doc();
    dialog(
      "ミッション設定",
      field(
        "ミッション名",
        "title",
        d.title,
        "text",
        'required maxlength="300"',
      ) +
        `<div class="field-row">${field("表示期間（0から）", "duration", d.time.duration, "number", 'min="0.01" max="1000000" step="any" required')}${selectField("時間単位", "unit", d.time.unit, Object.entries(units))}</div>` +
        field(
          "スナップ間隔",
          "snap",
          d.time.snap,
          "number",
          'min="0.01" step="any" required',
        ) +
        '<p class="muted">単位の変更は表記の変更です。時刻の数値は換算しません。</p>',
      (data) => {
        change((n) => {
          n.title = data.title;
          n.time = {
            duration: Number(data.duration),
            snap: Number(data.snap),
            unit: data.unit,
          };
        }, "ミッション設定を更新しました");
        fit();
      },
    );
  }
  function connect(type, id) {
    if (!linkSource) {
      if (type !== "state") {
        toast("まず作用・遷移の接続元Stateを選択してください。");
        return;
      }
      linkSource = id;
      selection = { type, id };
      render();
      return;
    }
    if (id === linkSource) {
      linkSource = null;
      render();
      return;
    }
    const source = linkSource;
    if (mode === "block" && type !== "transition") {
      toast("阻止する予定Transitionの矢印を選択してください。");
      return;
    }
    if (mode !== "block" && type !== "state") {
      toast("接続先のStateを選択してください。");
      return;
    }
    linkSource = null;
    render();
    if (mode === "transition") editTransition(null, source, id);
    else
      editInteraction(
        null,
        source,
        mode === "block" ? "transition" : "state",
        id,
        mode === "block" ? "block" : "cause",
      );
  }
  function point(event) {
    const b = svg.getBoundingClientRect();
    return { x: event.clientX - b.left, y: event.clientY - b.top };
  }
  function rowAt(y) {
    return layout.rows.find((r) => y >= r.top && y < r.top + r.height);
  }
  function targetInfo(event) {
    const g = event.target.closest("[data-type]");
    return g ? { type: g.dataset.type, id: g.dataset.id } : null;
  }
  svg.addEventListener("pointerdown", (e) => {
    if (e.button === 1 || spaceHeld) {
      e.preventDefault();
      drag = {
        type: "pan",
        x: e.clientX,
        y: e.clientY,
        left: scroll.scrollLeft,
        top: scroll.scrollTop,
      };
      return;
    }
    if (e.button !== 0) return;
    scroll.focus({ preventScroll: true });
    const info = targetInfo(e);
    if (!info) return;
    if (e.target.matches("[data-port]")) {
      e.preventDefault();
      linkSource = info.id;
      selection = info;
      drag = { type: "link", x: e.clientX, y: e.clientY };
      updateSelection();
      renderInspector();
      return;
    }
    if (mode !== "select") return;
    if (info.type === "state") {
      const s = state(info.id);
      drag = {
        type: "state",
        id: s.id,
        base: M.clone(history.doc),
        original: M.clone(s),
        x: e.clientX,
        y: e.clientY,
        handle: e.target.dataset.handle,
        copy: e.ctrlKey || e.metaKey,
        moved: false,
      };
      selection = info;
      // Keep the original pointer target until click/double-click dispatches.
    } else if (info.type === "actor") {
      drag = {
        type: "actor",
        id: info.id,
        x: e.clientX,
        y: e.clientY,
        moved: false,
      };
      selection = info;
    }
  });
  window.addEventListener("pointermove", (e) => {
    if (!drag) return;
    if (drag.type === "pan") {
      drag.moved =
        Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 3;
      scroll.scrollLeft = drag.left - (e.clientX - drag.x);
      scroll.scrollTop = drag.top - (e.clientY - drag.y);
      return;
    }
    const dx = e.clientX - drag.x,
      dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) < 4 && !drag.moved) return;
    drag.moved = true;
    if (drag.type === "link") return;
    if (drag.type === "actor") {
      drag.targetId = rowAt(point(e).y)?.actor.id;
      renderSVG();
      return;
    }
    const d = M.clone(drag.base),
      s = M.clone(drag.original),
      step = d.time.snap,
      delta = M.snap(dx / scale, step);
    if (drag.handle === "start")
      s.start = Math.max(
        0,
        Math.min(s.end - Math.min(step, s.end - s.start), s.start + delta),
      );
    else if (drag.handle === "end")
      s.end = Math.min(
        d.time.duration,
        Math.max(s.start + Math.min(step, s.end - s.start), s.end + delta),
      );
    else {
      const shift = Math.max(
        -s.start,
        Math.min(d.time.duration - s.end, delta),
      );
      s.start += shift;
      s.end += shift;
      const row = rowAt(point(e).y);
      if (row) s.actorId = row.actor.id;
    }
    if (drag.copy && !drag.handle) {
      drag.copyId ||= M.id("state");
      s.id = drag.copyId;
      d.states.push(s);
      selection = { type: "state", id: s.id };
    } else {
      Object.assign(item("state", s.id, d), s);
      followState(d, drag.original, s);
    }
    preview = d;
    renderSVG();
    $("#status").textContent = `${s.name} · ${time(s.start)} → ${time(s.end)}`;
  });
  window.addEventListener("pointerup", (e) => {
    if (!drag) return;
    const finished = drag;
    drag = null;
    if (finished.type === "link") {
      if (finished.moved) {
        ignoreClick = true;
        setTimeout(() => (ignoreClick = false), 0);
        const info = targetInfo(e);
        if (info?.type === "state" && info.id !== linkSource) {
          const src = linkSource;
          linkSource = null;
          mode =
            state(src).actorId === state(info.id).actorId
              ? "transition"
              : "interaction";
          render();
          if (mode === "transition") editTransition(null, src, info.id);
          else editInteraction(null, src, "state", info.id);
        } else if (info?.type === "transition" && mode === "block") {
          connect(info.type, info.id);
        }
      }
      return;
    }
    if (!finished.moved) {
      preview = null;
      return;
    }
    ignoreClick = true;
    setTimeout(() => (ignoreClick = false), 0);
    if (finished.type === "actor") {
      if (finished.targetId)
        safeChange((d) => {
          const from = d.actors.findIndex((a) => a.id === finished.id),
            to = d.actors.findIndex((a) => a.id === finished.targetId);
          d.actors.splice(to, 0, d.actors.splice(from, 1)[0]);
        }, "Actorを並べ替えました");
      else render();
    }
    if (finished.type === "state") {
      try {
        commit(preview, "Stateを変更しました");
      } catch (error) {
        preview = null;
        selection = { type: "state", id: finished.id };
        render();
        toast(error.message);
      }
    }
  });
  window.addEventListener("pointercancel", () => {
    drag = null;
    preview = null;
    render();
  });
  svg.addEventListener("click", (e) => {
    if (ignoreClick) return;
    const info = targetInfo(e),
      p = point(e);
    if (e.target.matches("[data-port]")) return;
    if (info) {
      if (["transition", "interaction", "block"].includes(mode) || linkSource) {
        if (mode === "select" && linkSource)
          mode =
            info.type === "state" &&
            state(linkSource).actorId === state(info.id)?.actorId
              ? "transition"
              : "interaction";
        connect(info.type, info.id);
      } else select(info.type, info.id);
      return;
    }
    if (p.x < scroll.scrollLeft + 196 || p.y < scroll.scrollTop + 64) return;
    const row = rowAt(p.y);
    if (mode === "state" && row)
      editState(null, row.actor.id, (p.x - 208) / scale);
    else {
      selection = null;
      linkSource = null;
      updateSelection();
      renderInspector();
    }
  });
  svg.addEventListener("dblclick", (e) => {
    if (mode !== "select") return;
    const info = targetInfo(e);
    if (info) {
      selection = info;
      editSelected();
    } else {
      const p = point(e),
        row = rowAt(p.y);
      if (row && p.x > scroll.scrollLeft + 196 && p.y > scroll.scrollTop + 64)
        editState(null, row.actor.id, (p.x - 208) / scale);
    }
  });
  function menu(x, y, entries) {
    const el = $("#context-menu");
    el.innerHTML = entries
      .map(
        (entry, n) =>
          `<button role="menuitem" data-menu="${n}" class="${entry.danger ? "danger" : ""}">${esc(entry.label)}</button>`,
      )
      .join("");
    el.hidden = false;
    el.style.left = `${Math.max(8, Math.min(x, innerWidth - el.offsetWidth - 8))}px`;
    el.style.top = `${Math.max(8, Math.min(y, innerHeight - el.offsetHeight - 8))}px`;
    el.onclick = (e) => {
      const n = e.target.dataset.menu;
      if (n !== undefined) {
        el.hidden = true;
        entries[Number(n)].action();
      }
    };
    el.querySelector("button")?.focus();
  }
  svg.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const info = targetInfo(e);
    if (info) {
      selection = info;
      render();
      const entries = [{ label: "編集", action: editSelected }];
      if (info.type === "state")
        entries.push(
          { label: "複製", action: duplicateSelected },
          {
            label: "ここから遷移を作成",
            action: () => {
              mode = "transition";
              linkSource = info.id;
              render();
            },
          },
          {
            label: "ここから作用を作成",
            action: () => {
              mode = "interaction";
              linkSource = info.id;
              render();
            },
          },
          {
            label: "ここから予定遷移を妨害",
            action: () => {
              mode = "block";
              linkSource = info.id;
              render();
            },
          },
        );
      if (info.type === "actor")
        entries.push(
          { label: "上へ移動", action: () => moveActor(-1) },
          { label: "下へ移動", action: () => moveActor(1) },
        );
      entries.push({ label: "削除", action: deleteSelected, danger: true });
      menu(e.clientX, e.clientY, entries);
    } else {
      const p = point(e),
        row = rowAt(p.y);
      menu(e.clientX, e.clientY, [
        ...(row
          ? [
              {
                label: "Stateを追加",
                action: () =>
                  editState(null, row.actor.id, (p.x - 208) / scale),
              },
            ]
          : []),
        { label: "Actorを追加", action: () => editActor() },
      ]);
    }
  });
  document.addEventListener("pointerdown", (e) => {
    if (!e.target.closest("#context-menu")) $("#context-menu").hidden = true;
  });
  $("#context-menu").addEventListener("keydown", (e) => {
    const items = [...$("#context-menu").querySelectorAll("button")],
      index = items.indexOf(document.activeElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      items[
        (index + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length
      ]?.focus();
    }
    if (e.key === "Escape") {
      $("#context-menu").hidden = true;
      scroll.focus();
    }
  });
  $("#inspector").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.jump) {
      jump(b.dataset.jumpType, b.dataset.jump);
      return;
    }
    ({
      edit: editSelected,
      delete: deleteSelected,
      duplicate: duplicateSelected,
      up: () => moveActor(-1),
      down: () => moveActor(1),
    })[b.dataset.action]?.();
  });
  $("#inspector").addEventListener("input", (e) => {
    if (e.target.id === "search") {
      searchQuery = e.target.value;
      renderSearch();
    }
  });
  $("#inspector").addEventListener("change", (e) => {
    if (e.target.id === "focus-chain") {
      focusChain = e.target.checked;
      renderSVG();
    }
  });
  $("#editor-form").addEventListener("submit", (e) => {
    e.preventDefault();
    try {
      dialogApply(Object.fromEntries(new FormData(e.target)));
      $("#editor-dialog").close();
      render();
    } catch (error) {
      $("#dialog-error").textContent = error.message;
    }
  });
  $("#dialog-close").onclick = $("#dialog-cancel").onclick = () =>
    $("#editor-dialog").close();
  $("#help-btn").onclick = () => $("#help-dialog").showModal();
  $("#help-close").onclick = () => $("#help-dialog").close();
  $$("[data-mode]").forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
  $("#add-actor").onclick = () => editActor();
  $("#document-title").onclick = documentSettings;
  function undo() {
    if (history.undo()) {
      selection = null;
      linkSource = null;
      saveLocal();
      render();
      $("#status").textContent = "元に戻しました";
    }
  }
  function redo() {
    if (history.redo()) {
      selection = null;
      linkSource = null;
      saveLocal();
      render();
      $("#status").textContent = "やり直しました";
    }
  }
  $("#undo").onclick = undo;
  $("#redo").onclick = redo;
  $("#snap").onchange = (e) =>
    safeChange((d) => {
      d.time.snap = Number(e.target.value);
    }, "スナップ間隔を変更しました");
  function zoom(factor) {
    const centerTime =
      (scroll.scrollLeft + scroll.clientWidth / 2 - 208) / scale;
    scale = Math.max(
      0.0001,
      Math.min(200, 24000 / doc().time.duration, scale * factor),
    );
    renderSVG();
    scroll.scrollLeft = Math.max(
      0,
      208 + centerTime * scale - scroll.clientWidth / 2,
    );
    $("#zoom-label").textContent = `${Math.round((scale / 16) * 100)}%`;
  }
  function fit() {
    scale = Math.max(
      0.0001,
      Math.min(200, (scroll.clientWidth - 250) / doc().time.duration),
    );
    scroll.scrollLeft = 0;
    render();
  }
  $("#zoom-in").onclick = () => zoom(1.25);
  $("#zoom-out").onclick = () => zoom(0.8);
  $("#fit").onclick = fit;
  $("#inspector-toggle").onclick = () => {
    inspectorHidden = !inspectorHidden;
    render();
  };
  scroll.addEventListener("scroll", sticky, { passive: true });
  scroll.addEventListener(
    "wheel",
    (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1);
      }
    },
    { passive: false },
  );
  function download(content, type, name) {
    const blob = new Blob([content], { type }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function saveJSON() {
    download(
      JSON.stringify(history.doc, null, 2),
      "application/json",
      "mission-timeline.json",
    );
    $("#status").textContent = "JSONファイルを書き出しました";
  }
  function exportSVG() {
    const copy = svg.cloneNode(true);
    copy
      .querySelectorAll("#actor-labels,#time-ruler,#corner")
      .forEach((e) => e.removeAttribute("transform"));
    copy
      .querySelectorAll(
        ".resize,.port,.handle-line,.pending-ring,.selection-time",
      )
      .forEach((e) => e.remove());
    copy
      .querySelectorAll(".selected,.dimmed")
      .forEach((e) => e.classList.remove("selected", "dimmed"));
    copy.setAttribute("viewBox", `0 0 ${layout.width} ${layout.height}`);
    copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    download(
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
        new XMLSerializer().serializeToString(copy),
      "image/svg+xml",
      "mission-timeline.svg",
    );
  }
  $("#save-btn").onclick = saveJSON;
  $("#open-btn").onclick = () => $("#file-input").click();
  $("#file-input").onchange = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      if (file.size > 8 * 1024 * 1024)
        throw new Error("JSONファイルは8MB以下にしてください。");
      const next = M.parse(await file.text());
      dialog(
        "JSONを読み込む",
        `<p class="dialog-summary">「${esc(next.title)}」を読み込みます。現在の内容は置き換わります。Undoで戻せます。</p>`,
        () => {
          commit(next, "JSONを読み込みました");
          selection = null;
          fit();
        },
      );
    } catch (error) {
      toast(`読み込みできません: ${error.message}`);
    }
  };
  $("#more-btn").onclick = (e) =>
    menu(e.clientX, e.clientY, [
      { label: "SVGを書き出す", action: exportSVG },
      { label: "ミッション設定", action: documentSettings },
      {
        label: "新規ミッション",
        action: () =>
          dialog(
            "新規ミッション",
            '<p class="dialog-summary">現在の内容を空のミッションに置き換えます。Undoで戻せます。</p>',
            () => {
              commit({
                version: 1,
                title: "新しいミッション",
                time: { unit: "minutes", duration: 60, snap: 1 },
                actors: [],
                states: [],
                transitions: [],
                interactions: [],
              });
              selection = null;
              fit();
            },
          ),
      },
      {
        label: "サンプルを読み込む",
        action: () =>
          dialog(
            "サンプルを読み込む",
            '<p class="dialog-summary">現在の内容をサンプルに置き換えます。Undoで戻せます。</p>',
            () => {
              commit(createSample());
              selection = null;
              fit();
            },
          ),
      },
    ]);
  window.addEventListener("keydown", (e) => {
    if (
      e.target.matches("input,textarea,select") ||
      e.target.isContentEditable ||
      $("dialog[open]")
    )
      return;
    const ctrl = e.ctrlKey || e.metaKey,
      key = e.key.toLowerCase();
    if (ctrl && key === "s") {
      e.preventDefault();
      saveJSON();
      return;
    }
    if (ctrl && key === "z") {
      e.preventDefault();
      e.shiftKey ? redo() : undo();
      return;
    }
    if (ctrl && key === "y") {
      e.preventDefault();
      redo();
      return;
    }
    if (key === "escape") {
      drag = null;
      preview = null;
      linkSource = null;
      mode = "select";
      selection = null;
      $("#context-menu").hidden = true;
      render();
      return;
    }
    if (e.code === "Space") {
      e.preventDefault();
      spaceHeld = true;
      return;
    }
    if (e.target.closest("button,#context-menu")) return;
    if (key === "delete" || key === "backspace") {
      e.preventDefault();
      deleteSelected();
      return;
    }
    if (key === "enter" && selection) {
      e.preventDefault();
      editSelected();
      return;
    }
    if (ctrl && key === "d") {
      e.preventDefault();
      duplicateSelected();
      return;
    }
    if (
      selection?.type === "state" &&
      (key === "arrowleft" || key === "arrowright")
    ) {
      e.preventDefault();
      const delta = doc().time.snap * (key === "arrowleft" ? -1 : 1);
      safeChange((d) => {
        const s = state(selection.id, d),
          before = M.clone(s);
        if (e.shiftKey) s.end += delta;
        else {
          s.start += delta;
          s.end += delta;
        }
        followState(d, before, s);
      }, "Stateの時間を変更しました");
      return;
    }
    if (!ctrl && { v: 1, s: 1, t: 1, i: 1, b: 1 }[key]) {
      e.preventDefault();
      setMode(
        {
          v: "select",
          s: "state",
          t: "transition",
          i: "interaction",
          b: "block",
        }[key],
      );
    }
    if (key === "?") $("#help-dialog").showModal();
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "Space") spaceHeld = false;
  });
  window.addEventListener("blur", () => {
    spaceHeld = false;
    if (drag) {
      drag = null;
      preview = null;
      render();
    }
  });
  render();
  requestAnimationFrame(fit);
  if (storageWarning) toast(storageWarning);
})();
