# LLM向け IMEEシミュレーションシナリオ作成手順 — version 2

IMEE Simulationは、装備・環境・交戦の詳細挙動をモデル化せず、外部解析によって得られたTask-level performanceをMission Thread上で伝播させ、Mission-level effectivenessおよび必要Capabilityを評価する。

この手順書は、**表示でき、シミュレーションも実行できるversion 2 JSON**をLLMに生成させるための追加仕様です。[共通JSON生成仕様](llm-json-generation.md)と一緒に渡してください。完成例は [examples/simulation.json](../examples/simulation.json)、実行意味論の詳細は [simulation.md](simulation.md)、読込形式は [data-model.md](data-model.md)にあります。

以下のJSON断片は設定方法の説明です。断片をそのまま完成文書として返さず、全参照先を持つ1つのJSONへ組み込んでください。JSONのみを求められた場合は、説明・コードフェンス・コメント・省略記号を付けません。

## 1. 入力を整理する

生成前に次を整理し、未指定なら質問するか、説明用の仮定として対象のnotesへ記録します。例の時間・CDF・wを実在装備の性能として流用しないでください。

| 入力 | 決めること |
| --- | --- |
| Mission要求 | 成功State、AND/OR、絶対期限、要求成功率 |
| Actor | 行為主体と作用を受ける主体、friendly / hostile / neutral |
| 基準経路 | 未介入時のState列、固定所要時間、初期Stateの時刻 |
| Task性能 | 固定時間かCDFか、達成の意味、CDFの出典・仮定 |
| 作用線 | 表示専用か実行か、State到達・w伝播・作用分岐のどれか、固定遅延かCDFか |
| 分岐 | Task内の条件付き確率選択か、外部作用による中断か |
| w | 外部入力の値、受け渡す経路、入力を待つか、出力を固定するか |
| 検証 | 基準結果、早過ぎる作用・遅過ぎる作用・未達時の期待結果、Seedと試行数 |

現在扱える範囲はTask/作用線のCDF、固定wとその伝播、単回実行の分岐、依存・中止、Mission成功条件、Monte Carlo、Criticality、Taskの時間/wの感度分析・要求境界の推定です。座標・軌道・センサ・交戦物理、ランダムW、Resource/数量、ループ、同じTaskの自動再試行は未対応です。対応していない機能をJSONキーやラベルだけで実装したことにしないでください。別Taskとして明示した再送経路は作れます。

## 2. Mission成功条件を先に定義する

成功とはどのActorのどのStateに到達することかを決め、文書直下のsimulationへ明示します。迎撃例なら、敵ミサイルの撃破Stateを成功条件にします。味方の「発射」だけでは撃破成功を表しません。

```json
{
  "simulation": {
    "successStateIds": ["missile-destroyed-mid", "missile-destroyed-terminal"],
    "successMode": "any",
    "deadline": 180,
    "iterations": 5000,
    "seed": 17
  }
}
```

- successStateIdsは存在するState IDを1件以上、重複なく指定します。
- successModeはall（AND、全State到達時の最大時刻）またはany（OR、最初の到達時刻）。排他的な撃破候補はanyです。
- deadlineはMission起点からの**絶対時刻**です。期限を課さないならnull。単位はtime.unitと同じです。非負の有限数、上限10⁹です。
- iterationsは1〜100,000の整数、seedは0〜4,294,967,295の整数です。生成時は両方明示します。
- Mission要求成功率は感度分析のtargetProbabilityとして指定します。文書simulationに未対応のtargetProbabilityキーを足して要求判定が働くと考えないでください。依頼条件やnotesに残し、分析実行時に渡します。

**State.timeは描画用の基準時刻で、達成期限ではありません。time.durationも表示期間で、実行の打切り期限ではありません。** 成功Stateへ実際に到達してもdeadlineを超えればMission失敗です。deadlineは遅い処理を中断せず、成功判定に使います。

## 3. 基準経路と実行依存を作る

Stateを到達時点として作り、同一Actor内のStateをTaskで結びます。Taskにstart / end / durationを重複保存しません。CDFなしの通常Taskは、接続先State.time−接続元State.timeが固定所要時間です。通常接続先がないTaskは最後のjunction.timeを終了として使います。

