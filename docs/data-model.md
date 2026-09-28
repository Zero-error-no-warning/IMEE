# Document schema v1 — Technology / View extension

LLMからJSONを直接生成する場合は、完成例を含む単体の [JSON生成仕様書](llm-json-generation.md) と [生成SKILL](../skills/imee-json-generator/SKILL.md) を利用してください。`node scripts/validate-mission.cjs mission.json` で実装と共通の検証を実行できます。

`version: 1` を拡張しています。旧JSONの読込時は `technologies: []`、`bindings: []`、`views.main` を補います。旧 `actor.collapsed` は `views.main.collapsedActors` へ移し、Actorから削除します。旧Actor配列順は `actorOrder` の初期値にします。時刻・接続・IDは変更しません。

## MissionとView

| フィールド                                   | 内容                                              |
| -------------------------------------------- | ------------------------------------------------- |
| version / title                              | `1`、ミッション名                                 |
| time                                         | `{ unit: seconds/minutes/hours, duration, snap }` |
| actors / states / transitions / interactions | ミッションの主体・状態・因果                      |
| technologies / bindings                      | 技術カタログと依存関係                            |
| views.main                                   | 表示専用情報。Missionとは別のオブジェクト         |

```json
{
  "collapsedActors": ["submarine"],
  "actorOrder": ["enemy", "control", "submarine", "sonar"],
  "zoom": 1.5,
  "visibleTimeRange": { "start": 10, "end": 50 },
  "filters": {
    "technology": true,
    "interaction": true,
    "planned": true,
    "quiet": true
  },
  "laneHeight": 44,
  "mode": "mission"
}
```

`mode`: `mission / technology / gap / interaction`。表示プロファイルは現在 `main` を使用し、その中のmodeで切り替えます。独立したプロファイルごとの編集UIはありません。表示設定はJSON・自動保存に含まれます。ズーム操作はUndoの1操作を消費しません。折りたたみ・並べ替え・親変更はUndo可能です。文書編集の履歴にはViewのスナップショットも含みます。

Actor配列の物理順を変えず、兄弟間の順序を `actorOrder` で決めます。親子関係は意味上の構造なので `actor.parentId` に残します。追加ActorはViewの順序にも追加します。`laneHeight` は40〜160、既定44。

時刻は共通の相対時間です。`0 < duration <= 1,000,000`、`0.01 <= snap <= duration`。数値は有限値のみ。6コレクションの各上限は10,000件、ファイル読込は8MiB。上限は入力防御用で、大規模文書の描画性能を保証しません。

すべてのIDは文書全体で一意な文字列。名称は1〜300文字、備考は10,000文字以下。画面座標をMissionに保存しません。

## Actor / State

Actor: `{id, name, side, parentId?, isGroup?, notes?}`。`side` は `friendly / hostile / neutral`。通常のActorも親になれます。親の不在・自己参照・循環は拒否します。

State: `{id, actorId, name, start, end, status, activity, phase?, notes?}`。

- `0 <= start < end <= duration`。
- `status`: `actual / planned`、`activity`: `active / quiet`。
- `phase`: `other / decision`。判断段階は利用者が明示指定します。状態名から推測しません。
- 同じActorの重複Stateは自動的に別レーンへ配置します。

`x = plotLeft + (start - viewStart) * scale`、`width = (end - start) * scale`。図形を文字幅のために伸ばしません。SVGは可視幅に固定。ズームは表示する時間範囲を変え、範囲外をクリップします。SVG・PNG出力は全期間・全階層・全要素です。PNGは同じ自己完結SVGをブラウザで画像化し、白背景で保存します。通常は2倍解像度、16,384px／辺・3,200万画素を超えない倍率へ必要に応じて下げます。

## Transition

`{id, from, to, status, label?}`。同じActorの異なるStateを接続し、`from.end <= to.start` が必要です。

開始 = `from.end`、終了 = `to.start`、所要時間 = 差分。JSONに期間を重複保存しません。0なら即時遷移として菱形を表示。期間のある遷移は空き時間を占め、ラベル・所要時間を中央に表示します。編集フォームの時間変更は前後Stateの境界変更です。共有する他の接続が不正になれば編集全体を拒否します。

## Interaction

```json
{
  "id": "hit",
  "fromStateId": "guidance",
  "targetType": "transition",
  "targetId": "escape",
  "label": "離脱阻止",
  "kind": "attack",
  "effect": "block",
  "sourceTime": 46,
  "time": 46,
  "outcomeStateId": "disabled",
  "proposed": false
}
```

| フィールド            | 制約                                                                                |
| --------------------- | ----------------------------------------------------------------------------------- |
| fromStateId           | 作用元State                                                                         |
| targetType / targetId | `state` または `transition` と、そのID                                              |
| kind                  | `detection / observation / information / command / support / attack / interference` |
| effect                | `cause / block`                                                                     |
| sourceTime            | 作用元State内（両端含む）                                                           |
| time                  | sourceTime以降の到達時刻                                                            |
| proposed              | 省略時false。trueは検討案で、阻止成立表示から除外                                   |
| outcomeStateId        | 任意。対象Actorのactual State、開始は到達以降                                       |

作用元と作用先のActorは異なります。State宛の到達はそのStateの開始に一致します。Transition宛の成立済み作用は `[from.end, to.start]` 内への到達が必要です。`proposed: true` なら時間窓外への到達を許し、早すぎる／遅すぎると評価できます。検討案でも時間逆行・不存在の参照は許可しません。

