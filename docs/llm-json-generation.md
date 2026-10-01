# LLM向け IMEE JSON生成仕様 — version 2 / propagation-duration model

この文書は、LLMがIMEE Mission State Timeline Editorへ読み込めるJSONを、外部テスト環境なしでも生成しやすくするための仕様です。

シミュレーションを含む場合は `docs/llm-simulation-generation.md` も併用します。

## 1. 基本原則

- 出力は1つのversion 2 JSONオブジェクト。
- 不明な性能・時刻・結果を事実として捏造しない。必要ならnotesへ「説明用仮定」と明記する。
- Stateは「到達した時点」、Taskは「同一Actor内でStateからStateへ進む行為」。
- CausalLinkはActor間・Task間の作用で、**到達絶対時刻を保存しない**。
- 因果の到達時刻は必ず「作用発生時刻 + 伝搬時間」から導出する。
- シミュレーション経路・依存・分岐・成功条件のいずれにも寄与しない形式的な待機State/Taskは作らない。
- Actorが存在するという理由だけで初期Stateを置かない。

## 2. トップレベル

```json
{
  "version": 2,
  "title": "シナリオ名",
  "notes": "",
  "time": {"unit": "seconds", "duration": 300, "snap": 1},
  "actors": [],
  "states": [],
  "tasks": [],
  "causalLinks": [],
  "technologies": [],
  "bindings": [],
  "simulation": {},
  "views": {}
}
```

`simulation` は表示だけの文書では省略可能です。

## 3. Actor

```json
{
  "id": "radar",
  "name": "監視レーダー",
  "side": "friendly",
  "parentId": null,
  "isGroup": false,
  "color": "#236d78",
  "notes": ""
}
```

`side` は `friendly / hostile / neutral`。

## 4. State

```json
{
  "id": "track-ready",
  "actorId": "radar",
  "name": "追尾情報確立",
  "time": 25,
  "activity": "active",
  "phase": "other",
  "notes": ""
}
```

Stateは一点です。`start` / `end` を持たせません。

### Stateを作る基準

次のどれかに該当する場合に作ります。

- Taskの開始・終了条件になる。
- CausalLinkの発生元または到達先になる。
- 分岐結果になる。
- Mission成功条件になる。
- ME上意味のあるReady/Decision/Effect状態を表す。

単に「Actorが時刻0から存在する」ことを示すだけの「待機」「監視中」は、実行依存に使わないなら作りません。

## 5. Task

通常Task:

```json
{
  "id": "track",
  "fromStateId": "detected",
  "toStateId": "track-ready",
  "label": "追尾・識別",
  "kind": "observation",
  "notes": ""
}
```

Taskの基準所要時間は、

`toState.time - fromState.time`

から導出します。

分岐Task:

```json
{
  "id": "classify",
  "fromStateId": "classification-start",
  "label": "識別",
  "junctions": [
    {
      "id": "j-classify",
      "time": 30,
      "outcomes": [
        {"toStateId": "identified", "label": "識別"},
        {"toStateId": "unknown", "label": "未識別"}
      ]
    }
  ]
}
```

## 6. CausalLink — 到達時刻ではなく伝搬時間を保存する

### 6.1 基本形

```json
{
  "id": "track-report",
  "source": {
    "type": "state",
    "id": "track-ready"
  },
  "target": {
    "type": "task",
    "id": "decide"
  },
  "propagation": {
    "duration": 4
  },
  "polarity": "positive",
  "label": "追尾情報",
  "kind": "information",
  "notes": ""
}
```

**targetにtimeを書いてはいけません。**

基準到達時刻は、

```text
arrivalTime = sourceTime + propagation.duration
```

です。

これにより、負の伝搬時間を禁止するだけで因果の時間逆転を構造的に防ぎます。

### 6.2 source

State:

```json
{"type":"state","id":"track-ready"}
```

発生時刻はState.timeから導出します。

Task上の途中点:

```json
{"type":"task","id":"track","time":20}
```

Actor上の外生イベント:

```json
{"type":"actor","id":"environment","time":15}
```

