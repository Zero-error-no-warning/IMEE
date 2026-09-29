(function (root) {
  "use strict";
  const M =
    typeof module !== "undefined" && module.exports
      ? require("./model.js")
      : root.ME;
  function sample() {
    const d = {
      version: 2,
      title: "捜索・識別・通信 — Taskと因果",
      time: { unit: "minutes", duration: 60, snap: 1 },
      actors: [
        {
          id: "group",
          name: "水中戦力",
          side: "friendly",
          isGroup: true,
          parentId: null,
        },
        { id: "sensor", name: "ソナー", side: "friendly", parentId: "group" },
        { id: "control", name: "管制", side: "friendly", parentId: "group" },
        { id: "enemy", name: "敵妨害", side: "hostile", parentId: null },
        { id: "radio", name: "通信", side: "friendly", parentId: "group" },
      ],
      states: [
        { id: "s0", actorId: "sensor", name: "未探知", time: 2 },
        { id: "s1", actorId: "sensor", name: "探知", time: 16 },
        { id: "i0", actorId: "control", name: "未識別", time: 18 },
        {
          id: "i1",
          actorId: "control",
          name: "識別済",
          time: 35,
          phase: "decision",
        },
        { id: "i2", actorId: "control", name: "未識別", time: 35 },
        { id: "e0", actorId: "enemy", name: "妨害準備", time: 24 },
        { id: "e1", actorId: "enemy", name: "妨害中", time: 45 },
        { id: "r0", actorId: "radio", name: "通信可能", time: 38 },
        { id: "r1", actorId: "radio", name: "送信完了", time: 56 },
        { id: "r2", actorId: "radio", name: "送信失敗", time: 56 },
      ],
      tasks: [
        {
          id: "search",
          fromStateId: "s0",
          toStateId: "s1",
          label: "捜索",
          kind: "detection",
        },
        {
          id: "identify",
          fromStateId: "i0",
          label: "識別",
          junctions: [
            {
              id: "j-identify",
              time: 29,
              outcomes: [
                { toStateId: "i1", label: "OK" },
                { toStateId: "i2", label: "NG" },
              ],
            },
          ],
        },
        {
          id: "jam",
          fromStateId: "e0",
          toStateId: "e1",
          label: "通信妨害",
          kind: "interference",
          status: "planned",
        },
        {
          id: "transmit",
          fromStateId: "r0",
          label: "送信",
          junctions: [
            {
              id: "j-transmit",
              time: 49,
              outcomes: [
                { toStateId: "r1", label: "OK" },
                { toStateId: "r2", label: "NG" },
              ],
            },
          ],
        },
      ],
      causalLinks: [
        {
          id: "report",
          source: { type: "state", id: "s1" },
          target: { type: "state", id: "i0" },
          label: "探知情報",
          polarity: "positive",
          kind: "information",
        },
        {
          id: "order",
          source: { type: "state", id: "i1" },
          target: { type: "state", id: "r0" },
          label: "送信指令",
          polarity: "positive",
          kind: "command",
        },
        {
          id: "negative",
          source: { type: "task", id: "jam", time: 42 },
          target: { type: "task", id: "transmit", time: 49 },
          label: "通信を妨害",
          polarity: "negative",
          kind: "interference",
        },
      ],
      technologies: [],
      bindings: [],
    };
    d.states.forEach((s) => {
      s.status ??= "actual";
      s.activity = "active";
      s.phase ??= "other";
      s.notes = "";
    });
    d.tasks.forEach((t) => {
      t.status ??= "actual";
      t.notes = "";
    });
    return M.defaults(d);
  }
  function grouped() {
    const d = sample();
    d.title = "階層と共有ジャンクション";
    d.views.main.collapsedActors = ["group"];
    return d;
  }
  function research() {
    const d = sample();
    d.title = "技術と介入経路";
    d.technologies = [
      { id: "tech-ready", name: "既存処理系", status: "existing", trl: 9 },
      { id: "tech-rd", name: "耐妨害通信", status: "research", trl: 4 },
    ];
    for (const a of d.actors)
      d.bindings.push({
        id: "bind-" + a.id,
        technologyId: "tech-ready",
        targetType: "actor",
        targetId: a.id,
      });
    d.bindings.push({
      id: "bind-radio-task",
      technologyId: "tech-rd",
      targetType: "task",
      targetId: "transmit",
    });
    d.causalLinks.push({
      id: "blue-action",
      source: { type: "state", id: "r0" },
      target: { type: "task", id: "jam", time: 44 },
      polarity: "negative",
      label: "妨害活動を抑制",
      kind: "interference",
    });
    for (const c of d.causalLinks)
      d.bindings.push({
        id: "bind-" + c.id,
        technologyId: "tech-ready",
        targetType: "causalLink",
        targetId: c.id,
      });
    d.bindings.push({
      id: "bind-blue-rd",
      technologyId: "tech-rd",
      targetType: "causalLink",
      targetId: "blue-action",
    });
    d.views.main.mode = "gap";
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
