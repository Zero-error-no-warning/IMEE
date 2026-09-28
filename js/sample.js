(function (root) {
  "use strict";
  const state = (
    id,
    actorId,
    name,
    start,
    end,
    activity = "active",
    status = "actual",
  ) => ({ id, actorId, name, start, end, activity, status, notes: "" });
  const transition = (id, from, to, status = "actual", label = "") => ({
    id,
    from,
    to,
    status,
    label,
  });
  const interaction = (
    id,
    fromStateId,
    targetId,
    label,
    kind,
    sourceTime,
    time,
  ) => ({
    id,
    fromStateId,
    targetId,
    label,
    kind,
    sourceTime,
    time,
    targetType: "state",
    effect: "cause",
    outcomeStateId: null,
  });
  function sample() {
    return {
      version: 1,
      title: "海域監視 — 敵UUVの任務阻止",
      time: { unit: "minutes", duration: 60, snap: 1 },
      actors: [
        {
          id: "enemy",
          name: "敵UUV",
          side: "hostile",
          notes: "監視海域で任務を遂行し、離脱する計画。",
        },
        { id: "sensor", name: "海底センサー", side: "friendly", notes: "" },
        { id: "control", name: "管制", side: "friendly", notes: "" },
        { id: "uuv", name: "味方UUV", side: "friendly", notes: "" },
        { id: "torpedo", name: "魚雷", side: "friendly", notes: "" },
      ],
      states: [
        state("e1", "enemy", "進出", 0, 12),
        state("e2", "enemy", "任務遂行", 14, 34),
        state("e3", "enemy", "離脱", 36, 44),
        state("e4", "enemy", "離脱完了", 52, 60, "active", "planned"),
        state("e5", "enemy", "無力化", 46, 60),
        state("s1", "sensor", "監視", 0, 14, "quiet"),
        state("s2", "sensor", "探知・追尾", 14, 48),
        state("c1", "control", "待機", 0, 18, "quiet"),
        state("c2", "control", "識別", 18, 25),
        state("c3", "control", "交戦判断", 27, 33),
        state("u1", "uuv", "哨戒", 0, 29, "quiet"),
        state("u2", "uuv", "接敵", 31, 38),
        state("u3", "uuv", "攻撃", 40, 46),
        state("t1", "torpedo", "待機", 0, 40, "quiet"),
        state("t2", "torpedo", "誘導", 40, 46),
      ],
      transitions: [
        transition("et1", "e1", "e2"),
        transition("et2", "e2", "e3"),
        transition("escape", "e3", "e4", "planned", "離脱成立"),
        transition("disabled", "e3", "e5"),
        transition("st1", "s1", "s2"),
        transition("ct1", "c1", "c2"),
        transition("ct2", "c2", "c3"),
        transition("ut1", "u1", "u2"),
        transition("ut2", "u2", "u3"),
        transition("tt1", "t1", "t2"),
      ],
      interactions: [
        interaction("detect", "e2", "s2", "発見", "detection", 14, 14),
        interaction("report", "s2", "c2", "探知情報", "information", 17, 18),
        interaction("order", "c3", "u2", "接敵指示", "command", 30, 31),
        interaction("launch", "u3", "t2", "発射", "attack", 40, 40),
        {
          id: "hit",
          fromStateId: "t2",
          targetType: "transition",
          targetId: "escape",
          label: "命中・離脱阻止",
          kind: "attack",
          sourceTime: 46,
          time: 46,
          effect: "block",
          outcomeStateId: "e5",
          notes:
            "離脱 → 離脱完了という予定遷移を阻止。実際には無力化へ遷移する。",
        },
      ],
    };
  }
  function grouped() {
    const d = sample();
    d.title = "潜水艦グループ — ソナー・魚雷による任務阻止";
    const submarine = d.actors.find((a) => a.id === "uuv");
    submarine.name = "潜水艦";
    submarine.isGroup = true;
    const sonar = d.actors.find((a) => a.id === "sensor");
    sonar.name = "ソナー";
    sonar.parentId = submarine.id;
    d.actors.find((a) => a.id === "torpedo").parentId = submarine.id;
    return d;
  }
  function research() {
    const d = grouped();
    d.title = "Technology / Gap — 介入経路の検討";
    d.states.find((s) => s.id === "c3").phase = "decision";
    d.technologies = [
      {
        id: "tech-existing",
        name: "既存システム基盤",
        status: "existing",
        trl: 9,
        notes: "操作説明用の架空の技術評価",
      },
      {
        id: "tech-sonar",
        name: "協調音響識別",
        status: "research",
        trl: 4,
        notes: "研究中の識別能力",
      },
      {
        id: "tech-link",
        name: "水中指令通信",
        status: "gap",
        trl: null,
        notes: "必要な通信能力が未確保",
      },
    ];
    d.bindings = [];
    for (const [type, key] of Object.entries({
      actor: "actors",
      state: "states",
      transition: "transitions",
      interaction: "interactions",
    }))
      for (const x of d[key])
        d.bindings.push({
          id: `binding-${x.id}`,
          technologyId: "tech-existing",
          targetType: type,
          targetId: x.id,
        });
    d.bindings.push(
      {
        id: "binding-research",
        technologyId: "tech-sonar",
        targetType: "state",
        targetId: "s2",
      },
      {
        id: "binding-gap",
        technologyId: "tech-link",
        targetType: "interaction",
        targetId: "order",
      },
    );
    d.interactions.push({
      ...d.interactions.find((i) => i.id === "hit"),
      id: "late-hit",
      label: "遅延する介入案",
      time: 54,
      proposed: true,
      outcomeStateId: null,
    });
    d.bindings.push({
      id: "binding-late",
      technologyId: "tech-existing",
      targetType: "interaction",
      targetId: "late-hit",
    });
    return d;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = sample;
    module.exports.grouped = grouped;
    module.exports.research = research;
  } else {
    root.createSample = sample;
    root.createGroupedSample = grouped;
    root.createResearchSample = research;
  }
})(globalThis);
