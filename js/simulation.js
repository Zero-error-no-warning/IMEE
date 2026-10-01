/* Task performance -> mission effectiveness. No equipment/engagement physics. */
(function (root) {
  "use strict";
  const M = typeof module !== "undefined" && module.exports ? require("./model.js") : root.ME;
  const P = typeof module !== "undefined" && module.exports ? require("./performance.js") : root.MEPerformance;
  const fail = message => { throw new Error(message); };
  const finite = Number.isFinite;
  const unique = values => [...new Set(values)];
  function compile(document, options = {}) {
    const d=M.clone(document);M.validate(d);
    const config={iterations:1000,seed:1,deadline:null,successMode:"all",...d.simulation,...options};
    if(!["all","any"].includes(config.successMode))fail("成功条件はallまたはanyです。");
    if(!config.successStateIds?.length || config.successStateIds.some(id=>!M.get(d,"state",id)))fail("成功Stateを選択してください。");
    if(!Number.isInteger(config.iterations) || config.iterations<1 || config.iterations>100000)fail("試行数は1〜100,000です。");
    if(!Number.isInteger(config.seed) || config.seed<0 || config.seed>4294967295)fail("Seedが範囲外です。");
    if(config.deadline!=null)P.number(config.deadline,"期限",0,1e9);
    const links=d.causalLinks.filter(l=>l.simulation?.enabled), graph=M.dependencyGraph(d,true), {nodes,order}=graph;
    const overrides=config.taskOverrides || {};
    for(const [id,o] of Object.entries(overrides)){
      if(!M.get(d,"task",id) || !o || typeof o!=="object")fail("Task性能変更が不正です。");
      if("w" in o)fail("性能変更wは廃止されました。qを使用してください。");
      if(o.duration!==undefined)P.number(o.duration,"変更時間",0,1e9);
      if(o.q!==undefined)P.number(o.q,"変更品質",0,1);
    }
    for(const n of nodes.values()){
      n.predecessors=n.dependencies;
      if(n.type!=="task")continue;
      n.window=M.taskWindow(d,n.item);n.duration=n.window.end-n.window.start;
      n.junctions=[...(n.item.junctions || [])].sort((a,b)=>a.time-b.time);n.rank=0;
      if(n.junctions.some(j=>!j.simulation))fail("分岐の実行モードを指定してください: "+n.item.label);
      if(!n.item.toStateId && n.junctions.at(-1)?.simulation.mode==="probability" && Math.abs(n.junctions.at(-1).outcomes.reduce((v,o)=>v+o.probability,0)-1)>1e-10)fail("通常到達先がない最終確率分岐の確率合計は1です。");
    }
    function completionSources(id,seen=new Set()){
      if(seen.has(id))return [];seen.add(id);
      const n=nodes.get(id);if(n.type==="start")return [];
      return n.type==="task"?[id]:unique(n.dependencies.flatMap(p=>completionSources(p,seen)));
    }
    for(let i=0;i<=d.tasks.length;i++){
      let changed=false;
      for(const l of links.filter(l=>l.target.type==="junction"))for(const id of completionSources(l.source.id)){
        const target=nodes.get(l.target.taskId),rank=nodes.get(id).rank+1;
        if(target.rank<rank){target.rank=rank;changed=true;}
      }
      if(!changed)break;if(i===d.tasks.length)fail("同時刻の分岐作用に循環があります。");
    }
    const gates=new Map();
    for(const l of links.filter(l=>l.target.type==="junction")){
      let v=gates.get(l.source.id);if(!v)gates.set(l.source.id,v=new Set());v.add(l.target.taskId);
    }
    const cost=nodes.size+links.length+d.tasks.reduce((v,t)=>v+(t.junctions?.length || 0),0);
    if(cost*config.iterations>5000000)fail("総処理量を500万以下にしてください。");
    return {document:d,config,nodes,order,links,gates,cost,overrides,warnings:d.causalLinks.some(l=>!l.simulation?.enabled)?["実行未指定の作用線は表示専用です。"]:[]};
  }
  class Events {
    constructor(){this.heap=[];this.serial=0;}
    before(a,b){return a.time-b.time || a.priority-b.priority || a.serial-b.serial;}
    add(time,priority,fn){if(!finite(time))return;const e={time,priority,fn,serial:this.serial++},h=this.heap;h.push(e);let i=h.length-1;while(i){const p=(i-1)>>1;if(this.before(h[p],e)<=0)break;h[i]=h[p];i=p;}h[i]=e;}
    pop(){const h=this.heap,e=h[0],last=h.pop();if(h.length){let i=0;while(2*i+1<h.length){let j=2*i+1;if(j+1<h.length&&this.before(h[j+1],h[j])<0)j++;if(this.before(last,h[j])<=0)break;h[i]=h[j];i=j;}h[i]=last;}return e;}
  }
  function trial(c,rng) {
    const events=new Events(),times=new Map([...c.nodes.keys()].map(id=>[id,Infinity])),taskTimes=new Map(),stateQ=new Map(),causes=new Map(),stopped=new Set(),arrivals=new Map(),draws=new Map(),branchEvents=[],signalEvents=[];
    const graph=(id,time,parents=[],taskId=null,linkId=null)=>{causes.set(id,{time,parents,taskId,linkId});return id;};
    for(const n of c.order)if(n.type==="task"){
      draws.set(n.id,{duration:rng(),branches:n.junctions.map(()=>rng())});
      taskTimes.set(n.id,{start:Infinity,end:Infinity,duration:null,wait:null,q:null,qOut:null,status:"pending",stop:null});
    }
    const linkDraws=new Map(c.links.filter(l=>l.propagation.performanceModel).map(l=>[l.id,rng()]));
    const running=id=>taskTimes.get(id).status==="running";
    function cancel(id,time){const r=taskTimes.get(id);if(["pending","running"].includes(r.status)){r.status="cancelled";r.stop=time;}}
    function state(id,producer,time,q,cause,force=false){
      if(finite(times.get(id)))return false;
      let a=arrivals.get(id);if(!a)arrivals.set(id,a=new Map());a.set(producer,{time,q,cause,force});
      events.add(time,20,()=>resolveState(id,time));return true;
    }
    function resolveState(id,time){
      if(finite(times.get(id)))return;
      const n=c.nodes.get(id),a=arrivals.get(id);if(!a?.size)return;
      const gates=[...(c.gates.get(id) || [])];
      if(gates.some(tid=>!finite(taskTimes.get(tid).start)))return;
      const producers=n.dependencies.filter(pid=>c.nodes.get(pid).type!=="start");
      const all=n.item.simulation?.join!=="any";
      if(all && producers.some(pid=>!a.has(pid)))return;
      const values=[...a.values()].filter(x=>x.time<=time);
      if(!values.length || (stopped.has(n.item.actorId) && !values.some(x=>x.force)))return;
      const inputQ=(all?Math.min:Math.max)(...values.map(x=>x.q));
      // A fixed q only supplies quality for exogenous/root States, never resets a received result.
      const q=producers.length?inputQ:(n.item.simulation?.q ?? inputQ);
      times.set(id,time);stateQ.set(id,q);
      graph(id,time,unique([...values.filter(x=>x.time===time).map(x=>x.cause),...gates.filter(tid=>taskTimes.get(tid).start===time).map(tid=>"start:"+tid)]));
      for(const t of c.document.tasks)if(t.simulation?.cancelOnStateIds?.includes(id))cancel(t.id,time);
      for(const l of c.links)if(l.source.id===id)emit(l,time,q,id);
      scheduleStarts(time);
    }
    function taskOutput(n,elapsed){
      const r=taskTimes.get(n.id),sim=n.item.simulation || {};
      return r.q*(sim.enabled && c.overrides[n.id]?.duration===undefined ? P.quality(sim.performanceModel,r.q,elapsed) : sim.qualityRetention ?? 1);
    }
    function redirect(n,j,o,time,cause,stopActor=false,receivedQ){
      const r=taskTimes.get(n.id);if(!running(n.id))return false;
      r.status="branched";r.stop=time;r.end=time;r.qOut=receivedQ ?? taskOutput(n,time-r.start);times.set(n.id,time);
      const delay=o.delay ?? M.get(c.document,"state",o.toStateId).time-j.time;
      branchEvents.push({taskId:n.id,junctionId:j.id,outcomeStateId:o.toStateId,time,q:r.qOut});
      if(stopActor){const aid=M.get(c.document,"state",n.item.fromStateId).actorId;stopped.add(aid);for(const t of c.document.tasks)if(M.get(c.document,"state",t.fromStateId).actorId===aid)cancel(t.id,time);}
      events.add(time+delay,0,()=>state(o.toStateId,n.id,time+delay,r.qOut,cause,true));return true;
    }
    function emit(l,time,q,cause){
      const p=l.propagation,draw=p.performanceModel?P.outcome(p.performanceModel,q,linkDraws.get(l.id)):{duration:p.duration,qOut:q*(p.qualityRetention ?? 1)};
      const delay=draw.duration,event={linkId:l.id,emittedAt:time,delay:finite(delay)?delay:null,q,qOut:draw.qOut,time:finite(delay)?time+delay:null,status:"failed"};
      if(!finite(delay)){signalEvents.push(event);return;}
      events.add(time+delay,5,()=>{
        const at=time+delay,linkCause=graph("link:"+l.id,at,[cause],null,l.id);
        event.status="accepted";signalEvents.push(event);
        if(l.target.type==="state"){
          times.set(l.id,at);if(!state(l.target.id,l.id,at,draw.qOut,linkCause))event.status="late";
        }else{
          const target=c.nodes.get(l.target.taskId),r=taskTimes.get(target.id),j=target.junctions.find(j=>j.id===l.target.id),o=j.outcomes.find(o=>o.toStateId===l.target.outcomeStateId);
          if(r.status==="pending"){
            const error=new Error("暗黙の開始依存違反: Task開始前に分岐作用が到達しました。");error.validationPath="$.causalLinks["+c.document.causalLinks.findIndex(x=>x.id===l.id)+"]";error.validationFragment={link:l,task:target.item,arrival:at,start:r.start};throw error;
          }
          if(!redirect(target,j,o,at,linkCause,l.simulation?.stopTargetActor,draw.qOut))event.status="late";
        }
      });
    }
    function start(n,time){
      const r=taskTimes.get(n.id),sim=n.item.simulation || {},qi=sim.qInput || {}, required=M.startStateIds(n.item),qualityIds=qi.stateIds || [];
      if(r.status!=="pending" || stopped.has(M.get(c.document,"state",n.item.fromStateId).actorId))return;
      if(required.some(id=>!finite(times.get(id))))return;
      const available=qualityIds.filter(id=>finite(times.get(id)) && times.get(id)<=time);
      if(qualityIds.length && (qi.mode==="any"?!available.length:available.length!==qualityIds.length))return;
      const selected=available.length?available:[n.item.fromStateId];
      r.q=c.overrides[n.id]?.q ?? ((qi.mode==="any"?Math.max:Math.min)(...selected.map(id=>stateQ.get(id))));
      const draw=sim.enabled && c.overrides[n.id]?.duration===undefined ? P.outcome(sim.performanceModel,r.q,draws.get(n.id).duration) : {duration:c.overrides[n.id]?.duration ?? n.duration,qOut:r.q*(sim.qualityRetention ?? 1)};
      Object.assign(r,{start:time,duration:draw.duration,wait:time-times.get(n.item.fromStateId),status:"running",qOut:draw.qOut});
      times.set("start:"+n.id,time);
      const startCause=graph("start:"+n.id,time,unique([...required,...available]).filter(id=>times.get(id)===time));
      for(const [sid,gates] of c.gates)if(gates.has(n.id))events.add(time,20,()=>resolveState(sid,time));
      n.junctions.forEach((j,i)=>{
        if(j.simulation.mode!=="probability")return;
        const f=n.duration?(j.time-n.window.start)/n.duration:0,at=f===0?time:time+draw.duration*f;
        events.add(at,25,()=>{if(!running(n.id))return;const u=draws.get(n.id).branches[i];let sum=0;for(const o of j.outcomes){sum+=o.probability;if(u<sum){redirect(n,j,o,at,graph("branch:"+n.id,at,[startCause],n.id));break;}}});
      });
      events.add(time+draw.duration,30+n.rank*2,()=>{
        if(!running(n.id))return;r.status="completed";r.end=time+draw.duration;times.set(n.id,r.end);
        graph(n.id,r.end,[startCause],n.id);if(n.item.toStateId)state(n.item.toStateId,n.id,r.end,r.qOut,n.id);
      });
    }
    function scheduleStarts(time){events.add(time,1000000,()=>{for(const n of c.order)if(n.type==="task")start(n,time);});}
    for(const n of c.order)if(n.type==="state" && !n.dependencies.some(pid=>c.nodes.get(pid).type!=="start"))events.add(n.item.time,0,()=>state(n.id,"root",n.item.time,n.item.simulation?.q ?? 1,n.id));
    while(events.heap.length){const e=events.pop();e.fn();}
    for(const r of taskTimes.values())if(r.status==="pending")r.status="blocked";else if(r.status==="running")r.status="failed";
    const goals=c.config.successStateIds.map(id=>times.get(id)),completion=(c.config.successMode==="any"?Math.min:Math.max)(...goals),reached=finite(completion),success=reached && (c.config.deadline==null || completion<=c.config.deadline),critical=new Set(),criticalLinks=new Set();
    if(reached){const stack=c.config.successStateIds.filter(id=>times.get(id)===completion),visited=new Set();while(stack.length){const id=stack.pop();if(visited.has(id))continue;visited.add(id);const cause=causes.get(id);if(!cause)continue;if(cause.taskId)critical.add(cause.taskId);if(cause.linkId)criticalLinks.add(cause.linkId);stack.push(...cause.parents);}}
    return {success,reached,completion,times,taskTimes,stateQ,critical,criticalLinks,branchEvents,signalEvents};
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
      criticalCount: 0, successfulCriticalCount: 0, starts: [], ends: [], waits: [], qs: [], outputQs: [],
    }]));
    const branches = new Map(), signals = new Map(c.links.map(l => [l.id,{id:l.id,label:l.label,propagation:l.propagation?.performanceModel?"cdf":"fixed",accepted:0,late:0,failed:0,unavailable:0,criticalCount:0,successfulCriticalCount:0,delays:[],qs:[]} ]));
    let trace = null;
    function step(batch = 100) {
      if (!Number.isInteger(batch) || batch < 1) fail("バッチサイズは正の整数です。");
      const stop = Math.min(c.config.iterations, completed+batch);
      for (; completed < stop; completed++) {
        const r = trial(c, rng);
        if (!trace) trace = { success:r.success, completion:Number.isFinite(r.completion)?r.completion:null,
          states:[...r.times].filter(([id,time]) => c.nodes.get(id).type === "state" && Number.isFinite(time)).map(([id,time]) => ({id,time,q:r.stateQ.get(id)})),
          tasks:[...r.taskTimes].map(([id,t]) => ({id,...Object.fromEntries(Object.entries(t).map(([k,v]) => [k,typeof v === "number" && !Number.isFinite(v)?null:v]))})),
          branches:r.branchEvents, signals:r.signalEvents };
        if (r.success) successes++;
        if (r.reached) { reached++; completionTimes.push(r.completion); }
        for (const [tid, timing] of r.taskTimes) {
          const s = tasks.get(tid);
          if (Number.isFinite(timing.start)) { s.started++; s.starts.push(timing.start); s.waits.push(timing.wait); s.qs.push(timing.q); }
          if (timing.status === "blocked") s.blocked++;
          if (timing.status === "failed") s.failed++;
          if (timing.status === "cancelled") s.cancelled++;
          if (timing.status === "branched") s.branched++;
          if (timing.status === "completed") { s.finished++; s.ends.push(timing.end); }
          if (r.critical.has(tid)) { s.criticalCount++; if (r.success) s.successfulCriticalCount++; }
        }
        for(const [tid,timing] of r.taskTimes)if(["completed","branched"].includes(timing.status) && finite(timing.qOut))tasks.get(tid).outputQs.push(timing.qOut);
        for(const b of r.branchEvents) { const key=b.taskId+":"+b.junctionId+":"+b.outcomeStateId; const entry=branches.get(key) || {...b,count:0}; entry.count++; branches.set(key,entry); }
        for(const e of r.signalEvents) {const s=signals.get(e.linkId);s[e.status]++;if(finite(e.qOut))s.qs.push(e.qOut);if(e.delay!==null)s.delays.push(e.delay);}
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
      cached = { version: 3, model: "quality-performance-events", unit: c.document.time.unit,
        config: c.config, iterations: completed, successes, reached,
        successProbability: successes/completed, successInterval95: wilson(successes, completed),
        reachProbability: reached/completed, completion, cdf, warnings: c.warnings,
        branches: [...branches.values()].map(({time,...b}) => b),
        signals:[...signals.values()].map(({delays,qs,successfulCriticalCount,...s}) => ({...s,
          delay:percentiles(delays),q:percentiles(qs),criticality:s.criticalCount/completed,
          criticalityGivenSuccess:successes?successfulCriticalCount/successes:null})), trace,
        tasks: [...tasks.values()].map(s => ({ id: s.id, label: s.label, started: s.started, finished: s.finished,
          failed: s.failed, blocked: s.blocked, cancelled:s.cancelled, branched:s.branched, q:percentiles(s.qs), qOut:percentiles(s.outputQs), start: percentiles(s.starts), end: percentiles(s.ends), wait: percentiles(s.waits),
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
