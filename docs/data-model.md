# Mission JSON version 2

`js/model.js` の `validate` / `parse` がインポートとCLIで共通の検証を行います。ES moduleではなく、ブラウザのclassic scriptとNodeのCommonJSで共有しています。

## 文書

```js
{
  version: 2,
  title: "ミッション名",
  time: { unit: "minutes", duration: 60, snap: 1 },
  actors: [], states: [], tasks: [], causalLinks: [],
  technologies: [], bindings: [],
  views: { main: { /* 表示情報 */ } }
}
```

必須はversion、title、time、actors、states、tasks、causalLinks。technologies / bindingsは省略時に空配列、viewsは省略時に標準Viewを補います。時間単位はseconds / minutes / hours。0 < duration ≤ 1,000,000、0.01 ≤ snap ≤ duration。時刻は有限数で0〜duration。スナップは操作時の丸め単位で、JSON時刻を強制的に丸めません。

トップレベルの各コレクションは10,000件以下。すべてのオブジェクトIDとTask内junction IDは文書全体で一意。IDは文字列、名前・ラベルは空白だけでない文字列。notesは任意文字列です。インポートは8MiB以下を受け付けます。

version 1、`transitions` / `interactions`、Stateの`start` / `end`は拒否します。曖昧な自動移行は行いません。

## Actor

```js
{ id, name, side: "friendly" | "hostile" | "neutral", parentId: null, isGroup: false, color: "#236d78", notes: "" }
```

parentIdとisGroupは任意。colorも任意で、指定する場合は#RRGGBB形式。省略時はパレットから補完します。Actor編集で変更でき、State・Task・結果線は所属Actor、因果線は起点端点のActorの色を使います。任意Actorを親にできます。不存在参照・自己参照・階層循環は拒否。Groupも通常Actorで、必要ならStateを持てます。並び順・折りたたみはActor自身に保存しません。

## State

```js
{ id, actorId, name, time, activity: "active", phase: "other", notes: "" }
```

id / actorId / name / timeが必須。activityはactive / quiet（省略時は通常）、phaseはother / decision。判断の役割はphaseで明示し、名称から推測しません。

StateはActorがその時刻に到達した一点です。円形ノードのX座標はtime、半径は時間と無関係。状態の継続は暗黙的で、行為として示したい待機はTaskにします。重なるStateはActor内のサブレーンへ上下に分離し、X座標は維持します。

## Task

通常形：

```js
{ id, fromStateId, toStateId, label, kind: "detection", notes: "" }
```

分岐形：

```js
{
  id: "identify", fromStateId: "unidentified", label: "識別",
  junctions: [{
    id: "identify-result", time: 29,
    outcomes: [
      { toStateId: "identified", label: "OK" },
      { toStateId: "still-unidentified", label: "NG" }
    ]
  }]
}
```

開始はfromStateIdのState.time。通常の終了はtoStateIdのState.time。toStateIdがないTaskの終了はjunctionsの最大time。Taskにstart / endを重複保存しません。結果Stateは接続元とは別の、同一ActorのStateでなければなりません。終了・結果は開始以降、各結果はそのjunction.time以降です。瞬間Taskも許容します。

TaskはtoStateIdまたは1つ以上のjunctionsを持ちます。両方を持つ場合は、通常の到達先へ向かうTask途中から結果が分岐します。toStateIdがある場合、junctionはその終了時刻以内。junctionsの順序は意味を持たず、同一Taskの同一時刻は1つにまとめます。junctionは1,000件以下、各outcomesも1〜1,000件です。

outcomesはTask内の短い結果ラベルとState参照であり、独立したMissionオブジェクトではありません。各結果に専用ノードは作りません。複数結果Stateはそれぞれ固有の時刻を持ちます。成功・失敗・継続などの語彙は自由で、色・線種に結果の意味を持たせません。

通常Taskにjunctionsは不要です。外部因果がTask途中へ到達する場合もjunctionsへの追記は不要で、到達位置はCausalLinkの発生時刻と伝搬時間から導出します。分岐情報のあるjunctionと同じ基準到達時刻なら、描画上は同じ白丸を共有します。

UIの「分岐を追加」は通常toStateIdを保持し、junctionsへ別の結果だけを追加します。追加可能な分岐時刻は既存Task実行期間内です。Taskを到達先とする因果線から分岐を追加する場合、分岐時刻は `source基準時刻 + propagation.duration` から求めます。

## CausalLink

CausalLinkは**到達絶対時刻を保存しません**。

```js
{
  id: "report",
  source: {type: "state", id: "sensor-detected"},
  target: {type: "task", id: "transmit"},
  propagation: {
    duration: 4
  },
  polarity: "positive",
  label: "探知情報",
  kind: "information",
  notes: ""
}
```

### source

| type | フィールド | 発生時刻 |
| --- | --- | --- |
| state | type, id | State.time |
| task | type, id, time | 指定time |
| actor | type, id, time | 指定time |

