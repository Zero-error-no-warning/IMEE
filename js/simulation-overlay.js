/* Map completed trial counts onto diagram routes, without changing the mission. */
(function (root) {
  "use strict";
  const key = (...ids) => JSON.stringify(ids);
  const percent = p => p === 0 ? "0%" : p === 1 ? "100%" : p < .001 ? "<0.1%" : p > .999 ? ">99.9%" : (p * 100).toFixed(1) + "%";
  const lineWidth = p => 1.6 + 6.4 * p;
  function slice(points, left, right) {
    if (left === right || points[0].x === points.at(-1).x) return points;
    const at = x => {
      if (x === points[0].x) return {...points[0]};
      if (x === points.at(-1).x) return {...points.at(-1)};
      for (let i = 1; i < points.length; i++) {
        const a = points[i-1], b = points[i];
        if (b.x > a.x && x >= a.x && x <= b.x) return {x, y:a.y+(b.y-a.y)*(x-a.x)/(b.x-a.x)};
      }
      return {...points.at(-1)};
    };
    return [at(left), ...points.filter(p => p.x > left && p.x < right), at(right)];
  }
  function create(doc, result) {
    if (!result || !Number.isSafeInteger(result.iterations) || result.iterations < 1) return null;
    const total = result.iterations,
      tasks = new Map((result.tasks || []).map(t => [t.id, t])),
      signals = new Map((result.signals || []).map(l => [l.id, l])),
      branches = new Map((result.branches || []).map(b => [key(b.taskId,b.junctionId,b.outcomeStateId),b.count])),
      definitions = new Map(doc.tasks.map(t => [t.id,t])),
      states = new Map(doc.states.map(s => [s.id,s]));
    const metric = (count, label) => {
      if (!Number.isSafeInteger(count) || count < 0 || count > total) return null;
      const ratio = count / total;
      return {count,total,ratio,label,text:percent(ratio),width:lineWidth(ratio)};
    };
    function segments(edge, vp) {
      // Marginal counts cannot recover the union of merged, correlated paths.
      if (edge.summaryActorId || edge.technologyOnly) return [];
      if (edge.type === "causalLink") {
        const m = metric(signals.get(edge.id)?.accepted,"作用適用率");
        return m ? [{points:edge.points,metric:m}] : [];
      }
      const t = definitions.get(edge.id), r = tasks.get(edge.id);
      if (!t || !r) return [];
      const junctions = [...(t.junctions || [])].sort((a,b) => a.time-b.time);
      const branchCount = j => j.outcomes.reduce((n,o) => n+(branches.get(key(t.id,j.id,o.toStateId)) || 0),0);
      if (edge.part === "outcome") {
        const j = junctions.find(j => j.id === edge.junctionId), o = j?.outcomes[edge.outcomeIndex];
        const m = o && metric(branches.get(key(t.id,j.id,o.toStateId)) || 0,"分岐選択率");
        return m ? [{points:edge.points,metric:m}] : [];
      }
      const start = states.get(t.fromStateId).time,
        end = t.toStateId ? states.get(t.toStateId).time : junctions.at(-1).time,
        cuts = [...new Set([...junctions.map(j => j.time).filter(time => time > start && time < end),end])],
        parts = [];
      let previous = start;
      for (const time of cuts) {
        // Before a branch, count paths that eventually continue OR select that
        // branch; after it, its diverted paths no longer traverse the main line.
        const later = junctions.filter(j => j.time >= time),
          count = r.finished + later.reduce((n,j) => n+branchCount(j),0),
          m = metric(count,later.length ? "経路通過率" : "正常完了率");
        if (m) parts.push({points:slice(edge.points,vp.x(previous),vp.x(time)),metric:m,start:previous,end:time});
        previous = time;
      }
      return parts;
    }
    return {total,seed:result.config?.seed,successProbability:result.successProbability,segments};
  }
  const api = {create,percent,lineWidth,slice};
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.MESimulationOverlay = api;
})(globalThis);