実行中は接続元Stateの**実到達時刻**と依存条件からTask開始を決めます。固定所要時間でも開始時刻は変動します。図上の開始時刻に合わせて待機する規則はありません。指定時刻までの待機が必要なら、初期Stateからの固定待機Taskなどで依存を明示します。同一Actorだからという理由でTask同士を自動的に排他実行しません。

```json
{
  "id": "midcourse-launch",
  "fromStateId": "midcourse-ready",
  "toStateId": "midcourse-launched",
  "label": "発射指示",
  "kind": "command",
  "simulation": {
    "enabled": false,
    "waitForStateIds": ["control-orders", "missile-midcourse"],
    "wInput": {"waitForLinks": true, "combine": "max"}
  }
}
```

このTaskは準備完了・指令発出・中間軌道突入と、実行指定された入力w作用線の到着を待ちます。完成例の基準State時刻は60→70秒なので、開始後10秒で発射Stateへ到達します。`enabled: false` は**CDFを使わず固定時間で実行する**設定です。Taskを実行から除外する設定ではありません。依存やw設定だけを持つ固定Taskにもenabledを明示します。

Stateの初期化と合流は次の規則です。

- Taskの通常接続先・全分岐先・実行State到達作用線の入力先は、生成元を持つStateです。未選択の分岐先や未達作用線の入力先を初期Stateにしません。
- 生成元がないStateだけが、図上の時刻に初期到達します。成功Stateの生成元がないと、それだけで成功する誤ったモデルになるので点検します。
- 複数生成元を持つStateは、`simulation: {"join": "all"}`（既定）で全入力待ち、`{"join": "any"}`で最初の入力を採用します。代替経路を合流させるStateにはanyを明示します。
- TaskのfromStateId、waitForStateIds、wInput.stateIdsはAND依存です。排他的な代替Stateをこれらへ並べず、any合流Stateを挟みます。
- Stateは1試行1回だけ成立し、Taskも1試行1回だけ実行します。依存循環を作りません。

## 4. 時間の不確実性を置く場所を選ぶ

| 表したい性能 | 設定先 | 抽選時間の起点と終点 |
| --- | --- | --- |
| Actor自身の行為・達成 | Task.simulation.performanceModel | 実Task開始 → 通常の達成 |
| Actor間の作用成立までの遅延・未達 | CausalLink.simulation.propagation.performanceModel | 実作用発生 → 到着 |
| 基準進行・固定作業 | CDF未設定、またはenabled:falseのTask | 実Task開始 → 基準所要時間後 |
| 固定の作用伝搬 | 実行作用線のsimulation.delay | 実作用発生 → 指定遅延後 |
| 分岐後の固定処理 | Junction.outcomes[].delay | 実分岐 → 結果State到達 |

探知を「発射から探知成立までの作用線CDF」で表すなら、同じ時間・未達を別の探知TaskのCDFへ重複計上しません。迎撃CDFが「発射から撃破成立まで」を含むなら、撃破作用線の固定遅延0で結果を敵へ伝えます。別工程としての遅延が必要な場合だけ追加します。

## 5. CDFを設定する

Taskのsimulation.enabledをtrueにし、performanceModelを指定します。所要時間と成功率を別々に抽選せず、`F(t|w)=P(T≤t)`で時間と未達を一緒に扱います。

```json
{
  "simulation": {
    "enabled": true,
    "w": 0,
    "wInput": {"stateIds": ["midcourse-launched"], "combine": "max"},
    "performanceModel": {
      "type": "cdf",
      "degradationInput": "w",
      "curves": [
        {"w": 0, "points": [{"t": 10, "p": 0.3}, {"t": 20, "p": 0.65}, {"t": 30, "p": 0.8}], "pInfinity": 0.2},
        {"w": 1, "points": [{"t": 10, "p": 0.1}, {"t": 20, "p": 0.35}, {"t": 30, "p": 0.55}], "pInfinity": 0.45}
      ]
    }
  }
}
```

この断片をmidcourse-interceptへ設定すると、w=0では開始後10秒以内に30%、30秒以内に80%が達成し、残り20%は未達です。tは絶対時刻ではなく経過時間で、全CDFの単位はtime.unitと同じです。

生成時に以下を確認します。

