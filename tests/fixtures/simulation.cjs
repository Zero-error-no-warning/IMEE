module.exports = () => ({
  version: 2, title: "Task performance demo", time: { unit: "seconds", duration: 100, snap: 1 },
  actors: [{ id: "sensor", name: "観測", side: "friendly" }, { id: "command", name: "管制", side: "friendly" }],
  states: [
    { id: "s0", actorId: "sensor", name: "観測開始", time: 0 },
    { id: "s1", actorId: "sensor", name: "検出", time: 10 },
    { id: "c0", actorId: "command", name: "処理準備", time: 0 },
    { id: "c1", actorId: "command", name: "Mission完了", time: 30 },
  ],
  tasks: [
    { id: "detect", fromStateId: "s0", toStateId: "s1", label: "検出",
      simulation: { enabled: true, w: 0, performanceModel: { type: "cdf", degradationInput: "w", curves: [
        { w: 0, points: [{ t: 5, p: .2 }, { t: 10, p: .6 }, { t: 20, p: .9 }], pInfinity: .1 },
        { w: 1, points: [{ t: 5, p: .05 }, { t: 10, p: .2 }, { t: 20, p: .55 }], pInfinity: .45 },
      ] } } },
    { id: "act", fromStateId: "c0", toStateId: "c1", label: "判断・実行",
      simulation: { enabled: false, waitForStateIds: ["s1"] } },
  ], causalLinks: [], simulation: { successStateIds: ["c1"], deadline: 45, iterations: 2000, seed: 17 },
});