State sourceにはtimeを書きません。Task / Actor sourceにはtimeが必要です。

### target

targetは `{type, id}` のみです。`target.time` は使用しません。

基準到達時刻:

```text
arrivalTime = sourceTime + propagation.duration
```

`propagation.duration` は0以上の有限値です。

State targetでは、表示整合のためtarget State.timeを基準到達時刻と一致させます。

Task targetでは、基準到達時刻がTaskの開始〜終了のどこにあるかを介入時間窓として評価します。期間外を意図的に表すこと自体は可能ですが、その場合はnotesへ理由を書きます。

### propagation

固定伝搬:

```js
propagation: { duration: 4 }
```

CDF伝搬:

```js
propagation: {
  duration: 4,
  w: 0,
  performanceModel: {
    type: "cdf",
    degradationInput: "w",
    curves: [...]
  }
}
```

`duration` は図上の基準位置です。CDFを使う実行ではCDF抽選時間が実伝搬時間そのもので、durationへ加算しません。

### simulation

作用線の実行効果は `simulation` に分離します。

```js
simulation: {
  enabled: true,
  type: "w" | "branch" | "state",
  w,
  junctionId,
  outcomeStateId,
  stopTargetActor,
  holdUntilStart
}
```

旧 `simulation.delay` と `simulation.propagation` は廃止です。

polarityは因果線種です。positiveは矩形波、negativeは滑らかな波線。kindは分析分類で、detection / observation / information / command / support / attack / interference等を使えます。

State / Taskの旧statusとCausalLink.proposedは互換読込用です。新規作成では付けません。

## Technology Binding

```js
{ id, name, status: "research", trl: 4, notes: "" } // technologies[]
{ id, technologyId, targetType: "task", targetId, notes: "" } // bindings[]
```

statusはexisting / research / planned / gap / unknown。TRLは1〜9の整数、nullまたは省略で未評価。Binding対象はactor / state / task / causalLinkのみです。UIでの新規紐付けはActor・Task・作用に限ります。Stateへの旧Bindingはデータ・分析ともに保持し、詳細パネルからTask・作用・Actorへの付け先変更ができます。同じ技術が変更先にある場合は重複をまとめます。Actor全体の技術・装備と旧StateのBindingは詳細パネルで表示します。StateとTaskの分析には直接Bindingに加え、その直接のActorのBindingを適用します。祖先Groupの技術は自動継承しません。Technologyカタログは複製間で共有し、Binding自身のIDは複製時に再発行します。

Task・作用の技術名は対象ラベルの直下にまとめ、ラベルと技術名を一体として配置します。ノード・文字・他の技術名・経路との衝突を避け、必要に応じて表示上のActor行間隔を増やします。views.main.laneHeightや時刻・所属データは変更しません。短いTaskなどで線上に見出しを置けない場合は、対象の近くに短い補助線付き見出しを置きます。4件を超える技術や、短縮しても収まらない技術は対象付近の「技N」に集約し、ホバーで一覧、選択で対象の詳細パネルを開きます。技術全文・成熟度・TRL・対象名はTooltipで確認できます。Gap Viewの技術名にはTRLも添えます。技術フィルタをオフにすると追加の間隔も外します。

## Views

```js
views: { main: {
  collapsedActors: [], actorOrder: ["actor-1", "actor-2"],
  zoom: 1, visibleTimeRange: {start: 0, end: 60},
  filters: {technology: true, causalLink: true, quiet: true},
  laneHeight: 64, collapsedLayout: "compact", mode: "mission"
}}
```

modeはmission / technology / gap / causality。laneHeightは通常表示の間隔（52〜160px）。collapsedLayoutはcompact / single / spacedで、省略時compact。compactは28px間隔、singleは一本の水平線、spacedはlaneHeightの間隔を使います。技術表示時は必要に応じて間隔を広げます。zoomは1〜1,000倍で、描画の実際の範囲はvisibleTimeRangeが決めます。UIでは両者を同期。actorOrder / collapsedActorsに重複・不存在IDは不可。省略したactorOrderは文書内Actor順を使用します。

折りたたみ時は子Actorの行を隠し、親と子孫のState・Taskを親Actorのタイムラインへ投影します。表示色は親Actorの色です。子Actor別のサブレーンは設けません。compact / spacedでは重なるState・分岐を上下に分け、singleでは同時刻のStateを同じ円へまとめ、Task・結果線の重なる区間を一つの水平線へまとめます。活動のない時間の空白は保ちます。compactはState名を、singleはState・Task名をTooltipへ移し、singleの集約要素はダブルクリックで展開して編集します。実データの時刻・所属・色は保持し、その場で時刻をドラッグ編集しても所属を変えません。因果線は両端が同じ折りたたみグループ内にある場合だけ非表示にします。外部との因果は投影後のState・Taskまたは親Actorへ元の時刻のまま接続し、表示上の起点Actorの色を使います。singleの集約Task線はすべて固定なら二重線、CDFを含む場合は実線です。CDF/FIX混在時はTooltipで混在と展開を案内します。展開時に元へ戻り、JSONの接続は削除しません。SVG / PNG出力は従来どおり全階層を展開します。旧filters.plannedは受け付けますが無視します。

