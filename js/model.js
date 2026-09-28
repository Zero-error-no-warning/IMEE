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
      if (s.phase !== undefined)
        oneOf(s.phase, ["other", "decision"], "分析上の役割");
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
      if (i.proposed !== undefined && typeof i.proposed !== "boolean")
        fail("proposedは真偽値です。");
      oneOf(
        i.kind,
        [
          "detection",
          "observation",
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
        !i.proposed &&
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
    validateExtensions(doc);
    return doc;
  }
  function parse(text) {
    return migrate(validate(JSON.parse(text)));
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
    const order = doc.views?.main?.actorOrder || doc.actors.map((a) => a.id);
    const rank = new Map(order.map((id, n) => [id, n]));
    for (const a of doc.actors
      .slice()
      .sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9))) {
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
      if (!isCollapsed(doc, row.actor.id) || includeHidden)
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
      setCollapsed(doc, target.id, false);
      target.isGroup = true;
    }
    const order = doc.views?.main?.actorOrder;
    if (order) {
      order.splice(order.indexOf(actor.id), 1);
      order.splice(
        order.indexOf(target.id) + (position === "before" ? 0 : 1),
        0,
        actor.id,
      );
    } else {
      doc.actors.splice(doc.actors.indexOf(actor), 1);
      doc.actors.splice(
        doc.actors.indexOf(target) + (position === "before" ? 0 : 1),
        0,
        actor,
      );
    }
  }
  function viewport(duration, width, start = 0, span = duration) {
    const safeSpan = Math.min(
      duration,
      Math.max(Math.min(0.01, duration), span),
    );
    const safeStart = Math.max(0, Math.min(duration - safeSpan, start));
    const plotLeft = Math.min(176, Math.max(100, width * 0.3));
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
    let top = 48;
    const laneHeight = doc.views?.main?.laneHeight || 44;
    const left = options.plotLeft ?? 176,
      start = options.start || 0;
    const owner = new Map(doc.states.map((s) => [s.id, s.actorId]));
    for (const t of doc.transitions) owner.set(t.id, owner.get(t.from));
    for (const i of doc.interactions) owner.set(i.id, owner.get(i.fromStateId));
    for (const a of doc.actors) owner.set(a.id, a.id);
    const annotatedActors = new Set(
      (doc.bindings || []).map((b) => owner.get(b.targetId)),
    );
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
      const hasTechnology = annotatedActors.has(actor.id);
      const rowLaneHeight = hasTechnology
        ? Math.max(52, laneHeight)
        : laneHeight;
      for (const s of states) {
        let lane = ends.findIndex((end) => end <= s.start);
        if (lane === -1) lane = ends.length;
        ends[lane] = s.end;
        positions.set(s.id, {
          x: left + (s.start - start) * scale,
          y: top + 14 + lane * rowLaneHeight,
          width: (s.end - s.start) * scale,
          height: 32,
          lane,
        });
      }
      const baseHeight = states.length
        ? 68 + Math.max(0, ends.length - 1) * rowLaneHeight
        : hasTechnology
          ? 68
          : 44;
      const height =
        baseHeight +
        (node.hasChildren &&
        isCollapsed(doc, actor.id) &&
        !options.includeHidden
          ? 16
          : 0);
      rows.push({ ...node, top, height, lanes: ends.length });
      top += height;
    }
    return {
      rows,
      positions,
      height: top + 12,
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
    const remaining = new Set(
      [
        ...doc.actors,
        ...doc.states,
        ...doc.transitions,
        ...doc.interactions,
      ].map((x) => x.id),
    );
    if (doc.bindings)
      doc.bindings = doc.bindings.filter((b) => remaining.has(b.targetId));
    if (doc.views)
      for (const v of Object.values(doc.views)) {
        v.actorOrder = v.actorOrder.filter((id) =>
          doc.actors.some((a) => a.id === id),
        );
        v.collapsedActors = v.collapsedActors.filter((id) =>
          doc.actors.some((a) => a.id === id),
        );
      }
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

  const targetCollections = {
    actor: "actors",
    state: "states",
    transition: "transitions",
    interaction: "interactions",
  };
  const technologyStatuses = [
    "existing",
    "research",
    "planned",
    "gap",
    "unknown",
  ];
  function migrate(doc) {
    doc.technologies ||= [];
    doc.bindings ||= [];
    doc.views ||= {};
    doc.views.main ||= {
      collapsedActors: doc.actors.filter((a) => a.collapsed).map((a) => a.id),
      actorOrder: doc.actors.map((a) => a.id),
      zoom: 1,
      visibleTimeRange: { start: 0, end: doc.time.duration },
      filters: {
        technology: true,
        interaction: true,
        planned: true,
        quiet: true,
      },
      laneHeight: 44,
      mode: "mission",
    };
    for (const a of doc.actors) {
      delete a.collapsed;
      if (!doc.views.main.actorOrder.includes(a.id))
        doc.views.main.actorOrder.push(a.id);
    }
    return doc;
  }
  function validateExtensions(d) {
    const ids = new Set(
      [...d.actors, ...d.states, ...d.transitions, ...d.interactions].map(
        (x) => x.id,
      ),
    );
    for (const key of ["technologies", "bindings"]) {
      if (d[key] === undefined) continue;
      if (!Array.isArray(d[key]) || d[key].length > 10000)
        fail(`${key}は10,000件以下の配列です。`);
      for (const x of d[key]) {
        if (!x) fail("不正な技術データです。");
        string(x.id, "ID");
        if (ids.has(x.id)) fail("IDが重複しています。");
        ids.add(x.id);
        if (
          x.notes !== undefined &&
          (typeof x.notes !== "string" || x.notes.length > 10000)
        )
          fail("備考が不正です。");
      }
    }
    for (const t of d.technologies || []) {
      string(t.name, "Technology名");
      oneOf(t.status, technologyStatuses, "技術状態");
      if (
        t.trl !== null &&
        (!Number.isInteger(t.trl) || t.trl < 1 || t.trl > 9)
      )
        fail("TRLは1〜9またはnullです。");
    }
    for (const b of d.bindings || []) {
      oneOf(b.targetType, Object.keys(targetCollections), "Binding対象");
      if (
        !d[targetCollections[b.targetType]].some((x) => x.id === b.targetId) ||
        !(d.technologies || []).some((x) => x.id === b.technologyId)
      )
        fail("Bindingの参照先が存在しません。");
    }
    if (d.views !== undefined) {
      if (
        !d.views ||
        typeof d.views !== "object" ||
        Array.isArray(d.views) ||
        !d.views.main
      )
        fail("views.mainが必要です。");
      for (const v of Object.values(d.views)) {
        if (!v || typeof v !== "object") fail("Viewが不正です。");
        for (const k of ["collapsedActors", "actorOrder"]) {
          if (
            !Array.isArray(v[k]) ||
            new Set(v[k]).size !== v[k].length ||
            v[k].some((id) => !d.actors.some((a) => a.id === id))
          )
            fail(`Viewの${k}が不正です。`);
        }
        finite(v.zoom, "zoom");
        finite(v.laneHeight, "lane height");
        if (v.zoom <= 0 || v.laneHeight < 40 || v.laneHeight > 160)
          fail("View倍率または行高さが範囲外です。");
        finite(v.visibleTimeRange?.start, "表示開始");
        finite(v.visibleTimeRange?.end, "表示終了");
        if (
          v.visibleTimeRange.start < 0 ||
          v.visibleTimeRange.end <= v.visibleTimeRange.start ||
          v.visibleTimeRange.end > d.time.duration
        )
          fail("Viewの表示期間が範囲外です。");
        oneOf(
          v.mode,
          ["mission", "technology", "gap", "interaction"],
          "View mode",
        );
        if (
          !v.filters ||
          ["technology", "interaction", "planned", "quiet"].some(
            (k) => typeof v.filters[k] !== "boolean",
          )
        )
          fail("Viewのfilterが不正です。");
      }
    }
  }
  function isCollapsed(d, id) {
    return d.views?.main
      ? d.views.main.collapsedActors.includes(id)
      : !!d.actors.find((a) => a.id === id)?.collapsed;
  }
  function setCollapsed(d, id, collapsed) {
    if (!d.views?.main) {
      const a = d.actors.find((a) => a.id === id);
      if (a) a.collapsed = collapsed;
      return;
    }
    d.views.main.collapsedActors = d.views.main.collapsedActors.filter(
      (x) => x !== id,
    );
    if (collapsed) d.views.main.collapsedActors.push(id);
  }
  function selectionClosure(d, selection) {
    const actors = new Set(),
      states = new Set();
    for (const x of selection) {
      if (x.type === "actor")
        for (const id of descendants(d, x.id)) actors.add(id);
      if (x.type === "state") states.add(x.id);
    }
    d.states
      .filter((s) => actors.has(s.actorId))
      .forEach((s) => states.add(s.id));
    const transitions = new Set(
      d.transitions
        .filter((t) => states.has(t.from) && states.has(t.to))
        .map((t) => t.id),
    );
    const interactions = new Set(
      d.interactions
        .filter(
          (i) =>
            states.has(i.fromStateId) &&
            (i.targetType === "state" ? states : transitions).has(i.targetId),
        )
        .map((i) => i.id),
    );
    return { actors, states, transitions, interactions };
  }
  function fragment(d, selection) {
    const sets = selectionClosure(d, selection),
      result = {};
    const included = new Set(Object.values(sets).flatMap((s) => [...s]));
    for (const key of Object.values(targetCollections))
      result[key] = clone(d[key].filter((x) => sets[key].has(x.id)));
    result.bindings = clone(
      (d.bindings || []).filter((b) => included.has(b.targetId)),
    );
    result.technologies = clone(
      (d.technologies || []).filter((t) =>
        result.bindings.some((b) => b.technologyId === t.id),
      ),
    );
    result.selection = clone(selection.filter((x) => included.has(x.id)));
    return result;
  }
  function paste(d, fragment) {
    migrate(d);
    const f = clone(fragment),
      map = new Map();
    for (const key of [...Object.values(targetCollections), "bindings"])
      for (const x of f[key]) map.set(x.id, id(key.slice(0, -1)));
    for (const t of f.technologies) {
      if (!d.technologies.some((x) => x.id === t.id)) d.technologies.push(t);
    }
    for (const a of f.actors) {
      a.parentId =
        map.get(a.parentId) ||
        (d.actors.some((x) => x.id === a.parentId) ? a.parentId : null);
      a.name = `${a.name} のコピー`.slice(0, 300);
    }
    for (const s of f.states) {
      s.actorId = map.get(s.actorId) || s.actorId;
      if (
        !d.actors.some((a) => a.id === s.actorId) &&
        !f.actors.some((a) => map.get(a.id) === s.actorId)
      )
        fail("貼付先Actorがありません。");
    }
    for (const t of f.transitions) {
      t.from = map.get(t.from);
      t.to = map.get(t.to);
    }
    for (const i of f.interactions) {
      i.fromStateId = map.get(i.fromStateId);
      i.targetId = map.get(i.targetId);
      i.outcomeStateId = map.get(i.outcomeStateId) || null;
    }
    for (const b of f.bindings) b.targetId = map.get(b.targetId);
    for (const key of [...Object.values(targetCollections), "bindings"])
      for (const x of f[key]) {
        x.id = map.get(x.id);
        d[key].push(x);
      }
    d.views.main.actorOrder.push(...f.actors.map((a) => a.id));
    return f.selection.map((x) => ({ ...x, id: map.get(x.id) }));
  }
  function groupActors(d, ids, name = "新しいグループ") {
    const selected = new Set(ids),
      roots = d.actors.filter(
        (a) =>
          selected.has(a.id) &&
          ![...selected].some(
            (id) => id !== a.id && descendants(d, id).has(a.id),
          ),
      );
    if (!roots.length) fail("Actorを選択してください。");
    const parent = roots.every(
      (a) => (a.parentId || null) === (roots[0].parentId || null),
    )
      ? roots[0].parentId || null
      : null;
    const group = {
      id: id("actor"),
      name,
      side: roots.every((a) => a.side === roots[0].side)
        ? roots[0].side
        : "neutral",
      parentId: parent,
      isGroup: true,
    };
    d.actors.push(group);
    roots.forEach((a) => (a.parentId = group.id));
    if (d.views)
      d.views.main.actorOrder.splice(
        Math.max(0, d.views.main.actorOrder.indexOf(roots[0].id)),
        0,
        group.id,
      );
    return group.id;
  }
  function ungroupActor(d, id) {
    const group = d.actors.find((a) => a.id === id);
    if (!group) return;
    d.actors
      .filter((a) => a.parentId === id)
      .forEach((a) => (a.parentId = group.parentId || null));
    // A real Actor can also be a container: retain it if it carries mission/technology data.
    if (
      d.states.some((s) => s.actorId === id) ||
      (d.bindings || []).some((b) => b.targetId === id)
    ) {
      group.isGroup = false;
      setCollapsed(d, id, false);
    } else remove(d, "actor", id);
  }
  function moveSelection(d, selection, delta, targetActorId = null) {
    const sets = selectionClosure(d, selection);
    for (const s of d.states)
      if (sets.states.has(s.id)) {
        s.start += delta;
        s.end += delta;
        if (targetActorId && !sets.actors.has(s.actorId))
          s.actorId = targetActorId;
      }
    for (const i of d.interactions) {
      if (sets.states.has(i.fromStateId)) i.sourceTime += delta;
      if (
        i.targetType === "state"
          ? sets.states.has(i.targetId)
          : sets.transitions.has(i.targetId)
      )
        i.time += delta;
    }
  }
  function technologyFor(d, type, id) {
    return (d.bindings || [])
      .filter((b) => b.targetType === type && b.targetId === id)
      .map((b) => ({
        ...d.technologies.find((t) => t.id === b.technologyId),
        bindingId: b.id,
      }));
  }
  function opportunity(d, i) {
    if (i.targetType !== "transition") return null;
    const t = d.transitions.find((t) => t.id === i.targetId),
      start = d.states.find((s) => s.id === t.from).end,
      end = d.states.find((s) => s.id === t.to).start;
    return {
      start,
      end,
      duration: end - start,
      arrival: i.time,
      status: i.time < start ? "early" : i.time > end ? "late" : "within",
      margin: end - i.time,
    };
  }
  function interactionProxies(d, visibleIds) {
    const actorOfState = (id) => d.states.find((s) => s.id === id)?.actorId;
    const representative = (id) => {
      let a = d.actors.find((a) => a.id === id);
      while (a && !visibleIds.has(a.id))
        a = d.actors.find((x) => x.id === a.parentId);
      return a?.id;
    };
    const bundles = new Map();
    for (const i of d.interactions) {
      const from = actorOfState(i.fromStateId),
        to = actorOfState(
          i.targetType === "state"
            ? i.targetId
            : d.transitions.find((t) => t.id === i.targetId)?.to,
        );
      const a = representative(from),
        b = representative(to);
      if (!a || !b || a === b || (a === from && b === to)) continue;
      const key = JSON.stringify([
        a,
        b,
        i.kind,
        i.effect,
        i.label,
        !!i.proposed,
      ]);
      if (!bundles.has(key))
        bundles.set(key, {
          fromActorId: a,
          toActorId: b,
          kind: i.kind,
          label: i.label,
          effect: i.effect,
          interactions: [],
        });
      bundles.get(key).interactions.push(i);
    }
    return [...bundles.values()];
  }
  function analyzeTransition(d, transitionId) {
    const ids = new Set([transitionId]),
      paths = [],
      warnings = [];
    const stateMap = new Map(d.states.map((s) => [s.id, s]));
    const actorMap = new Map(d.actors.map((a) => [a.id, a]));
    const tech = (type, id) => technologyFor(d, type, id);
    const blockers = d.interactions.filter(
      (i) =>
        i.targetType === "transition" &&
        i.targetId === transitionId &&
        i.effect === "block",
    );
    let truncated = false;
    // Directed reverse traversal. Each branch is evaluated separately; roles cannot be borrowed across branches.
    function visit(type, id, route, roles, visited, deadline = Infinity) {
      if (paths.length >= 256 || route.length >= 512) {
        truncated = true;
        return;
      }
      if (visited.has(id)) {
        paths.push({ route, roles: [...roles], temporalGap: true });
        return;
      }
      const seen = new Set(visited);
      seen.add(id);
      ids.add(id);
      const next = [...route, { type, id }],
        r = new Set(roles);
      const x = d[targetCollections[type]].find((x) => x.id === id);
      if (type === "interaction") {
        if (x.time > deadline) {
          paths.push({ route: next, roles: [...r], temporalGap: true });
          return;
        }
        const sourceBlue =
          actorMap.get(stateMap.get(x.fromStateId).actorId)?.side ===
          "friendly";
        const targetBlue =
          x.targetType === "state" &&
          actorMap.get(stateMap.get(x.targetId).actorId)?.side === "friendly";
        if (
          ["detection", "observation"].includes(x.kind) &&
          (sourceBlue || targetBlue)
        )
          r.add("observation");
        if (x.kind === "command" && sourceBlue) r.add("command");
        if (["attack", "interference"].includes(x.kind) && sourceBlue)
          r.add("attack");
        if (
          ["detection", "observation"].includes(x.kind) &&
          targetBlue &&
          !sourceBlue
        ) {
          paths.push({ route: next, roles: [...r] });
          return;
        }
        visit("state", x.fromStateId, next, r, seen, x.sourceTime);
        return;
      }
      if (type === "transition") {
        visit(
          "state",
          x.from,
          next,
          r,
          seen,
          Math.min(deadline, stateMap.get(x.from).end),
        );
        return;
      }
      if (
        type === "state" &&
        x.phase === "decision" &&
        actorMap.get(x.actorId)?.side === "friendly"
      )
        r.add("decision");
      const incoming = [
        ...d.transitions
          .filter((t) => t.to === id)
          .map((t) => ({ type: "transition", id: t.id })),
        ...d.interactions
          .filter((i) => i.targetType === "state" && i.targetId === id)
          .map((i) => ({ type: "interaction", id: i.id })),
      ];
      if (!incoming.length) paths.push({ route: next, roles: [...r] });
      else
        for (const edge of incoming)
          visit(edge.type, edge.id, next, r, seen, Math.min(deadline, x.start));
    }
    for (const b of blockers) {
      const before = paths.length;
      visit("interaction", b.id, [], new Set(), new Set());
      for (const path of paths.slice(before)) {
        path.interventionId = b.id;
        path.opportunity = opportunity(d, b);
        path.technologies = path.route.flatMap((e) => tech(e.type, e.id));
        for (const e of path.route.filter((e) => e.type === "state"))
          path.technologies.push(...tech("actor", stateMap.get(e.id).actorId));

        path.missingRoles = [
          "observation",
          "decision",
          "command",
          "attack",
        ].filter((role) => !path.roles.includes(role));
        const sequence = path.route
          .slice()
          .reverse()
          .flatMap((e) => {
            const x = d[targetCollections[e.type]].find((x) => x.id === e.id);
            if (e.type === "state")
              return x.phase === "decision" &&
                actorMap.get(x.actorId)?.side === "friendly"
                ? ["decision"]
                : [];
            if (e.type !== "interaction") return [];
            const blue =
              actorMap.get(stateMap.get(x.fromStateId).actorId)?.side ===
              "friendly";
            if (["detection", "observation"].includes(x.kind))
              return blue ||
                (x.targetType === "state" &&
                  actorMap.get(stateMap.get(x.targetId).actorId)?.side ===
                    "friendly")
                ? ["observation"]
                : [];
            return blue
              ? x.kind === "command"
                ? ["command"]
                : ["attack", "interference"].includes(x.kind)
                  ? ["attack"]
                  : []
              : [];
          });
        let progress = 0;
        const required = ["observation", "decision", "command", "attack"];
        for (const role of sequence)
          if (role === required[progress]) progress++;
        path.ordered = progress === 4;
        path.structural =
          path.ordered && path.missingRoles.length === 0 && !path.temporalGap;
        path.gaps = path.technologies.filter((t) => t.status !== "existing");
        path.unbound = path.route.filter(
          (e) =>
            tech(e.type, e.id).length === 0 &&
            !(
              e.type === "state" &&
              tech("actor", stateMap.get(e.id).actorId).length
            ),
        );

        path.complete =
          path.structural &&
          path.opportunity.status === "within" &&
          !path.gaps.length &&
          !path.unbound.length;
      }
    }
    if (truncated)
      warnings.push(
        "経路が多いため256経路／深さ512で解析を打ち切りました。ALL判定はできません。",
      );
    return {
      ids,
      paths,
      warnings,
      some: paths.some((p) => p.complete),
      all: !truncated && paths.length > 0 && paths.every((p) => p.complete),
    };
  }

  class History {
    constructor(doc) {
      this.doc = migrate(clone(validate(doc)));
      this.past = [];
      this.future = [];
    }
    commit(next) {
      next = migrate(clone(validate(next)));
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
    migrate,
    isCollapsed,
    setCollapsed,
    selectionClosure,
    fragment,
    paste,
    groupActors,
    ungroupActor,
    moveSelection,
    technologyFor,
    technologyStatuses,
    opportunity,
    interactionProxies,
    analyzeTransition,
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