1. model.typeはcdf、degradationInputは省略またはw。曲線は1〜100件、wは0〜1の重複のない昇順です。
2. 各曲線のpointsは1〜1,000件。tは0〜10⁹の有限数で重複のない昇順、pは0〜1の単調非減少です。
3. 各曲線の最終p＋pInfinityを1にします（許容誤差10⁻¹⁰）。末尾以降は最終pで平坦になり、残りをT=∞として扱います。JSONへInfinityを書きません。
4. 最初のtが正なら(0,0)から線形補間します。最初の点を(10,0.3)にすると10秒前にも達成可能です。最短時間10秒なら(10,0)などの点を置きます。t=0のp>0は即時達成の質量です。
5. w方向は隣接曲線のCDFを時間点の和集合で線形補間します。分位点の補間や外挿はしません。固定w（省略時0）と、伝播で入りうる全wを定義範囲に含めます。0と1の曲線を置けば全範囲を覆えます。保存済みの無効CDFも形式検証を受けます。
6. 「劣化度」としてwを使うなら、wが増えるほど達成確率が悪化するか、入力意図に照らして確認します。検証器は各曲線の時間方向の単調性を検査しますが、w方向の劣化順序までは強制しません。

Taskの抽選が∞なら通常接続先へ到達しません。ただし実行中の外部作用で中断・分岐することはできます。Taskと伝搬CDFの抽選は独立で、共通のState依存やw入力による結果の関連を表現します。任意の相関係数は設定できません。

CDFグラフの帯は**定義されたw範囲での性能の変化幅**です。信頼区間やランダムWの分布ではありません。濃い線は設定欄の表示wで、実行中に引き継ぐwを自動推定したグラフではありません。

## 6. 作用線を実行設定へ変換する

polarity、kind、labelは表示・構造分析用です。「指令」「攻撃」と書くだけでは依存も撃破も実行しません。実行に使う作用線にはsimulation.enabled:trueとtypeを必ず指定します。

| simulation.type | 入力先 | 実際に起きること |
| --- | --- | --- |
| state | State | 到着をStateの生成元として通知する |
| w | Task / State | wを渡す。Stateへの入力はw更新だけで、Stateは成立させない |
| branch | Task | 指定したeffect分岐へ移し、受け手Taskを中断する |

### State到達と伝搬CDF

探知は、敵ミサイルの発射Stateからレーダーの目標探知Stateへの作用線として作れます。

```json
{
  "id": "missile-observation",
  "source": {"type": "state", "id": "missile-launched"},
  "target": {"type": "state", "id": "radar-detected"},
  "polarity": "positive",
  "label": "探知",
  "kind": "observation",
  "simulation": {
    "enabled": true,
    "type": "state",
    "propagation": {
      "enabled": true,
      "w": 0,
      "performanceModel": {
        "type": "cdf",
        "curves": [
          {"w": 0, "points": [{"t": 5, "p": 0.1}, {"t": 15, "p": 0.6}, {"t": 30, "p": 0.9}, {"t": 40, "p": 0.98}], "pInfinity": 0.02},
          {"w": 1, "points": [{"t": 5, "p": 0.02}, {"t": 15, "p": 0.2}, {"t": 30, "p": 0.6}, {"t": 40, "p": 0.85}], "pInfinity": 0.15}
        ]
      }
    }
  }
}
```

有限の到着時刻は実発生時刻＋抽選した伝搬時間です。∞なら探知Stateは成立せず、後続追尾・判断・迎撃は開始できません。敵ミサイルの基準飛行は並行して進みます。入力先State.timeに到着を固定しません。

伝搬CDFはw / branchタイプにも同じ形式で使えます。CDF有効なら固定delayを**置き換え**、加算しません。固定モデルにするならpropagationを省略またはenabled:falseとし、simulation.delayを明示します。delay省略時は図上の入力端点時刻−出力端点時刻です。意図しない既定遅延を避けるため、固定遅延は生成時に明示します。

State起点は実到達時に作用を発生させます。Task起点の端点は、図上の進捗割合×抽選所要時間で発生し、中断後の未到達端点は発生しません。実行するTask起点端点はTask期間内に置きます。Actor起点は端点の図上時刻に発生するため、特定の到達条件に連動させるならState起点にします。

### wを明示して引き継ぐ

Stateの`simulation: {"w": 0.25}`は外部入力の固定出力wです。Taskに選択Stateまたは作用線からwを渡します。

