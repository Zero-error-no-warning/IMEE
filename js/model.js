/* Pure document model; shared by the browser and Node's built-in test runner. */
(function (root) {
  "use strict";
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const id = (prefix) =>
    `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;
  const fail = (message) => {
    throw new Error(message);
  };
  const finite = (n, label) => {
    if (typeof n !== "number" || !Number.isFinite(n))
      fail(`${label}は有限の数値で指定してください。`);
  };
  const string = (s, label, max = 300) => {
    if (typeof s !== "string" || !s.trim() || s.length > max)
      fail(`${label}は1〜${max}文字で指定してください。`);
  };
  const oneOf = (v, values, label) => {
    if (!values.includes(v)) fail(`${label}が不正です。`);
  };
  function validate(doc) {
    if (!doc || doc.version !== 1)
      fail("対応していないファイル形式です（version: 1 が必要です）。");
    string(doc.title, "ミッション名");
    if (!doc.time) fail("時間設定がありません。");
    oneOf(doc.time.unit, ["seconds", "minutes", "hours"], "時間単位");
    finite(doc.time.duration, "表示期間");
    finite(doc.time.snap, "スナップ");
    if (
      doc.time.duration <= 0 ||
      doc.time.duration > 1000000 ||
      doc.time.snap < 0.01 ||
      doc.time.snap > doc.time.duration
    )
      fail("表示期間またはスナップの範囲が不正です。");
    for (const key of ["actors", "states", "transitions", "interactions"]) {
      if (!Array.isArray(doc[key]) || doc[key].length > 10000)
        fail(`${key}は10,000件以下の配列にしてください。`);
    }
    const allIds = new Set();
    for (const entry of [
      ...doc.actors,
      ...doc.states,
      ...doc.transitions,
      ...doc.interactions,
    ]) {
      if (!entry || typeof entry !== "object") fail("不正な項目があります。");
      string(entry.id, "ID");
      if (allIds.has(entry.id)) fail(`IDが重複しています: ${entry.id}`);
      allIds.add(entry.id);
      if (
        entry.notes !== undefined &&
        (typeof entry.notes !== "string" || entry.notes.length > 10000)
      )
        fail("備考は10,000文字以下にしてください。");
    }
    const actors = new Map(doc.actors.map((a) => [a.id, a]));
    const states = new Map(doc.states.map((s) => [s.id, s]));
    const transitions = new Map(doc.transitions.map((t) => [t.id, t]));
    for (const a of doc.actors) {
      string(a.name, "Actor名");
      oneOf(a.side, ["friendly", "hostile", "neutral"], "所属");
      if (
        a.parentId != null &&
        (!actors.has(a.parentId) || a.parentId === a.id)
      )
        fail("親Actorが存在しないか、自分自身を親にしています。");
      for (const key of ["isGroup", "collapsed"])
        if (a[key] !== undefined && typeof a[key] !== "boolean")
          fail(`${key}は真偽値で指定してください。`);
      const ancestors = new Set([a.id]);
      let parent = actors.get(a.parentId);
      while (parent) {
        if (ancestors.has(parent.id)) fail("Actorの階層が循環しています。");
        ancestors.add(parent.id);
        parent = actors.get(parent.parentId);
      }
    }
    for (const s of doc.states) {
      string(s.name, "State名");
      if (!actors.has(s.actorId)) fail("StateのActorが存在しません。");
      finite(s.start, "開始");
      finite(s.end, "終了");
      if (s.start < 0 || s.end <= s.start || s.end > doc.time.duration)
        fail(
          `「${s.name}」の期間は 0 ≤ 開始 < 終了 ≤ 表示期間 にしてください。`,
        );
      oneOf(s.status, ["actual", "planned"], "状態の区分");
      oneOf(s.activity, ["active", "quiet"], "状態の強調");
    }
    for (const t of doc.transitions) {
      const from = states.get(t.from),
        to = states.get(t.to);
      if (!from || !to || from.id === to.id) fail("遷移の接続先が不正です。");
      if (from.actorId !== to.actorId)
        fail(
          "Transitionは同一Actor内で接続してください。Actor間はInteractionを使います。",
        );
      if (from.end > to.start)
        fail(
          `「${from.name} → ${to.name}」が時間を逆行しています。接続先の開始を接続元の終了以降にしてください。`,
        );
      oneOf(t.status, ["actual", "planned"], "遷移の区分");
      if (
        t.label !== undefined &&
        (typeof t.label !== "string" || t.label.length > 300)
      )
        fail("遷移ラベルが不正です。");
    }
    for (const i of doc.interactions) {
      string(i.label, "作用名");
      oneOf(
        i.kind,
        [
          "detection",
          "command",
          "information",
          "support",
          "attack",
          "interference",
        ],
        "作用の種類",
      );
      oneOf(i.effect, ["cause", "block"], "作用の効果");
      oneOf(i.targetType, ["state", "transition"], "作用先");
      const source = states.get(i.fromStateId);
      const target =
        i.targetType === "state"
          ? states.get(i.targetId)
          : transitions.get(i.targetId);
      if (!source || !target) fail("Interactionの接続先が存在しません。");
      const targetState =
        i.targetType === "state" ? target : states.get(target.to);
      if (source.actorId === targetState.actorId)
        fail("Interactionは異なるActorの間で接続してください。");
      finite(i.sourceTime, "作用の発生時刻");
      finite(i.time, "作用の到達時刻");
      if (
        i.sourceTime < source.start ||
        i.sourceTime > source.end ||
        i.time < i.sourceTime
      )
        fail(
          `「${i.label}」の発生時刻は接続元State内、到達時刻は発生以降にしてください。`,
        );
      if (i.targetType === "state" && Math.abs(i.time - target.start) > 1e-7)
        fail(
          `「${i.label}」の到達時刻は作用先Stateの開始時刻に一致させてください。`,
        );
      if (
        i.targetType === "transition" &&
        (i.time < states.get(target.from).end ||
          i.time > states.get(target.to).start)
      )
        fail(
          `「${i.label}」の到達時刻は対象Transitionの期間内にしてください。`,
        );
      if (
        i.effect === "block" &&
        (i.targetType !== "transition" || target.status !== "planned")
      )
        fail("妨害は予定Transitionに接続してください。");
      if (i.outcomeStateId) {
        const outcome = states.get(i.outcomeStateId);
        if (
          i.effect !== "block" ||
          !outcome ||
          outcome.actorId !== targetState.actorId ||
          outcome.status !== "actual" ||
          outcome.start < i.time
        )
          fail(
            "妨害後のStateは作用先Actorの実際の状態で、到達時刻以降に開始する必要があります。",
          );
      }
    }
    return doc;
  }
  function parse(text) {
    return validate(JSON.parse(text));
  }
  const snap = (value, step) =>
    Math.round(Math.round(value / step) * step * 1e8) / 1e8;
  function descendants(doc, actorId) {
    const result = new Set([actorId]),
      queue = [actorId];
    const children = new Map();
    for (const a of doc.actors) {
      const key = a.parentId || null;
      if (!children.has(key)) children.set(key, []);
      children.get(key).push(a.id);
    }
    for (let n = 0; n < queue.length; n++)
      for (const id of children.get(queue[n]) || [])
        if (!result.has(id)) {
          result.add(id);
          queue.push(id);
        }
    return result;
  }
  function hierarchy(doc, includeHidden = false) {
    const children = new Map();
    for (const a of doc.actors) {
      const key = a.parentId || null;
      if (!children.has(key)) children.set(key, []);
      children.get(key).push(a);
    }
    const result = [],
      stack = (children.get(null) || [])
        .slice()
        .reverse()
        .map((actor) => ({ actor, depth: 0 }));
    while (stack.length) {
      const row = stack.pop(),
        nested = children.get(row.actor.id) || [];
      result.push({ ...row, hasChildren: nested.length > 0 });
      if (!row.actor.collapsed || includeHidden)
        for (const actor of nested.slice().reverse())
          stack.push({ actor, depth: row.depth + 1 });
    }
    return result;
  }
  function placeActor(doc, actorId, targetId, position = "before") {
    const actor = doc.actors.find((a) => a.id === actorId),
      target = doc.actors.find((a) => a.id === targetId);
    if (!actor || !target || descendants(doc, actorId).has(targetId))
      fail("自分自身や子Actorの中には移動できません。");
    actor.parentId =
      position === "inside" ? target.id : target.parentId || null;
    if (position === "inside") {
      target.collapsed = false;
      target.isGroup = true;
    }
    doc.actors.splice(doc.actors.indexOf(actor), 1);
    const index = doc.actors.indexOf(target) + (position === "before" ? 0 : 1);
    doc.actors.splice(index, 0, actor);
  }
  function viewport(duration, width, start = 0, span = duration) {
    const safeSpan = Math.min(
      duration,
      Math.max(Math.min(0.01, duration), span),
    );
    const safeStart = Math.max(0, Math.min(duration - safeSpan, start));
    const plotLeft = Math.min(208, Math.max(100, width * 0.3));
    return {
      start: safeStart,
      span: safeSpan,
      end: safeStart + safeSpan,
      width,
      plotLeft,
      scale: Math.max(1, width - plotLeft - 24) / safeSpan,
    };
  }
  function layout(doc, scale = 16, options = {}) {
    const rows = [],
      positions = new Map();
    let top = 64;
    const left = options.plotLeft ?? 208,
      start = options.start || 0;
    for (const node of hierarchy(doc, options.includeHidden)) {
      const { actor } = node,
        ends = [];
      const states = doc.states
        .filter((s) => s.actorId === actor.id)
        .sort(
          (a, b) =>
            (a.status === "planned") - (b.status === "planned") ||
            a.start - b.start ||
            a.id.localeCompare(b.id),
        );
      for (const s of states) {
        let lane = ends.findIndex((end) => end <= s.start);
        if (lane === -1) lane = ends.length;
        ends[lane] = s.end;
        positions.set(s.id, {
          x: left + (s.start - start) * scale,
          y: top + 28 + lane * 52,
          width: (s.end - s.start) * scale,
          height: 32,
          lane,
        });
      }
      const height = Math.max(
        actor.isGroup && !states.length ? 68 : 100,
        54 + ends.length * 52,
      );
      rows.push({ ...node, top, height, lanes: ends.length });
      top += height;
    }
    return {
      rows,
      positions,
      height: top + 28,
      width: options.width ?? left + 40 + doc.time.duration * scale,
    };
  }
  function remove(doc, type, itemId) {
    if (type === "actor") {
      const ids = descendants(doc, itemId);
      doc.actors = doc.actors.filter((a) => !ids.has(a.id));
      doc.states = doc.states.filter((s) => !ids.has(s.actorId));
    }
    if (type === "state")
      doc.states = doc.states.filter((s) => s.id !== itemId);
    const stateIds = new Set(doc.states.map((s) => s.id));
    doc.transitions = doc.transitions.filter(
      (t) =>
        (type !== "transition" || t.id !== itemId) &&
        stateIds.has(t.from) &&
        stateIds.has(t.to),
    );
    const transitionIds = new Set(doc.transitions.map((t) => t.id));
    doc.interactions = doc.interactions.filter(
      (i) =>
        (type !== "interaction" || i.id !== itemId) &&
        stateIds.has(i.fromStateId) &&
        (i.targetType === "state"
          ? stateIds.has(i.targetId)
          : transitionIds.has(i.targetId)),
    );
    doc.interactions.forEach((i) => {
      if (i.outcomeStateId && !stateIds.has(i.outcomeStateId))
        i.outcomeStateId = null;
    });
  }
  function related(doc, selection) {
    if (!selection) return new Set();
    const result = new Set([selection.id]);
    if (selection.type === "actor") {
      const ids = descendants(doc, selection.id);
      doc.states
        .filter((s) => ids.has(s.actorId))
        .forEach((s) => result.add(s.id));
    }
    // Follow the connected causal component, including blocked plans and alternative outcomes.
    let changed = true;
    while (changed) {
      changed = false;
      for (const edge of [
        ...doc.transitions.map((t) => [t.id, t.from, t.to]),
        ...doc.interactions.map((i) =>
          [i.id, i.fromStateId, i.targetId, i.outcomeStateId].filter(Boolean),
        ),
      ]) {
        if (edge.some((id) => result.has(id)))
          for (const id of edge)
            if (!result.has(id)) {
              result.add(id);
              changed = true;
            }
      }
    }
    return result;
  }
  class History {
    constructor(doc) {
      this.doc = clone(validate(doc));
      this.past = [];
      this.future = [];
    }
    commit(next) {
      validate(next);
      if (JSON.stringify(next) === JSON.stringify(this.doc)) return false;
      this.past.push(clone(this.doc));
      if (this.past.length > 100) this.past.shift();
      this.doc = clone(next);
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
    validate,
    parse,
    snap,
    hierarchy,
    descendants,
    placeActor,
    viewport,
    layout,
    remove,
    related,
    History,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ME = api;
})(globalThis);