`block` は予定Transitionのみを対象にできます。阻止の×は `block && !proposed` の登録から描画時に導出します。これは編集者の登録内容であり、成功を自動推論した結果ではありません。結果Stateへの点線だけでは実際のTransitionを生成しません。

### 表示とProxy

- detection / observation: 紫破線。
- information: 濃灰破線。
- command: 青緑実線。support: 青緑点線。
- attack / interference: 赤太線。検討案は破線。
- ラベルの配置候補が重なれば省略記号にし、選択時に全文を表示。titleとInspectorには全文を保持します。線交差の最適化はしません。

折りたたまれた子Actorの接続は、可視祖先を代理端点にします。同じ可視Actorペア・kind・effect・label・proposedの作用だけを束ね、`指令 ×3` のように表示します。異なる時刻を含む束の端点は最早発生〜最遅到達の包絡です。個別時刻はTooltip・Inspectorに列挙します。同じ折りたたみ内部で完結する線は描きません。元のID・参照・時刻・件数は不変です。

## Technology / Binding

```json
{
  "technologies": [
    {
      "id": "tech-link",
      "name": "水中指令通信",
      "trl": 4,
      "status": "research",
      "notes": "研究中"
    }
  ],
  "bindings": [
    {
      "id": "binding-order",
      "technologyId": "tech-link",
      "targetType": "interaction",
      "targetId": "order"
    }
  ]
}
```

`trl`: 整数1〜9またはnull（未評価）。`status`: `existing / research / planned / gap / unknown`。TRLの値からstatusを自動変換しません。

Binding対象は `actor / state / transition / interaction`。技術カタログの編集は、その技術の全Bindingに反映します。通常画面は背景・枠線付きの小さな吹き出し、Technology Viewでは名称・状態タグと詳細パネル、Gap Viewでは未成熟技術の依存先一覧を表示します。

## 選択・複製・削除

Ctrl/⌘+Clickで選択を追加・解除。空白からの矩形選択はActor列とState領域の両方に対応します。

Actor複製は部分木のActor・State・内部Transition・内部Interaction・対象Bindingをコピーします。選択した親と子が重複していても1回だけ複製します。外部ActorとのInteractionはコピーしません。対象外の結果Stateへの参照も除きます。

複数Stateだけを選択した場合も、両端が含まれるTransition・Interactionをコピーします。コピーされた要素とBindingのIDはすべて新規発行し、内部参照を再マッピングします。Technologyカタログは共用で、Technology IDは保持します。

Copy/Cut/Pasteはメモリ上の文書内fragmentです。OSクリップボードや他文書との交換は未実装。文書の置き換えでクリップボードを消します。Cut後の外部接続は削除され、Pasteで復活しません（Undoでは復旧可能）。

Group化は選択Actorの最上位部分木を新Groupの子へ移します。Ungroupは直接の子を1階層外に移し、空Groupを削除します。StateやBindingを持つ親はデータを失わないよう通常Actorとして保持します。

Actor削除は子孫とStateを連鎖削除し、失われる要素へのTransition・Interaction・Bindingも削除します。Technology本体は保持します。結果Stateのみが失われた場合はoutcome参照をnullにします。

編集はコピー上で行い、検証後に原子的に確定。失敗時は全体を戻します。ドラッグ1回は履歴1件、履歴上限100件。単独Stateの移動・伸縮は作用の発生をState内にクランプし、State宛の到達を開始に追従させます。複数Stateをまとめて動かすと、内部接続の両時刻も同じ差分だけ移します。外部接続と時間制約が両立しなければ全体を拒否します。

## 経路・Gap・介入可能時間窓

敵Transition選択時は、そこへのblock作用から有向グラフを逆に辿ります。Stateへの流入Interactionと前段Transitionを辿り、敵の状態を観測する作用に到達したらBlue側経路の起点とします。無関係な下流分岐は取り込みません。

各候補経路を独立評価し、別経路の役割を合成しません。

1. 観測：detection / observation。味方が作用元または観測先。
2. 判断：味方Stateに `phase: decision` を指定。
3. 指令：味方を作用元とするcommand。
4. 攻撃：味方を作用元とするattack / interference。

この順序で接続され、各作用が次の段階に間に合うと「構造完結」です。さらに時間窓内に到達し、経路の全要素を支える技術がexistingなら「条件充足」とします。Actor BindingはそのActorのStateを支えるものとしても評価し、要素自身のBindingと併せて確認します。未Bindingは未評価、research/planned/gap/unknownは未成熟として区別します。敵自身の技術情報はBlueの充足判定に必須ではありません。

選択経路は技術状態を色分けし、gap位置より上流のタイムライン強調を切ります。全候補はInspectorで選択できます。`SOME`は条件充足の候補が1つ以上、`ALL`は列挙候補のすべてが条件充足という意味です。敵全体の全ミッション妨害や全シナリオの保証ではありません。最大256経路・深さ512で打ち切り、打ち切り時はALLを未確認にします。

介入窓は `[敵Transitionの開始, 終了]`。到達が開始前ならearly、終了後ならlate、境界を含めてwithin。余裕は終了−到達です。瞬間Transitionなら同時刻だけwithin。

これは入力された因果・時刻・技術状態の構造評価です。運動、通信遅延、探知性能、交戦成功率はシミュレートせず、実世界の実行可能性や軍事的有効性を保証しません。
