/* Canonical version 3 examples, shared with checked-in JSON. */
(function(root){
  "use strict";
  const M=typeof module!=="undefined" && module.exports?require("./model.js"):root.ME;
  const data={
  "sample": {
    "version": 3,
    "title": "海域監視 — 敵UUVの任務阻止",
    "notes": "時間・品質は説明用の仮定。Stateは意味のある条件・受領・結果のみを表す。作用線はState起点、Stateまたは分岐点終点。Task途中の出力は成立Stateを設けて分割する。",
    "time": {
      "unit": "minutes",
      "duration": 60,
      "snap": 1
    },
    "actors": [
      {
        "id": "enemy",
        "name": "敵UUV",
        "side": "hostile",
        "notes": "監視海域で任務を遂行し、離脱する計画。",
        "color": "#a75353"
      },
      {
        "id": "sensor",
        "name": "海底センサー",
        "side": "friendly",
        "notes": "",
        "color": "#236d78"
      },
      {
        "id": "control",
        "name": "管制",
        "side": "friendly",
        "notes": "",
        "color": "#8061a8"
      },
      {
        "id": "uuv",
        "name": "味方UUV",
        "side": "friendly",
        "notes": "",
        "color": "#a56c24"
      },
      {
        "id": "torpedo",
        "name": "魚雷",
        "side": "friendly",
        "notes": "",
        "color": "#397aa0"
      }
    ],
    "states": [
      {
        "id": "e1",
        "actorId": "enemy",
        "name": "進出開始",
        "time": 0,
        "status": "actual",
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "end-e1",
        "actorId": "enemy",
        "name": "進出終了",
        "time": 12,
        "status": "actual",
        "activity": "active",
        "notes": ""
      },
      {
        "id": "e2",
        "actorId": "enemy",
        "name": "任務開始",
        "time": 14,
        "status": "actual",
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "end-e2",
        "actorId": "enemy",
        "name": "任務終了",
        "time": 34,
        "status": "actual",
        "activity": "active",
        "notes": ""
      },
      {
        "id": "e3",
        "actorId": "enemy",
        "name": "離脱開始",
        "time": 36,
        "status": "actual",
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "end-e3",
        "actorId": "enemy",
        "name": "離脱中",
        "time": 44,
        "status": "actual",
        "activity": "active",
        "notes": ""
      },
      {
        "id": "e4",
        "actorId": "enemy",
        "name": "離脱完了",
        "time": 52,
        "status": "planned",
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "e5",
        "actorId": "enemy",
        "name": "無力化",
        "time": 46,
        "status": "actual",
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "s1",
        "actorId": "sensor",
        "name": "監視開始",
        "time": 0,
        "status": "actual",
        "activity": "quiet",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "s2",
        "actorId": "sensor",
        "name": "探知済",
        "time": 14,
        "status": "actual",
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "end-s2",
        "actorId": "sensor",
        "name": "追尾終了",
        "time": 48,
        "status": "actual",
        "activity": "active",
        "notes": ""
      },
      {
        "id": "c2",
        "actorId": "control",
        "name": "追尾情報受領",
        "time": 18,
        "status": "actual",
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "end-c2",
        "actorId": "control",
        "name": "識別終了",
        "time": 25,
        "status": "actual",
        "activity": "active",
        "notes": ""
      },
      {
        "id": "c3",
        "actorId": "control",
        "name": "判断開始",
        "time": 27,
        "status": "actual",
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "end-c3",
        "actorId": "control",
        "name": "判断終了",
        "time": 33,
        "status": "actual",
        "activity": "active",
        "notes": ""
      },
      {
        "id": "u2",
        "actorId": "uuv",
        "name": "迎撃指令受領",
        "time": 31,
        "status": "actual",
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "end-u2",
        "actorId": "uuv",
        "name": "接敵完了",
        "time": 38,
        "status": "actual",
        "activity": "active",
        "notes": ""
      },
      {
        "id": "u3",
        "actorId": "uuv",
        "name": "攻撃開始",
        "time": 40,
        "status": "actual",
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "end-u3",
        "actorId": "uuv",
        "name": "攻撃終了",
        "time": 46,
        "status": "actual",
        "activity": "active",
        "notes": ""
      },
      {
        "id": "t2",
        "actorId": "torpedo",
        "name": "誘導開始指示受領",
        "time": 40,
        "status": "actual",
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "end-t2",
        "actorId": "torpedo",
        "name": "誘導終了",
        "time": 46,
        "status": "actual",
        "activity": "active",
        "notes": ""
      },
      {
        "id": "activity-s2-output-17",
        "actorId": "sensor",
        "time": 17,
        "name": "探知情報成立",
        "activity": "active",
        "phase": "other"
      },
      {
        "id": "activity-c3-output-30",
        "actorId": "control",
        "time": 30,
        "name": "接敵指示成立",
        "activity": "active",
        "phase": "other"
      }
    ],
    "tasks": [
      {
        "id": "activity-e1",
        "fromStateId": "e1",
        "toStateId": "end-e1",
        "label": "進出",
        "status": "actual",
        "activity": "active",
        "notes": ""
      },
      {
        "id": "activity-e2",
        "fromStateId": "e2",
        "toStateId": "end-e2",
        "label": "任務遂行",
        "status": "actual",
        "activity": "active",
        "notes": ""
      },
      {
        "id": "activity-e3",
        "fromStateId": "e3",
        "toStateId": "end-e3",
        "label": "離脱",
        "status": "actual",
        "activity": "active",
        "notes": ""
      },
      {
        "id": "activity-s1",
        "fromStateId": "s1",
        "toStateId": "s2",
        "label": "監視",
        "status": "actual",
        "activity": "quiet",
        "notes": ""
      },
      {
        "id": "activity-s2",
        "fromStateId": "s2",
        "toStateId": "activity-s2-output-17",
        "label": "探知・追尾",
        "status": "actual",
        "activity": "active",
        "notes": "",
        "kind": "observation",
        "junctions": []
      },
      {
        "id": "activity-c2",
        "fromStateId": "c2",
        "toStateId": "end-c2",
        "label": "識別",
        "status": "actual",
        "activity": "active",
        "notes": ""
      },
      {
        "id": "activity-c3",
        "fromStateId": "c3",
        "toStateId": "activity-c3-output-30",
        "label": "交戦判断",
        "status": "actual",
        "activity": "active",
        "notes": "",
        "junctions": []
      },
      {
        "id": "activity-u2",
        "fromStateId": "u2",
        "toStateId": "end-u2",
        "label": "接敵",
        "status": "actual",
        "activity": "active",
        "notes": ""
      },
      {
        "id": "activity-u3",
        "fromStateId": "u3",
        "toStateId": "end-u3",
        "label": "攻撃",
        "status": "actual",
        "activity": "active",
        "notes": ""
      },
      {
        "id": "activity-t2",
        "fromStateId": "t2",
        "toStateId": "end-t2",
        "label": "誘導",
        "status": "actual",
        "activity": "active",
        "notes": ""
      },
      {
        "id": "et1",
        "fromStateId": "end-e1",
        "toStateId": "e2",
        "label": "移行",
        "status": "actual",
        "notes": ""
      },
      {
        "id": "et2",
        "fromStateId": "end-e2",
        "toStateId": "e3",
        "label": "移行",
        "status": "actual",
        "notes": ""
      },
      {
        "id": "escape",
        "fromStateId": "end-e3",
        "toStateId": "e4",
        "label": "離脱成立",
        "status": "planned",
        "notes": "旧escapeの44〜52分を保持。46分の命中で無力化へ分岐。元の離脱完了への実線は阻止失敗時の予定経路。旧disabledをこの成功枝へ統合。",
        "junctions": [
          {
            "id": "j-escape-hit",
            "time": 46,
            "outcomes": [
              {
                "toStateId": "e5",
                "label": "阻止成功"
              }
            ]
          }
        ]
      },
      {
        "id": "ct2",
        "fromStateId": "end-c2",
        "toStateId": "c3",
        "label": "移行",
        "status": "actual",
        "notes": ""
      },
      {
        "id": "ut2",
        "fromStateId": "end-u2",
        "toStateId": "u3",
        "label": "移行",
        "status": "actual",
        "notes": ""
      },
      {
        "id": "activity-s2-after-17",
        "fromStateId": "activity-s2-output-17",
        "toStateId": "end-s2",
        "label": "探知・追尾（継続）",
        "status": "actual",
        "activity": "active",
        "notes": "",
        "kind": "observation",
        "junctions": []
      },
      {
        "id": "activity-c3-after-30",
        "fromStateId": "activity-c3-output-30",
        "toStateId": "end-c3",
        "label": "交戦判断（継続）",
        "status": "actual",
        "activity": "active",
        "notes": "",
        "junctions": []
      }
    ],
    "causalLinks": [
      {
        "id": "detect",
        "source": {
          "type": "state",
          "id": "e2"
        },
        "target": {
          "type": "state",
          "id": "s2"
        },
        "label": "発見",
        "kind": "detection",
        "notes": "",
        "propagation": {
          "duration": 0,
          "qualityRetention": 1
        }
      },
      {
        "id": "report",
        "source": {
          "type": "state",
          "id": "activity-s2-output-17"
        },
        "target": {
          "type": "state",
          "id": "c2"
        },
        "label": "探知情報",
        "kind": "information",
        "notes": "",
        "propagation": {
          "duration": 1,
          "qualityRetention": 1
        }
      },
      {
        "id": "order",
        "source": {
          "type": "state",
          "id": "activity-c3-output-30"
        },
        "target": {
          "type": "state",
          "id": "u2"
        },
        "label": "接敵指示",
        "kind": "command",
        "notes": "",
        "propagation": {
          "duration": 1,
          "qualityRetention": 1
        }
      },
      {
        "id": "launch",
        "source": {
          "type": "state",
          "id": "u3"
        },
        "target": {
          "type": "state",
          "id": "t2"
        },
        "label": "発射",
        "kind": "attack",
        "notes": "",
        "propagation": {
          "duration": 0,
          "qualityRetention": 1
        }
      },
      {
        "id": "hit",
        "source": {
          "type": "state",
          "id": "end-t2"
        },
        "target": {
          "type": "junction",
          "taskId": "escape",
          "id": "j-escape-hit",
          "outcomeStateId": "e5"
        },
        "label": "命中・離脱阻止",
        "kind": "attack",
        "notes": "離脱 → 離脱完了という予定遷移を阻止。実際には無力化へ遷移する。",
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
          "enemy",
          "sensor",
          "control",
          "uuv",
          "torpedo"
        ],
        "zoom": 1,
        "visibleTimeRange": {
          "start": 0,
          "end": 60
        },
        "filters": {
          "technology": false,
          "causalLink": true,
          "quiet": true,
          "planned": true,
          "implicitDependencies": false
        },
        "laneHeight": 64,
        "mode": "mission",
        "collapsedLayout": "compact"
      }
    }
  },
  "grouped": {
    "version": 3,
    "title": "潜水艦グループ — ソナー・魚雷による任務阻止",
    "notes": "時間・品質は説明用の仮定。Stateは意味のある条件・受領・結果のみを表す。作用線はState起点、Stateまたは分岐点終点。Task途中の出力は成立Stateを設けて分割する。",
    "time": {
      "unit": "minutes",
      "duration": 60,
      "snap": 1
    },
    "actors": [
      {
        "id": "enemy",
        "name": "敵UUV",
        "side": "hostile",
        "notes": "監視海域で任務を遂行し、離脱する計画。",
        "color": "#a75353"
      },
      {
        "id": "sensor",
        "name": "ソナー",
        "side": "friendly",
        "notes": "",
        "parentId": "uuv",
        "color": "#236d78"
      },
      {
        "id": "control",
        "name": "管制",
        "side": "friendly",
        "notes": "",
        "color": "#8061a8"
      },
      {
        "id": "uuv",
        "name": "潜水艦",
        "side": "friendly",
        "notes": "",
        "isGroup": true,
        "color": "#a56c24"
      },
      {
        "id": "torpedo",
        "name": "魚雷",
        "side": "friendly",
        "notes": "",
        "parentId": "uuv",
        "color": "#397aa0"
      }
    ],
    "states": [
      {
        "id": "e1",
        "actorId": "enemy",
        "name": "進出開始",
        "time": 0,
        "status": "actual",
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "end-e1",
        "actorId": "enemy",
        "name": "進出終了",
        "time": 12,
        "status": "actual",
        "activity": "active",
        "notes": ""
      },
      {
        "id": "e2",
        "actorId": "enemy",
        "name": "任務開始",
        "time": 14,
        "status": "actual",
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "end-e2",
        "actorId": "enemy",
        "name": "任務終了",
        "time": 34,
        "status": "actual",
        "activity": "active",
        "notes": ""
      },
      {
        "id": "e3",
        "actorId": "enemy",
        "name": "離脱開始",
        "time": 36,
        "status": "actual",
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "end-e3",
        "actorId": "enemy",
        "name": "離脱中",
        "time": 44,
        "status": "actual",
        "activity": "active",
        "notes": ""
      },
      {
        "id": "e4",
        "actorId": "enemy",
        "name": "離脱完了",
        "time": 52,
        "status": "planned",
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "e5",
        "actorId": "enemy",
        "name": "無力化",
        "time": 46,
        "status": "actual",
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "s1",
        "actorId": "sensor",
        "name": "監視開始",
        "time": 0,
        "status": "actual",
        "activity": "quiet",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "s2",
        "actorId": "sensor",
        "name": "探知済",
        "time": 14,
        "status": "actual",
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "end-s2",
        "actorId": "sensor",
        "name": "追尾終了",
        "time": 48,
        "status": "actual",
        "activity": "active",
        "notes": ""
      },
      {
        "id": "c2",
        "actorId": "control",
        "name": "追尾情報受領",
        "time": 18,
        "status": "actual",
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "end-c2",
        "actorId": "control",
        "name": "識別終了",
        "time": 25,
        "status": "actual",
        "activity": "active",
        "notes": ""
      },
      {
        "id": "c3",
        "actorId": "control",
        "name": "判断開始",
        "time": 27,
        "status": "actual",
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "end-c3",
        "actorId": "control",
        "name": "判断終了",
        "time": 33,
        "status": "actual",
        "activity": "active",
        "notes": ""
      },
      {
        "id": "u2",
        "actorId": "uuv",
        "name": "迎撃指令受領",
        "time": 31,
        "status": "actual",
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "end-u2",
        "actorId": "uuv",
        "name": "接敵完了",
        "time": 38,
        "status": "actual",
        "activity": "active",
        "notes": ""
      },
      {
        "id": "u3",
        "actorId": "uuv",
        "name": "攻撃開始",
        "time": 40,
        "status": "actual",
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "end-u3",
        "actorId": "uuv",
        "name": "攻撃終了",
        "time": 46,
        "status": "actual",
        "activity": "active",
        "notes": ""
      },
      {
        "id": "t2",
        "actorId": "torpedo",
        "name": "誘導開始指示受領",
        "time": 40,
        "status": "actual",
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "end-t2",
        "actorId": "torpedo",
        "name": "誘導終了",
        "time": 46,
        "status": "actual",
        "activity": "active",
        "notes": ""
      },
      {
        "id": "activity-s2-output-17",
        "actorId": "sensor",
        "time": 17,
        "name": "探知情報成立",
        "activity": "active",
        "phase": "other"
      },
      {
        "id": "activity-c3-output-30",
        "actorId": "control",
        "time": 30,
        "name": "接敵指示成立",
        "activity": "active",
        "phase": "other"
      }
    ],
    "tasks": [
      {
        "id": "activity-e1",
        "fromStateId": "e1",
        "toStateId": "end-e1",
        "label": "進出",
        "status": "actual",
        "activity": "active",
        "notes": ""
      },
      {
        "id": "activity-e2",
        "fromStateId": "e2",
        "toStateId": "end-e2",
        "label": "任務遂行",
        "status": "actual",
        "activity": "active",
        "notes": ""
      },
      {
        "id": "activity-e3",
        "fromStateId": "e3",
        "toStateId": "end-e3",
        "label": "離脱",
        "status": "actual",
        "activity": "active",
        "notes": ""
      },
      {
        "id": "activity-s1",
        "fromStateId": "s1",
        "toStateId": "s2",
        "label": "監視",
        "status": "actual",
        "activity": "quiet",
        "notes": ""
      },
      {
        "id": "activity-s2",
        "fromStateId": "s2",
        "toStateId": "activity-s2-output-17",
        "label": "探知・追尾",
        "status": "actual",
        "activity": "active",
        "notes": "",
        "kind": "observation",
        "junctions": []
      },
      {
        "id": "activity-c2",
        "fromStateId": "c2",
        "toStateId": "end-c2",
        "label": "識別",
        "status": "actual",
        "activity": "active",
        "notes": ""
      },
      {
        "id": "activity-c3",
        "fromStateId": "c3",
        "toStateId": "activity-c3-output-30",
        "label": "交戦判断",
        "status": "actual",
        "activity": "active",
        "notes": "",
        "junctions": []
      },
      {
        "id": "activity-u2",
        "fromStateId": "u2",
        "toStateId": "end-u2",
        "label": "接敵",
        "status": "actual",
        "activity": "active",
        "notes": ""
      },
      {
        "id": "activity-u3",
        "fromStateId": "u3",
        "toStateId": "end-u3",
        "label": "攻撃",
        "status": "actual",
        "activity": "active",
        "notes": ""
      },
      {
        "id": "activity-t2",
        "fromStateId": "t2",
        "toStateId": "end-t2",
        "label": "誘導",
        "status": "actual",
        "activity": "active",
        "notes": ""
      },
      {
        "id": "et1",
        "fromStateId": "end-e1",
        "toStateId": "e2",
        "label": "移行",
        "status": "actual",
        "notes": ""
      },
      {
        "id": "et2",
        "fromStateId": "end-e2",
        "toStateId": "e3",
        "label": "移行",
        "status": "actual",
        "notes": ""
      },
      {
        "id": "escape",
        "fromStateId": "end-e3",
        "toStateId": "e4",
        "label": "離脱成立",
        "status": "planned",
        "notes": "旧escapeの44〜52分を保持。46分の命中で無力化へ分岐。元の離脱完了への実線は阻止失敗時の予定経路。旧disabledをこの成功枝へ統合。",
        "junctions": [
          {
            "id": "j-escape-hit",
            "time": 46,
            "outcomes": [
              {
                "toStateId": "e5",
                "label": "阻止成功"
              }
            ]
          }
        ]
      },
      {
        "id": "ct2",
        "fromStateId": "end-c2",
        "toStateId": "c3",
        "label": "移行",
        "status": "actual",
        "notes": ""
      },
      {
        "id": "ut2",
        "fromStateId": "end-u2",
        "toStateId": "u3",
        "label": "移行",
        "status": "actual",
        "notes": ""
      },
      {
        "id": "activity-s2-after-17",
        "fromStateId": "activity-s2-output-17",
        "toStateId": "end-s2",
        "label": "探知・追尾（継続）",
        "status": "actual",
        "activity": "active",
        "notes": "",
        "kind": "observation",
        "junctions": []
      },
      {
        "id": "activity-c3-after-30",
        "fromStateId": "activity-c3-output-30",
        "toStateId": "end-c3",
        "label": "交戦判断（継続）",
        "status": "actual",
        "activity": "active",
        "notes": "",
        "junctions": []
      }
    ],
    "causalLinks": [
      {
        "id": "detect",
        "source": {
          "type": "state",
          "id": "e2"
        },
        "target": {
          "type": "state",
          "id": "s2"
        },
        "label": "発見",
        "kind": "detection",
        "notes": "",
        "propagation": {
          "duration": 0,
          "qualityRetention": 1
        }
      },
      {
        "id": "report",
        "source": {
          "type": "state",
          "id": "activity-s2-output-17"
        },
        "target": {
          "type": "state",
          "id": "c2"
        },
        "label": "探知情報",
        "kind": "information",
        "notes": "",
        "propagation": {
          "duration": 1,
          "qualityRetention": 1
        }
      },
      {
        "id": "order",
        "source": {
          "type": "state",
          "id": "activity-c3-output-30"
        },
        "target": {
          "type": "state",
          "id": "u2"
        },
        "label": "接敵指示",
        "kind": "command",
        "notes": "",
        "propagation": {
          "duration": 1,
          "qualityRetention": 1
        }
      },
      {
        "id": "launch",
        "source": {
          "type": "state",
          "id": "u3"
        },
        "target": {
          "type": "state",
          "id": "t2"
        },
        "label": "発射",
        "kind": "attack",
        "notes": "",
        "propagation": {
          "duration": 0,
          "qualityRetention": 1
        }
      },
      {
        "id": "hit",
        "source": {
          "type": "state",
          "id": "end-t2"
        },
        "target": {
          "type": "junction",
          "taskId": "escape",
          "id": "j-escape-hit",
          "outcomeStateId": "e5"
        },
        "label": "命中・離脱阻止",
        "kind": "attack",
        "notes": "離脱 → 離脱完了という予定遷移を阻止。実際には無力化へ遷移する。",
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
          "enemy",
          "sensor",
          "control",
          "uuv",
          "torpedo"
        ],
        "zoom": 1,
        "visibleTimeRange": {
          "start": 0,
          "end": 60
        },
        "filters": {
          "technology": false,
          "causalLink": true,
          "quiet": true,
          "planned": true,
          "implicitDependencies": false
        },
        "laneHeight": 64,
        "mode": "mission",
        "collapsedLayout": "compact"
      }
    }
  },
  "research": {
    "version": 3,
    "title": "Technology / Gap — 介入経路の検討",
    "notes": "時間・品質は説明用の仮定。Stateは意味のある条件・受領・結果のみを表す。作用線はState起点、Stateまたは分岐点終点。Task途中の出力は成立Stateを設けて分割する。",
    "time": {
      "unit": "minutes",
      "duration": 60,
      "snap": 1
    },
    "actors": [
      {
        "id": "enemy",
        "name": "敵UUV",
        "side": "hostile",
        "notes": "監視海域で任務を遂行し、離脱する計画。",
        "color": "#a75353"
      },
      {
        "id": "sensor",
        "name": "ソナー",
        "side": "friendly",
        "notes": "",
        "parentId": "uuv",
        "color": "#236d78"
      },
      {
        "id": "control",
        "name": "管制",
        "side": "friendly",
        "notes": "",
        "color": "#8061a8"
      },
      {
        "id": "uuv",
        "name": "潜水艦",
        "side": "friendly",
        "notes": "",
        "isGroup": true,
        "color": "#a56c24"
      },
      {
        "id": "torpedo",
        "name": "魚雷",
        "side": "friendly",
        "notes": "",
        "parentId": "uuv",
        "color": "#397aa0"
      }
    ],
    "states": [
      {
        "id": "e1",
        "actorId": "enemy",
        "name": "進出開始",
        "time": 0,
        "status": "actual",
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "end-e1",
        "actorId": "enemy",
        "name": "進出終了",
        "time": 12,
        "status": "actual",
        "activity": "active",
        "notes": ""
      },
      {
        "id": "e2",
        "actorId": "enemy",
        "name": "任務開始",
        "time": 14,
        "status": "actual",
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "end-e2",
        "actorId": "enemy",
        "name": "任務終了",
        "time": 34,
        "status": "actual",
        "activity": "active",
        "notes": ""
      },
      {
        "id": "e3",
        "actorId": "enemy",
        "name": "離脱開始",
        "time": 36,
        "status": "actual",
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "end-e3",
        "actorId": "enemy",
        "name": "離脱中",
        "time": 44,
        "status": "actual",
        "activity": "active",
        "notes": ""
      },
      {
        "id": "e4",
        "actorId": "enemy",
        "name": "離脱完了",
        "time": 52,
        "status": "planned",
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "e5",
        "actorId": "enemy",
        "name": "無力化",
        "time": 46,
        "status": "actual",
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "s1",
        "actorId": "sensor",
        "name": "監視開始",
        "time": 0,
        "status": "actual",
        "activity": "quiet",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "s2",
        "actorId": "sensor",
        "name": "探知済",
        "time": 14,
        "status": "actual",
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "end-s2",
        "actorId": "sensor",
        "name": "追尾終了",
        "time": 48,
        "status": "actual",
        "activity": "active",
        "notes": ""
      },
      {
        "id": "c2",
        "actorId": "control",
        "name": "追尾情報受領",
        "time": 18,
        "status": "actual",
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "end-c2",
        "actorId": "control",
        "name": "識別終了",
        "time": 25,
        "status": "actual",
        "activity": "active",
        "notes": ""
      },
      {
        "id": "c3",
        "actorId": "control",
        "name": "判断開始",
        "time": 27,
        "status": "actual",
        "activity": "active",
        "phase": "decision",
        "notes": ""
      },
      {
        "id": "end-c3",
        "actorId": "control",
        "name": "判断終了",
        "time": 33,
        "status": "actual",
        "activity": "active",
        "notes": ""
      },
      {
        "id": "u2",
        "actorId": "uuv",
        "name": "迎撃指令受領",
        "time": 31,
        "status": "actual",
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "end-u2",
        "actorId": "uuv",
        "name": "接敵完了",
        "time": 38,
        "status": "actual",
        "activity": "active",
        "notes": ""
      },
      {
        "id": "u3",
        "actorId": "uuv",
        "name": "攻撃開始",
        "time": 40,
        "status": "actual",
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "end-u3",
        "actorId": "uuv",
        "name": "攻撃終了",
        "time": 46,
        "status": "actual",
        "activity": "active",
        "notes": ""
      },
      {
        "id": "t2",
        "actorId": "torpedo",
        "name": "誘導開始指示受領",
        "time": 40,
        "status": "actual",
        "activity": "active",
        "phase": "other",
        "notes": ""
      },
      {
        "id": "end-t2",
        "actorId": "torpedo",
        "name": "誘導終了",
        "time": 46,
        "status": "actual",
        "activity": "active",
        "notes": ""
      },
      {
        "id": "activity-s2-output-17",
        "actorId": "sensor",
        "time": 17,
        "name": "探知情報成立",
        "activity": "active",
        "phase": "other"
      },
      {
        "id": "activity-c3-output-30",
        "actorId": "control",
        "time": 30,
        "name": "接敵指示成立",
        "activity": "active",
        "phase": "other"
      }
    ],
    "tasks": [
      {
        "id": "activity-e1",
        "fromStateId": "e1",
        "toStateId": "end-e1",
        "label": "進出",
        "status": "actual",
        "activity": "active",
        "notes": "",
        "junctions": []
      },
      {
        "id": "activity-e2",
        "fromStateId": "e2",
        "toStateId": "end-e2",
        "label": "任務遂行",
        "status": "actual",
        "activity": "active",
        "notes": "",
        "junctions": []
      },
      {
        "id": "activity-e3",
        "fromStateId": "e3",
        "toStateId": "end-e3",
        "label": "離脱",
        "status": "actual",
        "activity": "active",
        "notes": "",
        "junctions": []
      },
      {
        "id": "activity-s1",
        "fromStateId": "s1",
        "toStateId": "s2",
        "label": "監視",
        "status": "actual",
        "activity": "quiet",
        "notes": "",
        "junctions": []
      },
      {
        "id": "activity-s2",
        "fromStateId": "s2",
        "toStateId": "activity-s2-output-17",
        "label": "探知・追尾",
        "status": "actual",
        "activity": "active",
        "notes": "",
        "kind": "observation",
        "junctions": []
      },
      {
        "id": "activity-c2",
        "fromStateId": "c2",
        "toStateId": "end-c2",
        "label": "識別",
        "status": "actual",
        "activity": "active",
        "notes": "",
        "junctions": []
      },
      {
        "id": "activity-c3",
        "fromStateId": "c3",
        "toStateId": "activity-c3-output-30",
        "label": "交戦判断",
        "status": "actual",
        "activity": "active",
        "notes": "",
        "junctions": []
      },
      {
        "id": "activity-u2",
        "fromStateId": "u2",
        "toStateId": "end-u2",
        "label": "接敵",
        "status": "actual",
        "activity": "active",
        "notes": "",
        "junctions": []
      },
      {
        "id": "activity-u3",
        "fromStateId": "u3",
        "toStateId": "end-u3",
        "label": "攻撃",
        "status": "actual",
        "activity": "active",
        "notes": "",
        "junctions": []
      },
      {
        "id": "activity-t2",
        "fromStateId": "t2",
        "toStateId": "end-t2",
        "label": "誘導",
        "status": "actual",
        "activity": "active",
        "notes": "",
        "junctions": []
      },
      {
        "id": "et1",
        "fromStateId": "end-e1",
        "toStateId": "e2",
        "label": "移行",
        "status": "actual",
        "notes": "",
        "junctions": []
      },
      {
        "id": "et2",
        "fromStateId": "end-e2",
        "toStateId": "e3",
        "label": "移行",
        "status": "actual",
        "notes": "",
        "junctions": []
      },
      {
        "id": "escape",
        "fromStateId": "end-e3",
        "toStateId": "e4",
        "label": "離脱成立",
        "status": "planned",
        "notes": "旧escapeの44〜52分を保持。46分の命中で無力化へ分岐。元の離脱完了への実線は阻止失敗時の予定経路。旧disabledをこの成功枝へ統合。",
        "junctions": [
          {
            "id": "j-escape-hit",
            "time": 46,
            "outcomes": [
              {
                "toStateId": "e5",
                "label": "阻止成功"
              }
            ]
          }
        ]
      },
      {
        "id": "ct2",
        "fromStateId": "end-c2",
        "toStateId": "c3",
        "label": "移行",
        "status": "actual",
        "notes": "",
        "junctions": []
      },
      {
        "id": "ut2",
        "fromStateId": "end-u2",
        "toStateId": "u3",
        "label": "移行",
        "status": "actual",
        "notes": "",
        "junctions": []
      },
      {
        "id": "activity-s2-after-17",
        "fromStateId": "activity-s2-output-17",
        "toStateId": "end-s2",
        "label": "探知・追尾（継続）",
        "status": "actual",
        "activity": "active",
        "notes": "",
        "kind": "observation",
        "junctions": []
      },
      {
        "id": "activity-c3-after-30",
        "fromStateId": "activity-c3-output-30",
        "toStateId": "end-c3",
        "label": "交戦判断（継続）",
        "status": "actual",
        "activity": "active",
        "notes": "",
        "junctions": []
      }
    ],
    "causalLinks": [
      {
        "id": "detect",
        "source": {
          "type": "state",
          "id": "e2"
        },
        "target": {
          "type": "state",
          "id": "s2"
        },
        "label": "発見",
        "kind": "detection",
        "notes": "",
        "propagation": {
          "duration": 0,
          "qualityRetention": 1
        }
      },
      {
        "id": "report",
        "source": {
          "type": "state",
          "id": "activity-s2-output-17"
        },
        "target": {
          "type": "state",
          "id": "c2"
        },
        "label": "探知情報",
        "kind": "information",
        "notes": "",
        "propagation": {
          "duration": 1,
          "qualityRetention": 1
        }
      },
      {
        "id": "order",
        "source": {
          "type": "state",
          "id": "activity-c3-output-30"
        },
        "target": {
          "type": "state",
          "id": "u2"
        },
        "label": "接敵指示",
        "kind": "command",
        "notes": "",
        "propagation": {
          "duration": 1,
          "qualityRetention": 1
        }
      },
      {
        "id": "launch",
        "source": {
          "type": "state",
          "id": "u3"
        },
        "target": {
          "type": "state",
          "id": "t2"
        },
        "label": "発射",
        "kind": "attack",
        "notes": "",
        "propagation": {
          "duration": 0,
          "qualityRetention": 1
        }
      },
      {
        "id": "hit",
        "source": {
          "type": "state",
          "id": "end-t2"
        },
        "target": {
          "type": "junction",
          "taskId": "escape",
          "id": "j-escape-hit",
          "outcomeStateId": "e5"
        },
        "label": "命中・離脱阻止",
        "kind": "attack",
        "notes": "離脱 → 離脱完了という予定遷移を阻止。実際には無力化へ遷移する。",
        "propagation": {
          "duration": 0,
          "qualityRetention": 1
        }
      }
    ],
    "technologies": [
      {
        "id": "tech-existing",
        "name": "既存システム基盤",
        "status": "existing",
        "trl": 9,
        "notes": "操作説明用の架空の技術評価"
      },
      {
        "id": "tech-sonar",
        "name": "協調音響識別",
        "status": "research",
        "trl": 4,
        "notes": "研究中の識別能力"
      },
      {
        "id": "tech-link",
        "name": "水中指令通信",
        "status": "gap",
        "trl": null,
        "notes": "必要な通信能力が未確保"
      }
    ],
    "bindings": [
      {
        "id": "binding-enemy",
        "technologyId": "tech-existing",
        "targetType": "actor",
        "targetId": "enemy"
      },
      {
        "id": "binding-sensor",
        "technologyId": "tech-existing",
        "targetType": "actor",
        "targetId": "sensor"
      },
      {
        "id": "binding-control",
        "technologyId": "tech-existing",
        "targetType": "actor",
        "targetId": "control"
      },
      {
        "id": "binding-uuv",
        "technologyId": "tech-existing",
        "targetType": "actor",
        "targetId": "uuv"
      },
      {
        "id": "binding-torpedo",
        "technologyId": "tech-existing",
        "targetType": "actor",
        "targetId": "torpedo"
      },
      {
        "id": "binding-e1",
        "technologyId": "tech-existing",
        "targetType": "task",
        "targetId": "activity-e1"
      },
      {
        "id": "binding-e2",
        "technologyId": "tech-existing",
        "targetType": "task",
        "targetId": "activity-e2"
      },
      {
        "id": "binding-e3",
        "technologyId": "tech-existing",
        "targetType": "task",
        "targetId": "activity-e3"
      },
      {
        "id": "binding-e4",
        "technologyId": "tech-existing",
        "targetType": "state",
        "targetId": "e4"
      },
      {
        "id": "binding-e5",
        "technologyId": "tech-existing",
        "targetType": "state",
        "targetId": "e5"
      },
      {
        "id": "binding-s1",
        "technologyId": "tech-existing",
        "targetType": "task",
        "targetId": "activity-s1"
      },
      {
        "id": "binding-s2",
        "technologyId": "tech-existing",
        "targetType": "task",
        "targetId": "activity-s2"
      },
      {
        "id": "binding-c2",
        "technologyId": "tech-existing",
        "targetType": "task",
        "targetId": "activity-c2"
      },
      {
        "id": "binding-c3",
        "technologyId": "tech-existing",
        "targetType": "task",
        "targetId": "activity-c3"
      },
      {
        "id": "binding-u2",
        "technologyId": "tech-existing",
        "targetType": "task",
        "targetId": "activity-u2"
      },
      {
        "id": "binding-u3",
        "technologyId": "tech-existing",
        "targetType": "task",
        "targetId": "activity-u3"
      },
      {
        "id": "binding-t2",
        "technologyId": "tech-existing",
        "targetType": "task",
        "targetId": "activity-t2"
      },
      {
        "id": "binding-et1",
        "technologyId": "tech-existing",
        "targetType": "task",
        "targetId": "et1"
      },
      {
        "id": "binding-et2",
        "technologyId": "tech-existing",
        "targetType": "task",
        "targetId": "et2"
      },
      {
        "id": "binding-escape",
        "technologyId": "tech-existing",
        "targetType": "task",
        "targetId": "escape"
      },
      {
        "id": "binding-disabled",
        "technologyId": "tech-existing",
        "targetType": "task",
        "targetId": "escape"
      },
      {
        "id": "binding-st1",
        "technologyId": "tech-existing",
        "targetType": "state",
        "targetId": "s2"
      },
      {
        "id": "binding-ct1",
        "technologyId": "tech-existing",
        "targetType": "state",
        "targetId": "c2"
      },
      {
        "id": "binding-ct2",
        "technologyId": "tech-existing",
        "targetType": "task",
        "targetId": "ct2"
      },
      {
        "id": "binding-ut2",
        "technologyId": "tech-existing",
        "targetType": "task",
        "targetId": "ut2"
      },
      {
        "id": "binding-tt1",
        "technologyId": "tech-existing",
        "targetType": "state",
        "targetId": "t2"
      },
      {
        "id": "binding-detect",
        "technologyId": "tech-existing",
        "targetType": "causalLink",
        "targetId": "detect"
      },
      {
        "id": "binding-report",
        "technologyId": "tech-existing",
        "targetType": "causalLink",
        "targetId": "report"
      },
      {
        "id": "binding-order",
        "technologyId": "tech-existing",
        "targetType": "causalLink",
        "targetId": "order"
      },
      {
        "id": "binding-launch",
        "technologyId": "tech-existing",
        "targetType": "causalLink",
        "targetId": "launch"
      },
      {
        "id": "binding-hit",
        "technologyId": "tech-existing",
        "targetType": "causalLink",
        "targetId": "hit"
      },
      {
        "id": "binding-research",
        "technologyId": "tech-sonar",
        "targetType": "task",
        "targetId": "activity-s2"
      },
      {
        "id": "binding-gap",
        "technologyId": "tech-link",
        "targetType": "causalLink",
        "targetId": "order"
      }
    ],
    "views": {
      "main": {
        "collapsedActors": [],
        "actorOrder": [
          "enemy",
          "sensor",
          "control",
          "uuv",
          "torpedo"
        ],
        "zoom": 1,
        "visibleTimeRange": {
          "start": 0,
          "end": 60
        },
        "filters": {
          "technology": false,
          "causalLink": true,
          "quiet": true,
          "planned": true,
          "implicitDependencies": false
        },
        "laneHeight": 64,
        "mode": "mission",
        "collapsedLayout": "compact"
      }
    }
  }
};
  const sample=()=>M.defaults(M.validate(M.clone(data.sample)));
  const grouped=()=>M.defaults(M.validate(M.clone(data.grouped)));
  const research=()=>M.defaults(M.validate(M.clone(data.research)));
  if(typeof module!=="undefined" && module.exports){module.exports=sample;module.exports.grouped=grouped;module.exports.research=research;}
  else {root.createSample=sample;root.createGroupedSample=grouped;root.createResearchSample=research;}
})(globalThis);