## コピー・削除・履歴

Actor / Group複製は子孫Actor、State、内部Task、内部因果、Bindingをコピー。全ID（junctionを含む）を再発行して内部参照を再マップします。外部Actorとの因果はコピーしません。Stateだけのコピーは選択内で完結するTask・因果を含みます。Task単体をクリップボード複製する仕様はありません。文書内クリップボードです。

削除は従属参照とBindingを整理します。結果State削除でTaskが短くなっても、存続するTaskへの時刻付き因果は残し、期間外なら時間窓Gapとして扱います。技術カタログはActor削除で消しません。

変更は文書単位で検証し、失敗した編集は適用しません。Undo / Redoは100履歴まで文書全体を保持。JSON読込・サンプル置換もUndo可能です。Viewのボタン操作も履歴に入ります。連続パンはViewの範囲を更新して保存します。

## 介入時間窓と経路評価

敵Taskへのnegative causal linkを候補とし、Taskの開始〜終了を時間窓にします。分岐後の結果Stateまでの線は結果経路であり、介入時間窓はTask本体の終了までです。

作用元から、Stateへ至るTaskと正の因果を逆向きにたどります。Task上の作用時点より後に入る因果はさかのぼり対象から除きます。同じ経路内で以下の順序がそろうことを構造完結とします。

1. friendly ActorのTask / 因果元によるkind: detectionまたはobservation。
2. friendly ActorのState.phase: decision。
3. friendly ActorのTask / 因果元によるkind: command。
4. friendly ActorのTask / 因果元によるkind: attackまたはinterference。

構造完結に加え、到達が時間窓内、全経路要素に技術Bindingがあり、全依存技術がexistingであるとき条件充足。TRLの数値からexistingを推測しません。旧status / proposedは条件判定に使わず、条件充足を実施証明とは扱いません。

最大256経路・深さ256で探索を打ち切り、打ち切りを表示しALLを未確認にします。SOMEは充足が1本以上、ALLは1本以上の候補があり、打ち切りなしで全候補が充足。この構造・技術評価では成功確率、AND/ORゲート、通信遅延、資源競合のシミュレーションは行いません。任意のSimulation機能は別の実行モデルを使用します。

## Simulation（任意・version 2互換）

Taskの任意 `simulation` に `enabled`、`w`、`performanceModel`、`waitForStateIds`、`wInput`、`outputW`、`cancelOnStateIds` を保存できます。

文書トップレベルの `simulation` には `successStateIds`、`successMode`、`deadline`、`iterations`、`seed` を保存します。

Junctionは `simulation.mode: "probability" | "effect"` を使います。

CausalLinkの時間モデルはトップレベル `propagation` に置きます。

- `propagation.duration`: 基準伝搬時間。必須。
- `propagation.w`: 伝搬CDFへ入力する固定w。任意。
- `propagation.performanceModel`: 伝搬時間CDF。任意。

作用線の `simulation.type` は `w / branch / state`。

実行時のState到達時刻は元のState.timeを書き換えません。State.timeとpropagation.durationは基準描画・整合確認に使い、CDF有効時の実到着は抽選結果を使います。

実行依存の循環、分岐モード、wの入力範囲等はcompile時にも確認しますが、JSON生成仕様は外部テスト環境を前提にしません。

## 描画の制約

State / junction / Task作用端点のXは時刻から求め、変更しません。共有始点・共有終点・共通区間は有限のオフセット候補で分離。上下Actor間は向かい合う円周へ接続します。負の因果は調整後の折れ線をサンプリングし、各区間の法線方向へ周期オフセットを加えます。端点・角は波幅を減衰させ、アンカーを保持します。矢じり直前は直線にし、矢じりの向きは波の接線ではなく経路の最後の基準線分に合わせます。

Task・分岐結果のラベルは元経路上に中心を置き、白背景と線と同色の細い枠で囲みます。既存経路上の候補からノード・文字・技術吹き出しとの重なりを避けて選び、線を曲げません。狭い区間は文字を省略し、枠も入らない短い区間では線のTooltipで全文を確認します。作用ラベルは経路近傍に配置し、線と同色の下線を付けます。作用ラベルの候補は元経路の中央付近から横±36px、縦−40〜＋24pxで、技術名がある場合は一体の幅を考慮した横位置と経路上の近隣位置も使います。文字は最大幅で省略し全文はTooltip / Inspectorへ。遠方の空き領域へ配置しません。State名も局所改行・省略し、円の大きさや時刻を変えません。
