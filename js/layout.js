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
    const compact = (points) => {
      const result = [];
      for (const p of points) {
        const b = result.at(-1), a = result.at(-2);
        if (b && p.x === b.x && p.y === b.y) continue;
        if (a && Math.abs((b.x-a.x)*(p.y-b.y)-(b.y-a.y)*(p.x-b.x)) < 1e-7 &&
            (b.x-a.x)*(p.x-b.x)+(b.y-a.y)*(p.y-b.y) >= 0) result.pop();
        result.push({ ...p });
      }
      return result;
    };
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
          // Short, low-bend paths win. Only node bodies and shared line segments
          // are obstacles; text is placed later and cannot deform a route.
          return overlap(parts) * 8 + penetration * 8 + length(parts) * 0.15 +
            Math.max(0, parts.length - 1) * 12;
        };
        let best = score(original);
        const dx = end.x - start.x, dy = end.y - start.y;
        const lengthValue = Math.hypot(dx, dy);
        for (const offset of [8, -8, 16, -16, 24, -24]) {
          // One parallel middle section, with short fan-out at either end.
          const fraction = Math.min(0.2, 12 / Math.max(1, lengthValue));
          let ox = -dy / Math.max(1, lengthValue) * offset;
          let oy = dx / Math.max(1, lengthValue) * offset;
          if (timeAxis) { ox = 0; oy = offset; }
          const candidate = compact([
            start,
            { x: start.x + dx * fraction + ox, y: start.y + dy * fraction + oy },
            { x: end.x - dx * fraction + ox, y: end.y - dy * fraction + oy },
            end,
          ]);
          if (candidate.some(p =>
            p.x < Math.min(bounds.left ?? -Infinity, start.x, end.x) ||
            p.x > Math.max(bounds.right ?? Infinity, start.x, end.x) ||
            p.y < Math.min(bounds.top ?? -Infinity, start.y, end.y) ||
            p.y > Math.max(bounds.bottom ?? Infinity, start.y, end.y))) continue;
          if (timeAxis && candidate.some((p, i) => i && p.x < candidate[i-1].x)) continue;
          const value = score(candidate) + Math.abs(offset) * 0.1;
          if (value < best - 0.01) { best = value; result = candidate; }
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
            fade = Math.min(1, s / 5, Math.max(0, (len - s - 7) / 5)),
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
  function label(text, points, occupied, maxWidth = 150, lineSegments = []) {
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
    const offsets = [];
    if (Math.abs(b.y - a.y) > Math.abs(b.x - a.x))
      for (const dx of [w / 2 + 8, -w / 2 - 8]) offsets.push({ dx, dy: -h / 2 });
    for (const dy of [-22, 6, -40, 24])
      for (const dx of [0, -18, 18, -36, 36]) offsets.push({ dx, dy });
    for (const { dx, dy } of offsets) {
        const box = {
          x: anchor.x - w / 2 + dx,
          y: anchor.y + dy,
          width: w,
          height: h,
        };
        const score =
          occupied.reduce((s, o) => s + (overlaps(box, o) ? 1 : 0), 0) * 100 +
          lineSegments.reduce((n, segment) => n + segmentInsideBox(segment, box), 0) * 12 +
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
      leader: Math.hypot(
        Math.max(box.x - anchor.x, 0, anchor.x - box.x - box.width),
        Math.max(box.y - anchor.y, 0, anchor.y - box.y - box.height),
      ) > 18,
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
        ? { quiet: true, causalLink: true, technology: true }
        : v.filters;
    const visible = (s) => filters.quiet || s.activity !== "quiet";
    const rows = [],
      states = new Map(),
      tasks = new Map(),
      junctions = new Map(),
      edges = [],
      occupied = [],
      nodeBodies = [];
    let y = 54;
    const allActors = M.hierarchy(doc, true).map(r => r.actor);
    const displayActor = (id) => options.full ? id : M.visibleActor(doc, id);
    const folded = new Set(options.full ? [] : v.collapsedActors);
    for (const { actor, depth } of M.hierarchy(doc, !!options.full)) {
      const top = y, aggregated = folded.has(actor.id), actorLanes = [];
      const owners = allActors.filter(a => displayActor(a.id) === actor.id);
      let laneCount = 0;
      for (const owner of owners) {
        const ss = doc.states.filter(s => s.actorId === owner.id && visible(s))
          .sort((a,b) => a.time - b.time);
        if (!ss.length) continue;
        const lanes = [], baseLane = laneCount;
        for (const s of ss) {
          const x = vp.x(s.time), needed = 30;
          const incoming = doc.tasks.find(t => t.toStateId === s.id) ||
            doc.tasks.find(t => t.junctions?.some(j => j.outcomes.some(o => o.toStateId === s.id)));
          const predecessor = incoming && states.get(incoming.fromStateId);
          const previousLane = predecessor ? predecessor.lane - baseLane : undefined;
          const sideBranch = incoming?.toStateId && incoming.toStateId !== s.id;
          const preferred = previousLane === undefined ? undefined : previousLane + (sideBranch ? 1 : 0);
          let lane = preferred !== undefined && (lanes[preferred] === undefined || lanes[preferred] < x - needed / 2)
            ? preferred : lanes.findIndex(end => end < x - needed / 2);
          if (lane < 0) lane = lanes.length;
          lanes[lane] = x + needed / 2;
          const cy = top + (aggregated ? 30 : 0) + 24 + (baseLane + lane) * v.laneHeight;
          states.set(s.id, { ...s, displayActorId:actor.id, x, labelX:x, y:cy, r:7,
            lane:baseLane + lane, lines:textLines(s.name,112) });
          nodeBodies.push({x:x-9,y:cy-9,width:18,height:18});
        }
        actorLanes.push({actorId:owner.id, y:top + (aggregated ? 30 : 0) + 24 + baseLane*v.laneHeight});
        laneCount += lanes.length;
      }
      const height = actor.isGroup && !laneCount ? 38 :
        (aggregated ? 30 : 0) + Math.max(1,laneCount)*v.laneHeight + 6;
      rows.push({actor,depth,y:top,height,center:top+24,aggregated,actorLanes});
      y += height;
    }
    const height = y + 24,
      router = createEdgeRouter(
        nodeBodies,
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
      return router([s, e], {
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
        actorId: from.actorId,
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
                actorId: states.get(t.fromStateId).actorId,
              });
          }
        }
    function anchor(p) {
      const ep = M.endpoint(doc, p);
      if (p.type === "actor") {
        const row = rows.find(r => r.actor.id === displayActor(ep.actorId));
        return row && {x:vp.x(ep.time),y:row.center,r:0};
      }
      if (p.type === "state") return states.get(p.id);
      if (p.type === "task") return ensure(p.id,p.time);
    }
    if (filters.causalLink)
      for (const c of doc.causalLinks) {
        const sourceActorId = M.endpoint(doc,c.source).actorId;
        const targetActorId = M.endpoint(doc,c.target).actorId;
        // Aggregated groups show their own/descendant State and Task timelines,
        // not causal proxy lines. Unrelated expanded actors retain their links.
        if (folded.has(displayActor(sourceActorId)) || folded.has(displayActor(targetActorId))) continue;
        const a=anchor(c.source), b=anchor(c.target);
        if (!a || !b) continue;
        edges.push({id:c.id,type:"causalLink",part:"causal",points:route(a,b),
          label:c.label,polarity:c.polarity,actorId:sourceActorId});
      }
    const lineSegments = edges.flatMap(e => routeSegments(e.points));
    // Reflow State text after routing. Text collisions never feed back into geometry.
    occupied.length = 0;
    occupied.push(...nodeBodies);
    for (const j of junctions.values()) occupied.push({ x: j.x - 6, y: j.y - 6, width: 12, height: 12 });
    for (const s of states.values()) {
      const peers = [...states.values()].filter(p => p.actorId === s.actorId && p.lane === s.lane && p.id !== s.id);
      const gap = Math.min(124, ...peers.map(p => Math.abs(p.x - s.x)));
      const maxWidth = Math.max(28, Math.min(112, gap - 10));
      s.lines = textLines(s.name, maxWidth);
      const labelWidth = Math.max(...s.lines.map(line => width(line)));
      const choices = [0, -18, 18, -30, 30].map(dx => {
        const cx = s.x >= vp.left && s.x <= vp.right
          ? Math.max(vp.left + labelWidth / 2 - 10, Math.min(vp.width - labelWidth / 2 - 8, s.x + dx))
          : s.x + dx;
        const box = { x: cx - labelWidth / 2, y: s.y + 11, width: labelWidth, height: s.lines.length * 13 };
        const score = occupied.reduce((n, o) => n + (overlaps(box, o) ? 100 : 0), 0) +
          lineSegments.reduce((n, line) => n + segmentInsideBox(line, box) * 12, 0) + Math.abs(dx);
        return { cx, box, score };
      });
      choices.sort((a,b) => a.score - b.score);
      s.labelX = choices[0].cx;
      occupied.push(choices[0].box);
    }
    for (const e of edges) {
      e.labelInfo = label(
        e.label,
        e.points,
        occupied,
        150,
        lineSegments,
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