```json
{
  "id": "track-information",
  "source": {"type": "state", "id": "radar-track"},
  "target": {"type": "task", "id": "decide", "time": 30},
  "polarity": "positive",
  "label": "追尾情報",
  "kind": "information",
  "simulation": {"enabled": true, "type": "w", "delay": 0}
}
```

受け手decideのwInput.waitForLinksをtrueにすれば、この作用線の到着を待って開始します。waitForLinks:falseまたは省略なら開始時点までに届いた入力だけを使い、後着は実行中のTaskへ適用しません。必須情報を待つ必要があるのに到着待ちを省略しないでください。

- wInput.stateIdsはwを採用するState ID列で、すべてのState到達も待ちます。fromStateIdのwを採用したい場合も、この配列に明示します。接続しただけでは自動採用しません。
- Taskは選択Stateと到着済みw作用線の最大wを使います。combineは省略またはmaxのみ。入力がなければTask.simulation.w（省略0）を使います。
- Task出力はoutputWがあればその固定値、なければ採用w。State出力は固定simulation.wが優先し、それがなければ到達Task・受信作用の最大wです。途中に意図しない固定outputWを置くと上流wの変化が後続へ伝わりません。
- 作用線のsimulation.wは**受け手へ渡す固定w**です。省略時は発生元の出力wを引き継ぎます。Actor起点のw作用線には固定simulation.wが必要です。
- 作用線のpropagation.wは**伝搬CDFに入力するw**です。省略時は発生元wを使います。simulation.wとは別です。Actor起点の伝搬CDFはpropagation.wがなければ固定simulation.wまたは0を使います。
- Stateへのw作用線はStateを成立させません。到達後にwが届いてもState出力作用線は再発生せず、以降に開始するTaskの入力だけに使えます。

## 7. 分岐モードと時間窓を設定する

すべてのjunctionにsimulation.modeを明示します。同一Task内のモードは統一します。描画用のjunctionだけでは実行できません。

### 外部作用による分岐：effect

基準飛行Taskに通常の接続先と撃破候補のjunctionを併置します。次の断片は完成例の中間飛行と撃破作用線です。

```json
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
      "simulation": {"mode": "effect"},
      "outcomes": [{"toStateId": "missile-destroyed-mid", "label": "撃破", "delay": 0}]
    }
  ]
}
```

```json
{
  "id": "midcourse-effect",
  "source": {"type": "state", "id": "midcourse-kill"},
  "target": {"type": "task", "id": "midcourse-flight", "time": 100},
  "polarity": "negative",
  "label": "中間撃破作用",
  "kind": "attack",
  "simulation": {
    "enabled": true,
    "type": "branch",
    "delay": 0,
    "junctionId": "mid-effect-junction",
    "outcomeStateId": "missile-destroyed-mid",
    "stopTargetActor": true,
    "holdUntilStart": false
  }
}
```

入力先Task、junctionId、outcomeStateIdを対応させ、target.timeを指定junction.timeと一致させます。effectのjunction.timeは**図上の接続位置**で、実分岐時刻は作用の実到着時刻です。固定飛行時間を迎撃Taskの抽選時間に合わせて伸ばしません。

完成例の敵基準経路は発射0→中間軌道60→終末軌道120→着弾180秒。中間迎撃の作用は中間飛行Taskが実行中のときだけ適用します。180秒に到着した中間撃破作用はlateになり、中間撃破成功にはなりません。終末迎撃にも同じ考え方で120〜180秒の受け手Taskを作ります。受け手の終了時刻と同時の作用は適用可能です。

- 開始前の作用はearly、完了/中止後はlate。前着作用を保持する意図がある場合だけholdUntilStart:trueにします。遅過ぎる作用を保持する設定ではありません。
- 分岐時に受け手の通常完了・残りの分岐・将来の出力を取り消します。stopTargetActor:trueなら受け手Actorの他の未開始/実行中Taskも中止します。分岐結果Stateは中止後も指定遅延で成立します。
- outcome.delayは分岐から結果Stateまでの固定遅延です。省略時は結果State.time−junction.time。迎撃CDFがすでに撃破達成までを含むならdelay:0を明示し、二重計上を避けます。
- 終末側の準備・発射・迎撃Taskには`cancelOnStateIds: ["missile-destroyed-mid"]`を指定し、中間撃破時に中止します。cancelOnStateIdsはOR条件で、完了済みのStateを巻き戻しません。
- 迎撃CDFが撃破成否を含むなら、有限の達成から作用線を発生させます。effect分岐には別の撃破確率を足しません。効果が時間窓内に届けば結果へ分岐します。別の確率を掛けるのは別工程の成否を表す場合だけです。

