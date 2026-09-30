/* Task performance -> mission effectiveness. No equipment/engagement physics. */
(function (root) {
  "use strict";
  const M = typeof module !== "undefined" && module.exports ? require("./model.js") : root.ME;
  const P = typeof module !== "undefined" && module.exports ? require("./performance.js") : root.MEPerformance;
  const fail = message => { throw new Error(message); };
  function compile(document, options = {}) {
    const d = M.clone(document);
    M.validate(d);
    const config = { iterations: 1000, seed: 1, deadline: null, ...d.simulation, ...options };
    if (!Array.isArray(config.successStateIds) || !config.successStateIds.length ||
        config.successStateIds.some(sid => !M.get(d, "state", sid)))
      fail("Mission成功Stateを1件以上選択してください。");
    if (!Number.isInteger(config.iterations) || config.iterations < 1 || config.iterations > 100000)
      fail("試行数は1〜100,000の整数です。");
    if (!Number.isInteger(config.seed) || config.seed < 0 || config.seed > 4294967295)
      fail("Seedは0〜4,294,967,295の整数です。");
    if (config.deadline != null) P.number(config.deadline, "Mission期限", 0, 1e9);
    if (config.iterations * (d.tasks.length + d.states.length) > 5000000)
      fail("この文書の試行数が多すぎます。State・Task数 × 試行数を500万以下にしてください。");
    const branched = d.tasks.filter(t => t.junctions?.length);
    if (branched.length)
      fail("分岐Taskの実行規則は未対応です。分岐を除いたシミュレーション用文書にしてください: " + branched.slice(0,5).map(t => t.label).join("、"));
    const nodes = new Map();
    for (const s of d.states) nodes.set(s.id, { id: s.id, type: "state", item: s, predecessors: [], successors: [] });
    for (const t of d.tasks) nodes.set(t.id, {
      id: t.id, type: "task", item: t,
      predecessors: [...new Set([t.fromStateId, ...(t.simulation?.waitForStateIds || [])])], successors: [],
      points: t.simulation?.enabled ? P.distribution(t.simulation.performanceModel, t.simulation.w ?? 0) : null,
      duration: M.taskWindow(d, t).end - M.taskWindow(d, t).start,
    });
    for (const t of d.tasks) nodes.get(t.toStateId).predecessors.push(t.id);
    for (const n of nodes.values()) for (const pid of n.predecessors) nodes.get(pid).successors.push(n.id);
    const pending = new Map([...nodes.values()].map(n => [n.id, n.predecessors.length]));
    const queue = [...nodes.values()].filter(n => !n.predecessors.length), order = [];
    for (let i=0; i<queue.length; i++) {
      const n = queue[i];
      order.push(n);
      for (const sid of n.successors) {
        pending.set(sid, pending.get(sid)-1);
        if (pending.get(sid) === 0) queue.push(nodes.get(sid));
      }
    }
    if (order.length !== nodes.size) fail("Task / 追加依存Stateに循環があります。ループの実行は未対応です。");
    return { document: d, config, nodes, order,
      warnings: d.causalLinks.length ? ["作用線は表示・構造分析用です。この実行では依存・分岐条件・w入力として使いません。Actor間の実行依存はTaskの追加依存Stateで指定してください。"] : [] };
  }
  function trial(compiled, rng) {
    const times = new Map(), taskTimes = new Map();
    for (const n of compiled.order) {
      const ready = n.predecessors.length ? Math.max(...n.predecessors.map(pid => times.get(pid))) : n.item.time;
      if (n.type === "state") times.set(n.id, ready);
      else {
        // Consume one draw for every task, even if blocked: seeded reruns stay stable.
        const u = rng(), duration = n.points ? P.sample(n.points, u) : n.duration;
        const end = ready + duration;
        times.set(n.id, end);
        taskTimes.set(n.id, { start: ready, end, duration: Number.isFinite(ready) ? duration : null,
          wait: Number.isFinite(ready) ? ready-times.get(n.item.fromStateId) : null });
      }
    }
    const completion = Math.max(...compiled.config.successStateIds.map(sid => times.get(sid)));
    const reached = Number.isFinite(completion);
    const success = reached && (compiled.config.deadline == null || completion <= compiled.config.deadline);
    const critical = new Set();
    if (reached) {
      const stack = compiled.config.successStateIds.filter(sid => times.get(sid) === completion), visited = new Set();
      while (stack.length) {
        const nid = stack.pop();
        if (visited.has(nid)) continue;
        visited.add(nid);
        const n = compiled.nodes.get(nid);
        if (n.type === "task") critical.add(nid);
        const ready = n.type === "task" ? taskTimes.get(nid).start : times.get(nid);
        for (const pid of n.predecessors)
          if (Math.abs(times.get(pid)-ready) <= 1e-9 * Math.max(1, Math.abs(ready))) stack.push(pid);
      }
    }
    return { success, reached, completion, times, taskTimes, critical };
  }
  function quantile(sorted, p) {
    if (!sorted.length) return null;
    const position = (sorted.length-1)*p, index = Math.floor(position);
    return sorted[index] + (sorted[Math.ceil(position)]-sorted[index])*(position-index);
  }
  function percentiles(values) {
    values.sort((a,b) => a-b);
    return { p50: quantile(values, .5), p90: quantile(values, .9) };
  }
  function wilson(successes, total) {
    const z = 1.959963984540054, p = successes/total, denominator = 1+z*z/total;
    const center = (p+z*z/(2*total))/denominator;
    const half = z*Math.sqrt(p*(1-p)/total+z*z/(4*total*total))/denominator;
    return { low: Math.max(0,center-half), high: Math.min(1,center+half) };
  }
  function createRun(document, options) {
    const c = compile(document, options), rng = P.random(c.config.seed);
    let completed = 0, successes = 0, reached = 0, cached = null;
    const completionTimes = [], tasks = new Map(c.document.tasks.map(t => [t.id, {
      id: t.id, label: t.label, started: 0, finished: 0, failed: 0, blocked: 0,
      criticalCount: 0, successfulCriticalCount: 0, starts: [], ends: [], waits: [],
    }]));
    function step(batch = 100) {
      if (!Number.isInteger(batch) || batch < 1) fail("バッチサイズは正の整数です。");
      const stop = Math.min(c.config.iterations, completed+batch);
      for (; completed < stop; completed++) {
        const r = trial(c, rng);
        if (r.success) successes++;
        if (r.reached) { reached++; completionTimes.push(r.completion); }
        for (const [tid, timing] of r.taskTimes) {
          const s = tasks.get(tid);
          if (Number.isFinite(timing.start)) { s.started++; s.starts.push(timing.start); s.waits.push(timing.wait); }
          else s.blocked++;
          if (Number.isFinite(timing.end)) { s.finished++; s.ends.push(timing.end); }
          else if (Number.isFinite(timing.start)) s.failed++;
          if (r.critical.has(tid)) { s.criticalCount++; if (r.success) s.successfulCriticalCount++; }
        }
      }
      return { completed, total: c.config.iterations, done: completed === c.config.iterations };
    }
    function result() {
      if (completed !== c.config.iterations) fail("シミュレーションが完了していません。");
      if (cached) return cached;
      const completion = percentiles(completionTimes), maximum = completionTimes.at(-1) ?? 0;
      // Unconditional mission CDF: missing trials retain their probability mass.
      const cdf = [];
      let cursor = 0;
      for (let i=0; i<=20; i++) {
        const t = maximum*i/20;
        while (cursor < completionTimes.length && completionTimes[cursor] <= t) cursor++;
        cdf.push({ t, p: cursor/completed });
      }
      cached = { version: 1, model: "task-performance-dag", unit: c.document.time.unit,
        config: c.config, iterations: completed, successes, reached,
        successProbability: successes/completed, successInterval95: wilson(successes, completed),
        reachProbability: reached/completed, completion, cdf, warnings: c.warnings,
        tasks: [...tasks.values()].map(s => ({ id: s.id, label: s.label, started: s.started, finished: s.finished,
          failed: s.failed, blocked: s.blocked, start: percentiles(s.starts), end: percentiles(s.ends), wait: percentiles(s.waits),
          criticalCount: s.criticalCount, criticality: s.criticalCount/completed,
          criticalityGivenSuccess: successes ? s.successfulCriticalCount/successes : null })),
      };
      return cached;
    }
    return { step, result, compiled: c };
  }
  function run(document, options) { const job = createRun(document, options); job.step(job.compiled.config.iterations); return job.result(); }
  const api = { compile, trial, createRun, run, quantile, wilson };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MESimulation = api;
})(globalThis);