Task/Actorのsourceには発生時刻が必要です。

### 6.3 target

```json
{"type":"state","id":"received"}
```

または

```json
{"type":"task","id":"decide"}
```

または

```json
{"type":"actor","id":"control"}
```

targetにはtimeを保存しません。

Stateをtargetにする場合、表示上の整合のため

`target State.time = sourceTime + propagation.duration`

とします。

Taskをtargetにする場合、導出したarrivalTimeがTaskの基準期間内にあるかを確認します。期間外の作用を意図的に表す場合はnotesに理由を書きます。

### 6.4 CDF付き伝搬

```json
{
  "propagation": {
    "duration": 4,
    "w": 0,
    "performanceModel": {
      "type": "cdf",
      "degradationInput": "w",
      "curves": [
        {
          "w": 0,
          "points": [
            {"t": 1, "p": 0.2},
            {"t": 3, "p": 0.8},
            {"t": 6, "p": 0.99}
          ],
          "pInfinity": 0.01
        },
        {
          "w": 1,
          "points": [
            {"t": 1, "p": 0.05},
            {"t": 3, "p": 0.35},
            {"t": 6, "p": 0.8}
          ],
          "pInfinity": 0.2
        }
      ]
    }
  }
}
```

`duration` は図上の基準到達位置です。

CDFを有効にしたシミュレーションでは、実到着時間はCDFから抽選します。`duration`へCDFの時間を加算しません。

## 7. 因果の自己点検

LLMは出力前に、コード実行なしでも次を点検してください。

1. すべてのID参照先が存在する。
2. Taskの前後Stateは同一Actor。
3. Taskの終了State.timeは開始State.time以上。
4. junction.timeはTask期間内。
5. CausalLink.sourceがStateならsource.timeを書いていない。
6. CausalLink.targetにはtimeを書いていない。
7. すべてのCausalLinkに`propagation.duration >= 0`がある。
8. 基準到達時刻 `sourceTime + duration` は `time.duration` 内。
9. State targetならState.timeが基準到達時刻と一致する。
10. effect分岐なら基準到達時刻とjunction.timeが一致する。
11. 実行経路と無関係な形式的待機Stateを置いていない。
12. 仮定の時間/CDF/wはnotesで仮定と明示している。

## 8. Technology / Binding

Technology:

```json
{"id":"tech-x","name":"技術名","status":"existing","trl":9}
```

statusは `existing / research / planned / gap / unknown`。

Binding:

```json
{
  "id": "bind-x",
  "technologyId": "tech-x",
  "targetType": "task",
  "targetId": "track"
}
```

新規生成では主に `actor / task / causalLink` へ関連付けます。

## 9. View

```json
{
  "views": {
    "main": {
      "collapsedActors": [],
      "actorOrder": ["radar","control"],
      "zoom": 1,
      "visibleTimeRange": {"start":0,"end":60},
      "filters": {
        "technology": true,
        "causalLink": true,
        "quiet": true
      },
      "laneHeight": 64,
      "collapsedLayout": "compact",
      "mode": "mission"
    }
  }
}
```

## 10. 検証器は任意の追加確認

LLMの実行環境にNode.jsやリポジトリがあるとは限りません。したがって、**JSON生成の成立条件として検証器実行を要求しません。**

利用可能な環境では任意の追加確認として、

```sh
node scripts/validate-mission.cjs mission.json
```

を使用できます。

違反時は、可能な限り

- エラーメッセージ
- JSON path
- 問題を含むJSON断片

を表示します。

例:

```text
INVALID: target.timeは廃止されました。

JSON path:
$.causalLinks[3]

Offending JSON:
{
  "id": "order",
  ...
}
```

テストやバリデータを「違反を発見してから直すための必須工程」と考えず、この文書の規則を守って最初から整合したJSONを生成してください。

## 11. 出力方針

ユーザーがJSONファイルを求めた場合は、JSONを実ファイルとして作成して渡します。

JSONだけを求められた場合、コードフェンス・説明文・省略記号を混ぜません。
