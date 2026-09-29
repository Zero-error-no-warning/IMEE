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
  function wave(points, amplitude = 2.8, wavelength = 15, bounds = null, shape = "sine") {
    // Keep exact endpoints and a straight tail near corners / arrowheads.
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
        if (shape === "square") {
          const start = Math.max(5, len * lo), end = Math.min(len - 7, len * hi),
            step = wavelength / 2,
            append = (s, offset) => result.push({
              x: a.x + dx * s / len - dy / len * offset,
              y: a.y + dy * s / len + dx / len * offset,
            });
          if (start < end) {
            let index = Math.floor((distance + start) / step),
              offset = index % 2 === 0 ? amplitude : -amplitude;
            append(start, 0);
            append(start, offset);
            // Two points at each transition preserve perpendicular steps, even after clipping.
            for (let s = (++index) * step - distance; s < end; s = (++index) * step - distance) {
              append(s, offset);
              offset = -offset;
              append(s, offset);
            }
            append(end, offset);
            append(end, 0);
          }
        } else {
          const count = Math.max(1, Math.ceil((len * (hi - lo)) / 2));
          for (let i = 0; i <= count; i++) {
            const t = lo + ((hi - lo) * i) / count,
              s = len * t,
              fade = Math.min(1, s / 5, Math.max(0, (len - s - 7) / 5)),
              offset = Math.sin(((distance + s) * 2 * Math.PI) / wavelength) * amplitude * fade;
            result.push({
              x: a.x + dx * t - (dy / len) * offset,
              y: a.y + dy * t + (dx / len) * offset,
            });
          }
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
  function label(text, points, occupied, maxWidth = 150, lineSegments = [], reserved = []) {
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
    const anchors = [anchor];
    if (reserved.length) for (const t of [0.25,0.75,0.1,0.9])
      anchors.push(pointOnRoute(points,a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t));
    for (const candidateAnchor of anchors) for (const { dx, dy } of offsets) {
        const box = {
          x: candidateAnchor.x - w / 2 + dx,
          y: candidateAnchor.y + dy,
          width: w,
          height: h,
        };
        const score =
          reserved.reduce((s, o) => s + (overlaps(box, o) ? 1 : 0), 0) * 10000 +
          occupied.reduce((s, o) => s + (overlaps(box, o) ? 1 : 0), 0) * 100 +
          lineSegments.reduce((n, segment) => n + segmentInsideBox(segment, box), 0) * 12 +
          Math.abs(dx) +
          Math.abs(dy + 22) + Math.hypot(candidateAnchor.x-anchor.x,candidateAnchor.y-anchor.y)*0.04;
        choices.push({ ...box, score, anchor:candidateAnchor });
      }
    choices.sort((a, b) => a.score - b.score);
    const box = choices[0];
    occupied.push(box);
    return {
      ...box,
      anchor:box.anchor,
      text: display,
      fullText: text,
      leader: Math.hypot(
        Math.max(box.x - box.anchor.x, 0, box.anchor.x - box.x - box.width),
        Math.max(box.y - box.anchor.y, 0, box.anchor.y - box.y - box.height),
      ) > 18,
    };
  }
  function taskLabel(text, points, occupied, lineSegments) {
    const segments = routeSegments(points),
      a = points[0], b = points.at(-1),
      middle = pointOnRoute(points, (a.x+b.x)/2, (a.y+b.y)/2),
      otherLines = lineSegments.filter(line => !segments.some(s => s.a === line.a && s.b === line.b));
    let chars = Array.from(text);
    const fullLength = chars.length;
    while (width(chars.join("")) > 150) chars.pop();
    // Slide the caption along the existing route; never reroute the Task around text.
    while (true) {
      const display = chars.join("") + (chars.length < fullLength ? "…" : ""),
        w = width(display)+10, h = 18, choices = [];
      for (const {a,b} of segments) for (const t of [0.5,0.4,0.6,0.3,0.7,0.2,0.8,0.1,0.9]) {
        const anchor = {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t},
          box = {x:anchor.x-w/2,y:anchor.y-h/2,width:w,height:h},
          padded = {x:box.x-2,y:box.y-2,width:w+4,height:h+4};
        if (occupied.some(o => overlaps(padded,o))) continue;
        const score = otherLines.reduce((n,line) => n+segmentInsideBox(line,padded),0)*12 +
          Math.hypot(anchor.x-middle.x,anchor.y-middle.y);
        choices.push({...box,anchor,score,text:display,fullText:text,leader:false});
      }
      if (choices.length) {
        choices.sort((a,b)=>a.score-b.score);
        occupied.push(choices[0]);
        return choices[0];
      }
      if (!chars.length) break;
      chars.pop();
    }
    // Very short / crowded segments retain their complete label in the edge Tooltip.
    return null;
  }
  function technologyLeader(anchor, box, obstacles, lines) {
    const padded = obstacles.filter(b => b !== box).map(b =>
      ({x:b.x-3,y:b.y-3,width:b.width+6,height:b.height+6}));
    const contains = (b,p) => p.x>b.x && p.x<b.x+b.width && p.y>b.y && p.y<b.y+b.height;
    const bounds = {x:Math.min(anchor.x,box.x)-48,y:Math.min(anchor.y,box.y)-48,
      width:Math.abs(anchor.x-box.x)+box.width+96,height:Math.abs(anchor.y-box.y)+box.height+96};
    // Only the source body can contain the attachment point. All other nodes,
    // captions and bubbles are obstacles, including the destination bubble.
    const blocked = padded.filter(b => !contains(b,anchor));
    blocked.push(box);
    const starts = [{x:anchor.x,y:anchor.y-9},{x:anchor.x+9,y:anchor.y},
      {x:anchor.x,y:anchor.y+9},{x:anchor.x-9,y:anchor.y}].filter(p => !blocked.some(b => contains(b,p)));
    const endX = Math.max(box.x+6,Math.min(box.x+box.width-6,anchor.x));
    const endY = Math.max(box.y+4,Math.min(box.y+box.height-4,anchor.y));
    const ends = [{x:endX,y:box.y},{x:endX,y:box.y+box.height},
      {x:box.x,y:endY},{x:box.x+box.width,y:endY}];
    const nodes = [...starts,...ends];
    for (const b of blocked.filter(b => overlaps(b,bounds))) for (const x of [b.x-1,b.x+b.width+1])
      for (const y of [b.y-1,b.y+b.height+1]) {
        const point = {x,y};
        if (!blocked.some(o => contains(o,point))) nodes.push(point);
      }
    const distance = nodes.map((_,i) => i<starts.length ? 0 : Infinity), previous = [], visited = new Set();
    while (visited.size < nodes.length) {
      let at=-1;
      for (let i=0;i<nodes.length;i++) if (!visited.has(i) && (at<0 || distance[i]<distance[at])) at=i;
      if (at<0 || !Number.isFinite(distance[at])) break;
      if (at>=starts.length && at<starts.length+ends.length) {
        const result=[];
        for (let i=at;i!==undefined;i=previous[i]) result.unshift(nodes[i]);
        return result;
      }
      visited.add(at);
      for (let i=0;i<nodes.length;i++) {
        if (visited.has(i)) continue;
        const segment={a:nodes[at],b:nodes[i]};
        const length=Math.hypot(segment.b.x-segment.a.x,segment.b.y-segment.a.y);
        if (distance[at]+length+4>=distance[i] || blocked.some(b => segmentInsideBox(segment,b)>0.01)) continue;
        const score=distance[at]+length+4+lines.reduce((sum,line)=>sum+parallelOverlap(segment,line,4)*4,0);
        if (score<distance[i]) {distance[i]=score;previous[i]=at;}
      }
    }
    return []; // The tooltip still identifies bindings in a fully enclosed area.
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
    const displayActor = (id) => options.full ? id : M.visibleActor(doc, id);
    const folded = new Set(options.full ? [] : v.collapsedActors);
    const internal = c => {
      const source = displayActor(M.endpoint(doc, c.source).actorId);
      const target = displayActor(M.endpoint(doc, c.target).actorId);
      return source === target && folded.has(source);
    };
    const technologyBindings = filters.technology ? doc.bindings.filter(b => {
      const tech = M.get(doc, "technology", b.technologyId);
      if (v.mode === "gap" && tech.status === "existing") return false;
      if (b.targetType === "causalLink") {
        const c = M.get(doc, "causalLink", b.targetId);
        return filters.causalLink && !internal(c);
      }
      return true;
    }).map(b => {
      const target = M.get(doc, b.targetType, b.targetId);
      const actorId = b.targetType === "actor" ? target.id
        : b.targetType === "state" ? target.actorId
        : b.targetType === "task" ? M.get(doc, "state", target.fromStateId).actorId
        : M.endpoint(doc, target.source).actorId;
      return { binding:b, actorId:displayActor(actorId) };
    }) : [];
    for (const { actor, depth } of M.hierarchy(doc, !!options.full)) {
      const top = y, aggregated = folded.has(actor.id), lanes = [];
      const collapseMode = aggregated ? (v.collapsedLayout || "compact") : "spaced";
      const spacing = collapseMode === "compact" ? 28 : v.laneHeight;
      const radius = collapseMode === "compact" ? 5 : 7;
      // Project the whole subtree onto ONE parent timeline. Sublanes are only
      // for concurrent states/branches, never one lane per child Actor.
      const ss = doc.states.filter(s => displayActor(s.actorId) === actor.id && visible(s))
        .sort((a,b) => a.time - b.time);
      for (const s of ss) {
        const x = vp.x(s.time), needed = 30;
        const incoming = doc.tasks.find(t => t.toStateId === s.id) ||
          doc.tasks.find(t => t.junctions?.some(j => j.outcomes.some(o => o.toStateId === s.id)));
        const previousLane = incoming && states.get(incoming.fromStateId)?.lane;
        const sideBranch = incoming?.toStateId && incoming.toStateId !== s.id;
        const preferred = previousLane === undefined ? undefined : previousLane + (sideBranch ? 1 : 0);
        let lane = preferred !== undefined && (lanes[preferred] === undefined || lanes[preferred] < x - needed / 2)
          ? preferred : lanes.findIndex(end => end < x - needed / 2);
        if (collapseMode === "single") lane = 0;
        else if (lane < 0) lane = lanes.length;
        lanes[lane] = x + needed / 2;
        const cy = top + 24 + lane * spacing;
        states.set(s.id, { ...s, displayActorId:actor.id, x, labelX:x, y:cy, r:radius,
          lane, collapseMode, lines:textLines(s.name,112) });
        nodeBodies.push({x:x-radius-2,y:cy-radius-2,width:radius*2+4,height:radius*2+4});
      }
      if (collapseMode === "single") {
        const atTime = new Map();
        for (const source of ss) {
          const state = states.get(source.id), existing = atTime.get(source.time);
          if (existing) {
            existing.summaryNames.push(source.name);
            if (source.activity !== "quiet") existing.activity = "active";
            state.summaryHidden = true;
          }
          else { state.summaryActorId=actor.id; state.summaryNames=[source.name]; atTime.set(source.time,state); }
        }
      }
      const count = technologyBindings.filter(b => b.actorId === actor.id).length;
      const baseHeight = actor.isGroup && !lanes.length ? 38 :
        collapseMode === "single" ? 48 : collapseMode === "compact"
          ? 42 + Math.max(0,lanes.length-1)*spacing
          : Math.max(1,lanes.length)*spacing+6;
      // A separate annotation band keeps bubbles off the timeline and captions.
      // Geometry does not depend on the length of State/Task/causal captions.
      const technologyTop = top + Math.max(baseHeight,
        (Math.max(1,lanes.length)-1)*spacing + (collapseMode === "spaced" ? 86 : 44)) + 8;
      const columns = Math.max(1, Math.floor((vp.width-vp.left-24)/200));
      const technologyHeight = count ? Math.ceil(count/columns)*28 + 8 + (options.technologySpace?.[actor.id] || 0) : 0;
      const rowHeight = count ? technologyTop-top+technologyHeight : baseHeight;
      rows.push({actor,depth,y:top,height:rowHeight,center:top+24,aggregated,collapseMode,
        technologyTop,technologyHeight});
      y += rowHeight;
    }
    let height = y + 24;
    const router = createEdgeRouter(
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
      const points = from.collapseMode === "single"
        ? [{x:from.x,y:from.y},{x:end.x,y:end.y}] : route(from,end,true);
      const e = {
        id: t.id,
        type: "task",
        part: "task",
        points,
        label: t.label,
        actorId: from.displayActorId,
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
      const j = { key, taskId: tid, actorId:task.from.displayActorId, time, ...p, r: 4, explicit };
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
                points: to.collapseMode === "single" ? [{x:p.x,y:p.y},{x:to.x,y:to.y}] : route(p,to,true),
                label: o.label,
                actorId: states.get(t.fromStateId).displayActorId,
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
        // Only causal links wholly inside the same collapsed subtree disappear.
        if (internal(c)) continue;
        const a=anchor(c.source), b=anchor(c.target);
        if (!a || !b) continue;
        edges.push({id:c.id,type:"causalLink",part:"causal",points:route(a,b),
          label:c.label,polarity:c.polarity,actorId:displayActor(sourceActorId)});
      }
    for (const row of rows.filter(r => r.collapseMode === "single")) {
      const sourceEdges = edges.filter(e => e.type === "task" && e.actorId === row.actor.id);
      const intervals = sourceEdges.map(e => ({start:e.points[0].x,end:e.points.at(-1).x,
        labels:[e.label],members:[e.id]})).sort((a,b) => a.start-b.start || a.end-b.end);
      const merged=[];
      for (const interval of intervals) {
        const last=merged.at(-1);
        if (last && interval.start<=last.end) {
          last.end=Math.max(last.end,interval.end);
          last.labels.push(...interval.labels); last.members.push(...interval.members);
        } else merged.push(interval);
      }
      for (let i=edges.length-1;i>=0;i--)
        if (edges[i].type === "task" && edges[i].actorId === row.actor.id) edges.splice(i,1);
      for (const [i,interval] of merged.entries()) edges.push({
        id:`summary-${row.actor.id}-${i}`,type:"task",part:"task",actorId:row.actor.id,
        summaryActorId:row.actor.id,memberIds:[...new Set(interval.members)],
        points:[{x:interval.start,y:row.center},{x:interval.end,y:row.center}],
        label:[...new Set(interval.labels)].filter(Boolean).join(" / "),hideLabel:true,
      });
    }
    const lineSegments = edges.flatMap(e => routeSegments(e.points));
    // Reflow State text after routing. Text collisions never feed back into geometry.
    occupied.length = 0;
    occupied.push(...nodeBodies);
    for (const j of junctions.values()) occupied.push({ x: j.x - 6, y: j.y - 6, width: 12, height: 12 });
    const technologyTags = [], unplaced = [];
    for (const {binding, actorId} of technologyBindings) {
      const row = rows.find(r => r.actor.id === actorId);
      let anchor;
      if (binding.targetType === "state") anchor = states.get(binding.targetId);
      else if (binding.targetType === "actor") anchor = row && {x:vp.left+30,y:row.center};
      else {
        const edge = binding.targetType === "task" ? tasks.get(binding.targetId)?.edge
          : edges.find(e => e.id === binding.targetId);
        if (edge) {
          const start = Math.max(vp.left, Math.min(...edge.points.map(p => p.x)));
          const end = Math.min(vp.right, Math.max(...edge.points.map(p => p.x)));
          if (start <= end) anchor = pointOnRoute(edge.points, (start+end)/2,
            (edge.points[0].y+edge.points.at(-1).y)/2);
        }
      }
      if (!anchor || !row || anchor.x < vp.left-14 || anchor.x > vp.width) continue;
      const tech = M.get(doc, "technology", binding.technologyId);
      const fullText = v.mode === "mission" ? tech.name
        : v.mode === "gap" ? `${tech.name} · TRL ${tech.trl ?? "?"}`
        : `${tech.name} · ${tech.status} · TRL ${tech.trl ?? "?"}`;
      const max = Math.max(16, Math.min(180,vp.width-vp.left-40));
      let text, box;
      // If lines divide a narrow viewport, use a shorter caption with the full
      // value in its tooltip before asking for more row height.
      for (const cap of [...new Set([max,Math.min(max,140),Math.min(max,100),Math.min(max,70)])]) {
        text = fullText;
        while (width(text,10) > cap && text.length > 1) text = text.slice(0,-1);
        if (text !== fullText) text = text.slice(0,-1) + "…";
        const w = width(text,10)+12, h = 20;
        const left = vp.left+8, right = vp.width-w-12;
        const preferred = Math.max(left,Math.min(right,anchor.x-w/2));
        const xs = [preferred,left,right];
        for (let x=left; x<=right; x+=12) xs.push(x);
        xs.sort((a,b) => Math.abs(a-preferred)-Math.abs(b-preferred));
        for (let ty=row.technologyTop; ty+h<=row.y+row.height-6 && !box; ty+=28)
          for (const x of xs) {
            const candidate = {x,y:ty,width:w,height:h};
            const padded = {x:x-5,y:ty-5,width:w+10,height:h+10};
            if (occupied.some(o => overlaps(padded,o)) ||
                lineSegments.some(line => segmentInsideBox(line,padded)>0)) continue;
            box = candidate;
            break;
          }
        if (box) break;
      }
      const tag = {binding,actorId,tech,anchor:{x:anchor.x,y:anchor.y},text,fullText,box};
      if (box) { technologyTags.push(tag); occupied.push(box); }
      else unplaced.push(tag);
    }
    if (unplaced.length && (options.technologyPass || 0) < 8) {
      const technologySpace = {...options.technologySpace};
      for (const tag of unplaced) technologySpace[tag.actorId] = (technologySpace[tag.actorId] || 0)+28;
      return layout(doc,widthValue,{...options,technologySpace,technologyPass:(options.technologyPass || 0)+1});
    }
    // Pathological density: keep every binding readable in an overflow band,
    // below all graph geometry, rather than drawing a bubble across a node/line.
    for (const tag of unplaced) {
      tag.box = {x:vp.left+8,y:height,width:Math.min(192,vp.width-vp.left-24),height:20};
      tag.overflow = true;
      height += 28;
      technologyTags.push(tag); occupied.push(tag.box);
    }
    for (const s of states.values()) {
      if (s.collapseMode !== "spaced") {s.lines=[];continue;}
      const peers = [...states.values()].filter(p => p.displayActorId === s.displayActorId && p.lane === s.lane && p.id !== s.id);
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
      e.labelInfo = e.hideLabel ? null : e.type === "task"
        ? taskLabel(e.label, e.points, occupied, lineSegments) : label(
        e.label,
        e.points,
        occupied,
        150,
        lineSegments,
        technologyTags.map(t => t.box),
      );
      e.path =
        e.type === "causalLink"
          ? wave(e.points, 2.8, 15, {
              left: vp.left - 24,
              right: vp.width + 12,
            }, e.polarity === "negative" ? "sine" : "square")
          : path(e.points);
    }
    for (const tag of technologyTags)
      tag.leader = technologyLeader(tag.anchor,tag.box,occupied,lineSegments);
    return {
      vp,
      rows,
      states,
      tasks,
      junctions,
      edges,
      height,
      filters,
      technologyTags,
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
    segmentInsideBox,
    createEdgeRouter,
    parallelOverlap,
    routeSegments,
    pointOnRoute,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.MELayout = api;
})(globalThis);