**Mission期限と局所の時間窓は両方設計します。** Mission期限180秒だけでは「中間撃破は120秒まで」を保証しません。中間飛行Taskの実行窓がその制約を表し、作用の到着時に適用可否を決めます。

### Task内の結果選択：probability

識別結果など、分岐点へ達した後に結果を抽選したい場合に使います。次のTask用に、同じActorへclassification-start（0秒）、identifiedとunidentified（各10秒）の3Stateを別途作ります。

```json
{
  "id": "classify",
  "fromStateId": "classification-start",
  "label": "識別結果選択",
  "junctions": [
    {
      "id": "classification-junction",
      "time": 10,
      "simulation": {"mode": "probability"},
      "outcomes": [
        {"toStateId": "identified", "label": "識別", "probability": 0.8, "delay": 0},
        {"toStateId": "unidentified", "label": "未識別", "probability": 0.2, "delay": 0}
      ]
    }
  ]
}
```

outcomesのprobabilityは各0〜1、合計≤1。残りは通常toStateIdへの継続です。通常接続先のない最終junctionは合計1必須です。分岐時刻は図上の進捗割合×Taskの抽選所要時間で動き、結果時刻は実分岐＋outcome.delayです。

この確率は**分岐点に到達した条件下の選択確率**です。Task CDFのpInfinityとは別です。∞のTaskは進捗0以外の分岐点へ到達しません。結果分岐を増やしてCDFの未達質量を二重に表現しないでください。

## 8. 完成例を依頼シナリオへ合わせる

[examples/simulation.json](../examples/simulation.json)は、敵Actorを弾道ミサイル本体だけにした実行用の完成文書です。味方Actorは広域レーダー、中央管制、中間軌道撃破用ユニット、終末軌道撃破用ユニットです。

| 段階 | 完成例の設定 | 点検する意味 |
| --- | --- | --- |
| 基準飛行 | boost-flight / midcourse-flight / terminal-flightは固定時間 | 迎撃処理が遅くても飛行・着弾を遅らせない |
| 探知 | missile-observationはstate作用＋伝搬CDF | 未達ならradar-detectedを初期到達させない |
| 追尾 | trackは固定10秒、radar-trackの出力w=0.25 | wは外部性能入力 |
| 管制 | decideはCDF＋w作用線待ち、commandは固定10秒 | 追尾成立から判断・指令へ依存とwを渡す |
| 発射 | 固定10秒、準備・指令・該当飛行段階・w到着を待つ | 固定時間でも依存で開始は遅れうる |
| 迎撃 | 発射StateからCDFで迎撃Stateへ | 発射から敵の撃破達成までの性能 |
| 敵側の結果 | branch作用を敵飛行のeffect分岐へ、遅延0 | 敵の撃破Stateへ到達し基準飛行を中止 |
| 次段の中止 | 終末側のcancelOnStateIds | 中間撃破後に終末迎撃を実行しない |
| Mission | 敵の中間撃破OR終末撃破、期限180秒 | 味方の達成と敵側の結果を区別 |

この完成例では、w=0.25で中間迎撃の達成率0.7375、終末迎撃0.7875、共通の探知達成率0.98です。独立した迎撃抽選が時間窓内に届く設定なので、解析値は`0.98 × (1 − (1−0.7375) × (1−0.7875)) = 0.925334375`です。5,000試行・Seed 17の実行値は成功率0.927です。これはこの架空入力の照合値で、新規シナリオの目標値ではありません。CDF・順序・依存・Seedを変更した場合は再実行します。

完成例を複製するときはIDと参照を一括で対応させ、分岐ID・outcomeStateId・w入力・中止条件・成功State・ViewのactorOrderまで確認します。技術評価が不明ならtechnologies / bindingsを空にできます。構造・技術Gap表示とMonte Carlo成功率は別の分析です。

## 9. 3段階で検証する

以下はすべてリポジトリルートで実行します。追加パッケージは不要です。エラーは生成文書を修正し、検証器を変更して通過させません。

