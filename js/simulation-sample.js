/* Illustrative external task performance inputs; not measured equipment data. */
(function (root) {
  "use strict";
  function createSimulationSample() {
    const M = typeof module !== "undefined" && module.exports ? require("./model.js") : root.ME;
    const d = {
  "version": 2,
  "title": "Simulation — 弾道ミサイルの二段階迎撃",
  "time": {
    "unit": "seconds",
    "duration": 180,
    "snap": 1
  },
  "actors": [
    {
      "id": "missile",
      "name": "弾道ミサイル本体",
      "side": "hostile",
      "color": "#a75353",
      "notes": "敵Actorはこの1件のみ。撃破作用を受けると敵側の撃破Stateへ分岐し、後続飛行を中止する。飛行線は未迎撃時の基準経路。時刻は説明用の仮定で、軌道計算は行わない。"
    },
    {
      "id": "radar",
      "name": "広域レーダー",
      "side": "friendly",
      "color": "#236d78"
    },
    {
      "id": "control",
      "name": "中央管制",
      "side": "friendly",
      "color": "#8061a8"
    },
    {
      "id": "midcourse",
      "name": "中間軌道撃破用ユニット",
      "side": "friendly",
      "color": "#397aa0"
    },
    {
      "id": "terminal",
      "name": "終末軌道撃破用ユニット",
      "side": "friendly",
      "color": "#538447"
    }
  ],
  "states": [
    {
      "id": "missile-launched",
      "actorId": "missile",
      "name": "発射",
      "time": 0
    },
    {
      "id": "missile-midcourse",
      "actorId": "missile",
      "name": "中間軌道突入",
      "time": 60
    },
    {
      "id": "missile-terminal",
      "actorId": "missile",
      "name": "終末軌道突入",
      "time": 120
    },
    {
      "id": "missile-impact",
      "actorId": "missile",
      "name": "未迎撃なら着弾",
      "time": 180,
      "notes": "基準飛行の終点。撃破された試行では到達しない。"
    },
    {
      "id": "missile-destroyed-mid",
      "actorId": "missile",
      "name": "中間軌道で撃破",
      "time": 100
    },
    {
      "id": "missile-destroyed-terminal",
      "actorId": "missile",
      "name": "終末軌道で撃破",
      "time": 160
    },
    {
      "id": "radar-detected",
      "actorId": "radar",
      "name": "目標探知",
      "time": 20
    },
    {
      "id": "radar-track",
      "actorId": "radar",
      "name": "追尾確立",
      "time": 30,
      "simulation": {
        "w": 0.25
      },
      "notes": "外部解析による抽象的な性能劣化度w=0.25。原因をIMEEでは計算しない。"
    },
    {
      "id": "control-track-received",
      "actorId": "control",
      "name": "追尾情報受領",
      "time": 30,
      "notes": "レーダー追尾情報の到達によって成立する。形式的な管制待機Stateは置かない。"
    },
    {
      "id": "control-decision",
      "actorId": "control",
      "name": "迎撃判断",
      "time": 40,
      "phase": "decision"
    },
    {
      "id": "control-orders",
      "actorId": "control",
      "name": "指令発出",
      "time": 50
    },
    {
      "id": "midcourse-ready",
      "actorId": "midcourse",
      "name": "中間迎撃準備完了",
      "time": 60,
      "notes": "本例では準備過程自体を評価対象にせず、T+60に成立する外生のReady条件として扱う。"
    },
    {
      "id": "midcourse-command-received",
      "actorId": "midcourse",
      "name": "中間迎撃指令受領",
      "time": 50,
      "notes": "中央管制の指令作用が到達して成立するState。形式的な待機Stateではなく、発射Taskの因果起点。"
    },
    {
      "id": "midcourse-launched",
      "actorId": "midcourse",
      "name": "迎撃ミサイル発射",
      "time": 70
    },
    {
      "id": "midcourse-kill",
      "actorId": "midcourse",
      "name": "迎撃",
      "time": 100,
      "notes": "迎撃CDFの達成結果。敵ミサイルの撃破までを含む作用が成立した時点を表す。"
    },
    {
      "id": "terminal-ready",
      "actorId": "terminal",
      "name": "終末迎撃準備完了",
      "time": 120,
      "notes": "本例では準備過程自体を評価対象にせず、T+120に成立する外生のReady条件として扱う。中間撃破時は後続Taskがcancelされる。"
    },
    {
      "id": "terminal-command-received",
      "actorId": "terminal",
      "name": "終末迎撃指令受領",
      "time": 50,
      "notes": "中央管制の指令作用が到達して成立するState。形式的な待機Stateではなく、発射Taskの因果起点。"
    },
    {
      "id": "terminal-launched",
      "actorId": "terminal",
      "name": "迎撃ミサイル発射",
      "time": 130
    },
    {
      "id": "terminal-kill",
      "actorId": "terminal",
      "name": "迎撃",
      "time": 160,
      "notes": "迎撃CDFの達成結果。敵ミサイルの撃破までを含む作用が成立した時点を表す。"
    }
  ],
  "tasks": [
    {
      "id": "boost-flight",
      "fromStateId": "missile-launched",
      "toStateId": "missile-midcourse",
      "label": "上昇飛行（基準）",
      "kind": "flight"
    },
    {
      "id": "midcourse-flight",
      "fromStateId": "missile-midcourse",
      "toStateId": "missile-terminal",
      "label": "中間軌道飛行（基準）",
      "kind": "flight",
      "junctions": [
        {
          "id": "mid-effect-junction",
          "time": 100,
          "simulation": {
            "mode": "effect"
          },
          "outcomes": [
            {
              "label": "撃破",
              "toStateId": "missile-destroyed-mid",
              "delay": 0
            }
          ]
        }
      ]
    },
    {
      "id": "terminal-flight",
      "fromStateId": "missile-terminal",
      "toStateId": "missile-impact",
      "label": "終末軌道飛行（基準）",
      "kind": "flight",
      "junctions": [
        {
          "id": "terminal-effect-junction",
          "time": 160,
          "simulation": {
            "mode": "effect"
          },
          "outcomes": [
            {
              "label": "撃破",
              "toStateId": "missile-destroyed-terminal",
              "delay": 0
            }
          ]
        }
      ]
    },
    {
      "id": "track",
      "fromStateId": "radar-detected",
      "toStateId": "radar-track",
      "label": "追尾",
      "kind": "information"
    },
    {
      "id": "decide",
      "fromStateId": "control-track-received",
      "toStateId": "control-decision",
      "label": "脅威評価・迎撃判断",
      "simulation": {
        "enabled": true,
        "w": 0,
        "wInput": {
          "stateIds": [
            "control-track-received"
          ],
          "combine": "max"
        },
        "performanceModel": {
          "type": "cdf",
          "curves": [
            {
              "w": 0,
              "points": [
                {
                  "t": 3,
                  "p": 0.3
                },
                {
                  "t": 8,
                  "p": 0.85
                },
                {
                  "t": 15,
                  "p": 1
                }
              ],
              "pInfinity": 0
            },
            {
              "w": 1,
              "points": [
                {
                  "t": 3,
                  "p": 0.3
                },
                {
                  "t": 8,
                  "p": 0.85
                },
                {
                  "t": 15,
                  "p": 1
                }
              ],
              "pInfinity": 0
            }
          ]
        }
      }
    },
    {
      "id": "command",
      "fromStateId": "control-decision",
      "toStateId": "control-orders",
      "label": "指令伝達",
      "kind": "command",
      "simulation": {
        "enabled": false,
        "wInput": {
          "stateIds": [
            "control-decision"
          ]
        }
      }
    },
    {
      "id": "midcourse-launch",
      "fromStateId": "midcourse-command-received",
      "toStateId": "midcourse-launched",
      "label": "発射指示",
      "kind": "command",
      "simulation": {
        "enabled": false,
        "waitForStateIds": [
          "midcourse-ready",
          "missile-midcourse"
        ],
        "wInput": {
          "stateIds": [
            "midcourse-command-received"
          ],
          "combine": "max"
        }
      },
      "notes": "中間迎撃指令受領を因果起点とし、迎撃準備完了とミッドコース段階到達を追加条件として待つ。条件成立後、説明用の固定20秒で発射Stateへ到達する。"
    },
    {
      "id": "midcourse-intercept",
      "fromStateId": "midcourse-launched",
      "toStateId": "midcourse-kill",
      "label": "中間軌道迎撃",
      "kind": "attack",
      "simulation": {
        "enabled": true,
        "w": 0,
        "wInput": {
          "stateIds": [
            "midcourse-launched"
          ]
        },
        "performanceModel": {
          "type": "cdf",
          "curves": [
            {
              "w": 0,
              "points": [
                {
                  "t": 10,
                  "p": 0.3
                },
                {
                  "t": 20,
                  "p": 0.65
                },
                {
                  "t": 30,
                  "p": 0.8
                }
              ],
              "pInfinity": 0.2
            },
            {
              "w": 1,
              "points": [
                {
                  "t": 10,
                  "p": 0.1
                },
                {
                  "t": 20,
                  "p": 0.35
                },
                {
                  "t": 30,
                  "p": 0.55
                }
              ],
              "pInfinity": 0.45
            }
          ]
        }
      },
      "notes": "発射から敵ミサイルの撃破達成までの時間CDF。飛翔や交戦の詳細は外部性能に縮約する。w=0時の未達確率20%。"
    },
    {
      "id": "terminal-launch",
      "fromStateId": "terminal-command-received",
      "toStateId": "terminal-launched",
      "label": "発射指示",
      "kind": "command",
      "simulation": {
        "enabled": false,
        "waitForStateIds": [
          "terminal-ready",
          "missile-terminal"
        ],
        "wInput": {
          "stateIds": [
            "terminal-command-received"
          ],
          "combine": "max"
        },
        "cancelOnStateIds": [
          "missile-destroyed-mid"
        ]
      },
      "notes": "終末迎撃指令受領を因果起点とし、迎撃準備完了と終末軌道段階到達を追加条件として待つ。中間撃破時は中止する。"
    },
    {
      "id": "terminal-intercept",
      "fromStateId": "terminal-launched",
      "toStateId": "terminal-kill",
      "label": "終末軌道迎撃",
      "kind": "attack",
      "simulation": {
        "enabled": true,
        "w": 0,
        "wInput": {
          "stateIds": [
            "terminal-launched"
          ]
        },
        "cancelOnStateIds": [
          "missile-destroyed-mid"
        ],
        "performanceModel": {
          "type": "cdf",
          "curves": [
            {
              "w": 0,
              "points": [
                {
                  "t": 5,
                  "p": 0.25
                },
                {
                  "t": 15,
                  "p": 0.6
                },
                {
                  "t": 30,
                  "p": 0.85
                }
              ],
              "pInfinity": 0.15
            },
            {
              "w": 1,
              "points": [
                {
                  "t": 5,
                  "p": 0.1
                },
                {
                  "t": 15,
                  "p": 0.35
                },
                {
                  "t": 30,
                  "p": 0.6
                }
              ],
              "pInfinity": 0.4
            }
          ]
        }
      },
      "notes": "発射から敵ミサイルの撃破達成までの時間CDF。中間撃破時は実行しない。w=0時の未達確率15%。"
    }
  ],
  "causalLinks": [
    {
      "id": "missile-observation",
      "source": {
        "type": "state",
        "id": "missile-launched"
      },
      "target": {
        "type": "state",
        "id": "radar-detected"
      },
      "polarity": "positive",
      "label": "探知",
      "kind": "observation",
      "notes": "発射から目標探知成立までを作用線の伝搬CDFで表す。未達確率2%。説明用の外部性能入力であり、伝搬の物理計算は行わない。",
      "simulation": {
        "enabled": true,
        "type": "state"
      },
      "propagation": {
        "duration": 20,
        "w": 0,
        "performanceModel": {
          "type": "cdf",
          "degradationInput": "w",
          "curves": [
            {
              "w": 0,
              "points": [
                {
                  "t": 5,
                  "p": 0.1
                },
                {
                  "t": 15,
                  "p": 0.6
                },
                {
                  "t": 30,
                  "p": 0.9
                },
                {
                  "t": 40,
                  "p": 0.98
                }
              ],
              "pInfinity": 0.02
            },
            {
              "w": 1,
              "points": [
                {
                  "t": 5,
                  "p": 0.02
                },
                {
                  "t": 15,
                  "p": 0.2
                },
                {
                  "t": 30,
                  "p": 0.6
                },
                {
                  "t": 40,
                  "p": 0.85
                }
              ],
              "pInfinity": 0.15
            }
          ]
        }
      }
    },
    {
      "id": "track-information",
      "source": {
        "type": "state",
        "id": "radar-track"
      },
      "target": {
        "type": "state",
        "id": "control-track-received"
      },
      "polarity": "positive",
      "label": "追尾情報",
      "kind": "information",
      "simulation": {
        "enabled": true,
        "type": "state"
      },
      "propagation": {
        "duration": 0
      }
    },
    {
      "id": "midcourse-command",
      "source": {
        "type": "state",
        "id": "control-orders"
      },
      "target": {
        "type": "state",
        "id": "midcourse-command-received"
      },
      "polarity": "positive",
      "label": "中間迎撃指令",
      "kind": "command",
      "simulation": {
        "enabled": true,
        "type": "state"
      },
      "propagation": {
        "duration": 0
      }
    },
    {
      "id": "terminal-command",
      "source": {
        "type": "state",
        "id": "control-orders"
      },
      "target": {
        "type": "state",
        "id": "terminal-command-received"
      },
      "polarity": "positive",
      "label": "終末迎撃指令",
      "kind": "command",
      "simulation": {
        "enabled": true,
        "type": "state"
      },
      "propagation": {
        "duration": 0
      }
    },
    {
      "id": "midcourse-effect",
      "source": {
        "type": "state",
        "id": "midcourse-kill"
      },
      "target": {
        "type": "task",
        "id": "midcourse-flight"
      },
      "polarity": "negative",
      "label": "中間撃破作用",
      "kind": "attack",
      "simulation": {
        "enabled": true,
        "type": "branch",
        "junctionId": "mid-effect-junction",
        "outcomeStateId": "missile-destroyed-mid",
        "stopTargetActor": true
      },
      "propagation": {
        "duration": 0
      }
    },
    {
      "id": "terminal-effect",
      "source": {
        "type": "state",
        "id": "terminal-kill"
      },
      "target": {
        "type": "task",
        "id": "terminal-flight"
      },
      "polarity": "negative",
      "label": "終末撃破作用",
      "kind": "attack",
      "simulation": {
        "enabled": true,
        "type": "branch",
        "junctionId": "terminal-effect-junction",
        "outcomeStateId": "missile-destroyed-terminal",
        "stopTargetActor": true
      },
      "propagation": {
        "duration": 0
      }
    }
  ],
  "simulation": {
    "successStateIds": [
      "missile-destroyed-mid",
      "missile-destroyed-terminal"
    ],
    "successMode": "any",
    "deadline": 180,
    "iterations": 5000,
    "seed": 17
  },
  "technologies": [],
  "bindings": [],
  "views": {
    "main": {
      "collapsedActors": [],
      "actorOrder": [
        "missile",
        "radar",
        "control",
        "midcourse",
        "terminal"
      ],
      "zoom": 1,
      "visibleTimeRange": {
        "start": 0,
        "end": 180
      },
      "filters": {
        "technology": true,
        "causalLink": true,
        "quiet": true
      },
      "laneHeight": 64,
      "collapsedLayout": "compact",
      "mode": "mission"
    }
  },
  "notes": "シミュレーション経路に寄与しない形式的な待機State/Taskは置かない。Actor間の情報・指令は、後続行為の因果起点になる意味のある受領Stateを成立させる。迎撃ユニットの準備過程そのものは本例の評価対象外とし、準備完了Stateを所定時刻に成立する外生条件として置く。時刻・CDF・wは説明用仮定で、実在装備の性能を表さない。"
};
    return M.defaults(M.validate(d));
  }
  root.createSimulationSample = createSimulationSample;
  if (typeof module !== "undefined" && module.exports) module.exports = createSimulationSample;
})(globalThis);
