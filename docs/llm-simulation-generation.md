# LLM向け IMEEシミュレーションシナリオ作成手順 — version 2

この文書は `llm-json-generation.md` に追加して、シミュレーション可能なMission Threadを生成するための仕様です。

IMEE Simulationは装備の内部物理や軌道を直接計算せず、外部解析等で得たTask性能・作用伝搬性能をMission Thread上で評価します。

## 1. まずMission成功条件を決める

```json
{
  "simulation": {
    "successStateIds": ["missile-destroyed-mid","missile-destroyed-terminal"],
    "successMode": "any",
    "deadline": 300,
    "iterations": 5000,
    "seed": 17
  }
}
```

成功Stateは「味方が発射した」ではなく、Mission上の成功結果そのものを選びます。

`successMode`:
- `all`: 全State到達
- `any`: いずれかのState到達

## 2. 実行経路だけを描く

Actorごとに形式的な「待機」「監視中」を置く必要はありません。

State/Taskを残す基準:

- 後続Taskの依存になる。
- CausalLinkの発生/到達に使う。
- 分岐結果になる。
- Mission成功/失敗の意味を持つ。
- Ready状態までの時間そのものがCapabilityとして重要。

「時刻0に待機しているだけ」で、そのStateを経由せずシミュレーションが進むなら削除します。

ただし、待機Stateを削除した結果、元々そのStateから始まっていたTaskへ情報・指令CausalLinkを直接接続して代用しないでください。

情報・指令が後続行為の因果起点なら、

```text
送信側State
   ↓ CausalLink
受信側「指令受領」State
   ↓
後続Task
```

とします。

TaskをCausalLinkのtargetにするのは、wをTaskへ入力する場合やeffect分岐でTaskを中断する場合など、Taskそのものへ作用させる意味があるときです。

## 3. Taskの時間モデル

固定TaskはState時刻差を基準所要時間として使います。

CDF Task:

```json
{
  "id": "intercept",
  "fromStateId": "launched",
  "toStateId": "kill",
  "label": "迎撃",
  "simulation": {
    "enabled": true,
    "w": 0,
    "wInput": {
      "stateIds": ["launched"],
      "combine": "max"
    },
    "performanceModel": {
      "type": "cdf",
      "degradationInput": "w",
      "curves": [
        {
          "w": 0,
          "points": [
            {"t":10,"p":0.3},
            {"t":20,"p":0.65},
            {"t":30,"p":0.8}
          ],
          "pInfinity": 0.2
        },
        {
          "w": 1,
          "points": [
            {"t":10,"p":0.1},
            {"t":20,"p":0.35},
            {"t":30,"p":0.55}
          ],
          "pInfinity": 0.45
        }
      ]
    }
  }
}
```

CDFは `F(t|w)=P(T<=t)`。

- tはTask開始からの経過時間。
- 最終p + pInfinity = 1。
- pは時間方向に単調非減少。
- wは0〜1。
- 未達は別の確率分岐として二重計上しない。

## 4. 作用線の伝搬時間モデル

CausalLinkの到達絶対時刻は保存しません。

```json
{
  "id": "observation",
  "source": {"type":"state","id":"missile-launched"},
  "target": {"type":"state","id":"radar-detected"},
  "propagation": {
    "duration": 25,
    "w": 0,
    "performanceModel": {
      "type": "cdf",
      "degradationInput": "w",
      "curves": [...]
    }
  },
  "polarity": "positive",
  "label": "探知",
  "kind": "observation",
  "simulation": {
    "enabled": true,
    "type": "state"
  }
}
```

役割:

- `propagation.duration`: 図上の基準伝搬時間。必須、0以上。
- `propagation.performanceModel`: 実行時の伝搬時間CDF。任意。
- `propagation.w`: 伝搬CDFへ入れる固定w。省略時は発生元w。
- `simulation.type`: 到達後に何を起こすか。

CDFを使う場合も、`duration`とCDF時間を加算しません。実行時はCDFの抽選時間が伝搬時間そのものです。

## 5. 作用線の実行タイプ

### state

```json
"simulation": {
  "enabled": true,
  "type": "state"
}
```

作用到着でtarget Stateを成立させます。

