/* Task performance -> mission effectiveness. No equipment/engagement physics. */
(function (root) {
  "use strict";
  const M = typeof module !== "undefined" && module.exports ? require("./model.js") : root.ME;
  const P = typeof module !== "undefined" && module.exports ? require("./performance.js") : root.MEPerformance;
  const fail = message => { throw new Error(message); };
  const finite = Number.isFinite;
  const unique = values => [...new Set(values)];
  function compile(document, options = {}) {
    const d = M.clone(document); M.validate(d);
    const config = { iterations: 1000, seed: 1, deadline: null, successMode: "all", ...d.simulation, ...options };
    if (!["all", "any"].includes(config.successMode)) fail("Mission成功条件はall（AND）またはany（OR）です。");
    if (!Array.isArray(config.successStateIds) || !config.successStateIds.length || config.successStateIds.some(sid => !M.get(d,"state",sid))) fail("Mission成功Stateを1件以上選択してください。");
    if (!Number.isInteger(config.iterations) || config.iterations < 1 || config.iterations > 100000) fail("試行数は1〜100,000の整数です。");
    if (!Number.isInteger(config.seed) || config.seed < 0 || config.seed > 4294967295) fail("Seedは0〜4,294,967,295の整数です。");
    if (config.deadline != null) P.number(config.deadline,"Mission期限",0,1e9);
    const links = d.causalLinks.filter(c => c.simulation?.enabled);
    const cost = d.tasks.length+d.states.length+links.length+d.tasks.reduce((n,t) => n+(t.junctions?.length || 0),0);
    if (config.iterations*cost > 5000000) fail("State・Task・作用線・分岐数 × 試行数を500万以下にしてください。");
    const overrides = config.taskOverrides || {};
    for (const [id,o] of Object.entries(overrides)) {
      if (!M.get(d,"task",id) || !o || typeof o !== "object") fail("Task性能変更が不正です。");
      if (o.duration !== undefined) P.number(o.duration,"変更Task時間",0,1e9);
      if (o.w !== undefined) P.number(o.w,"変更w",0,1);
    }
    const nodes = new Map();
    for (const s of d.states) nodes.set(s.id,{id:s.id,type:"state",item:s,predecessors:[],successors:[]});
    for (const t of d.tasks) {
      const window=M.taskWindow(d,t), junctions=[...(t.junctions || [])].sort((a,b) => a.time-b.time);
      if (junctions.some(j => !j.simulation)) fail("分岐Taskには明示的な実行モードが必要です: "+t.label);
      if (unique(junctions.map(j => j.simulation.mode)).length>1) fail("同一Task内の分岐実行モードは統一してください。");
      if (!t.toStateId && junctions.at(-1)?.simulation.mode === "probability" && Math.abs(junctions.at(-1).outcomes.reduce((n,o) => n+o.probability,0)-1)>1e-10) fail("通常接続先がない最終分岐の確率合計は1です。");
      nodes.set(t.id,{id:t.id,type:"task",item:t,junctions,window,duration:window.end-window.start,
        predecessors:unique([t.fromStateId,...(t.simulation?.waitForStateIds || []),...(t.simulation?.wInput?.stateIds || [])]),successors:[],inputs:[],outputs:[],rank:0,distributions:new Map()});
    }
    for (const t of d.tasks) for (const sid of unique([t.toStateId,...(t.junctions || []).flatMap(j => j.outcomes.map(o => o.toStateId))].filter(Boolean))) nodes.get(sid).predecessors.push(t.id);
    // State-producing links participate in the DAG and joins, so their destinations
    // never become initial States just because there is no incoming Task.
    for (const l of links) if (l.simulation.type === "state") {
      nodes.set(l.id,{id:l.id,type:"link",item:l,predecessors:l.source.type === "actor" ? [] : [l.source.id],successors:[]});
      nodes.get(l.target.id).predecessors.push(l.id);
    }
    for (const l of links) {
      const source=nodes.get(l.source.id), target=nodes.get(l.target.id);
      l.delay=l.simulation.delay ?? M.endpoint(d,l.target).time-M.endpoint(d,l.source).time;
      l.distributions=new Map();
      if (l.source.type === "task") {
        if (l.source.time<source.window.start || l.source.time>source.window.end) fail("実行作用線の出力端点はTask期間内です: "+l.label);
        source.outputs.push(l);
      }
      if (l.simulation.type === "w" && target.type === "task") {
        target.inputs.push(l);
        if (target.item.simulation?.wInput?.waitForLinks && l.source.type !== "actor") target.predecessors.push(l.source.id);
      }
      if (l.simulation.type === "branch" && l.target.time !== target.junctions.find(j => j.id === l.simulation.junctionId).time) fail("作用分岐の入力端点は指定Junction時刻にしてください。");
    }
    // Potential branches participate in readiness validation, effects themselves do not create a wait dependency.
    for (const n of nodes.values()) { n.predecessors=unique(n.predecessors); for (const pid of n.predecessors) nodes.get(pid).successors.push(n.id); }
    const pending=new Map([...nodes.values()].map(n => [n.id,n.predecessors.length]));
    const order=[...nodes.values()].filter(n => !n.predecessors.length);
    for (let i=0;i<order.length;i++) for (const id of order[i].successors) { pending.set(id,pending.get(id)-1); if (!pending.get(id)) order.push(nodes.get(id)); }
    if (order.length !== nodes.size) fail("Task / State到達作用 / 追加依存State / w入力に循環があります。ループの実行は未対応です。");
    // At equal timestamps, source completions and their effects precede receiver completions.
    const effects=links.filter(l => l.simulation.type === "branch");
    function completionSources(id) {
      const n=nodes.get(id);
      return n.type === "task" ? [id] : unique(n.predecessors.flatMap(completionSources));
    }
    for (let i=0;i<=d.tasks.length;i++) {
      let changed=false;
      for (const l of effects) {
        const sources=l.source.type === "actor" ? [] : completionSources(l.source.id);
        for (const id of sources) { const target=nodes.get(l.target.id), rank=nodes.get(id).rank+1; if(target.rank<rank) {target.rank=rank;changed=true;} }
      }
      if(!changed) break;
      if(i===d.tasks.length) fail("同時刻の相互作用に循環があります。");
    }
    // Validate every possible propagated value, rather than silently clamping an uncovered w.
    const memo=new Map(), visiting=new Set();
    function values(id) {
      if(memo.has(id)) return memo.get(id);
      if(visiting.has(id)) return [0,1];
      visiting.add(id);
      const n=nodes.get(id), sim=n.item.simulation || {}; let v=[];
      if(n.type === "link") v=n.item.simulation.w !== undefined ? [n.item.simulation.w] : n.item.source.type === "actor" ? [0] : values(n.item.source.id);
      else if(n.type === "task") {
        if(sim.outputW !== undefined) v=[sim.outputW];
        else if(overrides[id]?.w !== undefined) v=[overrides[id].w];
        else v=[sim.w ?? 0,...(sim.wInput?.stateIds || []).flatMap(values),...n.inputs.flatMap(l => l.simulation.w !== undefined ? [l.simulation.w] : values(l.source.id))];
      } else v=sim.w !== undefined ? [sim.w] : [...(n.predecessors.length?n.predecessors.flatMap(values):[0]),...links.filter(l => l.target.id===id && l.simulation.type==="w").flatMap(l => l.simulation.w !== undefined ? [l.simulation.w] : values(l.source.id))];
      visiting.delete(id); v=unique(v); memo.set(id,v); return v;
    }
    for(const t of d.tasks) if(t.simulation?.enabled && overrides[t.id]?.duration === undefined) {
      const n=nodes.get(t.id), wi=t.simulation.wInput;
      const inputs=overrides[t.id]?.w !== undefined ? [overrides[t.id].w] : [t.simulation.w ?? 0,...(wi?.stateIds || []).flatMap(values),...n.inputs.flatMap(l => l.simulation.w !== undefined ? [l.simulation.w] : values(l.source.id))];
      for(const w of unique(inputs)) n.distributions.set(w,P.distribution(t.simulation.performanceModel,w));
    }
    for(const l of links) if(l.simulation.propagation?.enabled) {
      const p=l.simulation.propagation, inputs=p.w !== undefined ? [p.w] : l.source.type === "actor" ? [l.simulation.w ?? 0] : values(l.source.id);
      for(const w of unique(inputs)) l.distributions.set(w,P.distribution(p.performanceModel,w));
    }
    return {document:d,config,nodes,order,links,cost,overrides,warnings:d.causalLinks.some(l => !l.simulation?.enabled) ? ["実行未指定の作用線は表示専用です。依存・w・分岐・State到達には適用しません。"] : []};
  }
  class Events {
    constructor(){this.heap=[];this.serial=0;}
    before(a,b){return a.time-b.time || a.priority-b.priority || a.serial-b.serial;}
    add(time,priority,fn){if(!finite(time)) return; const e={time,priority,fn,serial:this.serial++}, h=this.heap; h.push(e); let i=h.length-1; while(i){const p=(i-1)>>1;if(this.before(h[p],e)<=0)break;h[i]=h[p];i=p;}h[i]=e;}
    pop(){const h=this.heap,e=h[0],last=h.pop();if(h.length){let i=0;while(2*i+1<h.length){let j=2*i+1;if(j+1<h.length&&this.before(h[j+1],h[j])<0)j++;if(this.before(last,h[j])<=0)break;h[i]=h[j];i=j;}h[i]=last;}return e;}
  }
  function trial(c,rng) {
    const events=new Events(), times=new Map([...c.nodes.keys()].map(id => [id,Infinity])), taskTimes=new Map(), stateW=new Map(), causes=new Map(), stopped=new Set(), arrivals=new Map(), inputs=new Map(), held=new Map(), draws=new Map(), branchEvents=[], signalEvents=[];
    for(const n of c.order) if(n.type === "task") {
      draws.set(n.id,{duration:rng(),branches:n.junctions.map(() => rng())});
      taskTimes.set(n.id,{start:Infinity,end:Infinity,duration:null,wait:null,w:null,status:"pending",stop:null});
      inputs.set(n.id,new Map());
    }
    // Reserve link draws after Task draws, even if their source never emits.
    const linkDraws=new Map(c.links.filter(l=>l.simulation.propagation?.enabled).map(l=>[l.id,rng()]));
    const graph=(id,time,parents=[],taskId=null,linkId=null) => {causes.set(id,{time,parents,taskId,linkId});return id;};
    const outW=n => n.item.simulation?.outputW ?? taskTimes.get(n.id).w ?? 0;
    const running=id => taskTimes.get(id).status === "running";
    function cancel(id,time) {const r=taskTimes.get(id);if(r.status === "pending" || r.status === "running") {r.status="cancelled";r.stop=time;}}
    function state(id,producer,time,w,cause,force=false) {
      const n=c.nodes.get(id);
      if(stopped.has(n.item.actorId) && !force) return false;
      if(finite(times.get(id))) return false;
      let a=arrivals.get(id); if(!a) arrivals.set(id,a=new Map()); a.set(producer,{time,w,cause});
      if(n.predecessors.length && n.item.simulation?.join !== "any" && !n.predecessors.every(pid => a.has(pid))) return true;
      times.set(id,time);
      stateW.set(id,n.item.simulation?.w ?? Math.max(...[...a.values()].map(x => x.w),stateW.get(id) ?? 0));
      graph(id,time,[...a.values()].filter(x => x.time===time).map(x => x.cause));
      for(const t of c.document.tasks) if(t.simulation?.cancelOnStateIds?.includes(id)) cancel(t.id,time);
      for(const l of c.links) if(l.source.type === "state" && l.source.id === id) emit(l,time,stateW.get(id),id);
      scheduleStarts(time);
      return true;
    }
    function redirect(n,j,o,time,cause,stopActor=false) {
      const r=taskTimes.get(n.id); if(!running(n.id)) return false;
      r.status="branched";r.stop=time;r.end=time;times.set(n.id,time);
      const delay=o.delay ?? M.get(c.document,"state",o.toStateId).time-j.time;
      branchEvents.push({taskId:n.id,junctionId:j.id,outcomeStateId:o.toStateId,time});
      if(stopActor){const aid=M.get(c.document,"state",n.item.fromStateId).actorId;stopped.add(aid);for(const t of c.document.tasks) if(M.get(c.document,"state",t.fromStateId).actorId===aid)cancel(t.id,time);}
      events.add(time+delay,0,() => state(o.toStateId,n.id,time+delay,outW(n),cause,true));
      return true;
    }
    function emit(l,time,w,cause) {
      const sim=l.simulation, p=sim.propagation, inputW=p?.w ?? w;
      if(p?.enabled && !l.distributions.has(inputW)) l.distributions.set(inputW,P.distribution(p.performanceModel,inputW));
      const delay=p?.enabled ? P.sample(l.distributions.get(inputW),linkDraws.get(l.id)) : l.delay;
      const event={linkId:l.id,emittedAt:time,delay:finite(delay)?delay:null,w:inputW,time:finite(delay)?time+delay:null,status:"failed"};
      if(!finite(delay)) {signalEvents.push(event);return;}
      events.add(time+delay,1,() => {
        const at=time+delay, target=c.nodes.get(l.target.id);event.status="accepted";signalEvents.push(event);
        const linkCause=graph("link:"+l.id,at,[cause],null,l.id);
        if(sim.type === "w") {
          const value=sim.w ?? w;
          if(target.type === "state") { if(target.item.simulation?.w === undefined) stateW.set(target.id,Math.max(stateW.get(target.id) ?? 0,value)); }
          else {
            const r=taskTimes.get(target.id);
            if(r.status !== "pending") event.status="late";
            else {inputs.get(target.id).set(l.id,{w:value,time:at,cause:linkCause});scheduleStarts(at);}
          }
        } else if(sim.type === "state") {
          times.set(l.id,at);
          if(!state(target.id,l.id,at,sim.w ?? w,linkCause)) event.status="late";
        } else {
          const r=taskTimes.get(target.id), j=target.junctions.find(j => j.id===sim.junctionId), o=j.outcomes.find(o => o.toStateId===sim.outcomeStateId);
          if(r.status === "pending" && sim.holdUntilStart) {let h=held.get(target.id);if(!h)held.set(target.id,h=[]);h.push({l,j,o,cause:linkCause,event});event.status="held";}
          else if(!redirect(target,j,o,at,linkCause,sim.stopTargetActor)) event.status=r.status === "pending" ? "early" : "late";
        }
      });
    }
    function start(n,time) {
      const r=taskTimes.get(n.id), sim=n.item.simulation || {}, wi=sim.wInput || {}, incoming=inputs.get(n.id);
      if(r.status !== "pending" || stopped.has(M.get(c.document,"state",n.item.fromStateId).actorId))return;
      const required=unique([n.item.fromStateId,...(sim.waitForStateIds || []),...(wi.stateIds || [])]);
      if(required.some(id => !finite(times.get(id))) || (wi.waitForLinks && n.inputs.some(l => !incoming.has(l.id))))return;
      const deps=[...required.map(id => ({time:times.get(id),cause:id})),...(wi.waitForLinks ? [...incoming.values()] : [])];
      const ready=Math.max(...deps.map(x => x.time));if(ready>time)return;
      const values=[...(wi.stateIds || []).map(id => stateW.get(id) ?? 0),...[...incoming.values()].map(x => x.w)];
      r.w=c.overrides[n.id]?.w ?? (values.length ? Math.max(...values) : sim.w ?? 0);
      if(sim.enabled && c.overrides[n.id]?.duration === undefined && !n.distributions.has(r.w)) n.distributions.set(r.w,P.distribution(sim.performanceModel,r.w));
      const duration=c.overrides[n.id]?.duration ?? (sim.enabled ? P.sample(n.distributions.get(r.w),draws.get(n.id).duration) : n.duration);
      Object.assign(r,{start:time,duration,wait:time-times.get(n.item.fromStateId),status:"running"});
      const startCause=graph("start:"+n.id,time,deps.filter(x => x.time===ready).map(x => x.cause));
      graph(n.id,time+duration,[startCause],n.id);
      for(const l of n.outputs) {const f=n.duration ? (l.source.time-n.window.start)/n.duration : 0, at=f===0 ? time : time+duration*f;
        events.add(at,0,() => {if(running(n.id))emit(l,at,outW(n),graph("port:"+l.id,at,[startCause],n.id));});}
      n.junctions.forEach((j,i) => {if(j.simulation.mode !== "probability")return;
        const f=n.duration ? (j.time-n.window.start)/n.duration : 0,at=f===0 ? time : time+duration*f;
        events.add(at,2,() => {if(!running(n.id))return;const u=draws.get(n.id).branches[i];let sum=0;for(const o of j.outcomes){sum+=o.probability;if(u<sum){redirect(n,j,o,at,graph("branch:"+n.id,at,[startCause],n.id));break;}}});
      });
      events.add(time+duration,3+n.rank*2,() => {
        if(!running(n.id))return;
        r.status="completed";r.end=time+duration;times.set(n.id,r.end);
        if(n.item.toStateId)state(n.item.toStateId,n.id,r.end,outW(n),n.id);
      });
      const h=held.get(n.id);if(h)for(const x of h){const parents=causes.get(x.cause).time===time?[startCause,x.cause]:[startCause];x.event.status=redirect(n,x.j,x.o,time,graph("held:"+x.l.id,time,parents),x.l.simulation.stopTargetActor)?"accepted":"late";}
    }
    function scheduleStarts(time){events.add(time,1000000,() => {for(const n of c.order)if(n.type === "task")start(n,time);});}
    for(const n of c.order)if(n.type === "state" && !n.predecessors.length) events.add(n.item.time,0,() => state(n.id,"root",n.item.time,n.item.simulation?.w ?? 0,n.id));
    for(const l of c.links)if(l.source.type === "actor")emit(l,l.source.time,l.simulation.w ?? 0,graph("actor:"+l.id,l.source.time));
    while(events.heap.length){const e=events.pop();e.fn();}
    for(const r of taskTimes.values()) {if(r.status === "pending")r.status="blocked";else if(r.status === "running")r.status="failed";}
    const goals=c.config.successStateIds.map(id => times.get(id)), completion=c.config.successMode === "any" ? Math.min(...goals) : Math.max(...goals),reached=finite(completion),success=reached && (c.config.deadline == null || completion<=c.config.deadline),critical=new Set(),criticalLinks=new Set();
    if(reached){const stack=c.config.successStateIds.filter(id => times.get(id)===completion),visited=new Set();while(stack.length){const id=stack.pop();if(visited.has(id))continue;visited.add(id);const cause=causes.get(id);if(!cause)continue;if(cause.taskId)critical.add(cause.taskId);if(cause.linkId)criticalLinks.add(cause.linkId);stack.push(...cause.parents);}}
    return {success,reached,completion,times,taskTimes,critical,criticalLinks,branchEvents,signalEvents};
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
      id: t.id, label: t.label, started: 0, finished: 0, failed: 0, blocked: 0, cancelled: 0, branched: 0,
      criticalCount: 0, successfulCriticalCount: 0, starts: [], ends: [], waits: [], ws: [],
    }]));
    const branches = new Map(), signals = new Map(c.links.map(l => [l.id,{id:l.id,label:l.label,propagation:l.simulation.propagation?.enabled?"cdf":"fixed",accepted:0,early:0,late:0,held:0,failed:0,unavailable:0,criticalCount:0,successfulCriticalCount:0,delays:[],ws:[]} ]));
    let trace = null;
    function step(batch = 100) {
      if (!Number.isInteger(batch) || batch < 1) fail("バッチサイズは正の整数です。");
      const stop = Math.min(c.config.iterations, completed+batch);
      for (; completed < stop; completed++) {
        const r = trial(c, rng);
        if (!trace) trace = { success:r.success, completion:Number.isFinite(r.completion)?r.completion:null,
          states:[...r.times].filter(([id,time]) => c.nodes.get(id).type === "state" && Number.isFinite(time)).map(([id,time]) => ({id,time})),
          tasks:[...r.taskTimes].map(([id,t]) => ({id,...Object.fromEntries(Object.entries(t).map(([k,v]) => [k,typeof v === "number" && !Number.isFinite(v)?null:v]))})),
          branches:r.branchEvents, signals:r.signalEvents };
        if (r.success) successes++;
        if (r.reached) { reached++; completionTimes.push(r.completion); }
        for (const [tid, timing] of r.taskTimes) {
          const s = tasks.get(tid);
          if (Number.isFinite(timing.start)) { s.started++; s.starts.push(timing.start); s.waits.push(timing.wait); s.ws.push(timing.w); }
          if (timing.status === "blocked") s.blocked++;
          if (timing.status === "failed") s.failed++;
          if (timing.status === "cancelled") s.cancelled++;
          if (timing.status === "branched") s.branched++;
          if (timing.status === "completed") { s.finished++; s.ends.push(timing.end); }
          if (r.critical.has(tid)) { s.criticalCount++; if (r.success) s.successfulCriticalCount++; }
        }
        for(const b of r.branchEvents) { const key=b.taskId+":"+b.junctionId+":"+b.outcomeStateId; const entry=branches.get(key) || {...b,count:0}; entry.count++; branches.set(key,entry); }
        for(const e of r.signalEvents) {const s=signals.get(e.linkId);s[e.status]++;s.ws.push(e.w);if(e.delay!==null)s.delays.push(e.delay);}
        for(const id of r.criticalLinks) {const s=signals.get(id);s.criticalCount++;if(r.success)s.successfulCriticalCount++;}
        const delivered=new Set(r.signalEvents.map(e => e.linkId)); for(const l of c.links) if(!delivered.has(l.id))signals.get(l.id).unavailable++;
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
      cached = { version: 2, model: "task-performance-events", unit: c.document.time.unit,
        config: c.config, iterations: completed, successes, reached,
        successProbability: successes/completed, successInterval95: wilson(successes, completed),
        reachProbability: reached/completed, completion, cdf, warnings: c.warnings,
        branches: [...branches.values()].map(({time,...b}) => b),
        signals:[...signals.values()].map(({delays,ws,successfulCriticalCount,...s}) => ({...s,
          delay:percentiles(delays),w:percentiles(ws),criticality:s.criticalCount/completed,
          criticalityGivenSuccess:successes?successfulCriticalCount/successes:null})), trace,
        tasks: [...tasks.values()].map(s => ({ id: s.id, label: s.label, started: s.started, finished: s.finished,
          failed: s.failed, blocked: s.blocked, cancelled:s.cancelled, branched:s.branched, w:percentiles(s.ws), start: percentiles(s.starts), end: percentiles(s.ends), wait: percentiles(s.waits),
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
