/* Fictional teaching scenarios. Times and technology maturity are illustrative. */
(function (root) {
  "use strict";
  const M = typeof module !== "undefined" && module.exports ? require("./model.js") : root.ME;
  const actor = (id, name, parentId = null, side = "friendly", isGroup = false) =>
    ({ id, name, parentId, side, ...(isGroup ? { isGroup } : {}) });
  const state = (id, actorId, name, time, status = "planned", phase = "other") =>
    ({ id, actorId, name, time, status, activity: "active", phase, notes: "" });
  const task = (id, fromStateId, toStateId, label, kind = "support", status = "planned") =>
    ({ id, fromStateId, toStateId, label, kind, status, notes: "" });
  const branch = (id, fromStateId, label, time, outcomes, kind = "support") =>
    ({ id, fromStateId, label, kind, status: "planned", junctions: [
      { id: "j-" + id, time, outcomes: outcomes.map(([toStateId, label]) => ({ toStateId, label })) },
    ] });
  const at = (id, time) => time === undefined ? { type: "state", id } : { type: "task", id, time };
  const cause = (id, source, target, label, kind = "information", polarity = "positive") =>
    ({ id, source, target, label, kind, polarity });
  function finish(d) {
    M.defaults(d);
    d.views.main.filters.technology = false;
    return M.validate(d);
  }
  function sample() {
    return finish({
      version: 2,
      title: "沿岸監視 — 不明接触の識別と妨害下での通報",
      notes: "架空の検討例。目的は探知した接触の識別結果を母船へ届けること。16分までを実績、それ以降を予定として示す。識別できなければ追尾を続け、通報に失敗した場合は通信方式を切り替えて再送する。分岐先は排他的な候補であり、同時に実現した実績ではない。所要時間は説明用の仮定。",
      time: { unit: "minutes", duration: 90, snap: 1 },
      actors: [
        actor("group", "沿岸監視隊", null, "friendly", true),
        actor("sensor", "監視UUV", "group"),
        actor("control", "識別担当", "group"),
        actor("radio", "通信担当", "group"),
        actor("enemy", "妨害装置", null, "hostile"),
      ],
      states: [
        state("s0", "sensor", "未探知", 2, "actual"),
        state("s1", "sensor", "接触探知", 16, "actual"),
        state("i0", "control", "識別待ち", 18),
        state("i1", "control", "識別済", 35, "planned", "decision"),
        state("i2", "control", "識別保留", 35),
        state("i3", "control", "追加情報取得", 58),
        state("r0", "radio", "通報準備済", 38),
        state("r1", "radio", "通報完了", 56),
        state("r2", "radio", "未達確認", 56),
        state("r3", "radio", "代替回線確立", 70),
        state("r4", "radio", "再送完了", 84),
        state("e0", "enemy", "妨害準備済", 38),
        state("e1", "enemy", "妨害終了", 68),
      ],
      tasks: [
        task("search", "s0", "s1", "海域を捜索", "detection", "actual"),
        branch("identify", "i0", "特徴を照合", 29, [["i1", "一致"], ["i2", "不一致"]]),
        task("reobserve", "i2", "i3", "追尾・再観測", "observation"),
        branch("transmit", "r0", "識別結果を送信", 49, [["r1", "ACK受信"], ["r2", "応答なし"]]),
        task("switch", "r2", "r3", "通信方式を切替"),
        task("retry", "r3", "r4", "再送・ACK確認", "information"),
        task("jam", "e0", "e1", "通信帯域を妨害", "interference"),
      ],
      causalLinks: [
        cause("report", at("s1"), at("i0"), "接触情報"),
        cause("order", at("i1"), at("r0"), "通報指示", "command"),
        cause("negative", at("jam", 49), at("transmit", 49), "受信を阻害", "interference", "negative"),
      ],
    });
  }
  function grouped() {
    return finish({
      version: 2,
      title: "海底調査 — 2機のUUVと母船による確認・回収",
      notes: "架空の検討例。A機が候補を探知し、B機が近接確認、母船が報告を照合して回収を指示する。水中調査班を折りたたむと母船との報告・指令が残る。確認不可の枝では再走査して、未確定であることを報告する。時刻・能力は説明用の仮定。",
      time: { unit: "minutes", duration: 100, snap: 1 },
      actors: [
        actor("fleet", "調査隊", null, "friendly", true),
        actor("mother", "母船", "fleet"),
        actor("team", "水中調査班", "fleet", "friendly", true),
        actor("uuv-a", "A機・広域捜索", "team"),
        actor("uuv-b", "B機・近接確認", "team"),
      ],
      states: [
        state("a0", "uuv-a", "捜索開始", 4, "actual"),
        state("a1", "uuv-a", "候補探知", 24),
        state("a2", "uuv-a", "回収点到着", 88),
        state("b0", "uuv-b", "座標受領", 27),
        state("b1", "uuv-b", "対象確認", 48),
        state("b2", "uuv-b", "確認不可", 48),
        state("b3", "uuv-b", "再走査終了", 68),
        state("b4", "uuv-b", "回収指示受領", 76),
        state("b5", "uuv-b", "回収点到着", 94),
        state("m0", "mother", "確認報告受領", 51),
        state("m1", "mother", "記録確定", 66, "planned", "decision"),
        state("m2", "mother", "再調査を計画", 80),
      ],
      tasks: [
        task("survey", "a0", "a1", "広域を走査", "detection"),
        task("a-return", "a1", "a2", "地形を記録し帰投"),
        branch("inspect", "b0", "接近・撮像", 40, [["b1", "確認"], ["b2", "不鮮明"]], "observation"),
        task("rescan", "b2", "b3", "別角度で再走査", "observation"),
        task("b-return", "b4", "b5", "回収点へ帰投"),
        task("compile", "m0", "m1", "画像と座標を照合"),
      ],
      causalLinks: [
        cause("cue", at("a1"), at("b0"), "候補座標"),
        cause("confirm-report", at("b1"), at("m0"), "確認画像"),
        cause("incomplete-report", at("b3"), at("m2"), "未確定を報告"),
        cause("recall", at("m1"), at("b4"), "回収指示", "command"),
      ],
    });
  }
  function research() {
    const d = finish({
      version: 2,
      title: "技術Gap — 妨害源の探知から妨害活動への介入まで",
      notes: "架空の能力検討例。電波監視→指揮所の判断→介入担当への指令→敵Taskへの負の因果を追う。敵の妨害実行は20〜68分、介入は48分。指向性妨害の追尾制御だけを研究段階（仮定のTRL4）として、時間窓内でも技術条件が未充足になる例。耐妨害受信と敵の送信活動抑制は別の能力として扱う。",
      time: { unit: "minutes", duration: 80, snap: 1 },
      actors: [
        actor("sensor", "電波監視"), actor("control", "指揮所"),
        actor("effector", "介入担当"), actor("enemy", "敵妨害装置", null, "hostile"),
      ],
      states: [
        state("s0", "sensor", "監視開始", 2, "actual"),
        state("s1", "sensor", "妨害源探知", 14),
        state("c0", "control", "報告受領", 16),
        state("c1", "control", "介入決定", 30, "planned", "decision"),
        state("w0", "effector", "指令受領", 32),
        state("w1", "effector", "介入終了", 60),
        state("e0", "enemy", "送信準備済", 20),
        state("e1", "enemy", "妨害終了", 68),
      ],
      tasks: [
        task("detect", "s0", "s1", "電波を探知・測位", "detection"),
        task("decide", "c0", "c1", "介入可否を判断"),
        task("suppress", "w0", "w1", "追尾・指向性妨害", "interference"),
        task("jam", "e0", "e1", "通信帯域を妨害", "interference"),
      ],
      causalLinks: [
        cause("report", at("s1"), at("c0"), "位置・周波数"),
        cause("order", at("c1"), at("w0"), "介入指令", "command"),
        cause("blue-action", at("suppress", 48), at("jam", 48), "妨害活動を抑制", "interference", "negative"),
      ],
      technologies: [
        { id: "esm", name: "電波探知・測位", status: "existing", trl: 9 },
        { id: "c2", name: "情報融合・指揮", status: "existing", trl: 9 },
        { id: "array", name: "指向性送信装置", status: "existing", trl: 9 },
        { id: "tracking", name: "妨害源追尾制御", status: "research", trl: 4 },
      ],
      bindings: [
        { id: "b-sensor", technologyId: "esm", targetType: "actor", targetId: "sensor" },
        { id: "b-control", technologyId: "c2", targetType: "actor", targetId: "control" },
        { id: "b-effector", technologyId: "array", targetType: "actor", targetId: "effector" },
        { id: "b-report", technologyId: "c2", targetType: "causalLink", targetId: "report" },
        { id: "b-order", technologyId: "c2", targetType: "causalLink", targetId: "order" },
        { id: "b-action", technologyId: "tracking", targetType: "causalLink", targetId: "blue-action" },
      ],
    });
    d.views.main.mode = "gap";
    d.views.main.filters.technology = true;
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