### w

```json
"simulation": {
  "enabled": true,
  "type": "w"
}
```

target Task/Stateへwを渡します。

### branch

```json
"simulation": {
  "enabled": true,
  "type": "branch",
  "junctionId": "kill-junction",
  "outcomeStateId": "destroyed",
  "stopTargetActor": true,
  "holdUntilStart": false
}
```

target Taskのeffect分岐を起こします。

branchでは

`source基準時刻 + propagation.duration = junction.time`

にしてください。

## 6. wの伝播

Task:

```json
"wInput": {
  "stateIds": ["track-ready"],
  "waitForLinks": true,
  "combine": "max"
}
```

- State入力と到着済みw作用線から最大wを採用。
- 入力がなければTask.simulation.w。
- Task.outputWがなければ採用wを後続へ引き継ぐ。
- 原因となる物理量をIMEE内部で詳細計算しない場合、wは外部性能入力として扱う。

## 7. 分岐

確率分岐:

```json
{
  "id":"j-identify",
  "time":30,
  "simulation":{"mode":"probability"},
  "outcomes":[
    {"toStateId":"identified","label":"識別","probability":0.8,"delay":0},
    {"toStateId":"unknown","label":"未識別","probability":0.2,"delay":0}
  ]
}
```

外部作用分岐:

```json
{
  "id":"kill-junction",
  "time":150,
  "simulation":{"mode":"effect"},
  "outcomes":[
    {"toStateId":"destroyed","label":"撃破","delay":0}
  ]
}
```

effect分岐への作用線は、基準到達時刻をjunction.timeへ合わせます。

## 8. 中止

後段のTaskを前段成功で止める場合:

```json
"cancelOnStateIds": ["destroyed-mid"]
```

多層防御では、前段撃破後に後段迎撃が走らないよう明示します。

## 9. 初期State

Task・分岐・state型CausalLinkから生成されないStateだけが初期State候補です。

ただし、単に図を埋めるための初期待機Stateは作りません。

本当にMission開始時に成立している条件だけを初期Stateとして置きます。

## 10. 時間整合の自己点検

テスト環境がなくても、生成前に次を確認します。

- target.timeを使っていない。
- 全CausalLinkにpropagation.durationがある。
- durationは0以上。
- sourceがStateなら発生時刻はState.time。
- sourceがTaskならsource.timeはTask基準期間内。
- State targetならState.time = sourceTime + duration。
- branch targetならjunction.time = sourceTime + duration。
- Mission deadlineだけで局所時間窓を代用していない。
- CDFの未達確率と別分岐成功率を重複計上していない。
- 中止条件を必要な後段Taskに入れている。
- 実行に関係しない待機State/Taskを置いていない。

## 11. 検証器・シミュレーション実行は任意

LLMにNode.js、Git、IMEEリポジトリへのアクセスがあるとは限りません。

そのため、**シナリオ生成の必須条件としてcompile、Monte Carlo、テスト実行を要求しません。**

環境が利用できる場合だけ、追加確認として使えます。

形式確認:

```sh
node scripts/validate-mission.cjs mission.json
```

シミュレーション実行は、ユーザーが実行を求めた場合、または明確に検証まで求めた場合に行います。

「シミュレーションできるデータを作って」という依頼だけなら、勝手にMonte Carlo結果まで生成しません。

## 12. 仮定の扱い

実在装備・実システムを題材にする場合でも、性能値が与えられていなければ実性能として推定しません。

説明用に仮定値を置く場合は対象のnotesへ、

- 説明用仮定
- 実性能ではない
- 外部解析入力を模擬した値

などを明記します。

## 13. 推奨生成順序

1. Mission成功Stateを決める。
2. Mission上意味のあるActorだけを置く。
3. 実行経路に必要なStateだけを置く。
4. 同一Actor内をTaskで接続する。
5. Actor間の因果をCausalLinkで結ぶ。
6. source発生時刻とpropagation.durationから基準到達時刻を決める。
7. 必要なTask/CausalLinkだけCDF化する。
8. w依存・分岐・中止を設定する。
9. 上記自己点検を行う。
10. JSONとして出力する。

テスト環境はこの手順の前提ではありません。
