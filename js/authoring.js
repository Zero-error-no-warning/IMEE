/* Atomic authoring operations. The v3 execution model stays unchanged. */
(function (root) {
  "use strict";
  const M =
    typeof module !== "undefined" && module.exports
      ? require("./model")
      : root.ME;
  const clone = M.clone,
    round = (n) => Math.round(n * 1e9) / 1e9;
  function empty(title = "新しいシナリオ", unit = "minutes", duration = 60) {
    return M.defaults({
      version: 3,
      title,
      time: { unit, duration, snap: Math.min(1, duration) },
      actors: [],
      states: [],
      tasks: [],
      causalLinks: [],
      technologies: [],
      bindings: [],
    });
  }
  function label(d, type, id) {
    const x = M.get(d, type, id);
    if (!x) return id;
    if (type === "state")
      return `${M.get(d, "actor", x.actorId)?.name} / ${x.name} / T+${x.time}`;
    if (type === "task") {
      const w = M.taskWindow(d, x);
      return `${M.get(d, "actor", M.get(d, "state", x.fromStateId)?.actorId)?.name} / ${x.label} / T+${w.start}〜${w.end}`;
    }
    return x.name || x.label || id;
  }
  function connectionHints(d, source) {
    const from = M.get(d, "state", source?.id),
      graph = M.dependencyGraph(d),
      cache = new Map();
    function ancestors(id) {
      if (cache.has(id)) return cache.get(id);
      const set = new Set();
      for (const dep of graph.nodes.get(id)?.dependencies || []) {
        set.add(dep);
        for (const p of ancestors(dep)) set.add(p);
      }
      cache.set(id, set);
      return set;
    }
    return (type, id) => {
      if (!from)
        return { allowed: false, message: "起点Stateを選択してください。" };
      if (type === "state") {
        const target = M.get(d, "state", id);
        if (!target || id === from.id)
          return { allowed: false, message: "別のStateを選択してください。" };
        if (target.time < from.time)
          return { allowed: false, temporal: true, message: "接続先の時刻が起点より前です。" };
        if (ancestors(from.id).has(id))
          return {
            allowed: false,
            message: "この接続は依存関係を循環させます。",
          };
        return {
          allowed: true,
          message:
            target.actorId === from.actorId
              ? "活動（Task）を作成"
              : "状態・品質を伝える作用を作成",
        };
      }
      if (type === "task") {
        const task = M.get(d, "task", id);
        if (
          !task ||
          from.time < M.nominalStart(d, task) ||
          from.time > M.taskWindow(d, task).end
        )
          return {
            allowed: false,
            message: "作用元を対象活動の開始条件成立〜終了の間にしてください。",
          };
        if (ancestors("start:" + id).has(from.id))
          return {
            allowed: false,
            message: "対象の開始条件からの作用は暗黙の開始依存を循環させます。",
          };
        return { allowed: true, message: "作用を受ける分岐・結果を設定" };
      }
      return {
        allowed: false,
        message: "Stateまたは活動上の分岐を選択してください。",
      };
    };
  }
  function selectionInfo(d, selection) {
    const copied = M.fragment(d, selection),
      next = clone(d);
    let error = null;
    try {
      M.remove(next, selection);
    } catch (e) {
      error = e.message;
    }
    const deleted = {};
    for (const k of [
      "actors",
      "states",
      "tasks",
      "causalLinks",
      "technologies",
      "bindings",
    ])
      deleted[k] = d[k].length - next[k].length;
    return { copied, deleted, error };
  }
  function timing(d) {
    const durations = {},
      offsets = {},
      delays = {};
    for (const t of d.tasks) {
      const w = M.taskWindow(d, t);
      durations[t.id] = w.end - w.start;
      for (const j of t.junctions || []) {
        offsets[j.id] = j.time - w.start;
        for (const o of j.outcomes)
          delays[j.id + ":" + o.toStateId] =
            o.delay ?? M.get(d, "state", o.toStateId).time - j.time;
      }
    }
    return { durations, offsets, delays };
  }
  function changes(before, after) {
    const result = [];
    for (const type of ["state", "task", "causalLink"])
      for (const x of after[M.collections[type]]) {
        const old = M.get(before, type, x.id);
        if (!old) continue;
        if (type === "state" && Math.abs(old.time - x.time) > 1e-8)
          result.push({
            type,
            id: x.id,
            label: label(after, type, x.id),
            from: old.time,
            to: x.time,
          });
        if (
          type === "causalLink" &&
          Math.abs(old.propagation.duration - x.propagation.duration) > 1e-8
        )
          result.push({
            type,
            id: x.id,
            label: x.label,
            from: old.propagation.duration,
            to: x.propagation.duration,
          });
      }
    return result;
  }
  // Rebuild nominal arrivals in dependency order, preserving activity durations
  // and branch offsets unless the caller explicitly changes them.
  function reconcile(d, before = d, overrides = {}) {
    const base = timing(before),
      current = timing(d);
    const durations = {
      ...current.durations,
      ...base.durations,
      ...overrides.durations,
    };
    const offsets = {
      ...current.offsets,
      ...base.offsets,
      ...overrides.offsets,
    };
    const delays = { ...current.delays, ...base.delays, ...overrides.delays };
    const graph = M.dependencyGraph(d);
    for (const node of graph.order) {
      if (node.type === "task") {
        const t = node.item,
          start = t.timing ? M.nominalStart(d,t) : M.get(d, "state", t.fromStateId).time;
        if(t.timing)t.timing.duration=round(durations[t.id]);
        for (const j of t.junctions || []) {
          j.time = round(start + offsets[j.id]);
          for (const o of j.outcomes)
            if (o.delay !== undefined)
              o.delay = round(delays[j.id + ":" + o.toStateId]);
        }
      }
      if (node.type !== "state") continue;
      const s = node.item,
        arrivals = [];
      if(s.timing?.mode === "fixed"){s.time=s.timing.at;continue;}
      for (const t of d.tasks) {
        const start = t.timing ? M.nominalStart(d,t) : M.get(d, "state", t.fromStateId).time;
        if (t.toStateId === s.id) arrivals.push(start + durations[t.id]);
        for (const j of t.junctions || [])
          for (const o of j.outcomes)
            if (o.toStateId === s.id)
              arrivals.push(j.time + delays[j.id + ":" + s.id]);
      }
      for (const c of d.causalLinks)
        if (c.target.type === "state" && c.target.id === s.id && (s.timing?.mode!=="relative" || c.simulation?.enabled))
          arrivals.push(M.causalArrivalTime(d, c));
      let time = arrivals.length
        ? (s.simulation?.join === "any" ? Math.min : Math.max)(...arrivals)
        : s.time;
      for (const c of d.causalLinks)
        if (c.target.type === "junction" && c.source.id === s.id)
          time = Math.max(
            time,
            M.nominalStart(d, M.get(d, "task", c.target.taskId)),
          );
      s.time = round(time);
    }
    for (const c of d.causalLinks)
      if (c.target.type === "junction") {
        const t=M.get(d,"task",c.target.taskId),j=M.get(d,"junction",c.target.id);
        if(t.timing){
          const expected=M.causalArrivalTime(d,c);
          if(Math.abs(j.time-expected)>1e-8){
            if((overrides.effectPass||0)>d.states.length+d.tasks.length)throw new Error("作用分岐の基準時刻を整合できません。");
            return reconcile(d,before,{durations,delays,offsets:{...offsets,[j.id]:expected-M.taskWindow(d,t).start},effectPass:(overrides.effectPass||0)+1});
          }
          continue;
        }
        c.propagation.duration = round(
          M.get(d, "junction", c.target.id).time -
            M.get(d, "state", c.source.id).time,
        );
        if (c.propagation.duration < 0)
          throw new Error(
            `「${c.label}」の発生が分岐点より遅くなります。分岐時刻または発生条件を変更してください。`,
          );
      }
    const max = Math.max(
      d.time.duration,
      ...d.states.map((s) => s.time),
      ...d.tasks.flatMap((t) => (t.junctions || []).map((j) => j.time)),
      ...d.tasks.map(t=>M.taskWindow(d,t).end),
      ...d.causalLinks.map((c) => M.causalArrivalTime(d, c)),
    );
    if (max > 1e6) throw new Error("全期間は1,000,000以下にしてください。");
    if (max > d.time.duration) d.time.duration = round(max);
    M.validate(d);
    return changes(before, d);
  }
  function incomingRelations(d,id){
    const s=M.get(d,"state",id),relations=[];
    for(const t of d.tasks){if(t.toStateId===id)relations.push({id:"task:"+t.id,label:t.label,time:M.taskWindow(d,t).end});for(const j of t.junctions||[])for(const o of j.outcomes)if(o.toStateId===id)relations.push({id:"outcome:"+j.id+":"+id,label:t.label+" / "+o.label,time:j.time+(o.delay??s.time-j.time)});}
    for(const c of d.causalLinks)if(c.target.type==="state"&&c.target.id===id&&(s.timing?.mode!=="relative"||c.simulation?.enabled))relations.push({id:"causalLink:"+c.id,label:c.label,time:M.causalArrivalTime(d,c)});
    return relations;
  }
  function moveState(d, id, time, mode = "follow", incomingId) {
    if (!Number.isFinite(time) || time < 0)
      throw new Error("時刻は0以上の数値にしてください。");
    const before = clone(d),
      s = M.get(d, "state", id),
      old = s.time,
      b = timing(before),
      delta = time - old;
    s.time = time;
    if(s.timing?.mode === "fixed") {
      s.timing.at=time;
      return reconcile(d,before);
    }
    const inputs=incomingRelations(before,id);
    const chosen=incomingId||(inputs.find(x=>Math.abs(x.time-old)<1e-8)||inputs[0])?.id;
    if(incomingId&&!inputs.some(x=>x.id===incomingId))throw new Error("時間を調整する入力が存在しません。");
    for (const c of d.causalLinks) {
      if (c.target.type === "state" && c.target.id === id && chosen==="causalLink:"+c.id)
        c.propagation.duration = round(
          time - M.get(d, "state", c.source.id).time,
        );
      if (mode === "keep" && c.source.id === id)
        c.propagation.duration = round(c.propagation.duration - delta);
      if (c.propagation.duration < 0)
        throw new Error(
          "伝搬時間が負になります。発生元を早めるか、後続を移動してください。",
        );
    }
    for (const t of d.tasks) {
      if (t.toStateId === id && chosen==="task:"+t.id) b.durations[t.id] += delta;
      for (const j of t.junctions || [])
        for (const o of j.outcomes)
          if (o.toStateId === id && chosen==="outcome:"+j.id+":"+id) b.delays[j.id + ":" + id] += delta;
      if (mode === "keep" && t.fromStateId === id) {
        b.durations[t.id] -= delta;
        for (const j of t.junctions || []) b.offsets[j.id] -= delta;
      }
    }
    if (
      Object.values(b.durations).some((v) => v < 0) ||
      Object.values(b.delays).some((v) => v < 0) ||
      Object.values(b.offsets).some((v) => v < 0)
    )
      throw new Error(
        "活動・分岐の時間が負になります。後続を移動する方法を選んでください。",
      );
    const result=reconcile(d, before, b);
    if(Math.abs(s.time-time)>1e-8)throw new Error("他の入力・開始依存が成立時刻を拘束しています。調整する入力を変更するか、依存先も調整してください。");
    return result;
  }
  function setNodeTiming(d,id,mode,at){
    if(!["relative","fixed"].includes(mode))throw new Error("時間種別が不正です。");
    const before=clone(d),base=timing(d);
    // Capture old durations before releasing the destination's time constraint.
    for(const t of d.tasks)if(t.fromStateId===id||t.toStateId===id||t.junctions?.some(j=>j.outcomes.some(o=>o.toStateId===id))){t.timing??={duration:base.durations[t.id]};for(const j of t.junctions||[])for(const o of j.outcomes)o.delay??=base.delays[j.id+":"+o.toStateId];}
    const s=M.get(d,"state",id);s.timing=mode==="fixed"?{mode,at}:{mode};
    if(mode==="fixed")s.time=at;
    return reconcile(d,before,base);
  }
  function propagation(d, id, duration) {
    if (!Number.isFinite(duration) || duration < 0)
      throw new Error("伝搬時間は0以上にしてください。");
    const before = clone(d),
      c = M.get(d, "causalLink", id),
      b = timing(before);
    c.propagation.duration = duration;
    if (c.target.type === "junction") {
      const t = M.get(d, "task", c.target.taskId),
        j = M.get(d, "junction", c.target.id),
        start = M.taskWindow(d,t).start;
      b.offsets[j.id] = M.get(d, "state", c.source.id).time + duration - start;
      if (b.offsets[j.id] < 0)
        throw new Error("作用の到達は対象活動の開始以降にしてください。");
      b.durations[t.id] = Math.max(b.durations[t.id], b.offsets[j.id]);
    }
    return reconcile(d, before, b);
  }
  function moveSelection(d, selection, delta, mode = "follow", targetActorId) {
    const before = clone(d),
      ids = M.selectionClosure(d, selection),
      states = M.dependencyGraph(d).order.filter(
        (n) => n.type === "state" && ids.has(n.id),
      );
    for (const n of states) {
      const desired = M.get(before, "state", n.id).time + delta;
      if (Math.abs(M.get(d, "state", n.id).time - desired) > 1e-9)
        moveState(d, n.id, desired, mode);
    }
    if (
      targetActorId &&
      selection.filter((s) => s.type === "state").length === 1
    )
      M.get(d, "state", selection.find((s) => s.type === "state").id).actorId =
        targetActorId;
    M.validate(d);
    return changes(before, d);
  }
  function activity(
    d,
    {
      actorId,
      fromStateId,
      start = 0,
      duration = 10,
      label: name = "新しい活動",
      result = "完了",
    },
  ) {
    if (!M.get(d, "actor", actorId))
      throw new Error("登場主体を選択してください。");
    if (!Number.isFinite(duration) || duration < 0)
      throw new Error("所要時間は0以上にしてください。");
    let from = M.get(d, "state", fromStateId);
    if (!from) {
      from = { id: M.id("state"), actorId, name: "開始", time: start, timing:{mode:"fixed",at:start} };
      d.states.push(from);
    }
    if (from.actorId !== actorId)
      throw new Error("開始Stateは同じ登場主体を選んでください。");
    const to = {
        id: M.id("state"),
        actorId,
        name: result,
        time: round(from.time + duration),
        timing: {mode:"relative"},
      },
      task = {
        id: M.id("task"),
        fromStateId: from.id,
        toStateId: to.id,
        label: name,
        simulation: { enabled: false },
        timing: {duration},
      };
    d.states.push(to);
    d.tasks.push(task);
    d.time.duration = Math.max(d.time.duration, to.time);
    M.validate(d);
    return { type: "task", id: task.id };
  }
  function resizeActivity(d, taskId, duration) {
    if (!Number.isFinite(duration) || duration < 0)
      throw new Error("所要時間は0以上にしてください。");
    const before = clone(d),
      task = M.get(d, "task", taskId),
      window = M.taskWindow(d, task),
      length = window.end - window.start,
      offsets = {};
    for (const j of task.junctions || [])
      offsets[j.id] =
        duration * (length ? (j.time - window.start) / length : 1);
    return reconcile(d, before, { durations: { [taskId]: duration }, offsets });
  }
  function split(d, taskId, time, name, resetCDF = false) {
    const t = M.get(d, "task", taskId),
      w = M.taskWindow(d, t);
    if (!t.toStateId || time <= w.start || time >= w.end)
      throw new Error(
        "通常の到達先を持つ活動の開始と終了の間を選んでください。",
      );
    if (t.simulation?.enabled && !resetCDF)
      throw new Error(
        "CDFは分割後の活動ごとに再設定が必要です。「固定時間に戻して分割」を選択してください。",
      );
    if ((t.junctions || []).some((j) => j.time === time))
      throw new Error(
        "分岐点と同じ時刻での分割はできません。前後の時刻を選んでください。",
      );
    const s = {
      id: M.id("state"),
      actorId: M.get(d, "state", t.fromStateId).actorId,
      name,
      time,
    };
    const tail = clone(t);
    if(t.timing){t.timing.duration=time-w.start;tail.timing.duration=w.end-time;s.timing={mode:"relative"};}
    tail.id = M.id("task");
    tail.fromStateId = s.id;
    tail.label = t.label + "（継続）";
    tail.junctions = (t.junctions || []).filter((j) => j.time > time);
    t.junctions = (t.junctions || []).filter((j) => j.time < time);
    t.toStateId = s.id;
    // The continuation inherits quality and cancellation; explicit prerequisites
    // belong to the first segment, not a second artificial wait.
    if (tail.simulation) {
      delete tail.simulation.qInput;
      delete tail.simulation.waitForStateIds;
      tail.simulation.qualityRetention = 1;
    }
    if (resetCDF)
      for (const x of [t, tail]) {
        x.simulation = { ...x.simulation, enabled: false };
        delete x.simulation.performanceModel;
      }
    d.states.push(s);
    d.tasks.push(tail);
    for (const c of d.causalLinks)
      if (
        c.target.taskId === taskId &&
        tail.junctions.some((j) => j.id === c.target.id)
      )
        c.target.taskId = tail.id;
    for (const b of [...d.bindings])
      if (b.targetType === "task" && b.targetId === taskId)
        d.bindings.push({
          ...clone(b),
          id: M.id("binding"),
          targetId: tail.id,
        });
    M.validate(d);
    return { type: "state", id: s.id };
  }
  function convertUnit(d, unit, convert = true) {
    const units = { seconds: 1, minutes: 60, hours: 3600 };
    if (!units[unit]) throw new Error("時間単位が不正です。");
    const factor = convert ? units[d.time.unit] / units[unit] : 1;
    const scale = (n) => n * factor,
      cdf = (m) => {
        for (const c of m?.curves || [])
          for (const p of c.points) p.t = scale(p.t);
      };
    d.time.duration = scale(d.time.duration);
    d.time.snap = scale(d.time.snap);
    // Sub-second grids must stay representable after conversions.
    if (d.time.duration < 1e-9 || d.time.duration > 1e6 || d.time.snap < 1e-9)
      throw new Error("換算後の全期間・スナップが保存範囲外です。");
    for (const s of d.states) {s.time = scale(s.time);if(s.timing?.mode==="fixed")s.timing.at=scale(s.timing.at);}
    for (const t of d.tasks) {
      if(t.timing)t.timing.duration=scale(t.timing.duration);
      cdf(t.simulation?.performanceModel);
      for (const j of t.junctions || []) {
        j.time = scale(j.time);
        for (const o of j.outcomes)
          if (o.delay !== undefined) o.delay = scale(o.delay);
      }
    }
    for (const c of d.causalLinks) {
      c.propagation.duration = scale(c.propagation.duration);
      cdf(c.propagation.performanceModel);
    }
    if (d.simulation?.deadline != null)
      d.simulation.deadline = scale(d.simulation.deadline);
    const v = d.views?.main;
    if (v?.visibleTimeRange) {
      v.visibleTimeRange.start = scale(v.visibleTimeRange.start);
      v.visibleTimeRange.end = scale(v.visibleTimeRange.end);
    }
    d.time.unit = unit;
    M.validate(d);
    return factor;
  }
  function fingerprint(d) {
    // Preserve order: it participates in RNG assignment and tie breaking.
    const taskSim = (s) => ({
      enabled: !!s?.enabled,
      qualityRetention: s?.qualityRetention ?? 1,
      performanceModel: s?.enabled ? s.performanceModel : undefined,
      waitForStateIds: s?.waitForStateIds || [],
      cancelOnStateIds: s?.cancelOnStateIds || [],
      qInput: {
        stateIds: s?.qInput?.stateIds || [],
        mode: s?.qInput?.stateIds?.length ? s.qInput.mode || "all" : "all",
      },
    });
    return JSON.stringify({
      version: d.version,
      time: { unit: d.time.unit },
      states: d.states.map((s) => ({
        id: s.id,
        actorId: s.actorId,
        time: s.time,
        timing:s.timing,
        simulation: {
          q: s.simulation?.q ?? 1,
          join: s.simulation?.join || "all",
        },
      })),
      tasks: d.tasks.map((t) => ({
        id: t.id,
        fromStateId: t.fromStateId,
        toStateId: t.toStateId,
        timing:t.timing,
        junctions: (t.junctions || []).map((j) => ({
          id: j.id,
          time: j.time,
          mode: j.simulation?.mode,
          outcomes: j.outcomes.map((o) => ({
            toStateId: o.toStateId,
            delay: o.delay ?? M.get(d, "state", o.toStateId).time - j.time,
            probability: o.probability,
          })),
        })),
        simulation: taskSim(t.simulation),
      })),
      causalLinks: d.causalLinks.map((c) => ({
        id: c.id,
        source: c.source,
        target: c.target,
        propagation: {
          duration: c.propagation.duration,
          qualityRetention: c.propagation.qualityRetention ?? 1,
          performanceModel: c.propagation.performanceModel,
        },
        simulation: {
          enabled: !!c.simulation?.enabled,
          stopTargetActor: !!c.simulation?.stopTargetActor,
        },
      })),
      simulation: d.simulation,
    });
  }
  function issues(d) {
    const list = [],
      add = (severity, message, target, code) =>
        list.push({ severity, message, target, code });
    if (!d.actors.length)
      add("info", "登場主体を追加してください。", null, "actors");
    if (!d.tasks.length)
      add(
        "info",
        "活動を追加してシナリオを描き始めてください。",
        null,
        "tasks",
      );
    if (!d.simulation?.successStateIds?.length)
      add(
        "error",
        "達成目標が未設定です。Stateを選んで「達成目標にする」を押してください。",
        null,
        "success",
      );
    for (const c of d.causalLinks) {
      if (!c.simulation?.enabled)
        add(
          "warning",
          `「${c.label}」は説明用です。実行する作用なら設定を変更してください。`,
          { type: "causalLink", id: c.id },
          "display",
        );
      if (c.target.type === "junction")
        add(
          "info",
          `「${label(d, "state", c.source.id)}」は対象活動の開始を待ちます。`,
          { type: "causalLink", id: c.id },
          "implicit",
        );
    }
    for (const t of d.tasks)
      for (const j of t.junctions || []) {
        if (!j.simulation)
          add(
            "error",
            `「${t.label}」の分岐に実行方式を設定してください。`,
            { type: "task", id: t.id },
            "branch",
          );
        else if (
          !t.toStateId &&
          j === (t.junctions || []).at(-1) &&
          j.simulation.mode === "probability" &&
          Math.abs(
            j.outcomes.reduce((a, o) => a + (o.probability || 0), 0) - 1,
          ) > 1e-8
        )
          add(
            "error",
            `「${t.label}」には通常到達先がないため、最終分岐の合計を100%にしてください。`,
            { type: "task", id: t.id },
            "branch",
          );
      }
    if (!list.some((x) => x.severity === "error")) {
      const S =
        typeof module !== "undefined" && module.exports
          ? require("./simulation")
          : root.MESimulation;
      try {
        S?.compile(d);
      } catch (e) {
        add("error", e.message, null, "execution");
      }
    }
    return list;
  }
  function repairTimes(original) {
    const d = clone(original),
      before = clone(original);
    M.defaults(d);
    // Only timing inconsistencies are repaired. Missing references, cycles,
    // malformed CDFs, and unsupported versions are never silently removed.
    reconcile(d, before);
    return { document: d, changes: changes(before, d) };
  }
  const api = {
    empty,
    label,
    connectionHints,
    selectionInfo,
    timing,
    changes,
    reconcile,
    moveState,
    incomingRelations,
    setNodeTiming,
    moveSelection,
    propagation,
    activity,
    resizeActivity,
    split,
    convertUnit,
    fingerprint,
    issues,
    repairTimes,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.MEAuthoring = api;
})(globalThis);
