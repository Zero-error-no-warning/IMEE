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
    observation: "観測",
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
    linkSource = null,
    scale = 16,
    viewStart = history.doc.views.main.visibleTimeRange.start,
    viewSpan =
      history.doc.views.main.visibleTimeRange.end -
      history.doc.views.main.visibleTimeRange.start,
    plotLeft = 176,
    frame,
    layout,
    preview = null,
    drag = null,
    ignoreClick = false,
    spaceHeld = false,
    focusChain = false,
    inspectorHidden = true,
    searchQuery = "";
  let multi = [],
    clipboard = null;
  const selectedItems = () =>
    multi.length
      ? multi.filter((x) => item(x.type, x.id))
      : selection
        ? [selection]
        : [];
  const chosen = (id) => selectedItems().some((x) => x.id === id);
  const view = () => doc().views.main;
  const collapsed = (id) => M.isCollapsed(doc(), id);
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
    next = M.migrate(next);
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
  const timeX = (value) => plotLeft + (value - frame.start) * scale;
  const xTime = (x) => frame.start + (x - plotLeft) / scale;
  function beginConnection(id) {
    linkSource = id;
    multi = [];
    selection = { type: "state", id };
    render();
  }
  function toggleActor(id) {
    multi = [];
    selection = { type: "actor", id };
    linkSource = null;
    safeChange((d) => {
      const a = item("actor", id, d);
      M.setCollapsed(d, id, !M.isCollapsed(d, id));
    }, "グループの表示を変更しました");
  }
  function updateSelection() {
    const chain =
      (focusChain || isEnemyTransition(selection)) && selection
        ? causalIds(doc(), selection)
        : null;
    svg.querySelectorAll("[data-type]").forEach((el) => {
      el.classList.toggle("selected", chosen(el.dataset.id));
      el.classList.toggle(
        "dimmed",
        !!chain && el.dataset.type !== "actor" && !chain.has(el.dataset.id),
      );
    });
    svg
      .querySelectorAll(".interaction-label")
      .forEach(
        (el) =>
          (el.textContent = chosen(el.closest("[data-id]").dataset.id)
            ? el.dataset.fullLabel
            : el.dataset.shortLabel),
      );
    connectionFeedback();
    svg.querySelectorAll(".selection-time").forEach((el) => el.remove());
    if (selection?.type === "state") {
      const s = state(selection.id),
        p = layout.positions.get(s.id);
      if (!p) return;
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
  function select(type, id, additive = false) {
    if (additive) {
      const current = selectedItems();
      multi = current.some((x) => x.id === id)
        ? current.filter((x) => x.id !== id)
        : [...current, { type, id }];
      selection = multi.at(-1) || null;
    } else {
      multi = [];
      selection = { type, id };
    }
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
    if (!p || !q) return null;
    return {
      x: timeX(at),
      y: q.y + 16,
      x1: p.x + p.width,
      y1: p.y + 16,
      x2: q.x,
      y2: q.y + 16,
    };
  }
  function edgeClass(id) {
    const related = renderedRelated;
    return `${chosen(id) ? " selected" : ""}${related && !related.has(id) ? " dimmed" : ""}`;
  }
  const svgStyle = `
    text{font-family:Inter,"Segoe UI","Noto Sans JP",sans-serif}.grid{stroke:#edf1f2;stroke-width:1}.tick{fill:#82949a;font-size:10px}.rowline{stroke:#e3eaec;stroke-width:1}.state{cursor:grab}.state:active{cursor:grabbing}.state .body{stroke-width:1.2}.state.selected .body{stroke:#087f80;stroke-width:2.4}.state:hover .body{stroke-width:2}.state text{pointer-events:none}.state .resize{cursor:ew-resize;fill:#fff;fill-opacity:0}.state .handle-line{stroke:#69948d;opacity:0;pointer-events:none}.state:hover .handle-line,.state.selected .handle-line{opacity:1}.edge{cursor:pointer}.edge .hit{stroke:transparent;stroke-width:13;fill:none}.edge .line{fill:none;stroke-linejoin:round;stroke-linecap:round;stroke-width:1.6}.edge.selected .line{stroke-width:3}.edge:hover .line{stroke-width:2.6}.edge-label{font-size:10px;paint-order:stroke;stroke:#fff;stroke-width:5;stroke-linejoin:round;fill:#69878a}.edge.block .edge-label{fill:#b34c4d}.dimmed{opacity:.17}.actor-label{cursor:grab}.actor-label text{pointer-events:none}.actor-label:hover .actor-bg{fill:#edf5f3}.actor-label.selected .actor-bg{fill:#e4f1ec}.actor-label .actor-name{font-size:12px;fill:#27454e;font-weight:600}.blocked-cross{stroke:#c14d51;stroke-width:2.3;fill:none}.pending-ring{fill:none;stroke:#098784;stroke-width:2;stroke-dasharray:4 3}.drop-indicator{stroke:#087f80;stroke-width:3}.export-hide{display:none}svg[data-view="interaction"] .state:not(.selected) .body{fill-opacity:.25}
  `;
  let technologyBoxes = [];
  function renderSVG(full = false) {
    technologyBoxes = [];
    const d = doc();
    frame = M.viewport(
      d.time.duration,
      Math.max(280, scroll.clientWidth || 1000),
      full ? 0 : viewStart,
      full ? d.time.duration : viewSpan,
    );
    if (!full) {
      viewStart = frame.start;
      viewSpan = frame.span;
      if (!preview) {
        view().visibleTimeRange = { start: frame.start, end: frame.end };
        view().zoom = d.time.duration / frame.span;
        saveLocal();
      }
    }
    scale = frame.scale;
    plotLeft = frame.plotLeft;
    const filtered = full
      ? d
      : {
          ...d,
          transitions: d.transitions.filter(
            (t) => view().filters.planned || t.status !== "planned",
          ),
          states: d.states.filter(
            (s) =>
              (view().filters.planned || s.status !== "planned") &&
              (view().filters.quiet || s.activity !== "quiet"),
          ),
        };
    layout = M.layout(filtered, scale, {
      start: frame.start,
      plotLeft,
      width: frame.width,
      includeHidden: full,
    });
    renderedRelated =
      (focusChain || isEnemyTransition(selection)) && selection
        ? causalIds(d, selection)
        : null;
    svg.dataset.view = view().mode;
    svg.setAttribute("width", layout.width);
    svg.setAttribute("height", layout.height);
    svg.classList.toggle("link-mode", !!linkSource);
    const parts = [
      `<title>${esc(d.title)}</title><desc>横軸は時間（${units[d.time.unit]}）、縦軸はActor。状態の幅は継続時間。破線は予定、赤い×は阻止された遷移。</desc><style>${svgStyle}</style><defs><marker id="arrow-gray" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#8b9c9f"/></marker><marker id="arrow-teal" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#388c91"/></marker><marker id="arrow-red" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#c14d51"/></marker></defs><rect width="${layout.width}" height="${layout.height}" fill="white"/><defs><clipPath id="plot-clip"><rect x="${plotLeft - 12}" y="48" width="${layout.width - plotLeft - 12}" height="${layout.height - 48}"/></clipPath></defs><g id="plot" clip-path="url(#plot-clip)">`,
    ];
    parts.push(
      `<defs>${Object.keys(kinds)
        .map(
          (kind) =>
            `<marker id="arrow-${kind}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="${interactionStyle(kind).color}"/></marker>`,
        )
        .join("")}</defs>`,
    );
    const tickStep =
      [
        0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600,
        1200, 3600, 10000, 50000, 100000, 500000,
      ].find((n) => n * scale >= 65) || 1000000;
    for (const row of layout.rows)
      parts.push(
        `<rect data-row="${esc(row.actor.id)}" x="${plotLeft - 12}" y="${row.top}" width="${layout.width - plotLeft + 12}" height="${row.height}" fill="${row.actor.side === "hostile" ? "#fffcfb" : "#fff"}"/><line class="rowline" x1="0" y1="${row.top + row.height}" x2="${layout.width}" y2="${row.top + row.height}"/>`,
      );
    for (
      let t = Math.ceil(frame.start / tickStep) * tickStep;
      t <= frame.end + 1e-7;
      t += tickStep
    ) {
      const x = timeX(t);
      parts.push(
        `<line class="grid" x1="${x}" y1="48" x2="${x}" y2="${layout.height - 28}"/>`,
      );
    }
    // Transitions are drawn behind states. A vertical branch does not alter its time coordinate.
    for (const t of d.transitions) {
      if (!full && !view().filters.planned && t.status === "planned") continue;
      const a = layout.positions.get(t.from),
        b = layout.positions.get(t.to);
      if (!a || !b) continue;
      const blockers = d.interactions.filter(
        (i) => i.effect === "block" && !i.proposed && i.targetId === t.id,
      );
      const path = `M ${a.x + a.width} ${a.y + 16} V ${b.y + 16} H ${b.x}`;
      parts.push(
        `<g data-type="transition" data-id="${esc(t.id)}" class="edge${blockers.length ? " block" : ""}${edgeClass(t.id)}"><title>${esc(state(t.from).name)} → ${esc(state(t.to).name)}${blockers.length ? "（阻止）" : t.status === "planned" ? "（予定）" : ""}</title><path class="hit" d="${path}"/><path class="line" d="${path}" stroke="${blockers.length ? "#c14d51" : "#8b9c9f"}" ${t.status === "planned" ? 'stroke-dasharray="5 4"' : ""} marker-end="url(#arrow-${blockers.length ? "red" : "gray"})"/>`,
      );
      if (t.label || b.x - a.x - a.width >= 90)
        parts.push(
          `<text class="edge-label" x="${(a.x + a.width + b.x) / 2}" y="${b.y + (b.x > a.x + a.width ? 10 : 42)}" text-anchor="middle">${esc(t.label || "遷移")}${state(t.to).start > state(t.from).end ? ` · ${fmt(state(t.to).start - state(t.from).end)} ${units[d.time.unit]}` : ""}</text>`,
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
      if (!p) continue;
      const clipId = `clip-${d.states.indexOf(s)}`;
      parts.push(
        `<g class="state${edgeClass(s.id)}" data-type="state" data-id="${esc(s.id)}"><title>${esc(s.name)} · ${time(s.start)}–${time(s.end)} ${units[d.time.unit]} · ${planned ? "予定" : "実際"}${quiet ? " · 平常" : ""}</title><defs><clipPath id="${clipId}"><rect x="${p.x + 5}" y="${p.y}" width="${Math.max(0, p.width - 10)}" height="32"/></clipPath></defs><rect class="body" x="${p.x}" y="${p.y}" width="${p.width}" height="32" rx="5" fill="${quiet ? "#f6f8f8" : planned ? "#fff" : c.fill}" stroke="${quiet ? "#ced9dc" : planned ? "#b3bec1" : c.stroke}" ${planned ? 'stroke-dasharray="5 3"' : quiet ? 'stroke-dasharray="3 3"' : ""}/><text x="${(Math.max(p.x, plotLeft) + Math.min(p.x + p.width, frame.width - 24)) / 2}" y="${p.y + 20}" text-anchor="middle" fill="${quiet ? "#95a5aa" : planned ? "#87999e" : c.ink}" font-size="11" font-weight="${quiet ? "400" : "550"}" clip-path="url(#${clipId})">${esc(s.name)}${planned ? " · 予定" : ""}</text>`,
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
      parts.push("</g>");
    }
    // An instantaneous transition has no horizontal length; a point marker makes it selectable.
    for (const t of d.transitions) {
      const a = state(t.from),
        b = state(t.to);
      if (!full && !view().filters.planned && t.status === "planned") continue;
      if (a.end !== b.start) continue;
      const p = transitionPoint(t, b.start);
      if (!p) continue;
      parts.push(
        `<g data-type="transition" data-id="${esc(t.id)}" class="edge${edgeClass(t.id)}"><title>${esc(a.name)} → ${esc(b.name)} · 即時遷移</title><path d="M ${p.x} ${p.y - 5} l 5 5 -5 5 -5 -5 Z" fill="white" stroke="#8b9c9f" stroke-width="1.5"/></g>`,
      );
    }
    // Interactions share the same time scale. Their attachment points denote event times.
    const labelBoxes = [];
    for (const i of d.interactions) {
      if (!full && !view().filters.interaction) continue;
      const s = layout.positions.get(i.fromStateId);
      if (!s) continue;
      let target;
      if (i.targetType === "state") {
        const q = layout.positions.get(i.targetId);
        if (!q) continue;
        target = { x: q.x, y: q.y + 16 };
      } else target = transitionPoint(item("transition", i.targetId), i.time);
      if (!target) continue;
      const down = target.y > s.y + 16,
        x1 = timeX(i.sourceTime),
        y1 = s.y,
        x2 = timeX(i.time),
        y2 = i.targetType === "state" ? target.y + (down ? -16 : 16) : target.y;
      const middleY = s.y - 2,
        path = `M ${x1} ${y1} V ${middleY} H ${x2} V ${y2}`;
      const blocked = i.effect === "block",
        style = interactionStyle(i.kind),
        color = style.color;
      const labelX = Math.min(
          frame.width - 100,
          Math.max(plotLeft, Math.max(x1, x2) + 7),
        ),
        labelY = middleY - 4;
      const labelWidth = Math.min(160, i.label.length * 10);
      const overlap = labelBoxes.some(
        (b) =>
          Math.abs(b.y - labelY) < 15 &&
          labelX < b.x + b.w &&
          labelX + labelWidth > b.x,
      );
      labelBoxes.push({ x: labelX, y: labelY, w: labelWidth });
      const label = chosen(i.id)
        ? i.label
        : overlap
          ? "…"
          : i.label.length > 16
            ? i.label.slice(0, 15) + "…"
            : i.label;
      parts.push(
        `<g class="edge${blocked ? " block" : ""}${edgeClass(i.id)}" data-type="interaction" data-id="${esc(i.id)}"><title>${i.proposed ? "検討案 / " : ""}${esc(i.label)} · ${time(i.sourceTime)} → ${time(i.time)}</title><path class="hit" d="${path}"/><path class="line" d="${path}" stroke="${color}" ${i.proposed ? 'stroke-dasharray="3 6"' : style.dash ? `stroke-dasharray="${style.dash}"` : ""} style="stroke-width:${style.width}" marker-end="url(#arrow-${i.kind})"/><circle cx="${x1}" cy="${y1}" r="3" fill="white" stroke="${color}"/><text class="edge-label interaction-label" data-full-label="${esc(i.label)}" data-short-label="${esc(label)}" x="${labelX}" y="${labelY}">${i.proposed ? "検討: " : ""}${esc(label)}</text>`,
      );
      if (i.outcomeStateId && layout.positions.has(i.outcomeStateId)) {
        const o = layout.positions.get(i.outcomeStateId);
        parts.push(
          `<path class="line" d="M ${x2} ${y2} H ${o.x - 9} V ${o.y + 16} H ${o.x}" stroke="${color}" stroke-dasharray="2 3"/>`,
        );
      }
      parts.push("</g>");
    }
    if (!full && view().filters.interaction) renderProxies(parts, filtered);
    renderTechnologyTags(parts, d, full);
    if (!d.actors.length)
      parts.push(
        '<text x="230" y="112" font-size="14" fill="#73858b">「＋ Actor」からミッションの登場主体を追加してください。</text>',
      );
    for (const row of layout.rows) {
      if (full || !collapsed(row.actor.id) || !row.hasChildren) continue;
      const ids = M.descendants(d, row.actor.id);
      ids.delete(row.actor.id);
      const hiddenStates = new Set(
        d.states.filter((s) => ids.has(s.actorId)).map((s) => s.id),
      );
      const hiddenEdges = d.interactions.filter(
        (i) =>
          hiddenStates.has(i.fromStateId) ||
          (i.targetType === "state"
            ? hiddenStates.has(i.targetId)
            : hiddenStates.has(item("transition", i.targetId).from)),
      ).length;
      parts.push(
        `<g data-toggle="${esc(row.actor.id)}" style="cursor:pointer"><text x="${plotLeft + 5}" y="${row.top + row.height - 10}" font-size="10" fill="#7c9095">▸ ${ids.size} Actors / ${hiddenStates.size} States · 関連作用 ${hiddenEdges}件 · 外部接続は束ね表示</text></g>`,
      );
    }
    parts.push("</g>");
    // Keep actor names and the time ruler visible while the canvas scrolls.
    parts.push('<g id="actor-labels">');
    for (const row of layout.rows) {
      const a = row.actor,
        c = colors(a.side),
        indent = Math.min(60, row.depth * 14),
        nameX = 43 + indent;
      const maxChars = Math.max(3, Math.floor((plotLeft - 24 - nameX) / 11));
      const toggle = row.hasChildren
        ? `<g data-toggle="${esc(a.id)}" role="button" tabindex="0" aria-label="${esc(a.name)}を${collapsed(a.id) ? "展開" : "折りたたむ"}" aria-expanded="${!collapsed(a.id)}"><rect x="${14 + indent}" y="${row.top + 10}" width="24" height="28" fill="white" fill-opacity="0"/><text x="${20 + indent}" y="${row.top + 25}" fill="#477e7b" font-size="12">${collapsed(a.id) && !full ? "▸" : "▾"}</text></g>`
        : `<text x="${20 + indent}" y="${row.top + 25}" font-size="12" fill="#a3b9bb">${row.depth ? "└" : "⠿"}</text>`;
      parts.push(
        `<g class="actor-label${chosen(a.id) ? " selected" : ""}" data-type="actor" data-id="${esc(a.id)}"><rect class="actor-bg" x="0" y="${row.top}" width="${plotLeft - 12}" height="${row.height}" fill="${a.isGroup || row.hasChildren ? "#f0f6f4" : "#fafcfc"}"/><line class="rowline" x1="0" y1="${row.top + row.height}" x2="${plotLeft - 12}" y2="${row.top + row.height}"/>${toggle}<text class="actor-name" x="${nameX}" y="${row.top + 24}">${esc(a.name.length > maxChars ? a.name.slice(0, maxChars) + "…" : a.name)}</text><text x="${nameX}" y="${row.top + 40}" font-size="9" fill="${c.stroke}">${sides[a.side]}${row.hasChildren || a.isGroup ? " / グループ" : ""}</text>${technologyBubble("actor", a.id, nameX, row.top + 45, plotLeft - 20 - nameX, full)}<title>${esc(a.name)} · 中央へドロップで子に、上下端へドロップで並べ替え</title></g>`,
      );
    }
    parts.push(
      `<line x1="${plotLeft - 12}" y1="48" x2="${plotLeft - 12}" y2="${layout.height}" stroke="#dde7e9"/></g><g id="time-ruler"><rect x="${plotLeft - 12}" y="0" width="${layout.width - plotLeft + 12}" height="48" fill="#fafcfc"/><line class="rowline" x1="${plotLeft - 12}" y1="48" x2="${layout.width}" y2="48"/><text x="${plotLeft}" y="14" font-size="8" letter-spacing="1.2" fill="#81969b">ELAPSED TIME / ${units[d.time.unit]}</text>`,
    );
    for (
      let t = Math.ceil(frame.start / tickStep) * tickStep;
      t <= frame.end + 1e-7;
      t += tickStep
    ) {
      const x = timeX(t);
      parts.push(
        `<text class="tick" x="${x}" y="32" text-anchor="middle">${time(t)}</text><line x1="${x}" y1="53" x2="${x}" y2="48" stroke="#dbe5e7"/>`,
      );
    }
    parts.push(
      `</g><g id="corner"><rect width="${plotLeft - 12}" height="48" fill="#fafcfc"/><text x="28" y="29" font-size="9" letter-spacing="1.4" fill="#7d9299">ACTORS</text><line class="rowline" x1="0" y1="48" x2="${plotLeft - 12}" y2="48"/></g>`,
    );
    if (drag?.type === "actor" && drag.targetId) {
      const row = layout.rows.find((r) => r.actor.id === drag.targetId);
      if (row)
        parts.push(
          `<line class="drop-indicator" x1="0" y1="${drag.position === "after" ? row.top + row.height : row.top}" x2="${layout.width}" y2="${drag.position === "after" ? row.top + row.height : row.top}"/>`,
        );
    }
    if (drag?.type === "actor" && drag.position === "inside") {
      const row = layout.rows.find((r) => r.actor.id === drag.targetId);
      if (row)
        parts.push(
          `<rect x="2" y="${row.top + 2}" width="${plotLeft - 16}" height="${row.height - 4}" rx="5" fill="#087f8012" stroke="#087f80" pointer-events="none"/>`,
        );
    }
    svg.innerHTML = parts.join("");
    connectionFeedback();
    sticky();
  }
  function sticky() {
    $("#actor-labels")?.setAttribute("transform", `translate(0 0)`);
    $("#time-ruler")?.setAttribute(
      "transform",
      `translate(0 ${scroll.scrollTop})`,
    );
    $("#corner")?.setAttribute("transform", `translate(0 ${scroll.scrollTop})`);
  }
  function render() {
    if (selection && !item(selection.type, selection.id)) selection = null;
    multi = multi.filter((x) => item(x.type, x.id));
    renderSVG();
    renderInspector();
    $("#document-title").textContent = doc().title;
    document.title = `${doc().title} | IMEE`;
    $("#counts").textContent =
      `${doc().actors.length} Actors · ${doc().states.length} States`;
    $("#undo").disabled = !history.past.length;
    $("#redo").disabled = !history.future.length;
    $("#view-mode").value = view().mode;
    $("#zoom-label").textContent = `${fmt(doc().time.duration / viewSpan)}×`;
    $("#time-window").textContent =
      `${time(viewStart)} — ${time(viewStart + viewSpan)}`;
    $("#time-pan").max = Math.max(0, doc().time.duration - viewSpan);
    $("#time-pan").value = viewStart;
    $("#time-pan").disabled = viewSpan >= doc().time.duration;
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
      ? "接続先のState・予定遷移を選択 · Escで取消"
      : "Alt + ドラッグで接続 · ダブルクリックで編集 · 右クリックで操作";
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
    let html =
      '<div class="inspector-heading"><span class="panel-eyebrow">INSPECTOR</span><button data-action="close" aria-label="詳細パネルを閉じる">×</button></div>';
    if (selectedItems().length > 1)
      html += `<div class="panel-section"><strong>${selectedItems().length} 件を選択</strong><div class="panel-actions"><button data-action="duplicate">まとめて複製</button><button data-action="group">グループ化</button><button data-action="delete">削除</button></div></div>`;
    if (!selection) {
      const blocks = d.interactions.filter(
        (i) => i.effect === "block" && !i.proposed,
      );
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
          ["親", x.parentId ? item("actor", x.parentId).name : "最上位"],
          ["配下Actor", M.descendants(d, x.id).size - 1],
        ]);
      if (type === "transition") {
        const a = state(x.from),
          b = state(x.to),
          blocks = d.interactions.filter(
            (i) => i.targetId === x.id && i.effect === "block" && !i.proposed,
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
          [
            "効果",
            x.proposed
              ? "検討案（未成立）"
              : x.effect === "block"
                ? "予定遷移の阻止"
                : "状態変化の原因",
          ],
        ]);
        if (x.effect === "block" && !x.proposed)
          html += `<div class="block-card"><strong>成立しなかった予定遷移</strong><p>${esc(target)}${x.outcomeStateId ? `<br>妨害後：${esc(state(x.outcomeStateId).name)}` : ""}</p></div>`;
      }
      html +=
        '<div class="panel-actions"><button data-action="edit">編集</button>' +
        (["state", "actor"].includes(type)
          ? '<button data-action="duplicate">複製</button>'
          : "") +
        '<button data-action="delete" class="danger">削除</button></div>';
      if (type === "actor")
        html +=
          '<div class="panel-actions"><button data-action="up">↑ 上へ</button><button data-action="down">↓ 下へ</button><button data-action="parent">階層を変更</button><button data-action="child">子Actor追加</button></div>';
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
    html += researchInspector();
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
    const sId =
      type === "state"
        ? id
        : type === "interaction"
          ? item(type, id).fromStateId
          : type === "transition"
            ? item(type, id).from
            : null;
    if (sId) {
      const s = state(sId);
      const next = M.clone(doc());
      let actor = item("actor", s.actorId, next),
        changed = false;
      while (actor?.parentId) {
        actor = item("actor", actor.parentId, next);
        if (M.isCollapsed(next, actor.id)) {
          M.setCollapsed(next, actor.id, false);
          changed = true;
        }
      }
      if (!view().filters.planned && s.status === "planned") {
        next.views.main.filters.planned = true;
        changed = true;
      }
      if (!view().filters.quiet && s.activity === "quiet") {
        next.views.main.filters.quiet = true;
        changed = true;
      }
      if (changed) commit(next, "検索対象のグループを展開しました");
      if (s.start < viewStart || s.end > viewStart + viewSpan)
        viewStart = (s.start + s.end - viewSpan) / 2;
    }
    multi = [];
    selection = { type, id };
    render();
    const p = sId && layout.positions.get(sId);
    if (p)
      scroll.scrollTo({
        left: 0,
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
  function parentOptions(excluded = null) {
    const banned = excluded ? M.descendants(doc(), excluded) : new Set();
    return [
      ["", "最上位"],
      ...M.hierarchy(doc(), true)
        .filter((n) => !banned.has(n.actor.id))
        .map((n) => [n.actor.id, "　".repeat(n.depth) + n.actor.name]),
    ];
  }
  function editActor(existing = null, parentId = null, isGroup = false) {
    const a = existing || {
      id: M.id("actor"),
      name: isGroup ? "新しいグループ" : "新しいActor",
      side: parentId ? item("actor", parentId).side : "friendly",
      notes: "",
      parentId,
      isGroup,
    };
    dialog(
      existing
        ? "Actor / グループを編集"
        : isGroup
          ? "グループを追加"
          : "Actorを追加",
      field("名前", "name", a.name, "text", 'required maxlength="300"') +
        `<div class="field-row">${selectField("所属", "side", a.side, Object.entries(sides))}${selectField(
          "表示種別",
          "isGroup",
          a.isGroup ? "true" : "false",
          [
            ["false", "Actor"],
            ["true", "グループ"],
          ],
        )}</div>` +
        selectField(
          "親Actor / グループ",
          "parentId",
          a.parentId || "",
          parentOptions(existing?.id),
        ) +
        notesField(a.notes),
      (data) => {
        change((d) => {
          const value = {
            ...a,
            ...data,
            parentId: data.parentId || null,
            isGroup: data.isGroup === "true",
          };
          if (existing) Object.assign(item("actor", a.id, d), value);
          else {
            d.actors.push(value);
            d.views.main.actorOrder.push(value.id);
          }
          if (value.parentId) M.setCollapsed(d, value.parentId, false);
        }, "Actorを保存しました");
        multi = [];
        selection = { type: "actor", id: a.id };
      },
    );
  }
  function editParent(id) {
    const a = item("actor", id);
    dialog(
      "階層を変更",
      selectField(
        "親Actor / グループ",
        "parentId",
        a.parentId || "",
        parentOptions(id),
      ),
      (data) => {
        change((d) => {
          item("actor", id, d).parentId = data.parentId || null;
          if (data.parentId) M.setCollapsed(d, data.parentId, false);
        }, "階層を変更しました");
      },
    );
  }
  function ungroup(id) {
    safeChange((d) => M.ungroupActor(d, id), "グループを解除しました");
  }
  function groupSelected() {
    const ids = selectedItems()
      .filter((x) => x.type === "actor")
      .map((x) => x.id);
    if (!ids.length) {
      toast("まとめるActorをCtrl / ⌘ + クリックで選択してください。");
      return;
    }
    safeChange((d) => {
      const id = M.groupActors(d, ids);
      multi = [];
      multi = [];
      selection = { type: "actor", id };
    }, "選択Actorをグループ化しました");
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
        selectField("経路分析上の役割", "phase", s.phase || "other", [
          ["other", "未指定"],
          ["decision", "判断（明示指定）"],
        ]) +
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
        multi = [];
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
        `<p class="muted">所要時間：${fmt(state(t.to).start - state(t.from).end)} ${units[doc().time.unit]}。下の時間変更は前Stateの終了・後Stateの開始を変更します。共有する接続にも影響します。</p>` +
        `<div class="field-row">${field("遷移開始（前State終了）", "transitionStart", state(t.from).end, "number", 'required step="any"')}${field("遷移終了（後State開始）", "transitionEnd", state(t.to).start, "number", 'required step="any"')}</div>` +
        field("ラベル（任意）", "label", t.label, "text", 'maxlength="300"') +
        selectField("遷移の区分", "status", t.status, [
          ["actual", "実際"],
          ["planned", "予定"],
        ]),
      (data) => {
        change((d) => {
          const a = state(t.from, d),
            b = state(t.to, d),
            oldA = M.clone(a),
            oldB = M.clone(b);
          a.end = Number(data.transitionStart);
          b.start = Number(data.transitionEnd);
          followState(d, oldA, a);
          followState(d, oldB, b);
          const value = { label: data.label, status: data.status };
          if (existing) Object.assign(item("transition", t.id, d), value);
          else d.transitions.push({ ...t, ...value });
        }, "Transitionを保存しました");
        multi = [];
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
    if (i.targetType === "transition")
      html += selectField("到達時刻の扱い", "proposed", String(!!i.proposed), [
        ["false", "成立した作用（時間窓内のみ）"],
        ["true", "検討案（時間窓外も登録して評価）"],
      ]);
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
            proposed: data.proposed === "true",
            sourceTime: Number(data.sourceTime),
            time: Number(data.time),
            outcomeStateId: data.outcomeStateId || null,
          };
          if (existing) Object.assign(item("interaction", i.id, d), value);
          else d.interactions.push(value);
        }, "Interactionを保存しました");
        multi = [];
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
    const items = selectedItems();
    if (!items.length) return;
    const execute = () => {
      safeChange((d) => {
        for (const x of items) M.remove(d, x.type, x.id);
        multi = [];
        selection = null;
      }, "選択項目を削除しました（Undoで戻せます）");
    };
    if (items.some((x) => x.type === "actor"))
      dialog(
        "選択Actorを削除",
        `<p>選択した${items.length}項目と配下のState・接続・Bindingを削除します。Undoで元に戻せます。</p>`,
        execute,
      );
    else execute();
  }
  function duplicateSelected() {
    const items = selectedItems().filter((x) =>
      ["actor", "state"].includes(x.type),
    );
    if (!items.length) return;
    safeChange((d) => {
      multi = M.paste(d, M.fragment(d, items));
      selection = multi.at(-1) || null;
    }, "選択項目を複製しました");
  }
  function copySelection(cut = false) {
    const items = selectedItems().filter((x) =>
      ["actor", "state"].includes(x.type),
    );
    if (!items.length) return;
    clipboard = M.fragment(doc(), items);
    if (cut)
      safeChange((d) => {
        for (const x of items) M.remove(d, x.type, x.id);
        multi = [];
        selection = null;
      }, "切り取りました（文書内クリップボード）");
    else toast("コピーしました（この文書内でCtrl / ⌘ + V）");
  }
  function pasteSelection() {
    if (!clipboard) return;
    safeChange((d) => {
      multi = M.paste(d, clipboard);
      selection = multi.at(-1) || null;
    }, "参照を付け替えて貼り付けました");
  }
  function moveActor(delta) {
    if (selection?.type !== "actor") return;
    safeChange((d) => {
      const a = item("actor", selection.id, d),
        siblings = M.hierarchy(d, true)
          .map((x) => x.actor)
          .filter((x) => (x.parentId || null) === (a.parentId || null)),
        i = siblings.indexOf(a),
        target = siblings[i + delta];
      if (target)
        M.placeActor(d, a.id, target.id, delta < 0 ? "before" : "after");
    }, "Actorを並べ替えました");
  }
  let selectedPath = 0;
  const techColors = {
    existing: "#21806b",
    research: "#a66a13",
    planned: "#426cb2",
    gap: "#c44550",
    unknown: "#77818b",
  };
  function supportStatus(type, id) {
    const technologies = [
      ...M.technologyFor(doc(), type, id),
      ...(type === "state"
        ? M.technologyFor(doc(), "actor", state(id).actorId)
        : []),
    ];
    return (
      ["gap", "research", "planned", "unknown", "existing"].find((status) =>
        technologies.some((t) => t.status === status),
      ) || "unknown"
    );
  }
  function isEnemyTransition(sel) {
    return (
      sel?.type === "transition" &&
      item("actor", state(item("transition", sel.id)?.to)?.actorId)?.side ===
        "hostile"
    );
  }
  function causalIds(d, sel) {
    if (!isEnemyTransition(sel)) return M.related(d, sel);
    const analysis = M.analyzeTransition(d, sel.id),
      path = analysis.paths[selectedPath];
    if (!path) return analysis.ids;
    const result = new Set([sel.id]);
    // Walk from the intervention upstream; a capability gap visibly terminates the highlighted route.
    for (const e of path.route) {
      result.add(e.id);
      const technologies = [
        ...M.technologyFor(d, e.type, e.id),
        ...(e.type === "state"
          ? M.technologyFor(d, "actor", state(e.id, d).actorId)
          : []),
      ];
      if (technologies.some((t) => t.status === "gap")) break;
    }
    return result;
  }
  function interactionStyle(kind) {
    if (["detection", "observation"].includes(kind))
      return { color: "#8056ad", dash: "6 4", width: 1.8 };
    if (kind === "information")
      return { color: "#46515e", dash: "5 4", width: 1.7 };
    if (["attack", "interference"].includes(kind))
      return { color: "#c44550", dash: "", width: 3.2 };
    return {
      color: "#18858c",
      dash: kind === "support" ? "2 3" : "",
      width: 2,
    };
  }
  function connectionFeedback(hover = null) {
    svg.classList.toggle("connecting", !!linkSource);
    for (const el of svg.querySelectorAll(
      '[data-type="state"],[data-type="transition"]',
    )) {
      let valid = false;
      if (linkSource) {
        const source = state(linkSource),
          x = item(el.dataset.type, el.dataset.id);
        if (source && x)
          valid =
            el.dataset.type === "state"
              ? x.id !== source.id &&
                (x.actorId !== source.actorId
                  ? source.start <= x.start
                  : source.end <= x.start)
              : x.status === "planned" &&
                state(x.to).actorId !== source.actorId;
      }
      el.classList.toggle("connect-target", valid);
      el.classList.toggle(
        "connect-hover",
        valid && hover?.id === el.dataset.id,
      );
    }
  }
  function renderProxies(parts, d) {
    const labels = [];
    const rows = new Map(layout.rows.map((r) => [r.actor.id, r]));
    for (const proxy of M.interactionProxies(d, new Set(rows.keys()))) {
      const from = rows.get(proxy.fromActorId),
        to = rows.get(proxy.toActorId),
        style = interactionStyle(proxy.kind);
      const first = proxy.interactions[0],
        x1 = timeX(Math.min(...proxy.interactions.map((i) => i.sourceTime))),
        x2 = timeX(Math.max(...proxy.interactions.map((i) => i.time)));
      const y1 = from.top + from.height - 18,
        y2 = to.top + to.height - 18,
        path = `M ${x1} ${y1} H ${x2} V ${y2}`;
      const labelX = Math.max(
          plotLeft,
          Math.min(frame.width - 145, (x1 + x2) / 2),
        ),
        labelY = y1 - 5;
      const fullLabel = `${first.proposed ? "検討: " : ""}${proxy.label} ×${proxy.interactions.length}`;
      const width = Math.min(180, fullLabel.length * 10),
        collision = labels.some(
          (b) =>
            Math.abs(b.y - labelY) < 14 &&
            labelX < b.x + b.w &&
            labelX + width > b.x,
        );
      const shortLabel = collision
        ? ""
        : fullLabel.length > 18
          ? fullLabel.slice(0, 17) + "…"
          : fullLabel;
      if (!collision) labels.push({ x: labelX, y: labelY, w: width });
      parts.push(
        `<g class="interaction-proxy edge" data-type="interaction" data-id="${esc(first.id)}"><title>${esc(proxy.interactions.map((i) => `${i.label}: ${time(i.sourceTime)} → ${time(i.time)}`).join("\n"))}\n折りたたみ表示。端点は最早発生〜最遅到達。元の接続は詳細または展開で確認。</title><path class="hit" d="${path}"/><path class="line" d="${path}" stroke="${style.color}" stroke-dasharray="${first.proposed ? "3 6" : style.dash}" style="stroke-width:${style.width}" marker-end="url(#arrow-${proxy.kind})"/><text class="edge-label interaction-label" data-full-label="${esc(fullLabel)}" data-short-label="${esc(shortLabel)}" x="${labelX}" y="${labelY}">${esc(chosen(first.id) ? fullLabel : shortLabel)}</text></g>`,
      );
    }
  }
  function renderTechnologyTags(parts, d, full) {
    if (!full && !view().filters.technology) return;
    const targets = [
      ...d.states.map((s) => ({
        type: "state",
        id: s.id,
        p: layout.positions.get(s.id),
      })),
      ...d.transitions
        .filter((t) => full || view().filters.planned || t.status !== "planned")
        .map((t) => ({
          type: "transition",
          id: t.id,
          p: transitionPoint(t, (state(t.from).end + state(t.to).start) / 2),
        })),
      ...d.interactions
        .filter(() => full || view().filters.interaction)
        .map((i) => ({
          type: "interaction",
          id: i.id,
          p: layout.positions.has(i.fromStateId)
            ? {
                x: timeX(i.sourceTime),
                y: layout.positions.get(i.fromStateId).y - 12,
              }
            : null,
        })),
    ];
    for (const e of targets) {
      if (!e.p || e.type === "actor") continue;
      if (
        e.p.x > frame.width - 24 ||
        (e.type === "state" ? e.p.x + e.p.width < plotLeft : e.p.x < plotLeft)
      )
        continue;
      const y =
        e.type === "state"
          ? e.p.y + 35
          : e.type === "transition"
            ? e.p.y + 19
            : e.p.y + 47;
      parts.push(
        technologyBubble(
          e.type,
          e.id,
          e.p.x,
          y,
          Math.min(160, frame.width - plotLeft - 12),
          full,
        ),
      );
    }
  }
  function technologyBubble(type, id, left, top, maxWidth = 160, full = false) {
    if ((!full && !view().filters.technology) || maxWidth < 22) return "";
    const tech = M.technologyFor(doc(), type, id);
    if (!tech.length) return "";
    const worst =
      tech.find((t) => t.status === "gap") ||
      tech.find((t) => t.status !== "existing") ||
      tech[0];
    const detail = ["technology", "gap"].includes(view().mode);
    const text = detail
      ? `${worst.name} · ${worst.status}${tech.length > 1 ? ` +${tech.length - 1}` : ""}`
      : `T${tech.length}${worst.status === "gap" ? " GAP" : ""}`;
    const measure = (value) =>
      [...value].reduce((n, c) => n + (c.charCodeAt(0) > 255 ? 9 : 5.3), 0);
    let width = Math.min(maxWidth, Math.max(24, Math.ceil(measure(text) + 12)));
    const minX = type === "actor" ? left : plotLeft,
      maxX = type === "actor" ? left + maxWidth : frame.width - 16;
    const preferred = Math.max(minX, Math.min(maxX - width, left));
    const near = technologyBoxes.filter((b) => Math.abs(b.y - top) < 18);
    const place = (w) =>
      [preferred, ...near.flatMap((b) => [b.x - w - 3, b.x + b.width + 3])]
        .filter(
          (x) =>
            x >= minX &&
            x + w <= maxX &&
            near.every((b) => x + w + 2 <= b.x || x >= b.x + b.width + 2),
        )
        .sort((a, b) => Math.abs(a - preferred) - Math.abs(b - preferred))[0];
    let x = place(width),
      display = text;
    if (x === undefined) {
      display = `T${tech.length}`;
      width = Math.min(
        maxWidth,
        Math.max(24, Math.ceil(measure(display) + 12)),
      );
      x = place(width) ?? preferred;
    }
    technologyBoxes.push({ x, y: top, width });
    let label = display;
    while (
      label.length &&
      measure(label) + (label === display ? 0 : 9) > width - 12 + 0.01
    )
      label = label.slice(0, -1);
    if (label !== display) label += "…";
    const color = techColors[worst.status],
      fill = {
        existing: "#f0f8f4",
        research: "#fff8e9",
        planned: "#f1f5fc",
        gap: "#fff0f1",
        unknown: "#f4f5f6",
      }[worst.status];
    return `<g class="technology-tag" data-type="${type}" data-id="${esc(id)}"><title>${esc(tech.map((t) => `${t.name} / ${t.status} / TRL ${t.trl ?? "?"}`).join("\n"))}</title>${Math.abs(x - preferred) > 2 ? `<path d="M ${preferred + 9} ${top - 5} L ${x + 9} ${top - 4}" fill="none" stroke="${color}" stroke-opacity=".5" stroke-width=".8" pointer-events="none"/>` : ""}<path class="technology-bubble" d="M ${x + 3} ${top} H ${x + 6} L ${x + 9} ${top - 4} L ${x + 12} ${top} H ${x + width - 3} Q ${x + width} ${top} ${x + width} ${top + 3} V ${top + 13} Q ${x + width} ${top + 16} ${x + width - 3} ${top + 16} H ${x + 3} Q ${x} ${top + 16} ${x} ${top + 13} V ${top + 3} Q ${x} ${top} ${x + 3} ${top} Z" fill="${fill}" stroke="${color}" stroke-opacity=".6" stroke-width=".8"/><text x="${x + 6}" y="${top + 11}" fill="${color}" font-size="9" font-weight="550" pointer-events="none">${esc(label)}</text></g>`;
  }
  function editTechnology(id = null) {
    const t = doc().technologies.find((t) => t.id === id) || {
      id: M.id("technology"),
      name: "新しい技術",
      status: "unknown",
      trl: null,
      notes: "",
    };
    dialog(
      id ? "Technologyを編集（全Bindingに反映）" : "Technology / R&Dを追加",
      field("技術名", "name", t.name, "text", 'required maxlength="300"') +
        selectField(
          "成熟・開発状態",
          "status",
          t.status,
          M.technologyStatuses.map((s) => [s, s]),
        ) +
        selectField("TRL", "trl", t.trl ?? "", [
          ["", "未評価"],
          ...Array.from({ length: 9 }, (_, i) => [
            String(i + 1),
            String(i + 1),
          ]),
        ]) +
        notesField(t.notes),
      (data) =>
        change((d) => {
          const value = {
            ...t,
            ...data,
            trl: data.trl === "" ? null : Number(data.trl),
          };
          if (id)
            Object.assign(
              d.technologies.find((x) => x.id === id),
              value,
            );
          else d.technologies.push(value);
        }, "Technologyを保存しました"),
    );
  }
  function editBinding() {
    const target = selection;
    if (!target) {
      toast(
        "関連付けるActor / State / Transition / Interactionを選択してください。",
      );
      return;
    }
    if (!doc().technologies.length) {
      editTechnology();
      toast("技術を作成後、もう一度「技術を関連付け」を選択してください。");
      return;
    }
    dialog(
      "技術を関連付け",
      `<p>${esc(item(target.type, target.id).name || item(target.type, target.id).label || target.id)}を支える技術</p>` +
        selectField(
          "Technology",
          "technologyId",
          doc().technologies[0].id,
          doc().technologies.map((t) => [t.id, `${t.name} / ${t.status}`]),
        ),
      (data) =>
        change((d) => {
          if (
            !d.bindings.some(
              (b) =>
                b.targetId === target.id &&
                b.technologyId === data.technologyId,
            )
          )
            d.bindings.push({
              id: M.id("binding"),
              targetType: target.type,
              targetId: target.id,
              technologyId: data.technologyId,
            });
        }, "Bindingを追加しました"),
    );
  }
  function researchInspector() {
    let html =
      '<div class="panel-section"><h3>Technology / R&D</h3><div class="panel-actions"><button data-action="technology">＋ 技術</button>' +
      (selection ? '<button data-action="bind">技術を関連付け</button>' : "") +
      "</div>";
    const tech = selection
      ? M.technologyFor(doc(), selection.type, selection.id)
      : doc().technologies;
    if (["gap", "technology"].includes(view().mode))
      html += `<p class="tech-legend">${Object.entries(techColors)
        .map(
          ([status, color]) =>
            `<span style="color:${color}">● ${status}</span>`,
        )
        .join(" · ")}</p>`;
    html += tech
      .map(
        (t) =>
          `<div class="tech-card" style="border-color:${techColors[t.status]}"><button data-technology="${esc(t.id)}">${esc(t.name)}</button><small>${t.status} · TRL ${t.trl ?? "未評価"}</small>${t.bindingId ? `<button data-unbind="${esc(t.bindingId)}" aria-label="${esc(t.name)}のBinding解除">解除</button>` : ""}</div>`,
      )
      .join("");
    if (!tech.length)
      html += '<p class="muted">技術の関連付けなし（未評価）。</p>';
    if (["technology", "gap"].includes(view().mode) && selection)
      html += `<details><summary>技術カタログ（${doc().technologies.length}）</summary>${doc()
        .technologies.map(
          (t) =>
            `<button data-technology="${esc(t.id)}">${esc(t.name)} / ${t.status}</button>`,
        )
        .join("")}</details>`;
    if (view().mode === "gap") {
      const gapBindings = doc().bindings.filter((b) =>
        doc().technologies.some(
          (t) => t.id === b.technologyId && t.status !== "existing",
        ),
      );
      html +=
        `<h3>未成熟技術の依存先 · ${gapBindings.length}</h3>` +
        gapBindings
          .map(
            (b) =>
              `<button class="gap-dependency" data-jump-type="${b.targetType}" data-jump="${esc(b.targetId)}">${esc(doc().technologies.find((t) => t.id === b.technologyId).name)} → ${esc(item(b.targetType, b.targetId).name || item(b.targetType, b.targetId).label || b.targetId)}</button>`,
          )
          .join("");
    }
    html += "</div>";
    if (selection?.type === "interaction") {
      const bundle = M.interactionProxies(
        doc(),
        new Set(layout.rows.map((r) => r.actor.id)),
      ).find((p) => p.interactions.some((i) => i.id === selection.id));
      if (bundle)
        html += `<div class="panel-section"><h3>束ねた作用 · ${bundle.interactions.length} 件</h3>${bundle.interactions.map((i) => `<button data-jump="${esc(i.id)}" data-jump-type="interaction">${esc(i.label)} · ${time(i.sourceTime)} → ${time(i.time)}</button>`).join("")}</div>`;
      const i = item("interaction", selection.id),
        o = M.opportunity(doc(), i);
      if (o)
        html += `<div class="panel-section"><h3>介入可能時間窓</h3>${facts([
          ["開始 / 終了", `${time(o.start)} — ${time(o.end)}`],
          [
            "到達評価",
            {
              early: "時間窓より早い",
              late: "この作用は遅すぎる",
              within: "時間窓内",
            }[o.status],
          ],
          ["終了までの余裕", `${fmt(o.margin)} ${units[doc().time.unit]}`],
          [
            "登録",
            i.proposed
              ? "検討案（阻止成立扱いにしない）"
              : "成立した作用として登録",
          ],
        ])}</div>`;
    }
    if (isEnemyTransition(selection)) {
      const a = M.analyzeTransition(doc(), selection.id),
        t = item("transition", selection.id),
        from = state(t.from),
        to = state(t.to);
      html += `<div class="panel-section"><h3>介入経路 / 時間窓</h3><p>${time(from.end)} — ${time(to.start)} · ${fmt(to.start - from.end)} ${units[doc().time.unit]}</p><p>SOME: ${a.some ? "成立条件を満たす経路あり" : "未確認"} / ALL: ${a.all ? "全候補が条件を満たす" : "未確認"}</p><p class="muted">宣言された因果・技術・時刻の構造評価。実世界の有効性・成功率は判定しません。各経路に観測→判断（Stateで指定）→指令→攻撃と、Blue経路の全要素にexisting技術が必要です。SOMEは少なくとも1経路、ALLは列挙した全候補経路についての判定です。</p>`;
      html += a.paths
        .map(
          (p, n) =>
            `<div class="path-card ${p.complete ? "complete" : "gap"}"><button data-path="${n}" aria-pressed="${selectedPath === n}">経路 ${n + 1} · ${p.complete ? "条件充足" : "Gap / 未評価"}</button><p>${p.route
              .slice()
              .reverse()
              .map(
                (e) =>
                  `<span style="color:${techColors[supportStatus(e.type, e.id)]}">${esc(item(e.type, e.id).name || item(e.type, e.id).label || "遷移")}</span>`,
              )
              .join(
                " → ",
              )}</p><small>不足役割: ${esc(p.missingRoles.join(", ") || "なし")} / 構造 ${p.structural ? "完結" : "未完結"} / 未評価要素 ${p.unbound.length} / 未成熟技術 ${p.gaps.length}${p.temporalGap || !p.ordered ? " / 因果順序の断絶" : ""} / ${p.opportunity.status === "late" ? "到達が遅すぎる" : p.opportunity.status === "early" ? "到達が早すぎる" : "時間窓内"}</small></div>`,
        )
        .join("");
      if (!a.paths.length) html += "<p>接続された介入候補がありません。</p>";
      html += a.warnings.map((w) => `<p>${esc(w)}</p>`).join("") + "</div>";
    }
    return html;
  }
  function viewSettings() {
    const v = view();
    dialog(
      "Viewの表示設定",
      [
        ...Object.entries({
          technology: "Technologyタグ",
          interaction: "Interaction",
          planned: "予定State / Transition",
          quiet: "平常・待機State",
        }),
      ]
        .map(([key, label]) =>
          selectField(label, key, String(v.filters[key]), [
            ["true", "表示"],
            ["false", "非表示"],
          ]),
        )
        .join("") +
        field(
          "レーン高さ",
          "laneHeight",
          v.laneHeight,
          "number",
          'min="40" max="160" required',
        ),
      (data) => {
        const next = M.clone(doc());
        for (const key of Object.keys(v.filters))
          next.views.main.filters[key] = data[key] === "true";
        next.views.main.laneHeight = Number(data.laneHeight);
        M.validate(next);
        history.doc.views.main = next.views.main;
        saveLocal();
        render();
      },
    );
  }
  $("#view-mode").addEventListener("change", (e) => {
    view().mode = e.target.value;
    svg.dataset.view = view().mode;
    if (["technology", "gap"].includes(view().mode)) inspectorHidden = false;
    saveLocal();
    render();
  });
  $("#view-settings").addEventListener("click", viewSettings);
  $("#group-selected").addEventListener("click", groupSelected);
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
          n.views.main.visibleTimeRange = { start: 0, end: n.time.duration };
        }, "ミッション設定を更新しました");
        fit();
      },
    );
  }
  function connect(type, id) {
    const source = linkSource;
    if (!source || source === id) {
      linkSource = null;
      render();
      return;
    }
    if (!["state", "transition"].includes(type)) {
      toast("接続先のStateまたは予定Transitionを選択してください。");
      return;
    }
    linkSource = null;
    render();
    if (type === "transition")
      editInteraction(null, source, "transition", id, "block");
    else if (state(source).actorId === state(id).actorId)
      editTransition(null, source, id);
    else editInteraction(null, source, "state", id, "cause");
  }
  function point(event) {
    const b = svg.getBoundingClientRect();
    return { x: event.clientX - b.left, y: event.clientY - b.top };
  }
  function rowAt(y) {
    return layout.rows.find((r) => y >= r.top && y < r.top + r.height);
  }
  function targetInfo(event) {
    const g = event.target.closest?.("[data-type]");
    return g ? { type: g.dataset.type, id: g.dataset.id } : null;
  }
  svg.addEventListener("pointerdown", (e) => {
    if (e.button === 1 || spaceHeld) {
      e.preventDefault();
      drag = {
        type: "pan",
        x: e.clientX,
        y: e.clientY,
        start: viewStart,
        top: scroll.scrollTop,
      };
      return;
    }
    if (e.button !== 0) return;
    scroll.focus({ preventScroll: true });
    const info = targetInfo(e);
    if (e.target.closest("[data-toggle]")) return;
    if (!info) {
      const p = point(e);
      if (p.y >= 48)
        drag = {
          type: "marquee",
          x: e.clientX,
          y: e.clientY,
          start: p,
          additive: e.ctrlKey || e.metaKey,
          prior: selectedItems(),
          moved: false,
        };
      return;
    }
    if (
      info.type === "state" &&
      e.altKey &&
      !e.target.closest(".technology-tag")
    ) {
      e.preventDefault();
      linkSource = info.id;
      multi = [];
      selection = info;
      drag = { type: "link", x: e.clientX, y: e.clientY };
      updateSelection();
      renderInspector();
      return;
    }
    if (linkSource || e.target.closest(".technology-tag")) return;
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
      if (!(e.ctrlKey || e.metaKey)) {
        if (!chosen(info.id)) multi = [];
        selection = info;
      }
      drag.items = chosen(info.id) ? selectedItems() : [info];
      // Keep the original pointer target until click/double-click dispatches.
    } else if (info.type === "actor") {
      drag = {
        type: "actor",
        id: info.id,
        x: e.clientX,
        y: e.clientY,
        moved: false,
      };
      if (!(e.ctrlKey || e.metaKey)) {
        if (!chosen(info.id)) multi = [];
        selection = info;
      }
      drag.items = chosen(info.id) ? selectedItems() : [info];
    }
  });
  window.addEventListener("pointermove", (e) => {
    if (!drag) return;
    if (drag.type === "pan") {
      drag.moved =
        Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 3;
      viewStart = drag.start - (e.clientX - drag.x) / scale;
      renderSVG();
      updateViewportControls();
      scroll.scrollTop = drag.top - (e.clientY - drag.y);
      return;
    }
    const dx = e.clientX - drag.x,
      dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) < 4 && !drag.moved) return;
    drag.moved = true;
    if (drag.type === "marquee") {
      const p = point(e),
        r = {
          x: Math.min(p.x, drag.start.x),
          y: Math.min(p.y, drag.start.y),
          w: Math.abs(p.x - drag.start.x),
          h: Math.abs(p.y - drag.start.y),
        };
      const hits = [];
      for (const row of layout.rows)
        if (
          r.x < plotLeft - 12 &&
          r.y < row.top + row.height &&
          r.y + r.h > row.top
        )
          hits.push({ type: "actor", id: row.actor.id });
      for (const [id, q] of layout.positions)
        if (
          r.x < q.x + q.width &&
          r.x + r.w > q.x &&
          r.y < q.y + 32 &&
          r.y + r.h > q.y
        )
          hits.push({ type: "state", id });
      multi = [
        ...new Map(
          [...(drag.additive ? drag.prior : []), ...hits].map((x) => [x.id, x]),
        ).values(),
      ];
      selection = multi.at(-1) || null;
      updateSelection();
      svg.querySelector("#marquee")?.remove();
      svg.insertAdjacentHTML(
        "beforeend",
        `<rect id="marquee" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="#078a8a" fill-opacity=".12" stroke="#078a8a" pointer-events="none"/>`,
      );
      return;
    }
    if (drag.type === "link") {
      connectionFeedback(targetInfo(e));
      const from = layout.positions.get(linkSource),
        p = point(e);
      if (!from) return;
      let line = svg.querySelector("#link-preview");
      if (!line) {
        line = document.createElementNS("http://www.w3.org/2000/svg", "path");
        line.id = "link-preview";
        line.setAttribute("fill", "none");
        line.setAttribute("stroke", "#087f80");
        line.setAttribute("stroke-dasharray", "4 3");
        line.setAttribute("pointer-events", "none");
        svg.querySelector("#plot").append(line);
      }
      line.setAttribute(
        "d",
        `M ${Math.max(plotLeft, Math.min(frame.width - 24, from.x + from.width / 2))} ${from.y + 16} L ${p.x} ${p.y}`,
      );
      return;
    }
    if (drag.type === "actor") {
      const p = point(e),
        row = rowAt(p.y);
      drag.targetId = row?.actor.id;
      drag.position = row
        ? p.y - row.top < row.height * 0.25
          ? "before"
          : p.y - row.top > row.height * 0.75
            ? "after"
            : "inside"
        : "before";
      $("#status").textContent = row
        ? `${row.actor.name} ${drag.position === "inside" ? "の子に移動" : drag.position === "before" ? "の前へ移動" : "の後へ移動"}`
        : "";
      renderSVG();
      return;
    }
    const d = M.clone(drag.base),
      s = M.clone(drag.original),
      step = d.time.snap,
      delta = M.snap(dx / scale, step);
    if (drag.items?.length > 1 && !drag.handle) {
      let moving = drag.items;
      if (drag.copy) {
        drag.copied ||= M.fragment(drag.base, drag.items);
        multi = M.paste(d, drag.copied);
        selection = multi.at(-1) || null;
        moving = multi;
      }
      const ids = M.selectionClosure(d, moving).states,
        states = d.states.filter((s) => ids.has(s.id));
      const shift = Math.max(
        -Math.min(...states.map((s) => s.start)),
        Math.min(
          delta,
          d.time.duration - Math.max(...states.map((s) => s.end)),
        ),
      );
      M.moveSelection(d, moving, shift);
      if (drag.items.every((x) => x.type === "state")) {
        const actors = layout.rows.map((r) => r.actor.id),
          target = rowAt(point(e).y);
        const indexes = states.map((s) => actors.indexOf(s.actorId));
        const offset = Math.max(
          -Math.min(...indexes),
          Math.min(
            actors.length - 1 - Math.max(...indexes),
            actors.indexOf(target?.actor.id) -
              actors.indexOf(drag.original.actorId),
          ),
        );
        if (target)
          states.forEach((s, n) => (s.actorId = actors[indexes[n] + offset]));
      }
      preview = d;
      renderSVG();
      return;
    }
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
      const originalId = s.id;
      s.id = drag.copyId;
      d.states.push(s);
      drag.copyBindings ||= d.bindings
        .filter((b) => b.targetType === "state" && b.targetId === originalId)
        .map((b) => ({ ...b, id: M.id("binding"), targetId: s.id }));
      d.bindings.push(...M.clone(drag.copyBindings));
      multi = [];
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
      svg.querySelector("#link-preview")?.remove();
      if (finished.moved) {
        ignoreClick = true;
        setTimeout(() => (ignoreClick = false), 0);
        const info = targetInfo(e);
        if (info && ["state", "transition"].includes(info.type))
          connect(info.type, info.id);
        else {
          linkSource = null;
          render();
          toast("接続先のStateまたは予定Transitionにドロップしてください。");
        }
      } else {
        $("#mode-hint").textContent =
          "接続先のState・予定遷移を選択 · Escで取消";
      }
      return;
    }
    if (!finished.moved) {
      preview = null;
      return;
    }
    ignoreClick = true;
    setTimeout(() => (ignoreClick = false), 0);
    if (finished.type === "marquee") {
      svg.querySelector("#marquee")?.remove();
      renderInspector();
      return;
    }
    if (finished.type === "actor") {
      if (finished.targetId)
        safeChange((d) => {
          const actorIds = new Set(
            (finished.items?.length
              ? finished.items
              : [{ type: "actor", id: finished.id }]
            )
              .filter((x) => x.type === "actor")
              .map((x) => x.id),
          );
          const roots = [...actorIds].filter(
            (id) =>
              ![...actorIds].some(
                (other) => id !== other && M.descendants(d, other).has(id),
              ),
          );
          if (roots.some((id) => M.descendants(d, id).has(finished.targetId)))
            throw new Error("選択範囲の中には移動できません。");
          for (const id of finished.position === "after"
            ? roots.reverse()
            : roots)
            M.placeActor(d, id, finished.targetId, finished.position);
        }, "Actorを並べ替えました");
      else render();
    }
    if (finished.type === "state") {
      try {
        commit(preview, "Stateを変更しました");
      } catch (error) {
        preview = null;
        multi = [];
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
    const toggle = e.target.closest("[data-toggle]");
    if (toggle) {
      toggleActor(toggle.dataset.toggle);
      return;
    }
    const info = targetInfo(e),
      p = point(e);
    if (e.altKey) return;
    if (info) {
      selectedPath = 0;
      if (linkSource) connect(info.type, info.id);
      else select(info.type, info.id, e.ctrlKey || e.metaKey);
      return;
    }
    if (p.x < plotLeft - 12 || p.y < scroll.scrollTop + 48) return;
    selection = null;
    multi = [];
    linkSource = null;
    updateSelection();
    renderInspector();
  });
  svg.addEventListener("dblclick", (e) => {
    if (e.target.closest("[data-toggle]")) return;
    const info = targetInfo(e);
    if (info) {
      multi = [];
      selection = info;
      editSelected();
    } else {
      const p = point(e),
        row = rowAt(p.y);
      if (row && p.x > plotLeft - 12 && p.y > scroll.scrollTop + 48)
        editState(null, row.actor.id, xTime(p.x));
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
    const info = targetInfo(e),
      p = point(e);
    if (info) {
      if (!chosen(info.id)) multi = [];
      selection = info;
      updateSelection();
      renderInspector();
      const entries = [
        { label: "編集", action: editSelected },
        {
          label: "詳細を表示",
          action: () => {
            inspectorHidden = false;
            render();
          },
        },
      ];
      entries.push({ label: "技術を関連付け", action: () => editBinding() });
      if (["actor", "state"].includes(info.type))
        entries.push(
          { label: "コピー", action: () => copySelection() },
          { label: "切り取り", action: () => copySelection(true) },
          { label: "貼り付け", action: pasteSelection },
        );
      if (info.type === "state")
        entries.push(
          { label: "ここから接続", action: () => beginConnection(info.id) },
          { label: "複製", action: duplicateSelected },
        );
      if (info.type === "actor") {
        const a = item("actor", info.id),
          hasChildren = doc().actors.some((x) => x.parentId === a.id);
        entries.push(
          { label: "Actor / Groupを複製", action: duplicateSelected },
          { label: "選択Actorをグループ化", action: groupSelected },
          { label: "グループ解除", action: () => ungroup(a.id) },
          {
            label: "Stateを追加",
            action: () => editState(null, a.id, viewStart),
          },
          { label: "子Actorを追加", action: () => editActor(null, a.id) },
          {
            label: "子グループを追加",
            action: () => editActor(null, a.id, true),
          },
          { label: "階層を変更", action: () => editParent(a.id) },
        );
        if (hasChildren)
          entries.push(
            {
              label: collapsed(a.id) ? "展開" : "折りたたむ",
              action: () => toggleActor(a.id),
            },
            { label: "子Actorを1階層外へ出す", action: () => ungroup(a.id) },
          );
        entries.push(
          { label: "上へ移動", action: () => moveActor(-1) },
          { label: "下へ移動", action: () => moveActor(1) },
        );
      }
      entries.push({ label: "削除", action: deleteSelected, danger: true });
      menu(e.clientX, e.clientY, entries);
    } else {
      const row = rowAt(p.y);
      menu(e.clientX, e.clientY, [
        ...(row
          ? [
              {
                label: "Stateを追加",
                action: () => editState(null, row.actor.id, xTime(p.x)),
              },
            ]
          : []),
        { label: "貼り付け", action: pasteSelection },
        { label: "Actorを追加", action: () => editActor() },
        { label: "グループを追加", action: () => editActor(null, null, true) },
        { label: "全期間を表示", action: fit },
        { label: "表示時間を指定", action: editTimeWindow },
        { label: "SVGを書き出す", action: exportSVG },
        { label: "PNGを書き出す", action: exportPNG },
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
    if (b.dataset.technology) {
      editTechnology(b.dataset.technology);
      return;
    }
    if (b.dataset.unbind) {
      safeChange(
        (d) =>
          (d.bindings = d.bindings.filter((x) => x.id !== b.dataset.unbind)),
        "Bindingを解除しました",
      );
      return;
    }
    if (b.dataset.path) {
      selectedPath = Number(b.dataset.path);
      render();
      return;
    }
    if (b.dataset.jump) {
      jump(b.dataset.jumpType, b.dataset.jump);
      return;
    }
    ({
      close: () => {
        inspectorHidden = true;
        render();
      },
      technology: () => editTechnology(),
      bind: () => editBinding(),
      group: groupSelected,
      ungroup: () => ungroup(selection.id),
      parent: () => editParent(selection.id),
      child: () => editActor(null, selection.id),
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
  $("#add-group").onclick = () => editActor(null, null, true);
  $("#search-btn").onclick = () => {
    inspectorHidden = false;
    render();
    $("#search").focus();
  };
  $("#add-actor").onclick = () => editActor();
  $("#document-title").onclick = documentSettings;
  function undo() {
    if (history.undo()) {
      selection = null;
      multi = [];
      linkSource = null;
      viewStart = view().visibleTimeRange.start;
      viewSpan = view().visibleTimeRange.end - viewStart;
      saveLocal();
      render();
      $("#status").textContent = "元に戻しました";
    }
  }
  function redo() {
    if (history.redo()) {
      selection = null;
      multi = [];
      linkSource = null;
      viewStart = view().visibleTimeRange.start;
      viewSpan = view().visibleTimeRange.end - viewStart;
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
  function updateViewportControls() {
    $("#zoom-label").textContent = `${fmt(doc().time.duration / viewSpan)}×`;
    $("#time-window").textContent =
      `${time(viewStart)} — ${time(viewStart + viewSpan)}`;
    $("#time-pan").max = Math.max(0, doc().time.duration - viewSpan);
    $("#time-pan").value = viewStart;
    $("#time-pan").disabled = viewSpan >= doc().time.duration;
  }
  function zoom(factor) {
    const middle = viewStart + viewSpan / 2;
    viewSpan = Math.min(
      doc().time.duration,
      Math.max(
        Math.min(doc().time.snap, doc().time.duration),
        viewSpan / factor,
      ),
    );
    viewStart = middle - viewSpan / 2;
    render();
  }
  function fit() {
    viewStart = 0;
    viewSpan = doc().time.duration;
    scroll.scrollLeft = 0;
    render();
  }
  function editTimeWindow() {
    dialog(
      "表示時間を指定",
      `<div class="field-row">${field("開始", "start", viewStart, "number", 'required min="0" step="any"')}${field("終了", "end", viewStart + viewSpan, "number", 'required min="0" step="any"')}</div><p class="muted">図の幅を保ったまま、この時間範囲を表示します。</p>`,
      (data) => {
        const start = Number(data.start),
          end = Number(data.end);
        if (
          !Number.isFinite(start) ||
          !Number.isFinite(end) ||
          start < 0 ||
          end <= start ||
          end > doc().time.duration
        )
          throw Error("0 ≤ 開始 < 終了 ≤ ミッション期間で指定してください。");
        viewStart = start;
        viewSpan = end - start;
        render();
      },
    );
  }
  $("#zoom-in").onclick = () => zoom(1.5);
  $("#zoom-out").onclick = () => zoom(1 / 1.5);
  $("#fit").onclick = fit;
  $("#time-window").onclick = editTimeWindow;
  $("#time-pan").oninput = (e) => {
    viewStart = Number(e.target.value);
    renderSVG();
    updateViewportControls();
  };
  $("#time-prev").onclick = () => {
    viewStart -= viewSpan * 0.5;
    render();
  };
  $("#time-next").onclick = () => {
    viewStart += viewSpan * 0.5;
    render();
  };
  $("#inspector-toggle").onclick = () => {
    inspectorHidden = !inspectorHidden;
    render();
  };
  scroll.addEventListener(
    "scroll",
    () => {
      scroll.scrollLeft = 0;
      sticky();
    },
    { passive: true },
  );
  scroll.addEventListener(
    "wheel",
    (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1);
      } else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault();
        viewStart += (e.deltaX || e.deltaY) / scale;
        render();
      }
    },
    { passive: false },
  );
  if (window.ResizeObserver) {
    let width = 0;
    new ResizeObserver(() => {
      const next = scroll.clientWidth;
      if (next !== width && !drag) {
        width = next;
        render();
      }
    }).observe(scroll);
  } else window.addEventListener("resize", () => render());
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
  function exportImageSource() {
    renderSVG(true);
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
      .querySelectorAll(".selected,.dimmed,.connect-target,.connect-hover")
      .forEach((e) =>
        e.classList.remove(
          "selected",
          "dimmed",
          "connect-target",
          "connect-hover",
        ),
      );
    copy.classList.remove("connecting", "link-mode");
    copy.setAttribute("viewBox", `0 0 ${layout.width} ${layout.height}`);
    copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const result = {
      width: layout.width,
      height: layout.height,
      source:
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
        new XMLSerializer().serializeToString(copy),
    };
    renderSVG();
    return result;
  }
  function exportSVG() {
    download(
      exportImageSource().source,
      "image/svg+xml",
      "mission-timeline.svg",
    );
  }
  let pngExporting = false;
  async function exportPNG() {
    if (pngExporting) return;
    pngExporting = true;
    let imageURL;
    try {
      if (document.fonts?.ready) await document.fonts.ready;
      const { source, width, height } = exportImageSource();
      // Bound memory and browser canvas dimensions; never truncate the chart.
      const ratio = Math.min(
        2,
        16384 / width,
        16384 / height,
        Math.sqrt(32000000 / (width * height)),
      );
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(width * ratio));
      canvas.height = Math.max(1, Math.floor(height * ratio));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("このブラウザではPNG出力を利用できません。");
      // Keep the SVG decoder's intrinsic raster within the same memory limit.
      const imageSVG = new DOMParser().parseFromString(
        source,
        "image/svg+xml",
      ).documentElement;
      imageSVG.setAttribute("width", canvas.width);
      imageSVG.setAttribute("height", canvas.height);
      imageURL = URL.createObjectURL(
        new Blob([new XMLSerializer().serializeToString(imageSVG)], {
          type: "image/svg+xml;charset=utf-8",
        }),
      );
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () =>
          reject(
            new Error("図の画像化に失敗しました。SVG出力も利用できます。"),
          );
        img.src = imageURL;
      });
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (!blob)
        throw new Error(
          "PNGを生成できませんでした。図を小さくして再度お試しください。",
        );
      download(blob, "image/png", "mission-timeline.png");
      toast(
        `PNGを書き出しました（${canvas.width} × ${canvas.height}px、全期間・全階層）`,
      );
    } catch (error) {
      toast(error.message);
    } finally {
      if (imageURL) URL.revokeObjectURL(imageURL);
      pngExporting = false;
    }
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
          selection = null;
          multi = [];
          clipboard = null;
          viewStart = next.views.main.visibleTimeRange.start;
          viewSpan = next.views.main.visibleTimeRange.end - viewStart;
          commit(next, "JSONを読み込みました");
        },
      );
    } catch (error) {
      toast(`読み込みできません: ${error.message}`);
    }
  };
  $("#more-btn").onclick = (e) =>
    menu(e.clientX, e.clientY, [
      { label: "SVGを書き出す", action: exportSVG },
      { label: "PNGを書き出す", action: exportPNG },
      { label: "ミッション設定", action: documentSettings },
      {
        label: "Technology / Gapのサンプル",
        action: () =>
          dialog(
            "技術・経路サンプルを読み込む",
            "<p>現在の内容を置き換えます。Undoで戻せます。</p>",
            () => {
              selection = null;
              multi = [];
              clipboard = null;
              commit(createResearchSample());
              fit();
            },
          ),
      },
      {
        label: "潜水艦グループのサンプル",
        action: () =>
          dialog(
            "グループのサンプルを読み込む",
            '<p class="dialog-summary">現在の内容を潜水艦・ソナー・魚雷のサンプルに置き換えます。Undoで戻せます。</p>',
            () => {
              commit(createGroupedSample());
              selection = null;
              multi = [];
              clipboard = null;
              fit();
            },
          ),
      },
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
              multi = [];
              clipboard = null;
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
              multi = [];
              clipboard = null;
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
    if (ctrl && ["c", "x", "v"].includes(key)) {
      e.preventDefault();
      key === "v" ? pasteSelection() : copySelection(key === "x");
      return;
    }
    if (ctrl && key === "g") {
      e.preventDefault();
      e.shiftKey && selection?.type === "actor"
        ? ungroup(selection.id)
        : groupSelected();
      return;
    }
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
      selection = null;
      multi = [];
      $("#context-menu").hidden = true;
      render();
      return;
    }
    if (e.target.closest("[data-toggle]") && (key === "enter" || key === " ")) {
      e.preventDefault();
      toggleActor(e.target.closest("[data-toggle]").dataset.toggle);
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
      ["state", "actor"].includes(selection?.type) &&
      (key === "arrowleft" || key === "arrowright")
    ) {
      e.preventDefault();
      const delta = doc().time.snap * (key === "arrowleft" ? -1 : 1);
      safeChange((d) => {
        if (
          selection.type === "actor" ||
          (!e.shiftKey && selectedItems().length > 1)
        ) {
          M.moveSelection(d, selectedItems(), delta);
          return;
        }
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
    if (!ctrl && key === "c" && selection?.type === "state") {
      e.preventDefault();
      beginConnection(selection.id);
    }
    if (!ctrl && key === "f") {
      e.preventDefault();
      inspectorHidden = false;
      render();
      $("#search").focus();
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
  requestAnimationFrame(render);
  if (storageWarning) toast(storageWarning);
})();
