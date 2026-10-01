/* IMEE v3: pure mission data and operations. No DOM or runtime dependencies. */
(function (root) {
  "use strict";
  const P = typeof module !== "undefined" && module.exports ? require("./performance.js") : root.MEPerformance;
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const id = (p) =>
    `${p}-${globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + "-" + Math.random().toString(36).slice(2)}`;
  const collections = {
    actor: "actors",
    state: "states",
    task: "tasks",
    causalLink: "causalLinks",
    technology: "technologies",
    binding: "bindings",
  };
  const technologyStatuses = [
    "existing",
    "research",
    "planned",
    "gap",
    "unknown",
  ];
  let validationContext = null;
  const fail = (message, path, fragment) => {
    const error = new Error(message);
    error.name = "MissionValidationError";
    const context = path ? { path, fragment } : validationContext;
    if (context) {
      error.validationPath = context.path;
      try { error.validationFragment = clone(context.fragment); }
      catch (_) { error.validationFragment = context.fragment; }
    }
    throw error;
  };
  const context = (path, fragment) => { validationContext = { path, fragment }; };
  const get = (d, type, id) => type === "junction" ? d.tasks.flatMap(t=>t.junctions || []).find(j=>j.id===id) : d[collections[type]]?.find((x) => x.id === id);
  const snap = (n, step) => Math.round(n / step) * step;
  const actorPalette = ["#a75353", "#236d78", "#8061a8", "#a56c24", "#397aa0", "#538447", "#a55387", "#596a86"];
  function actorColor(d, actor) {
    if (actor?.color) return actor.color;
    const index = d.actors.indexOf(actor);
    return actorPalette[(index < 0 ? d.actors.length : index) % actorPalette.length];
  }
  function defaults(d) {
    d.actors?.forEach(a => { a.color ??= actorColor(d, a); });
    d.technologies ??= [];
    d.bindings ??= [];
    d.views ??= {};
    const v = (d.views.main ??= {});
    v.collapsedActors ??= [];
    v.actorOrder ??= d.actors.map((a) => a.id);
    v.zoom ??= 1;
    v.visibleTimeRange ??= { start: 0, end: d.time.duration };
    v.filters = {
      technology: true,
      causalLink: true,
      quiet: true,
      implicitDependencies: false,
      ...v.filters,
    };
    v.laneHeight ??= 64;
    v.collapsedLayout ??= "compact";
    v.mode ??= "mission";
    validationContext = null;
    return d;
  }
  function taskWindow(d, t) {
    const start = get(d, "state", t.fromStateId)?.time;
    return {
      start,
      end: t.toStateId
        ? get(d, "state", t.toStateId)?.time
        : Math.max(...(t.junctions || []).map((j) => j.time)),
    };
  }
  function endpoint(d, p) {
    if (!p) return;
    if (p.type === "state") {
      const s = get(d, "state", p.id);
      return s && { actorId: s.actorId, time: s.time };
    }
    if (p.type === "junction") {
      const t=get(d,"task",p.taskId), j=t?.junctions?.find(j=>j.id===p.id);
      return j && {actorId:get(d,"state",t.fromStateId)?.actorId,time:j.time};
    }
  }
  function endpointActor(d, p) { return endpoint(d,p)?.actorId; }
  function startStateIds(t) { return [...new Set([t.fromStateId,...(t.simulation?.waitForStateIds || [])])]; }
  function nominalStart(d,t) {
    const base=Math.max(...startStateIds(t).map(id=>get(d,"state",id).time));
    const qi=t.simulation?.qInput, qs=qi?.stateIds || [];
    return qs.length ? Math.max(base,(qi.mode === "any" ? Math.min : Math.max)(...qs.map(id=>get(d,"state",id).time))) : base;
  }
  function implicitDependencies(d) {
    return d.causalLinks.filter(c=>c.target.type==="junction").map(c=>({
      sourceStateId:c.source.id,targetTaskId:c.target.taskId,linkId:c.id,
      startStateIds:startStateIds(get(d,"task",c.target.taskId))
    }));
  }
  function dependencyGraph(d, executableOnly=false) {
    const nodes=new Map(), add=(id,type,item,dependencies=[])=>nodes.set(id,{id,type,item,dependencies:[...new Set(dependencies)]});
    for(const st of d.states)add(st.id,"state",st);
    for(const t of d.tasks){add("start:"+t.id,"start",t,[...startStateIds(t),...(t.simulation?.qInput?.stateIds || [])]);add(t.id,"task",t,["start:"+t.id]);}
    for(const t of d.tasks)for(const id of new Set([t.toStateId,...(t.junctions || []).flatMap(j=>j.outcomes.map(o=>o.toStateId))].filter(Boolean)))nodes.get(id).dependencies.push(t.id);
    for(const c of d.causalLinks.filter(c=>!executableOnly || c.simulation?.enabled)){
      if(c.target.type==="state"){add(c.id,"link",c,[c.source.id]);nodes.get(c.target.id).dependencies.push(c.id);}
      else nodes.get(c.source.id).dependencies.push("start:"+c.target.taskId);
    }
    const done=new Set(), visiting=new Set(), order=[], stack=[];
    function visit(id){
      if(done.has(id))return;
      if(visiting.has(id)){
        const cycle=[...stack.slice(stack.indexOf(id)),id];
        const links=d.causalLinks.filter(c=>cycle.includes(c.source.id) && cycle.includes("start:"+c.target.taskId));
        fail("暗黙の開始依存を含む循環があります: "+cycle.join(" → "),"$.causalLinks",{cycle,causalLinks:links,items:cycle.map(id=>nodes.get(id)?.item)});
      }
      visiting.add(id);stack.push(id);
      for(const p of nodes.get(id).dependencies)visit(p);
      stack.pop();visiting.delete(id);done.add(id);order.push(nodes.get(id));
    }
    for(const id of nodes.keys())visit(id);
    return {nodes,order};
  }

  function causalEndpoint(d, c, side = "target") {
    const source = endpoint(d, c.source);
    if (!source) return;
    if (side === "source") return source;
    const actorId = endpointActor(d, c.target);
    const duration = c.propagation?.duration;
    if (!actorId || !Number.isFinite(duration)) return;
    return { actorId, time: source.time + duration };
  }
  function causalArrivalTime(d, c) {
    return causalEndpoint(d, c, "target")?.time;
  }
  function validate(d) {
    try {
    validationContext = { path: "$", fragment: d };
    if (!d || d.version !== 3)
      fail(
        "version: 3 のJSONが必要です。旧w・極性・Task/Actor作用端点は使用できません。",
      );
    const str = (s, n, empty = false) => {
      if (typeof s !== "string" || (!empty && !s.trim()) || s.length > 10000)
        fail(n + "が不正です。");
    };
    const num = (n, label, min = 0, max = d.time?.duration) => {
      if (typeof n !== "number" || !Number.isFinite(n) || n < min || n > max)
        fail(label + "が範囲外です。");
    };
    const opt = (v, choices, label) => {
      if (v !== undefined && !choices.includes(v)) fail(label + "が不正です。");
    };
    str(d.title, "ミッション名");
    if (!d.time) fail("時間設定が必要です。");
    num(d.time.duration, "全期間", 1e-9, 1e6);
    num(d.time.snap, "スナップ", 1e-9, d.time.duration);
    opt(d.time.unit, ["seconds", "minutes", "hours"], "時間単位");
    if (!d.time.unit) fail("時間単位が必要です。");
    for (const k of ["actors", "states", "tasks", "causalLinks"])
      if (!Array.isArray(d[k])) fail(k + "配列が必要です。");
    if (d.transitions || d.interactions)
      fail(
        "旧transitions / interactionsは使用できません。tasks / causalLinksを使用してください。",
      );
    const ids = new Set();
    const register = (x) => {
      if (!x || typeof x !== "object") fail("項目が不正です。");
      str(x.id, "ID");
      if (ids.has(x.id)) fail("ID重複: " + x.id);
      ids.add(x.id);
      if (x.notes !== undefined) str(x.notes, "備考", true);
    };
    for (const k of Object.values(collections)) {
      if (d[k] === undefined && ["technologies", "bindings"].includes(k))
        continue;
      if (!Array.isArray(d[k]) || d[k].length > 10000)
        fail(k + "は10,000件以下の配列です。");
      d[k].forEach((x,i)=>{context(`$.${k}[${i}]`,x);register(x);});
    }
    for (const [i, a] of d.actors.entries()) {
      context(`$.actors[${i}]`, a);
      str(a.name, "Actor名");
      opt(a.side, ["friendly", "hostile", "neutral"], "所属");
      if (!a.side) fail("所属が必要です。");
      if (a.color !== undefined && !/^#[0-9a-f]{6}$/i.test(a.color)) fail("Actorの色は#RRGGBBで指定してください。");
      if (a.isGroup !== undefined && typeof a.isGroup !== "boolean")
        fail("isGroupは真偽値です。");
      const seen = new Set([a.id]);
      let p = a.parentId;
      while (p) {
        const parent = get(d, "actor", p);
        if (!parent || seen.has(p)) fail("Actorの親参照または階層が不正です。");
        seen.add(p);
        p = parent.parentId;
      }
      if ("collapsed" in a)
        fail("折りたたみはviews.main.collapsedActorsへ保存してください。");
    }
    const status = (x) => {
      opt(x.status, ["actual", "planned", "proposed"], "区分");
      if (x.proposed !== undefined && typeof x.proposed !== "boolean")
        fail("proposedは真偽値です。");
      if (x.kind !== undefined) str(x.kind, "分類", true);
    };
    for (const [i, s] of d.states.entries()) {
      context(`$.states[${i}]`, s);
      str(s.name, "State名");
      if (!get(d, "actor", s.actorId)) fail("StateのActorが存在しません。");
      num(s.time, "State.time");
      if ("start" in s || "end" in s)
        fail("Stateはtimeの一点です。start / endは使用できません。");
      status(s);
      opt(s.activity, ["active", "quiet"], "活動");
      opt(s.phase, ["other", "decision"], "役割");
      if (s.simulation !== undefined) {
        if (!s.simulation || typeof s.simulation !== "object" || Array.isArray(s.simulation)) fail("State.simulationが不正です。");
        if ("w" in s.simulation) fail("State.wは廃止されました。qを使用してください。");
        if (s.simulation.q !== undefined) P.number(s.simulation.q, "State品質q", 0, 1);
        opt(s.simulation.join, ["all", "any"], "State合流モード");
      }
    }
    for (const [i, t] of d.tasks.entries()) {
      context(`$.tasks[${i}]`, t);
      status(t);
      P.validateTask(t.simulation, t.label || t.id);
      if(t.simulation && "q" in t.simulation)fail("Taskの入力qはStateから取得します。固定qは初期Stateへ指定してください。");
      const refs = (ids, label) => {
        if (ids !== undefined && (!Array.isArray(ids) || ids.length > 10000 || new Set(ids).size !== ids.length || ids.some(sid => !get(d, "state", sid)))) fail(label + "参照が不正です。");
      };
      refs(t.simulation?.cancelOnStateIds, "Task中止State");
      if (t.simulation?.qInput !== undefined) {
        const qi=t.simulation.qInput;
        if(!qi || typeof qi!=="object" || Array.isArray(qi))fail("qInputが不正です。");
        refs(qi.stateIds,"品質入力State");
        opt(qi.mode,["all","any"],"品質入力合流条件");
      }
      if (t.simulation?.waitForStateIds !== undefined &&
          (!Array.isArray(t.simulation.waitForStateIds) || t.simulation.waitForStateIds.length > 10000 ||
           new Set(t.simulation.waitForStateIds).size !== t.simulation.waitForStateIds.length ||
           t.simulation.waitForStateIds.some(sid => !get(d, "state", sid))))
        fail("Taskの追加依存State参照が不正です。");
      str(t.label, "Task名");
      const s = get(d, "state", t.fromStateId);
      if (!s) fail("Taskの接続元が存在しません。");
      if (!t.toStateId && !t.junctions?.length)
        fail("Taskには接続先Stateまたは分岐が必要です。");
      if (
        t.junctions !== undefined &&
        (!Array.isArray(t.junctions) || t.junctions.length > 1000)
      )
        fail("junctionsが不正です。");
      const dest = (sid, time) => {
        const e = get(d, "state", sid);
        if (!e || e.id === s.id || e.actorId !== s.actorId || e.time < time)
          fail(
            "Taskの接続先は同一Actor・開始時刻以降の別Stateにしてください。",
          );
      };
      if (t.toStateId) dest(t.toStateId, s.time);
      const times = new Set();
      for (const j of t.junctions || []) {
        register(j);
        num(j.time, "Junction.time", s.time);
        if (times.has(j.time))
          fail("同一Task・同一時刻のジャンクションは1つにまとめてください。");
        times.add(j.time);
        if (t.toStateId && j.time > get(d, "state", t.toStateId).time)
          fail("ジャンクションはTask期間内に置いてください。");
        if (
          !Array.isArray(j.outcomes) ||
          !j.outcomes.length ||
          j.outcomes.length > 1000
        )
          fail("ジャンクションには1件以上の結果が必要です。");
        for (const o of j.outcomes) {
          str(o.label, "結果ラベル");
          dest(o.toStateId, j.time);
          if (o.probability !== undefined) P.number(o.probability, "分岐確率", 0, 1);
          if (o.delay !== undefined) P.number(o.delay, "分岐後の遅延", 0, 1e9);
        }
        if (j.simulation !== undefined) {
          if (!j.simulation || !["probability", "effect"].includes(j.simulation.mode)) fail("分岐実行モードが不正です。");
          if (new Set(j.outcomes.map(o => o.toStateId)).size !== j.outcomes.length) fail("実行分岐の結果Stateは重複できません。");
          if (j.simulation.mode === "probability") {
            if (j.outcomes.some(o => o.probability === undefined) || j.outcomes.reduce((sum,o) => sum+o.probability,0) > 1+1e-10) fail("分岐確率の合計は1以下にしてください。");
          }
        }
      }
    }
    for (const [i, c] of d.causalLinks.entries()) {
      context(`$.causalLinks[${i}]`, c);
      str(c.label, "因果ラベル");
      if ("polarity" in c) fail("polarityは廃止されました。State成立または分岐結果で作用を表現してください。");
      status(c);
      if(!c.source || c.source.type!=="state" || !endpoint(d,c.source) || "time" in c.source)fail("作用線の起点はStateのみです。source.timeは保存しません。");
      const target=c.target;
      if(!target || !["state","junction"].includes(target.type) || !endpoint(d,target) || "time" in target)fail("作用線の到達先はStateまたは明示的な分岐点です。target.timeは保存しません。");
      const p=c.propagation;
      if(!p || typeof p!=="object" || Array.isArray(p))fail("propagation.durationが必要です。");
      P.number(p.duration,"伝搬時間",0,1e9);
      if("w" in p)fail("propagation.wは廃止されました。");
      if(p.qualityRetention!==undefined)P.number(p.qualityRetention,"品質保持率",0,1);
      if(p.performanceModel)P.validateTask({enabled:true,performanceModel:p.performanceModel},"作用線の伝搬CDF");
      const arrival=causalArrivalTime(d,c), ep=endpoint(d,target);
      if(!Number.isFinite(arrival) || arrival>d.time.duration)fail("作用線の基準到達時刻が表示期間外です。");
      if(target.type==="junction" && Math.abs(arrival-ep.time)>1e-9)fail(`基準到達時刻が分岐点と一致しません。source+duration=${arrival}, target=${ep.time}`);
      if(target.type==="junction"){
        const t=get(d,"task",target.taskId), j=get(d,"junction",target.id);
        if(!j.outcomes.some(o=>o.toStateId===target.outcomeStateId))fail("分岐点の結果Stateをtarget.outcomeStateIdで指定してください。");
        if(j.simulation && j.simulation.mode!=="effect")fail("作用線の到達先は作用分岐点です。");
        if(get(d,"state",c.source.id).time<nominalStart(d,t))fail("作用発生Stateの基準時刻は対象Taskの開始条件成立以降にしてください。実行時は暗黙の開始依存を適用します。");
      }
      if(c.simulation!==undefined){
        const sim=c.simulation;
        if(!sim || typeof sim!=="object" || Array.isArray(sim) || typeof sim.enabled!=="boolean")fail("作用線simulation.enabledは真偽値です。");
        for(const k of ["type","w","delay","propagation","junctionId","outcomeStateId","holdUntilStart"])if(k in sim)fail("旧作用線simulation."+k+"は廃止されました。作用はtargetから決まります。");
        if(sim.stopTargetActor!==undefined && (typeof sim.stopTargetActor!=="boolean" || target.type!=="junction"))fail("stopTargetActorは分岐点への作用にのみ指定できます。");
      }
    }
    // Individual receipts may precede or follow the State's nominal establishment.
    for(const [i,st] of d.states.entries()) {
      const links=d.causalLinks.filter(c=>c.target.type==="state" && c.target.id===st.id);
      if(!links.length)continue;
      const arrivals=links.map(c=>causalArrivalTime(d,c));
      for(const t of d.tasks){
        if(t.toStateId===st.id)arrivals.push(st.time);
        for(const j of t.junctions || [])for(const o of j.outcomes)
          if(o.toStateId===st.id)arrivals.push(j.time+(o.delay ?? st.time-j.time));
      }
      const mode=st.simulation?.join || "all";
      let expected=(mode==="any"?Math.min:Math.max)(...arrivals);
      const gates=d.causalLinks.filter(c=>c.target.type==="junction" && c.source.id===st.id);
      if(gates.length)expected=Math.max(expected,...gates.map(c=>nominalStart(d,get(d,"task",c.target.taskId))));
      if(Math.abs(st.time-expected)>1e-9)fail(`Stateの基準成立時刻が合流条件と一致しません。join=${mode}, expected=${expected}, State.time=${st.time}`,`$.states[${i}]`,{state:st,arrivals,causalLinks:links});
    }
    dependencyGraph(d);
    for (const [i, t] of (d.technologies || []).entries()) {
      context(`$.technologies[${i}]`, t);
      str(t.name, "技術名");
      opt(t.status, technologyStatuses, "技術区分");
      if (!t.status) fail("技術区分が必要です。");
      if (t.trl != null) {
        num(t.trl, "TRL", 1, 9);
        if (!Number.isInteger(t.trl)) fail("TRLは整数です。");
      }
    }
    for (const [i, b] of (d.bindings || []).entries()) {
      context(`$.bindings[${i}]`, b);
      if (
        !["actor", "state", "task", "causalLink"].includes(b.targetType) ||
        !get(d, b.targetType, b.targetId) ||
        !get(d, "technology", b.technologyId)
      )
        fail("Technology Bindingの参照が不正です。");
    }
    if (d.simulation !== undefined) {
      context("$.simulation", d.simulation);
      const sim = d.simulation;
      if (!sim || typeof sim !== "object" || Array.isArray(sim) ||
          !Array.isArray(sim.successStateIds) || sim.successStateIds.length > 10000 ||
          new Set(sim.successStateIds).size !== sim.successStateIds.length ||
          sim.successStateIds.some(sid => !get(d, "state", sid)))
        fail("Mission成功State参照が不正です。");
      if (sim.deadline != null) P.number(sim.deadline, "Mission期限", 0, 1e9);
      opt(sim.successMode, ["all", "any"], "Mission成功条件モード");
      for (const [key, min, max] of [["iterations", 1, 100000], ["seed", 0, 4294967295]])
        if (sim[key] !== undefined && (!Number.isInteger(sim[key]) || sim[key] < min || sim[key] > max))
          fail("simulation." + key + "が不正です。");
    }
    if (d.views?.main) {
      context("$.views.main", d.views.main);
      const v = d.views.main;
      opt(v.mode, ["mission", "technology", "gap", "causality"], "View");
      opt(v.collapsedLayout, ["compact", "single", "spaced"], "折りたたみ表示");
      if (v.laneHeight !== undefined) num(v.laneHeight, "レーン高さ", 52, 160);
      if (v.zoom !== undefined) num(v.zoom, "倍率", 1, 1000);
      if (v.visibleTimeRange) {
        num(v.visibleTimeRange.start, "表示開始");
        num(v.visibleTimeRange.end, "表示終了", v.visibleTimeRange.start);
        if (v.visibleTimeRange.end <= v.visibleTimeRange.start)
          fail("表示範囲には長さが必要です。");
      }
      for (const k of ["collapsedActors", "actorOrder"])
        if (
          v[k] !== undefined &&
          (!Array.isArray(v[k]) ||
            new Set(v[k]).size !== v[k].length ||
            v[k].some((id) => !get(d, "actor", id)))
        )
          fail(k + "のActor参照が不正です。");
      for (const [k, value] of Object.entries(v.filters || {}))
        if (
          !["technology", "causalLink", "planned", "quiet", "implicitDependencies"].includes(k) ||
          typeof value !== "boolean"
        )
          fail("表示フィルタが不正です。");
    }
    return d;
    } catch(error){if(!error.validationPath && validationContext){error.validationPath=validationContext.path;error.validationFragment=clone(validationContext.fragment);}throw error;}
  }
  function parse(text) {
    return defaults(clone(validate(JSON.parse(text))));
  }
  function descendants(d, aid) {
    const result = new Set([aid]);
    let size;
    do {
      size = result.size;
      for (const a of d.actors) if (result.has(a.parentId)) result.add(a.id);
    } while (size !== result.size);
    return result;
  }
  function hierarchy(d, all = false) {
    const v = d.views.main,
      order = v.actorOrder,
      rows = [];
    const visit = (parent, depth) => {
      d.actors
        .filter((a) => (a.parentId || null) === parent)
        .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
        .forEach((a) => {
          rows.push({ actor: a, depth });
          if (all || !v.collapsedActors.includes(a.id)) visit(a.id, depth + 1);
        });
    };
    visit(null, 0);
    return rows;
  }
  function visibleActor(d, aid) {
    let a = get(d, "actor", aid),
      visible = aid;
    while (a?.parentId) {
      a = get(d, "actor", a.parentId);
      if (d.views.main.collapsedActors.includes(a.id)) visible = a.id;
    }
    return visible;
  }
  function createConnection(d, source, target) {
    if (
      source.type === "state" &&
      target.type === "state" &&
      endpoint(d, source).actorId === endpoint(d, target).actorId
    ) {
      const t = {
        id: id("task"),
        fromStateId: source.id,
        toStateId: target.id,
        label: "新しいTask",
        kind: "",
        notes: "",
      };
      d.tasks.push(t);
      validate(d);
      return { type: "task", id: t.id };
    }
    if(source.type!=="state" || !["state","junction"].includes(target.type))fail("接続はState起点・Stateまたは分岐点終点です。途中出力はStateを設けてTaskを分けてください。");
    const sourcePoint = endpoint(d, source), targetPoint = endpoint(d, target);
    if (!sourcePoint || !targetPoint) fail("作用線の端点が不正です。");
    const duration = targetPoint.time - sourcePoint.time;
    if (duration < 0)
      fail("作用線は時間を逆行できません。到達位置は発生位置以降にしてください。");
    const c = {
      id: id("cause"),
      source: clone(source),
      target: clone(target),
      propagation: { duration },
      label: "作用",
      kind: "",
      notes: "",
    };
    d.causalLinks.push(c);
    validate(d);
    return { type: "causalLink", id: c.id };
  }
  function addOutcome(d, tid, time, toStateId, label) {
    const t = get(d, "task", tid), w = taskWindow(d, t);
    if (!Number.isFinite(time) || time < w.start || time > w.end)
      fail("分岐時刻はTaskの実行期間内にしてください。期間の変更はTask編集で行います。");
    t.junctions ??= [];
    let j = t.junctions.find((j) => j.time === time);
    if (!j) {
      j = { id: id("junction"), time, outcomes: [] };
      t.junctions.push(j);
    }
    // Keep the ordinary destination and the execution window. Adding an
    // alternative outcome is not a request to shorten the original Task.
    j.outcomes.push({ toStateId, label });
    validate(d);
    return j;
  }
  function selectionClosure(d, selection) {
    const set = new Set(selection.map((s) => s.id));
    for (const s of selection)
      if (s.type === "actor")
        for (const id of descendants(d, s.id)) set.add(id);
    for (const s of d.states) if (set.has(s.actorId)) set.add(s.id);
    for (const t of d.tasks) {
      const dest = [
        t.toStateId,
        ...(t.junctions || []).flatMap((j) =>
          j.outcomes.map((o) => o.toStateId),
        ),
      ].filter(Boolean);
      if (set.has(t.fromStateId) && dest.every((id) => set.has(id)))
        set.add(t.id);
    }
    for (const c of d.causalLinks)
      if (set.has(c.source.id) && set.has(c.target.type === "junction" ? c.target.taskId : c.target.id)) set.add(c.id);
    return set;
  }
  function fragment(d, selection) {
    const set = selectionClosure(d, selection),
      f = {};
    for (const k of ["actors", "states", "tasks", "causalLinks"])
      f[k] = clone(d[k].filter((x) => set.has(x.id)));
    f.tasks = f.tasks.filter(
      (t) =>
        set.has(t.fromStateId) &&
        (!t.toStateId || set.has(t.toStateId)) &&
        (t.junctions || []).every((j) =>
          j.outcomes.every((o) => set.has(o.toStateId)),
        ),
    );
    const available = new Set(
      [...f.actors, ...f.states, ...f.tasks].map((x) => x.id),
    );
    f.causalLinks = f.causalLinks.filter(
      (c) => available.has(c.source.id) && available.has(c.target.type === "junction" ? c.target.taskId : c.target.id),
    );
    const copied = new Set([...available, ...f.causalLinks.map((c) => c.id)]);
    f.bindings = clone(d.bindings.filter((b) => copied.has(b.targetId)));
    return f;
  }
  function paste(d, f, delta = 0) {
    f = clone(f);
    const map = new Map();
    for (const k of ["actors", "states", "tasks", "causalLinks", "bindings"])
      for (const x of f[k]) map.set(x.id, id(k));
    for (const t of f.tasks)
      for (const j of t.junctions || []) map.set(j.id, id("junction"));
    const ref = (x) => map.get(x) || x;
    for (const a of f.actors) {
      a.id = ref(a.id);
      a.parentId = ref(a.parentId);
      a.name += " コピー";
    }
    for (const s of f.states) {
      s.id = ref(s.id);
      s.actorId = ref(s.actorId);
      s.time += delta;
    }
    for (const t of f.tasks) {
      t.id = ref(t.id);
      t.fromStateId = ref(t.fromStateId);
      if (t.toStateId) t.toStateId = ref(t.toStateId);
      if (t.simulation?.waitForStateIds)
        t.simulation.waitForStateIds = t.simulation.waitForStateIds.map(ref);
      if (t.simulation?.cancelOnStateIds) t.simulation.cancelOnStateIds = t.simulation.cancelOnStateIds.map(ref);
      if (t.simulation?.qInput?.stateIds) t.simulation.qInput.stateIds = t.simulation.qInput.stateIds.map(ref);
      for (const j of t.junctions || []) {
        j.id = ref(j.id);
        j.time += delta;
        for (const o of j.outcomes) o.toStateId = ref(o.toStateId);
      }
    }
    for (const c of f.causalLinks) {
      c.id = ref(c.id);
      if(c.target.type === "junction"){c.target.taskId=ref(c.target.taskId);c.target.outcomeStateId=ref(c.target.outcomeStateId);}
      c.source.id = ref(c.source.id);
      c.target.id = ref(c.target.id);
      if (c.source.type !== "state") c.source.time += delta;
    }
    for (const b of f.bindings) {
      b.id = ref(b.id);
      b.targetId = ref(b.targetId);
    }
    for (const k of ["actors", "states", "tasks", "causalLinks", "bindings"])
      d[k].push(...f[k]);
    d.views.main.actorOrder.push(...f.actors.map((a) => a.id));
    validate(d);
    return [
      ...f.actors.map((a) => ({ type: "actor", id: a.id })),
      ...f.states.map((s) => ({ type: "state", id: s.id })),
    ];
  }
  function remove(d, selection) {
    const set = new Set(selection.map((s) => s.id));
    for (const s of selection)
      if (s.type === "actor") descendants(d, s.id).forEach((id) => set.add(id));
    for (const s of d.states) if (set.has(s.actorId)) set.add(s.id);
    for (const t of d.tasks) {
      if (set.has(t.fromStateId)) set.add(t.id);
      if (set.has(t.toStateId)) delete t.toStateId;
      for (const j of t.junctions || [])
        j.outcomes = j.outcomes.filter((o) => !set.has(o.toStateId));
      t.junctions = (t.junctions || []).filter((j) => j.outcomes.length);
      if (!t.toStateId && !t.junctions.length) set.add(t.id);
    }
    for(const c of d.causalLinks)
      if(set.has(c.source.id) || set.has(c.target.id) || set.has(c.target.taskId) || (c.target.type==="junction" && !get(d,"task",c.target.taskId)?.junctions?.some(j=>j.id===c.target.id && j.outcomes.some(o=>o.toStateId===c.target.outcomeStateId))))set.add(c.id);
    for (const k of [
      "actors",
      "states",
      "tasks",
      "causalLinks",
      "technologies",
    ])
      d[k] = d[k].filter((x) => !set.has(x.id));
    d.bindings = d.bindings.filter(
      (b) => !set.has(b.id) && !set.has(b.targetId) && !set.has(b.technologyId),
    );
    for (const k of ["actorOrder", "collapsedActors"])
      d.views.main[k] = d.views.main[k].filter((id) => !set.has(id));
    // Retain surviving timed links even when a result deletion shortens a Task.
    // Their explicit attachment time is now an analyzable timing gap.
    d.bindings = d.bindings.filter((b) => get(d, b.targetType, b.targetId));
    for (const t of d.tasks) {
      if (t.simulation?.waitForStateIds)
        t.simulation.waitForStateIds = t.simulation.waitForStateIds.filter(sid => get(d, "state", sid));
      if (t.simulation?.cancelOnStateIds) t.simulation.cancelOnStateIds = t.simulation.cancelOnStateIds.filter(sid => get(d,"state",sid));
      if (t.simulation?.qInput?.stateIds) t.simulation.qInput.stateIds = t.simulation.qInput.stateIds.filter(sid => get(d,"state",sid));
    }
    if (d.simulation)
      d.simulation.successStateIds = d.simulation.successStateIds.filter(sid => get(d, "state", sid));
    validate(d);
  }
  function groupActors(d, ids, name = "新しいグループ") {
    const roots = ids.filter(
      (a) => !ids.some((b) => a !== b && descendants(d, b).has(a)),
    );
    if (!roots.length) fail("Actorを選択してください。");
    const parent = get(d, "actor", roots[0]).parentId || null;
    const a = {
      id: id("actor"),
      name,
      side: "neutral",
      parentId: roots.every(
        (i) => (get(d, "actor", i).parentId || null) === parent,
      )
        ? parent
        : null,
      isGroup: true,
    };
    d.actors.push(a);
    d.views.main.actorOrder.unshift(a.id);
    roots.forEach((i) => (get(d, "actor", i).parentId = a.id));
    return a.id;
  }
  function ungroupActor(d, aid) {
    const a = get(d, "actor", aid);
    d.actors
      .filter((x) => x.parentId === aid)
      .forEach((x) => (x.parentId = a.parentId || null));
    if (d.states.some((s) => s.actorId === aid)) {
      a.isGroup = false;
      return;
    }
    remove(d, [{ type: "actor", id: aid }]);
  }
  function placeActor(d, aid, target, position = "before") {
    if (aid === target || descendants(d, aid).has(target))
      fail("自分・子孫には移動できません。");
    const a = get(d, "actor", aid),
      t = get(d, "actor", target);
    a.parentId = position === "inside" ? target : t.parentId || null;
    const order = d.views.main.actorOrder.filter((x) => x !== aid);
    order.splice(
      order.indexOf(target) + (position === "after" ? 1 : 0),
      0,
      aid,
    );
    d.views.main.actorOrder = order;
    validate(d);
  }
  function moveSelection(d, selection, delta, targetActorId) {
    const set = selectionClosure(d, selection);
    for (const s of d.states)
      if (set.has(s.id)) {
        s.time += delta;
        if (
          targetActorId &&
          selection.filter((x) => x.type === "state").length === 1
        )
          s.actorId = targetActorId;
      }
    for (const t of d.tasks)
      if (set.has(t.id)) for (const j of t.junctions || []) j.time += delta;
    for (const c of d.causalLinks)
      if (c.source.type !== "state" && set.has(c.source.id)) c.source.time += delta;
    validate(d);
  }
  function technologyFor(d, type, tid) {
    const own = d.bindings.filter(
      (b) => b.targetType === type && b.targetId === tid,
    );
    let aid =
      type === "state"
        ? get(d, type, tid).actorId
        : type === "task"
          ? get(d, "state", get(d, type, tid).fromStateId).actorId
          : null;
    const inherited = aid
      ? d.bindings.filter((b) => b.targetType === "actor" && b.targetId === aid)
      : [];
    return [...new Set([...own, ...inherited].map((b) => b.technologyId))].map(
      (id) => get(d, "technology", id),
    );
  }
  function opportunity(d, c) {
    if (c.target.type !== "junction") return null;
    const w = taskWindow(d, get(d, "task", c.target.taskId));
    const at = causalArrivalTime(d, c);
    return {
      ...w,
      at,
      within: at >= w.start && at <= w.end,
      message:
        at > w.end
          ? "到達が遅すぎます"
          : at < w.start
            ? "Task開始前です"
            : "時間窓内",
    };
  }
  /* Enumerate directed, time-ordered intervention paths. No role pooling across branches. */
  function analyzeTask(d, taskId) {
    const candidates = d.causalLinks.filter(
      (c) =>
        c.target.type === "junction" &&
        c.target.taskId === taskId,
    );
    const paths = [];
    let truncated = false;
    const friendly = (type, id) => {
      const a =
        type === "state"
          ? get(d, "state", id)?.actorId
          : type === "task"
            ? get(d, "state", get(d, "task", id)?.fromStateId)?.actorId
            : null;
      return get(d, "actor", a)?.side === "friendly";
    };
    const finish = (reverse, c) => {
      if (paths.length >= 256) {
        truncated = true;
        return;
      }
      const nodes = [...reverse].reverse();
      const roles = [];
      for (const n of nodes) {
        const x = get(d, n.type, n.id);
        if (
          n.type === "state" &&
          x.phase === "decision" &&
          friendly(n.type, n.id)
        )
          roles.push("decision");
        if (["task", "causalLink"].includes(n.type)) {
          const blue =
            n.type === "task"
              ? friendly("task", x.id)
              : get(d, "actor", endpoint(d, x.source).actorId)?.side ===
                "friendly";
          if (blue) {
            if (["observation", "detection"].includes(x.kind))
              roles.push("observation");
            if (x.kind === "command") roles.push("command");
            if (["attack", "interference"].includes(x.kind))
              roles.push("attack");
          }
        }
      }
      let r = 0;
      for (const role of roles)
        if (role === ["observation", "decision", "command", "attack"][r]) r++;
      const gaps = nodes.flatMap((n) => {
        const ts = technologyFor(d, n.type, n.id);
        return !ts.length
          ? [{ ...n, status: "unknown", name: "技術未関連付け" }]
          : ts
              .filter((t) => t.status !== "existing")
              .map((t) => ({ ...n, status: t.status, name: t.name }));
      });
      const win = opportunity(d, c);
      const structural = r === 4;
      paths.push({
        nodes,
        roles,
        structural,
        gaps,
        window: win,
        complete:
          structural &&
          !gaps.length &&
          win.within,
      });
    };
    const walk = (p, deadline, rev, seen, c, depth = 0) => {
      if (paths.length >= 256 || depth > 256) {
        truncated = true;
        return;
      }
      const key = p.type + ":" + p.id;
      if (seen.has(key)) return;
      const next = new Set(seen);
      next.add(key);
      const nodes = [...rev, { type: p.type, id: p.id }];
      let incoming = [];
      if (p.type === "state") {
        for (const t of d.tasks) {
          if (t.toStateId === p.id)
            incoming.push({
              type: "task",
              id: t.id,
              time: taskWindow(d, t).end,
            });
          for (const j of t.junctions || [])
            if (j.outcomes.some((o) => o.toStateId === p.id))
              incoming.push({ type: "task", id: t.id, time: j.time });
        }
      }
      for (const link of d.causalLinks)
        if (
          link.id !== c.id &&
          link.target.type === p.type &&
          link.target.id === p.id &&
          causalArrivalTime(d, link) <= deadline
        )
          incoming.push({ link });
      if (p.type === "task") {
        const t = get(d, "task", p.id);
        incoming.push({
          type: "state",
          id: t.fromStateId,
          time: get(d, "state", t.fromStateId).time,
        });
      }
      if (!incoming.length) finish(nodes, c);
      for (const n of incoming) {
        if (n.link) {
          const l = n.link;
          walk(
            l.source,
            endpoint(d, l.source).time,
            [...nodes, { type: "causalLink", id: l.id }],
            next,
            c,
            depth + 1,
          );
        } else walk(n, n.time, nodes, next, c, depth + 1);
      }
    };
    for (const c of candidates)
      walk(
        c.source,
        endpoint(d, c.source).time,
        [{ type: "causalLink", id: c.id }],
        new Set(),
        c,
      );
    return {
      paths,
      truncated,
      some: paths.some((p) => p.complete),
      all: !!paths.length && !truncated && paths.every((p) => p.complete),
    };
  }
  class History {
    constructor(d) {
      this.doc = defaults(clone(validate(d)));
      this.past = [];
      this.future = [];
    }
    commit(d) {
      d = defaults(clone(validate(d)));
      if (JSON.stringify(d) === JSON.stringify(this.doc)) return false;
      this.past.push(this.doc);
      if (this.past.length > 100) this.past.shift();
      this.doc = d;
      this.future = [];
      return true;
    }
    undo() {
      if (!this.past.length) return false;
      this.future.push(this.doc);
      this.doc = this.past.pop();
      return true;
    }
    redo() {
      if (!this.future.length) return false;
      this.past.push(this.doc);
      this.doc = this.future.pop();
      return true;
    }
  }
  const api = {
    clone,
    id,
    collections,
    get,
    snap,
    defaults,
    actorColor,
    validate,
    parse,
    taskWindow,
    startStateIds, nominalStart, implicitDependencies, dependencyGraph,
    endpoint,
    endpointActor,
    causalEndpoint,
    causalArrivalTime,
    descendants,
    hierarchy,
    visibleActor,
    createConnection,
    addOutcome,
    selectionClosure,
    fragment,
    paste,
    remove,
    groupActors,
    ungroupActor,
    placeActor,
    moveSelection,
    technologyFor,
    technologyStatuses,
    opportunity,
    analyzeTask,
    History,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ME = api;
})(globalThis);