### A. 読込形式

```sh
node scripts/validate-mission.cjs mission.json
```

VALIDは形式・参照・基準時刻と保存された設定の検証です。実行依存の循環、分岐モード未指定、伝播w範囲などのcompile検証は別途必要です。

### B. compileとMonte Carlo

```sh
IMEE_SCENARIO_PATH=mission.json node <<'NODE'
const fs = require('node:fs');
const M = require('./js/model.js');
const S = require('./js/simulation.js');
const mission = M.parse(fs.readFileSync(process.env.IMEE_SCENARIO_PATH, 'utf8'));
const compiled = S.compile(mission);
const result = S.run(mission);
console.log(JSON.stringify({
  config: result.config,
  warnings: compiled.warnings,
  successProbability: result.successProbability,
  successInterval95: result.successInterval95,
  reachProbability: result.reachProbability,
  completion: result.completion,
  tasks: result.tasks,
  signals: result.signals,
  branches: result.branches,
  trace: result.trace
}, null, 2));
NODE
```

実行用作用線が表示専用のままならwarningsが出ます。意図的な表示専用線以外は実行設定へ直します。件数制限は`(State数＋Task数＋実行作用線数＋junction数) × iterations ≤ 5,000,000`です。

結果を次のように読み、入力意図と照合します。

- successProbabilityは期限内成功数/全試行数。reachProbabilityは期限超過も含む成功条件への到達数/全試行数です。両者の差を確認します。
- completionのP50/P90は到達試行だけの分布で、期限超過も含みます。Mission CDFは全試行を分母にし、未達質量を残します。
- Taskのfailed（CDF未達）、blocked（開始不能）、cancelled（中止）、branched（分岐）を区別します。入力wと開始・終了・待ち時間を確認します。
- 作用線のfailedは伝搬CDF未達、unavailableは作用が発生しなかった試行、early / lateは時間窓外、acceptedは適用です。heldは開始前に保持した作用です。有限の伝搬時間分布には未適用の到着も含みます。
- CIはMission到達を決めた因果経路にTask/作用線が含まれた回数/全試行数です。criticalityGivenSuccessは期限内成功試行が分母です。図上で最も長い線を固定Critical Pathと扱いません。
- traceは第1試行です。State実到達、採用w、作用到着、分岐・中止の因果を読む用途に使い、平均的な試行と断定しません。

同一文書・設定・Seedなら再現できます。文書順序や構造を変えると乱数の対応は変わりえます。実行は元文書のState.timeを書き換えません。

### C. 意味と境界ケース

基準結果だけで完了にせず、依頼シナリオに必要な境界ケースを文書のコピーまたは一時的なTask介入で確認します。

| ケース | 迎撃例での期待 |
| --- | --- |
| 探知CDFの未達を1にする | 探知・追尾・迎撃成功は成立せず、基準飛行は着弾へ進む |
| 中間迎撃の所要時間を180秒に固定 | 中間作用はlate、中間撃破Stateは成立しない。終末迎撃の成否は別途判定 |
| 終末迎撃も時間窓後にする | 敵の撃破Stateに到達せず、Mission失敗 |
| 中間撃破が成立する試行 | 着弾へ進まず、終末側の未開始/実行中Taskが中止される |
| w=0とw=1を比較する | 対象CDFと採用wが意図どおり変わり、依存待ちは保持される |
| 代替分岐が片方だけ選ばれる | 未選択Stateが初期到達しない。any合流なら選択側で後続開始 |
| 成功条件へ期限後に到達する | 到達には数えるが、Mission成功には数えない |

CDFの未達を1にする場合は、その曲線の全pを0、pInfinityを1にして整合させます。所要時間介入は`S.run(mission, {taskOverrides: {'midcourse-intercept': {duration: 180}}})`のように指定できます。これは該当Taskの有限達成を仮定する介入で、基準CDFの検証とは区別して記録します。

実行環境がない場合は、形式・compile・実行・境界ケースをそれぞれ「未実行」と明示します。推測した成功率を実行結果として記載しません。

## 10. 感度分析・要求逆算まで行う

生成したシナリオの因果と時間窓を検証してから、Taskごとの時間またはwを変化させます。分析対象は現在Taskのみです。作用線CDF・Resource数量の感度分析は未対応です。

