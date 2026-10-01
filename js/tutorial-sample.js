/* Canonical version 3 examples, shared with checked-in JSON. */
(function(root){
  "use strict";
  const M=typeof module!=="undefined" && module.exports?require("./model.js"):root.ME;
  const data={
  "sample": {
    "version": 3,
    "title": "沿岸監視 — 不明接触の識別と妨害下での通報",
    "notes": "時間・品質は説明用の仮定。Stateは意味のある条件・受領・結果のみを表す。作用線はState起点、Stateまたは分岐点終点。Task途中の出力は成立Stateを設けて分割する。",
    "time": {
      "unit": "minutes",
      "duration": 90,
      "snap": 1
    },
    "actors": [
      {
        "id": "group",
        "name": "沿岸監視隊",
        "parentId": null,
        "side": "friendly",
        "isGroup": true,
        "color": "#a75353"
      },
      {
        "id": "sensor",
        "name": "監視UUV",
        "parentId": "group",
        "side": "friendly",
        "color": "#236d78"
      },
      {
        "id": "control",
        "name": "識別担当",
        "parentId": "group",
        "side": "friendly",
        "color": "#8061a8"
      },
      {
        "id": "radio",
        "name": "通信担当",
        "parentId": "group",
        "side": "friendly",
        "color": "#a56c24"
      },
      {
        "id": "enemy",
        "name": "妨害装置",
        "parentId": null,
        "side": "hostile",
        "color": "#397aa0"
      }
    ],
    "states": [
      {
        "id": "s0",
        "actorId": "sensor",
        "name": "未探知",
        "time": 2,
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "s1",
        "actorId": "sensor",
        "name": "接触探知",
        "time": 16,
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "i0",
        "actorId": "control",
        "name": "識別待ち",
        "time": 18,
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "i1",
        "actorId": "control",
        "name": "識別済",
        "time": 35,
        "activity": "active",
        "phase": "decision",
        "notes": ""
      },
      {
        "id": "i2",
        "actorId": "control",
        "name": "識別保留",
        "time": 35,
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "i3",
        "actorId": "control",
        "name": "追加情報取得",
        "time": 58,
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "r0",
        "actorId": "radio",
        "name": "通報準備済",
        "time": 38,
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "r1",
        "actorId": "radio",
        "name": "通報完了",
        "time": 56,
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "r2",
        "actorId": "radio",
        "name": "未達確認",
        "time": 56,
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "r3",
        "actorId": "radio",
        "name": "代替回線確立",
        "time": 70,
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "r4",
        "actorId": "radio",
        "name": "再送完了",
        "time": 84,
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "e0",
        "actorId": "enemy",
        "name": "妨害準備済",
        "time": 38,
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "e1",
        "actorId": "enemy",
        "name": "妨害終了",
        "time": 68,
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "jam-output-49",
        "actorId": "enemy",
        "time": 49,
        "name": "受信を阻害成立",
        "activity": "active",
        "phase": "other"
      }
    ],
    "tasks": [
      {
        "id": "search",
        "fromStateId": "s0",
        "toStateId": "s1",
        "label": "海域を捜索",
        "kind": "detection",
        "notes": ""
      },
      {
        "id": "identify",
        "fromStateId": "i0",
        "label": "特徴を照合",
        "kind": "support",
        "junctions": [
          {
            "id": "j-identify",
            "time": 29,
            "outcomes": [
              {
                "toStateId": "i1",
                "label": "一致"
              },
              {
                "toStateId": "i2",
                "label": "不一致"
              }
            ]
          }
        ]
      },
      {
        "id": "reobserve",
        "fromStateId": "i2",
        "toStateId": "i3",
        "label": "追尾・再観測",
        "kind": "observation",
        "notes": ""
      },
      {
        "id": "transmit",
        "fromStateId": "r0",
        "label": "識別結果を送信",
        "kind": "support",
        "junctions": [
          {
            "id": "j-transmit",
            "time": 49,
            "outcomes": [
              {
                "toStateId": "r1",
                "label": "ACK受信"
              },
              {
                "toStateId": "r2",
                "label": "応答なし"
              }
            ]
          }
        ]
      },
      {
        "id": "switch",
        "fromStateId": "r2",
        "toStateId": "r3",
        "label": "通信方式を切替",
        "kind": "support",
        "notes": ""
      },
      {
        "id": "retry",
        "fromStateId": "r3",
        "toStateId": "r4",
        "label": "再送・ACK確認",
        "kind": "information",
        "notes": ""
      },
      {
        "id": "jam",
        "fromStateId": "e0",
        "toStateId": "jam-output-49",
        "label": "通信帯域を妨害",
        "kind": "interference",
        "notes": "",
        "junctions": []
      },
      {
        "id": "jam-after-49",
        "fromStateId": "jam-output-49",
        "toStateId": "e1",
        "label": "通信帯域を妨害（継続）",
        "kind": "interference",
        "notes": "",
        "junctions": []
      }
    ],
    "causalLinks": [
      {
        "id": "report",
        "source": {
          "type": "state",
          "id": "s1"
        },
        "target": {
          "type": "state",
          "id": "i0"
        },
        "label": "接触情報",
        "kind": "information",
        "propagation": {
          "duration": 2,
          "qualityRetention": 1
        }
      },
      {
        "id": "order",
        "source": {
          "type": "state",
          "id": "i1"
        },
        "target": {
          "type": "state",
          "id": "r0"
        },
        "label": "通報指示",
        "kind": "command",
        "propagation": {
          "duration": 3,
          "qualityRetention": 1
        }
      },
      {
        "id": "negative",
        "source": {
          "type": "state",
          "id": "jam-output-49"
        },
        "target": {
          "type": "junction",
          "taskId": "transmit",
          "id": "j-transmit",
          "outcomeStateId": "r2"
        },
        "label": "受信を阻害",
        "kind": "interference",
        "propagation": {
          "duration": 0,
          "qualityRetention": 1
        }
      }
    ],
    "technologies": [],
    "bindings": [],
    "views": {
      "main": {
        "collapsedActors": [],
        "actorOrder": [
          "group",
          "sensor",
          "control",
          "radio",
          "enemy"
        ],
        "zoom": 1,
        "visibleTimeRange": {
          "start": 0,
          "end": 90
        },
        "filters": {
          "technology": false,
          "causalLink": true,
          "quiet": true,
          "implicitDependencies": false
        },
        "laneHeight": 64,
        "collapsedLayout": "compact",
        "mode": "mission"
      }
    }
  },
  "grouped": {
    "version": 3,
    "title": "海底調査 — 2機のUUVと母船による確認・回収",
    "notes": "時間・品質は説明用の仮定。Stateは意味のある条件・受領・結果のみを表す。作用線はState起点、Stateまたは分岐点終点。Task途中の出力は成立Stateを設けて分割する。",
    "time": {
      "unit": "minutes",
      "duration": 100,
      "snap": 1
    },
    "actors": [
      {
        "id": "fleet",
        "name": "調査隊",
        "parentId": null,
        "side": "friendly",
        "isGroup": true,
        "color": "#a75353"
      },
      {
        "id": "mother",
        "name": "母船",
        "parentId": "fleet",
        "side": "friendly",
        "color": "#236d78"
      },
      {
        "id": "team",
        "name": "水中調査班",
        "parentId": "fleet",
        "side": "friendly",
        "isGroup": true,
        "color": "#8061a8"
      },
      {
        "id": "uuv-a",
        "name": "A機・広域捜索",
        "parentId": "team",
        "side": "friendly",
        "color": "#a56c24"
      },
      {
        "id": "uuv-b",
        "name": "B機・近接確認",
        "parentId": "team",
        "side": "friendly",
        "color": "#397aa0"
      }
    ],
    "states": [
      {
        "id": "a0",
        "actorId": "uuv-a",
        "name": "捜索開始",
        "time": 4,
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "a1",
        "actorId": "uuv-a",
        "name": "候補探知",
        "time": 24,
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "a2",
        "actorId": "uuv-a",
        "name": "回収点到着",
        "time": 88,
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "b0",
        "actorId": "uuv-b",
        "name": "座標受領",
        "time": 27,
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "b1",
        "actorId": "uuv-b",
        "name": "対象確認",
        "time": 48,
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "b2",
        "actorId": "uuv-b",
        "name": "確認不可",
        "time": 48,
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "b3",
        "actorId": "uuv-b",
        "name": "再走査終了",
        "time": 68,
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "b4",
        "actorId": "uuv-b",
        "name": "回収指示受領",
        "time": 76,
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "b5",
        "actorId": "uuv-b",
        "name": "回収点到着",
        "time": 94,
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "m0",
        "actorId": "mother",
        "name": "確認報告受領",
        "time": 51,
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "m1",
        "actorId": "mother",
        "name": "記録確定",
        "time": 66,
        "activity": "active",
        "phase": "decision",
        "notes": ""
      },
      {
        "id": "m2",
        "actorId": "mother",
        "name": "再調査を計画",
        "time": 80,
        "activity": "active",
        "phase": "other",
        "notes": ""
      }
    ],
    "tasks": [
      {
        "id": "survey",
        "fromStateId": "a0",
        "toStateId": "a1",
        "label": "広域を走査",
        "kind": "detection",
        "notes": ""
      },
      {
        "id": "a-return",
        "fromStateId": "a1",
        "toStateId": "a2",
        "label": "地形を記録し帰投",
        "kind": "support",
        "notes": ""
      },
      {
        "id": "inspect",
        "fromStateId": "b0",
        "label": "接近・撮像",
        "kind": "observation",
        "junctions": [
          {
            "id": "j-inspect",
            "time": 40,
            "outcomes": [
              {
                "toStateId": "b1",
                "label": "確認"
              },
              {
                "toStateId": "b2",
                "label": "不鮮明"
              }
            ]
          }
        ]
      },
      {
        "id": "rescan",
        "fromStateId": "b2",
        "toStateId": "b3",
        "label": "別角度で再走査",
        "kind": "observation",
        "notes": ""
      },
      {
        "id": "b-return",
        "fromStateId": "b4",
        "toStateId": "b5",
        "label": "回収点へ帰投",
        "kind": "support",
        "notes": ""
      },
      {
        "id": "compile",
        "fromStateId": "m0",
        "toStateId": "m1",
        "label": "画像と座標を照合",
        "kind": "support",
        "notes": ""
      }
    ],
    "causalLinks": [
      {
        "id": "cue",
        "source": {
          "type": "state",
          "id": "a1"
        },
        "target": {
          "type": "state",
          "id": "b0"
        },
        "label": "候補座標",
        "kind": "information",
        "propagation": {
          "duration": 3,
          "qualityRetention": 1
        }
      },
      {
        "id": "confirm-report",
        "source": {
          "type": "state",
          "id": "b1"
        },
        "target": {
          "type": "state",
          "id": "m0"
        },
        "label": "確認画像",
        "kind": "information",
        "propagation": {
          "duration": 3,
          "qualityRetention": 1
        }
      },
      {
        "id": "incomplete-report",
        "source": {
          "type": "state",
          "id": "b3"
        },
        "target": {
          "type": "state",
          "id": "m2"
        },
        "label": "未確定を報告",
        "kind": "information",
        "propagation": {
          "duration": 12,
          "qualityRetention": 1
        }
      },
      {
        "id": "recall",
        "source": {
          "type": "state",
          "id": "m1"
        },
        "target": {
          "type": "state",
          "id": "b4"
        },
        "label": "回収指示",
        "kind": "command",
        "propagation": {
          "duration": 10,
          "qualityRetention": 1
        }
      }
    ],
    "technologies": [],
    "bindings": [],
    "views": {
      "main": {
        "collapsedActors": [],
        "actorOrder": [
          "fleet",
          "mother",
          "team",
          "uuv-a",
          "uuv-b"
        ],
        "zoom": 1,
        "visibleTimeRange": {
          "start": 0,
          "end": 100
        },
        "filters": {
          "technology": false,
          "causalLink": true,
          "quiet": true,
          "implicitDependencies": false
        },
        "laneHeight": 64,
        "collapsedLayout": "compact",
        "mode": "mission"
      }
    }
  },
  "research": {
    "version": 3,
    "title": "技術Gap — 妨害源の探知から妨害活動への介入まで",
    "notes": "時間・品質は説明用の仮定。Stateは意味のある条件・受領・結果のみを表す。作用線はState起点、Stateまたは分岐点終点。Task途中の出力は成立Stateを設けて分割する。",
    "time": {
      "unit": "minutes",
      "duration": 80,
      "snap": 1
    },
    "actors": [
      {
        "id": "sensor",
        "name": "電波監視",
        "parentId": null,
        "side": "friendly",
        "color": "#a75353"
      },
      {
        "id": "control",
        "name": "指揮所",
        "parentId": null,
        "side": "friendly",
        "color": "#236d78"
      },
      {
        "id": "effector",
        "name": "介入担当",
        "parentId": null,
        "side": "friendly",
        "color": "#8061a8"
      },
      {
        "id": "enemy",
        "name": "敵妨害装置",
        "parentId": null,
        "side": "hostile",
        "color": "#a56c24"
      }
    ],
    "states": [
      {
        "id": "s0",
        "actorId": "sensor",
        "name": "監視開始",
        "time": 2,
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "s1",
        "actorId": "sensor",
        "name": "妨害源探知",
        "time": 14,
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "c0",
        "actorId": "control",
        "name": "報告受領",
        "time": 16,
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "c1",
        "actorId": "control",
        "name": "介入決定",
        "time": 30,
        "activity": "active",
        "phase": "decision",
        "notes": ""
      },
      {
        "id": "w0",
        "actorId": "effector",
        "name": "指令受領",
        "time": 32,
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "w1",
        "actorId": "effector",
        "name": "介入終了",
        "time": 60,
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "e0",
        "actorId": "enemy",
        "name": "送信準備済",
        "time": 20,
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "e1",
        "actorId": "enemy",
        "name": "妨害終了",
        "time": 68,
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "suppress-output-48",
        "actorId": "effector",
        "time": 48,
        "name": "妨害活動を抑制成立",
        "activity": "active",
        "phase": "other"
      }
    ],
    "tasks": [
      {
        "id": "detect",
        "fromStateId": "s0",
        "toStateId": "s1",
        "label": "電波を探知・測位",
        "kind": "detection",
        "notes": ""
      },
      {
        "id": "decide",
        "fromStateId": "c0",
        "toStateId": "c1",
        "label": "介入可否を判断",
        "kind": "support",
        "notes": ""
      },
      {
        "id": "suppress",
        "fromStateId": "w0",
        "toStateId": "suppress-output-48",
        "label": "追尾・指向性妨害",
        "kind": "interference",
        "notes": "",
        "junctions": []
      },
      {
        "id": "jam",
        "fromStateId": "e0",
        "toStateId": "e1",
        "label": "通信帯域を妨害",
        "kind": "interference",
        "notes": "",
        "junctions": [
          {
            "id": "blue-action-junction",
            "time": 48,
            "outcomes": [
              {
                "label": "妨害活動を抑制結果",
                "toStateId": "e1"
              }
            ]
          }
        ]
      },
      {
        "id": "suppress-after-48",
        "fromStateId": "suppress-output-48",
        "toStateId": "w1",
        "label": "追尾・指向性妨害（継続）",
        "kind": "interference",
        "notes": "",
        "junctions": []
      }
    ],
    "causalLinks": [
      {
        "id": "report",
        "source": {
          "type": "state",
          "id": "s1"
        },
        "target": {
          "type": "state",
          "id": "c0"
        },
        "label": "位置・周波数",
        "kind": "information",
        "propagation": {
          "duration": 2,
          "qualityRetention": 1
        }
      },
      {
        "id": "order",
        "source": {
          "type": "state",
          "id": "c1"
        },
        "target": {
          "type": "state",
          "id": "w0"
        },
        "label": "介入指令",
        "kind": "command",
        "propagation": {
          "duration": 2,
          "qualityRetention": 1
        }
      },
      {
        "id": "blue-action",
        "source": {
          "type": "state",
          "id": "suppress-output-48"
        },
        "target": {
          "type": "junction",
          "taskId": "jam",
          "id": "blue-action-junction",
          "outcomeStateId": "e1"
        },
        "label": "妨害活動を抑制",
        "kind": "interference",
        "propagation": {
          "duration": 0,
          "qualityRetention": 1
        }
      }
    ],
    "technologies": [
      {
        "id": "esm",
        "name": "電波探知・測位",
        "status": "existing",
        "trl": 9
      },
      {
        "id": "c2",
        "name": "情報融合・指揮",
        "status": "existing",
        "trl": 9
      },
      {
        "id": "array",
        "name": "指向性送信装置",
        "status": "existing",
        "trl": 9
      },
      {
        "id": "tracking",
        "name": "妨害源追尾制御",
        "status": "research",
        "trl": 4
      }
    ],
    "bindings": [
      {
        "id": "b-sensor",
        "technologyId": "esm",
        "targetType": "actor",
        "targetId": "sensor"
      },
      {
        "id": "b-control",
        "technologyId": "c2",
        "targetType": "actor",
        "targetId": "control"
      },
      {
        "id": "b-effector",
        "technologyId": "array",
        "targetType": "actor",
        "targetId": "effector"
      },
      {
        "id": "b-report",
        "technologyId": "c2",
        "targetType": "causalLink",
        "targetId": "report"
      },
      {
        "id": "b-order",
        "technologyId": "c2",
        "targetType": "causalLink",
        "targetId": "order"
      },
      {
        "id": "b-action",
        "technologyId": "tracking",
        "targetType": "causalLink",
        "targetId": "blue-action"
      }
    ],
    "views": {
      "main": {
        "collapsedActors": [],
        "actorOrder": [
          "sensor",
          "control",
          "effector",
          "enemy"
        ],
        "zoom": 1,
        "visibleTimeRange": {
          "start": 0,
          "end": 80
        },
        "filters": {
          "technology": true,
          "causalLink": true,
          "quiet": true,
          "implicitDependencies": false
        },
        "laneHeight": 64,
        "collapsedLayout": "compact",
        "mode": "gap"
      }
    }
  }
};
  const sample=()=>M.defaults(M.validate(M.clone(data.sample)));
  const grouped=()=>M.defaults(M.validate(M.clone(data.grouped)));
  const research=()=>M.defaults(M.validate(M.clone(data.research)));
  if(typeof module!=="undefined" && module.exports){module.exports=sample;module.exports.grouped=grouped;module.exports.research=research;}
  else {root.createTutorialSample=sample;root.createTutorialGroupedSample=grouped;root.createTutorialResearchSample=research;}
})(globalThis);
