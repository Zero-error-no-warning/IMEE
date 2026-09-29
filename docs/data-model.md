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

通常Taskにjunctionsは不要。外部因果がTask途中に付く場合もjunctionsへの追記は不要です。描画が同じTask ID＋timeの小さい白丸を導出します。分岐情報のあるjunctionと同時刻の外部端点も同じ丸を共有します。Task自身のlineは正の因果として実線です。

UIの「結果を追加」は、通常toStateIdを「継続」結果に変換し、新結果と一緒に指定時刻へまとめます。Task編集で分岐時刻を変えた場合、同じ旧時刻へ接続していた因果端点も追従します。複数junctionの既存情報も編集できます。

## CausalLink

```js
{
  id, source: {type: "state", id: "sensor-detected"},
  target: {type: "task", id: "transmit", time: 49},
  polarity: "positive" | "negative",
  label: "作用の説明", kind: "interference", notes: ""
}
```

source / targetの形式：

| type  | フィールド     | 時刻・レーン                             |
| ----- | -------------- | ---------------------------------------- |
| state | type, id       | State.time / StateのActor                |
| task  | type, id, time | 指定time / 接続元StateのActor            |
| actor | type, id, time | 指定time / Actorレーン（環境等に利用可） |

State端点にはtimeを書きません。Task / Actor端点には必ずtimeを書きます。到達時刻は発生時刻以降。同一ActorでもTaskへの因果作用を表現できます。Task端点はTask実行期間外でも全期間内の指定時刻に保存できます。期間外端点はTaskの実線上にはなく、時間窓外の接続点です。Inspectorで「開始前」「遅すぎる」を確認できます。

polarityが唯一の因果線種です。positiveは実線、negativeは経路に沿った波線で、いずれも矢印headを持ちます。kindは任意文字列の分析分類。detection / observation / information / command / support / attack / interference等を線種・太さ・色に反映しません。

State / Taskの旧status（actual / planned / proposed）とCausalLink.proposedは読込・保存の互換性のため受け付けますが、表示・フィルタ・分析には使いません。新規作成では付けません。シナリオの仮定はnotesで説明します。ラベル補助線も細いニュートラルな実線です。

## Technology Binding

```js
{ id, name, status: "research", trl: 4, notes: "" } // technologies[]
{ id, technologyId, targetType: "task", targetId, notes: "" } // bindings[]
```

statusはexisting / research / planned / gap / unknown。TRLは1〜9の整数、nullまたは省略で未評価。Binding対象はactor / state / task / causalLinkのみです。StateとTaskの分析には直接Bindingに加え、その直接のActorのBindingを適用します。祖先Groupの技術は自動継承しません。Technologyカタログは複製間で共有し、Binding自身のIDは複製時に再発行します。

技術吹き出しはレイアウト計算に含め、Actor行に専用の注記領域を確保します。矩形とノード・ラベル・他の吹き出し・経路線分との衝突を避け、狭い場所では短縮表示し、必要に応じて表示上の行高さを増やします。views.main.laneHeightや時刻・所属データは変更しません。引き出し線はノード・文字・吹き出しの矩形を避けます。技術全文・成熟度・TRL・対象名はTooltipで確認できます。技術フィルタをオフにすると注記領域も外します。

## Views

```js
views: { main: {
  collapsedActors: [], actorOrder: ["actor-1", "actor-2"],
  zoom: 1, visibleTimeRange: {start: 0, end: 60},
  filters: {technology: true, causalLink: true, quiet: true},
  laneHeight: 64, mode: "mission"
}}
```

modeはmission / technology / gap / causality。laneHeightは52〜160px。zoomは1〜1,000倍で、描画の実際の範囲はvisibleTimeRangeが決めます。UIでは両者を同期。actorOrder / collapsedActorsに重複・不存在IDは不可。省略したactorOrderは文書内Actor順を使用します。

折りたたみ時は子Actorの行を隠し、親と子孫のState・Taskを親Actorのタイムラインへ投影します。表示色は親Actorの色です。子Actor別のサブレーンは設けず、重なるState・分岐だけ上下に分けます。実データの時刻・所属・色は保持し、その場で時刻をドラッグ編集しても所属を変えません。因果線は両端が同じ折りたたみグループ内にある場合だけ非表示にします。外部との因果は投影後のState・Taskまたは親Actorへ元の時刻のまま接続し、表示上の起点Actorの色を使います。展開時に元へ戻り、JSONの接続は削除しません。SVG / PNG出力は従来どおり全階層を展開します。旧filters.plannedは受け付けますが無視します。

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

最大256経路・深さ256で探索を打ち切り、打ち切りを表示しALLを未確認にします。SOMEは充足が1本以上、ALLは1本以上の候補があり、打ち切りなしで全候補が充足。成功確率、AND/ORゲート、通信遅延、資源競合のシミュレーションは行いません。

## 描画の制約

State / junction / Task作用端点のXは時刻から求め、変更しません。共有始点・共有終点・共通区間は有限のオフセット候補で分離。上下Actor間は向かい合う円周へ接続します。負の因果は調整後の折れ線をサンプリングし、各区間の法線方向へ周期オフセットを加えます。端点・角は波幅を減衰させ、アンカーを保持します。矢じり直前は直線にし、矢じりの向きは波の接線ではなく経路の最後の基準線分に合わせます。

線ラベルは元経路の中央付近から横±36px、縦−40〜＋24pxの候補だけを探索。文字は最大幅で省略し全文はTooltip / Inspectorへ。遠方の空き領域へ配置しません。State名も局所改行・省略し、円の大きさや時刻を変えません。
