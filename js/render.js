/* Standalone SVG renderer, shared by the canvas and exports. */
(function (root) {
  "use strict";
  const M =
    typeof module !== "undefined" && module.exports
      ? require("./model.js")
      : root.ME;
  const L =
    typeof module !== "undefined" && module.exports
      ? require("./layout.js")
      : root.MELayout;
  const esc = (s) =>
    String(s ?? "").replace(
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
  const techColors = {
    existing: "#35765d",
    research: "#9b6b23",
    planned: "#736487",
    gap: "#af4545",
    unknown: "#687680",
  };
  function render(doc, layout, options = {}) {
    const { vp, rows, states, edges, junctions, height } = layout,
      v = doc.views.main,
      selection = options.selection || [],
      selected = (id) => selection.some((s) => s.id === id),
      chain = options.chain;
    const emphasis = (id) =>
      chain?.size && !chain.has(id) ? ' opacity="0.24"' : "";
    const data = (type, id) =>
      options.export
        ? ""
        : ` data-type="${type}" data-id="${esc(id)}" tabindex="0"`;
    const summaryData = (actorId) => data("actor",actorId) +
      (options.export ? "" : ` data-expand-group="${esc(actorId)}"`);
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${vp.width}" height="${height}" viewBox="0 0 ${vp.width} ${height}" role="img" aria-label="${esc(doc.title)}" font-family="Segoe UI, Noto Sans JP, sans-serif" font-size="11" fill="#243d44" data-view="${v.mode}"><title>${esc(doc.title)}</title><defs><marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M0,1 L10,5 L0,9 Z" fill="context-stroke"/></marker><marker id="state-arrow" viewBox="0 0 10 10" refX="19" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M0,1 L10,5 L0,9 Z" fill="context-stroke"/></marker><clipPath id="time-clip"><rect x="${vp.left - 14}" y="32" width="${vp.width - vp.left + 14}" height="${height}"/></clipPath></defs><rect width="100%" height="100%" fill="white"/>`;
    for (const row of rows)
      svg += `<rect x="0" y="${row.y}" width="${vp.width}" height="${row.height}" fill="${rows.indexOf(row) % 2 ? "#fafcfc" : "#ffffff"}"/><path d="M0,${row.y + row.height} H${vp.width}" stroke="#e7edef"/>`;
    const span = vp.end - vp.start,
      raw = span / 10,
      unit = 10 ** Math.floor(Math.log10(raw)),
      step = [1, 2, 5, 10].map((n) => n * unit).find((n) => n >= raw);
    for (
      let t = Math.ceil(vp.start / step) * step;
      t <= vp.end + step * 0.001;
      t += step
    ) {
      const x = vp.x(t);
      svg += `<path d="M${x},32 V${height - 10}" stroke="#eef2f3"/><text x="${x}" y="21" text-anchor="middle" font-size="10" fill="#77868c">${esc(+t.toFixed(4))}</text>`;
    }
    svg += `<text x="12" y="21" font-size="10" fill="#77868c">ACTOR / T+ (${esc(doc.time.unit)})</text><g clip-path="url(#time-clip)">`;
    for (const e of edges) {
      const chosen = selected(e.summaryActorId || e.id),
        actor = M.get(doc,"actor",e.actorId),
        color = M.actorColor(doc,actor),
        gap = options.gapIds?.has(e.id) || e.memberIds?.some(id => options.gapIds?.has(id)),
        muted = v.mode === "causality" && e.type === "task" && !chosen ? 0.4 : 1;
      const centeredEnd = [...states.values()].some(s =>
        Math.abs(s.x-e.points.at(-1).x)<0.01 && Math.abs(s.y-e.points.at(-1).y)<0.01);
      let marker = centeredEnd ? "state-arrow" : "arrow";
      svg += `<g class="edge ${e.part}${chosen ? " selected" : ""}${options.connecting && e.part === "task" ? " connect-target" : ""}"${e.summaryActorId ? summaryData(e.summaryActorId) : data(e.type,e.id)}${emphasis(e.id)}><title>${esc(actor?.name)} · ${esc(e.label)}</title>`;
      if (e.type === "causalLink") {
        const segment = L.routeSegments(e.points).at(-1);
        const angle = segment ? Math.atan2(segment.b.y-segment.a.y,segment.b.x-segment.a.x)*180/Math.PI : 0;
        marker = "causal-arrow-" + edges.indexOf(e);
        // Orient by the routed centerline, never by the final wave sample.
        svg += `<defs><marker id="${marker}" viewBox="0 0 10 10" refX="${centeredEnd ? 19 : 10}" refY="5" markerWidth="7" markerHeight="7" orient="${angle}" markerUnits="userSpaceOnUse"><path d="M0,1 L10,5 L0,9 Z" fill="${color}"/></marker></defs>`;
      }
      if (!options.export)
        svg += `<path class="hit" d="${L.path(e.points)}" fill="none" stroke="transparent" stroke-width="18" pointer-events="stroke"/>`;
      if (chosen || gap)
        svg += `<path class="edge-highlight" d="${e.path}" fill="none" stroke="${chosen ? "#087f80" : "#d17a30"}" stroke-width="7" opacity=".25" pointer-events="none"/>`;
      svg += `<path class="line" data-polarity="${e.polarity || "positive"}" d="${e.path}" fill="none" stroke="${color}" stroke-width="${chosen ? 2.5 : 1.6}" opacity="${muted}" stroke-linejoin="${e.type === "causalLink" && e.polarity === "positive" ? "miter" : "round"}" marker-end="url(#${marker})"/></g>`;
    }
    const summaryJunctions = new Set();
    for (const j of junctions.values()) {
      const single = rows.find(r => r.actor.id === j.actorId)?.collapseMode === "single";
      const key = j.actorId+"@"+j.time;
      if (single && summaryJunctions.has(key)) continue;
      if (single) summaryJunctions.add(key);
      const color=M.actorColor(doc,M.get(doc,"actor",j.actorId));
      svg += `<g class="junction"${single ? summaryData(j.actorId) : data("task",j.taskId)} data-time="${j.time}"><title>Task上の時刻 ${j.time}</title><circle cx="${j.x}" cy="${j.y}" r="4" fill="white" stroke="${color}" stroke-width="1.6"/></g>`;
    }
    for (const s of states.values()) {
      if (s.summaryHidden) continue;
      const a = M.get(doc, "actor", s.displayActorId), color = M.actorColor(doc,a);
      svg += `<g class="state${selected(s.id) ? " selected" : ""}${options.connecting ? " connect-target" : ""}"${s.summaryActorId ? summaryData(s.summaryActorId) : data("state",s.id)}${emphasis(s.id)} opacity="${s.activity === "quiet" ? 0.55 : 1}"><title>${esc(a.name)} · ${esc((s.summaryNames && [...new Set(s.summaryNames)].join(" / ")) || s.name)} · T+${s.time}</title><circle class="body" cx="${s.x}" cy="${s.y}" r="${s.r}" fill="${color}" stroke="${color}" stroke-width="${selected(s.id) ? 3 : 1.6}"/>`;
      if (options.gapIds?.has(s.id)) svg += `<circle cx="${s.x}" cy="${s.y}" r="12" fill="none" stroke="#d17a30" opacity=".6"/>`;
      if (selected(s.id))
        svg += `<circle cx="${s.x}" cy="${s.y}" r="11" fill="none" stroke="#76b8b5"/>`;
      s.lines.forEach(
        (line, i) =>
          (svg += `<text x="${s.labelX}" y="${s.y + 22 + i * 13}" text-anchor="middle" font-size="11">${esc(line)}</text>`),
      );
      svg += "</g>";
    }
    for (const e of edges) {
      const b = e.labelInfo,
        color = M.actorColor(doc,M.get(doc,"actor",e.actorId)),
        isTask = e.type === "task";
      if (!b) continue;
      svg += `<g class="edge-label ${isTask ? "task-label" : "causal-label"}"${data(e.type, e.id)}${emphasis(e.id)}><title>${esc(b.fullText)}</title>`;
      if (b.leader)
        svg += `<path class="label-leader" d="M${b.anchor.x},${b.anchor.y} L${b.x + b.width / 2},${b.y + b.height / 2}" stroke="#9aa8ad" stroke-width="0.7" fill="none"/>`;
      svg += `<rect class="${isTask ? "label-frame" : "label-background"}" x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" rx="${isTask ? 2 : 3}" fill="white" fill-opacity="${isTask ? 1 : .94}"${isTask ? ` stroke="${color}" stroke-width="1.2"` : ""}/>`;
      if (!isTask)
        svg += `<path class="label-underline" d="M${b.x+4},${b.y+b.height-1} H${b.x+b.width-4}" fill="none" stroke="${color}" stroke-width="1.5"/>`;
      svg += `<text x="${b.x + b.width / 2}" y="${b.y + 12}" text-anchor="middle">${esc(b.text)}</text></g>`;
    }
    for (const tag of layout.technologyTags) {
      const {tech,box} = tag;
      const target = M.get(doc,tag.binding.targetType,tag.binding.targetId);
      svg += `<g class="technology-tag"${data("technology", tech.id)}><title>${esc(tech.name)} / ${tech.status} / TRL ${tech.trl ?? "未評価"} · ${esc(target.name || target.label)}</title><path class="technology-leader" fill="none" pointer-events="none" d="${L.path(tag.leader)}" stroke="${techColors[tech.status]}" stroke-width=".7"/><rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="4" fill="#fffdf5" stroke="${techColors[tech.status]}" stroke-width=".8"/><text x="${box.x + box.width / 2}" y="${box.y + 14}" font-size="10" text-anchor="middle" fill="${techColors[tech.status]}">${esc(tag.text)}</text></g>`;
    }
    svg += "</g>";
    for (const row of rows) {
      const a = row.actor,
        children = doc.actors.some((x) => x.parentId === a.id),
        x = 12 + Math.min(row.depth, 6) * 13;
      svg += `<g class="actor${selected(a.id) ? " selected" : ""}"${data("actor", a.id)}><rect x="0" y="${row.y + 1}" width="${vp.left - 17}" height="${row.height - 2}" fill="${selected(a.id) ? "#e3f1ef" : "#f6f9f9"}"/><path d="M2,${row.y + 8} V${row.y + row.height - 8}" stroke="${M.actorColor(doc,a)}" stroke-width="3"/>`;
      if (children)
        svg += `<text class="collapse-toggle" data-collapse="${esc(a.id)}" x="${x}" y="${row.center + 4}" font-size="13">${v.collapsedActors.includes(a.id) && !options.full ? "▸" : "▾"}</text>`;
      const name =
        a.name.length > 13 - Math.min(row.depth, 4)
          ? a.name.slice(0, 12 - Math.min(row.depth, 4)) + "…"
          : a.name;
      svg += `<text x="${x + 16}" y="${row.center + 4}" font-weight="600" font-size="11">${esc(name)}</text><title>${esc(a.name)}</title>`;
      svg += "</g>";
    }
    return svg + "</svg>";
  }
  const api = { render, esc, techColors };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.MERender = api;
})(globalThis);
