/* Geometry only: semantic anchors never move horizontally. */
(function (root) {
  "use strict";
  const M =
    typeof module !== "undefined" && module.exports
      ? require("./model.js")
      : root.ME;
  function routeSegments(points) {
    return points
      .slice(1)
      .map((b, n) => ({ a: points[n], b }))
      .filter((s) => Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) > 0.01);
  }
  function parallelOverlap(s, t, clearance = 6) {
    const dx = s.b.x - s.a.x,
      dy = s.b.y - s.a.y,
      length = Math.hypot(dx, dy);
    const tx = t.b.x - t.a.x,
      ty = t.b.y - t.a.y,
      otherLength = Math.hypot(tx, ty);
    if (
      !length ||
      !otherLength ||
      Math.abs(dx * ty - dy * tx) > 0.001 * length * otherLength
    )
      return 0;
    const distance =
      Math.abs(dx * (t.a.y - s.a.y) - dy * (t.a.x - s.a.x)) / length;
    if (distance >= clearance) return 0;
    const start = ((t.a.x - s.a.x) * dx + (t.a.y - s.a.y) * dy) / length;
    const end = ((t.b.x - s.a.x) * dx + (t.b.y - s.a.y) * dy) / length;
    return (
      Math.max(
        0,
        Math.min(length, Math.max(start, end)) -
          Math.max(0, Math.min(start, end)),
      ) *
      (1 - distance / clearance)
    );
  }
  function segmentInsideBox(s, box) {
    const dx = s.b.x - s.a.x,
      dy = s.b.y - s.a.y;
    let lo = 0,
      hi = 1;
    for (const [p, q] of [
      [-dx, s.a.x - box.x],
      [dx, box.x + box.width - s.a.x],
      [-dy, s.a.y - box.y],
      [dy, box.y + box.height - s.a.y],
    ]) {
      if (p === 0) {
        if (q <= 0) return 0;
      } else if (p < 0) lo = Math.max(lo, q / p);
      else hi = Math.min(hi, q / p);
      if (lo >= hi) return 0;
    }
    return (hi - lo) * Math.hypot(dx, dy);
  }
  function createEdgeRouter(obstacles = [], bounds = {}) {
    const used = [];
    const compact = (points) =>
      points
        .filter(
          (p, n) => !n || p.x !== points[n - 1].x || p.y !== points[n - 1].y,
        )
        .map((p) => ({ ...p }));
    return (input, { axis = "vertical", timeAxis = false } = {}) => {
      const original = compact(input),
        start = original[0],
        end = original.at(-1);
      const segments = routeSegments(original);
      const overlap = (parts) =>
        parts.reduce(
          (sum, s) => sum + used.reduce((n, t) => n + parallelOverlap(s, t), 0),
          0,
        );
      const contains = (box, p) =>
        p.x >= box.x &&
        p.x <= box.x + box.width &&
        p.y >= box.y &&
        p.y <= box.y + box.height;
      const obstaclesHere = obstacles.filter(
        (box) => !contains(box, start) && !contains(box, end),
      );
      const penetration = (parts) =>
        parts.reduce(
          (sum, s) =>
            sum + obstaclesHere.reduce((n, b) => n + segmentInsideBox(s, b), 0),
          0,
        );
      let result = original;
      if (
        segments.length &&
        (overlap(segments) > 0.5 || penetration(segments) > 0.5) &&
        (!timeAxis || end.x > start.x)
      ) {
        const length = (parts) =>
          parts.reduce(
            (sum, s) => sum + Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y),
            0,
          );
        const score = (points) => {
          const parts = routeSegments(points);
          const penetration = parts.reduce(
            (sum, s) =>
              sum +
              obstaclesHere.reduce((n, b) => n + segmentInsideBox(s, b), 0),
            0,
          );
          return overlap(parts) * 50 + penetration * 8 + length(parts) * 0.08;
        };
        let best = score(original);
        const offsets = [0, 8, -8, 16, -16, 24, -24, 32, -32, 48, -48, 64, -64];
        const lowX = Math.min(bounds.left ?? -Infinity, start.x, end.x),
          highX = Math.max(bounds.right ?? Infinity, start.x, end.x);
        const lowY = Math.min(bounds.top ?? -Infinity, start.y, end.y),
          highY = Math.max(bounds.bottom ?? Infinity, start.y, end.y);
        for (const side of offsets)
          for (const bend of [0, 8, -8, 16, -16, 24, -24, 32, -32]) {
            let candidate;
            if (axis === "horizontal") {
              const direction = Math.sign(end.x - start.x) || 1;
              const stub = Math.min(8, Math.abs(end.x - start.x) / 4);
              const mid =
                (start.x + end.x) / 2 + Math.max(-stub, Math.min(stub, bend));
              candidate = [
                start,
                { x: start.x + direction * stub, y: start.y + side },
                { x: mid, y: start.y + side },
                { x: mid, y: end.y + side },
                { x: end.x - direction * stub, y: end.y + side },
                end,
              ];
            } else {
              const direction = Math.sign(end.y - start.y) || 1;
              const stub = Math.min(8, Math.abs(end.y - start.y) / 4);
              const mid =
                (start.y + end.y) / 2 +
                Math.max(
                  -Math.abs(end.y - start.y) / 4,
                  Math.min(Math.abs(end.y - start.y) / 4, bend),
                );
              const limit = (end.x - start.x) / 3;
              const sx = timeAxis ? Math.max(0, Math.min(limit, side)) : side;
              const ex = timeAxis ? Math.min(0, Math.max(-limit, -side)) : side;
              candidate = [
                start,
                { x: start.x + sx, y: start.y + direction * stub },
                { x: start.x + sx, y: mid },
                { x: end.x + ex, y: mid },
                { x: end.x + ex, y: end.y - direction * stub },
                end,
              ];
            }
            candidate = compact(candidate);
            if (
              candidate.some(
                (p) => p.x < lowX || p.x > highX || p.y < lowY || p.y > highY,
              )
            )
              continue;
            const value =
              score(candidate) + (Math.abs(side) + Math.abs(bend)) * 0.05;
            if (value < best - 0.01) {
              best = value;
              result = candidate;
            }
          }
      }
      used.push(...routeSegments(result));
      return result;
    };
  }
  function pointOnRoute(points, x, preferredY) {
    const candidates = [];
    for (const { a, b } of routeSegments(points)) {
      if (x < Math.min(a.x, b.x) - 1e-7 || x > Math.max(a.x, b.x) + 1e-7)
        continue;
      if (Math.abs(a.x - b.x) < 1e-7)
        candidates.push({
          x,
          y: Math.max(
            Math.min(a.y, b.y),
            Math.min(Math.max(a.y, b.y), preferredY),
          ),
        });
      else
        candidates.push({
          x,
          y: a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x),
        });
    }
    return (
      candidates.sort(
        (a, b) => Math.abs(a.y - preferredY) - Math.abs(b.y - preferredY),
      )[0] || { x, y: preferredY }
    );
  }
  const path = (points) =>
    points
      .map((p, i) => (i ? "L" : "M") + p.x.toFixed(2) + "," + p.y.toFixed(2))
      .join(" ");
  function wave(points, amplitude = 2.8, wavelength = 15, bounds = null) {
    // Sampling each routed segment keeps corners and exact endpoints; taper near corners.
    const result = [];
    let distance = 0;
    for (const { a, b } of routeSegments(points)) {
      const dx = b.x - a.x,
        dy = b.y - a.y,
        len = Math.hypot(dx, dy);
      let lo = 0,
        hi = 1;
      // Avoid sampling invisible, potentially kilometre-long segments at maximum zoom.
      // The semantic endpoints are retained; only off-canvas waveform detail is omitted.
      if (bounds) {
        if (Math.abs(dx) < 1e-9) {
          if (a.x < bounds.left || a.x > bounds.right) {
            result.push(a, b);
            distance += len;
            continue;
          }
        } else {
          const t1 = (bounds.left - a.x) / dx,
            t2 = (bounds.right - a.x) / dx;
          lo = Math.max(0, Math.min(t1, t2));
          hi = Math.min(1, Math.max(t1, t2));
        }
      }
      result.push(a);
      if (lo <= hi) {
        const count = Math.max(1, Math.ceil((len * (hi - lo)) / 2));
        for (let i = 0; i <= count; i++) {
          const t = lo + ((hi - lo) * i) / count,
            s = len * t,
            fade = Math.min(1, s / 5, (len - s) / 5),
            offset =
              Math.sin(((distance + s) * 2 * Math.PI) / wavelength) *
              amplitude *
              fade;
          result.push({
            x: a.x + dx * t - (dy / len) * offset,
            y: a.y + dy * t + (dx / len) * offset,
          });
        }
      }
      result.push(b);
      distance += len;
    }
    return path(result.length ? result : points);
  }
  const overlaps = (a, b) =>
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y;
  const width = (text, size = 11) =>
    Array.from(text).reduce(
      (n, c) => n + (/[\u0020-\u007e]/.test(c) ? size * 0.56 : size),
      0,
    );
  function textLines(text, max = 115, size = 11, limit = 3) {
    const lines = [""];
    for (const c of Array.from(text)) {
      if (width(lines.at(-1) + c, size) > max) lines.push("");
      lines[lines.length - 1] += c;
    }
    if (lines.length > limit) {
      lines.length = limit;
      lines[limit - 1] = lines[limit - 1].slice(0, -1) + "…";
    }
    return lines;
  }
  function label(text, points, occupied, maxWidth = 150) {
    const a = points[0],
      b = points.at(-1);
    const anchor = pointOnRoute(points, (a.x + b.x) / 2, (a.y + b.y) / 2);
    let display = text;
    while (width(display) > maxWidth && display.length > 1)
      display = display.slice(0, -1);
    if (display !== text) display = display.slice(0, -1) + "…";
    const w = width(display) + 10,
      h = 18;
    // Finite, local candidates only. Crowded labels may overlap rather than escape.
    const choices = [];
    for (const dy of [-22, 6, -40, 24])
      for (const dx of [0, -18, 18, -36, 36]) {
        const box = {
          x: anchor.x - w / 2 + dx,
          y: anchor.y + dy,
          width: w,
          height: h,
        };
        const score =
          occupied.reduce((s, o) => s + (overlaps(box, o) ? 1 : 0), 0) * 100 +
          Math.abs(dx) +
          Math.abs(dy + 22);
        choices.push({ ...box, score });
      }
    choices.sort((a, b) => a.score - b.score);
    const box = choices[0];
    occupied.push(box);
    return {
      ...box,
      anchor,
      text: display,
      fullText: text,
      leader:
        Math.abs(box.y - anchor.y) > 28 ||
        Math.abs(box.x + box.width / 2 - anchor.x) > 20,
    };
  }
  function viewport(duration, width, start = 0, end = duration) {
    const left = Math.min(166, width * 0.28),
      right = width - 36,
      scale = (right - left) / (end - start);
    return {
      width,
      left,
      right,
      scale,
      start,
      end,
      x: (t) => left + (t - start) * scale,
      time: (x) => start + (x - left) / scale,
    };
  }
  function layout(doc, widthValue = 1050, options = {}) {
    const v = doc.views.main,
      range = options.full
        ? { start: 0, end: doc.time.duration }
        : v.visibleTimeRange,
      vp = viewport(doc.time.duration, widthValue, range.start, range.end),
      filters = options.full
        ? { planned: true, quiet: true, causalLink: true, technology: true }
        : v.filters;
    const visible = (s) =>
      (filters.planned || !["planned", "proposed"].includes(s.status)) &&
      (filters.quiet || s.activity !== "quiet");
    const rows = [],
      states = new Map(),
      tasks = new Map(),
      junctions = new Map(),
      edges = [],
      occupied = [];
    let y = 42;
    for (const { actor, depth } of M.hierarchy(doc, !!options.full)) {
      const ss = doc.states
          .filter((s) => s.actorId === actor.id && visible(s))
          .sort((a, b) => a.time - b.time),
        lanes = [];
      const top = y;
      for (const s of ss) {
        const x = vp.x(s.time),
          lines = textLines(s.name, 112),
          labelWidth = Math.min(112, width(s.name)),
          needed = Math.max(36, labelWidth + 12);
        let lane = lanes.findIndex((end) => end < x - needed / 2);
        if (lane < 0) lane = lanes.length;
        lanes[lane] = x + needed / 2;
        const cy = top + 24 + lane * v.laneHeight;
        const labelX =
          x >= vp.left && x <= vp.right
            ? Math.max(
                vp.left + labelWidth / 2 - 10,
                Math.min(vp.width - labelWidth / 2 - 8, x),
              )
            : x;
        const p = { ...s, x, labelX, y: cy, r: 7, lane, lines };
        states.set(s.id, p);
        occupied.push(
          { x: x - 9, y: cy - 9, width: 18, height: 18 },
          {
            x: labelX - labelWidth / 2,
            y: cy + 11,
            width: labelWidth,
            height: lines.length * 13,
          },
        );
      }
      const height =
        actor.isGroup && !ss.length
          ? 38
          : Math.max(1, lanes.length) * v.laneHeight + 6;
      rows.push({ actor, depth, y: top, height, center: top + 24 });
      y += height;
    }
    const height = y + 24,
      router = createEdgeRouter(
        occupied.map((box) => ({ ...box })),
        { left: vp.left, right: vp.right, top: 36, bottom: height - 12 },
      );
    function facing(a, b) {
      const direction = Math.sign(b.y - a.y);
      return [
        { x: a.x, y: a.y + (direction ? direction * (a.r || 0) : 0) },
        { x: b.x, y: b.y - (direction ? direction * (b.r || 0) : 0) },
      ];
    }
    function route(a, b, timeAxis = false) {
      const [s, e] = facing(a, b);
      let pts;
      if (Math.abs(s.y - e.y) < 0.1) pts = [s, e];
      else if (timeAxis)
        pts = [
          s,
          { x: (s.x + e.x) / 2, y: s.y },
          { x: (s.x + e.x) / 2, y: e.y },
          e,
        ];
      else
        pts = [
          s,
          { x: s.x, y: (s.y + e.y) / 2 },
          { x: e.x, y: (s.y + e.y) / 2 },
          e,
        ];
      return router(pts, {
        axis: Math.abs(a.y - b.y) < 1 ? "horizontal" : "vertical",
        timeAxis,
      });
    }
    for (const t of doc.tasks) {
      if (!visible(t) || !states.has(t.fromStateId)) continue;
      const from = states.get(t.fromStateId),
        w = M.taskWindow(doc, t),
        to = t.toStateId ? states.get(t.toStateId) : null;
      if (t.toStateId && !to) continue;
      const end = to || { x: vp.x(w.end), y: from.y, r: 4 };
      const points = route(from, end, true);
      const e = {
        id: t.id,
        type: "task",
        part: "task",
        points,
        label: t.label,
        status: t.status,
        task: t,
      };
      edges.push(e);
      tasks.set(t.id, { task: t, points, from, end, window: w, edge: e });
    }
    const ensure = (tid, time, explicit) => {
      const key = tid + "@" + time;
      if (junctions.has(key)) return junctions.get(key);
      const task = tasks.get(tid);
      if (!task) return null;
      const p = pointOnRoute(task.points, vp.x(time), task.from.y);
      const j = { key, taskId: tid, time, ...p, r: 4, explicit };
      junctions.set(key, j);
      occupied.push({ x: j.x - 6, y: j.y - 6, width: 12, height: 12 });
      return j;
    };
    for (const t of doc.tasks)
      if (tasks.has(t.id))
        for (const j of t.junctions || []) {
          const p = ensure(t.id, j.time, j.id);
          for (const [i, o] of j.outcomes.entries()) {
            const to = states.get(o.toStateId);
            if (to)
              edges.push({
                id: t.id,
                type: "task",
                part: "outcome",
                junctionId: j.id,
                outcomeIndex: i,
                points: route(p, to, true),
                label: o.label,
                status: t.status,
              });
          }
        }
    const proxyGroups = new Map();
    function anchor(p) {
      const ep = M.endpoint(doc, p),
        aid = options.full ? ep.actorId : M.visibleActor(doc, ep.actorId);
      if (aid !== ep.actorId || p.type === "actor") {
        const row = rows.find((r) => r.actor.id === aid);
        return (
          row && {
            x: vp.x(ep.time),
            y: row.center,
            r: 0,
            proxy: aid !== ep.actorId,
            actorId: aid,
          }
        );
      }
      if (p.type === "state") return states.get(p.id);
      if (p.type === "task") return ensure(p.id, p.time);
    }
    if (filters.causalLink)
      for (const c of doc.causalLinks) {
        if (!filters.planned && c.proposed) continue;
        const a = anchor(c.source),
          b = anchor(c.target);
        if (!a || !b) continue;
        if (a.proxy && b.proxy && a.actorId === b.actorId) continue;
        if (a.proxy || b.proxy) {
          const key = [
            a.actorId || M.endpoint(doc, c.source).actorId,
            b.actorId || M.endpoint(doc, c.target).actorId,
            c.polarity,
            c.label,
            M.endpoint(doc, c.source).time,
            M.endpoint(doc, c.target).time,
            c.proposed,
          ].join("|");
          const existing = proxyGroups.get(key);
          if (existing) {
            existing.ids.push(c.id);
            existing.label = c.label + " ×" + existing.ids.length;
            continue;
          }
          const e = {
            id: c.id,
            ids: [c.id],
            type: "causalLink",
            part: "causal",
            points: route(a, b),
            label: c.label,
            polarity: c.polarity,
            proposed: c.proposed,
            proxy: true,
          };
          proxyGroups.set(key, e);
          edges.push(e);
        } else
          edges.push({
            id: c.id,
            type: "causalLink",
            part: "causal",
            points: route(a, b),
            label: c.label,
            polarity: c.polarity,
            proposed: c.proposed,
          });
      }
    for (const edge of edges)
      for (const { a, b } of routeSegments(edge.points))
        occupied.push({
          x: Math.min(a.x, b.x) - 2,
          y: Math.min(a.y, b.y) - 2,
          width: Math.abs(b.x - a.x) + 4,
          height: Math.abs(b.y - a.y) + 4,
        });
    for (const e of edges) {
      const tag =
        e.proposed || e.status === "proposed"
          ? "案"
          : e.status === "planned"
            ? "予定"
            : "";
      e.labelInfo = label(
        (tag ? tag + " · " : "") + e.label,
        e.points,
        occupied,
      );
      e.path =
        e.polarity === "negative"
          ? wave(e.points, 2.8, 15, {
              left: vp.left - 24,
              right: vp.width + 12,
            })
          : path(e.points);
    }
    return {
      vp,
      rows,
      states,
      tasks,
      junctions,
      edges,
      height,
      filters,
      occupied,
    };
  }
  const api = {
    layout,
    viewport,
    path,
    wave,
    label,
    width,
    textLines,
    overlaps,
    createEdgeRouter,
    parallelOverlap,
    routeSegments,
    pointOnRoute,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.MELayout = api;
})(globalThis);