```sh
IMEE_SCENARIO_PATH=examples/simulation.json node <<'NODE'
const fs = require('node:fs');
const M = require('./js/model.js');
const A = require('./js/sensitivity.js');
const mission = M.parse(fs.readFileSync(process.env.IMEE_SCENARIO_PATH, 'utf8'));
const analysis = A.run(mission, {
  taskId: 'midcourse-intercept',
  parameter: 'duration',
  values: [5, 10, 20, 40, 60],
  iterations: 1000,
  seed: 17,
  targetProbability: 0.8,
  criterion: 'lower95',
  refineSteps: 6
});
console.log(JSON.stringify({
  config: analysis.config,
  baselineProbability: analysis.baseline.successProbability,
  probabilityGap: analysis.probabilityGap,
  points: analysis.points,
  requirement: analysis.requirement,
  interpretation: analysis.interpretation
}, null, 2));
NODE
```

別のシナリオではtaskId・評価値・Mission要求を置き換えます。w評価ならparameter:w、values:[0,0.25,0.5,0.75,1]などとし、全評価値をCDF定義範囲に含めます。評価値は2〜25件の重複のない昇順、durationは0〜10⁹、wは0〜1です。refineStepsは0〜8、判定はlower95（Wilson 95%区間下限）またはestimate（成功率推定値）です。感度分析全体の処理量は`(評価点数＋refineSteps＋基準1件) × iterations × モデル件数 ≤ 20,000,000`にします。

時間介入はTi=tに固定し、**対象Taskの未達確率を取り除いて有限の達成を仮定します**。依存が満たされなければ開始不能のままです。w介入は採用wを固定してCDFの未達確率と入力待ちを保持し、出力w固定がなければ後続へも伝えます。基準と各評価点には同じSeedを使い、乱数を対応させます。

要求判定の返り値は以下の範囲で解釈します。

| requirement.status | 報告すること |
| --- | --- |
| bracketed | maxPassingValueは達成を確認した値、firstFailingValueは未達の値。境界はその間として報告 |
| all-tested-pass | 評価範囲はすべて達成。要求上限は未特定 |
| no-passing-sample | 評価範囲内に達成点なし |
| nonmonotone | 未達後に達成点があるため、一律の上限を導出しない |

未評価点間の単調性、実CDF全体に対する十分条件、実装備の能力保証は導出しません。Capability Gapは基準成功率の要求からの不足と、評価したTask性能の達成/未達境界として報告します。

## 11. LLMへ渡す依頼文のひな形

共通JSON生成仕様とこの手順書、必要なら完成例JSONを添えて、次の角括弧内を埋めます。

```text
添付のIMEE version 2共通JSON生成仕様とシミュレーションシナリオ作成手順に従い、
次のシナリオを表示・実行できる1つの完全なJSON文書にしてください。

シナリオ: [目的、Actor、基準経路、必要な作用と結果]
Mission成功条件: [ActorとState、AND/OR]
Mission絶対期限: [time.unitの単位で指定。期限なしならnull]
要求成功率: [0〜1。未指定なら要求逆算は未評価]
時間単位・表示期間: [seconds/minutes/hours、duration、snap]
固定時間とCDF: [各Task・作用線の入力。未指定なら架空値の使用可否]
w入力と伝播: [外部w、引き継ぐ経路、必須入力を待つ条件]
分岐・中止: [確率選択/外部作用、適用時間窓、成功後に中止するTask]
実行設定: [iterations、seed]
出力: [JSONのみ、またはJSONファイルと仮定・実際の検証結果]

図上のState時刻を期限や実到達時刻と混同せず、実行依存を明示してください。
CDFの時間と未達確率を二重計上しないでください。
実行作用線にはtypeを、すべての分岐にはmodeを設定してください。
不明な性能を事実として作らず、仮定の値は対象のnotesへ記録してください。
形式検証、compile、Monte Carlo、必要な境界ケースを実行し、エラーを修正してください。
実行できなかった検証は未実行としてください。
```

JSON以外も出せる依頼なら、仮定・入力出典、実行した検証、Seed/試行数、成功率と区間、時間窓外・未達・中止の確認結果を添えます。JSONのみの依頼では仮定をnotesへ入れ、架空の検証済みフィールドや分析結果を完成文書へ追加しません。
