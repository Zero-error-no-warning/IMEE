# Document schema v1

時刻は共通の相対時間軸上の数値です。単位は `time.unit`、表示範囲は `[0, time.duration]`。座標は保存しません。JSONから描画時に計算します。

## Document

| フィールド   | 型            | 意味                       |
| ------------ | ------------- | -------------------------- |
| version      | `1`           | スキーマバージョン         |
| title        | string        | ミッション名（1〜300文字） |
| time         | object        | `{ unit, duration, snap }` |
| actors       | Actor[]       | 同じ親を持つActorの配列順が兄弟間の順序         |
| states       | State[]       | 状態                       |
| transitions  | Transition[]  | 同一Actor内の遷移          |
| interactions | Interaction[] | Actor間の作用・遷移阻止    |

`unit`: `seconds | minutes | hours`。`0 < duration <= 1,000,000`、`0.01 <= snap <= duration`。すべての時刻は有限の数値。各コレクションは最大10,000件、UIからのファイル読込は8MiBまでです。この上限は読み込み防御用であり、大規模文書の描画性能を保証しません。

すべての `id` は文書全体で一意な空でない文字列。IDは位置や名前に依存せず、参照はIDで保持します。`notes` は省略可能で、10,000文字以下です。

## Actor

```json
{ "id": "enemy", "name": "敵UUV", "side": "hostile", "notes": "" }
```

`side`: `friendly | hostile | neutral`。

Actorには次の任意フィールドを追加できます。既存v1文書はそのまま読み込めます。

| フィールド | 型・既定値              | 意味                                                        |
| ---------- | ----------------------- | ----------------------------------------------------------- |
| parentId   | string / null、既定null | 親ActorのID。通常のActorも親にできます                      |
| isGroup    | boolean、既定false      | グループとして表示。子Actorがある場合は自動的に展開UIを表示 |
| collapsed  | boolean、既定false      | 子孫を画面から隠す。JSONと自動保存に含め、Undo可能          |

親IDの不在・自己参照・循環を拒否します。`actors` の順序は兄弟間で保ち、描画は親→子の深さ優先。Stateを持つActorを親にしても、親のStateは通常どおり表示します。折りたたみ時は親の行を残し、子孫のState・関連リンクを隠して件数を表示します。参照と時刻は変えません。

Actorを別Actor行の中央へドロップすると、そのActorを親にします。上下端へのドロップでは移動先と同じ親を持ち、その前後へ移動します。子孫の親参照は変更しないため、部分木が一緒に移動します。

## State

```json
{
  "id": "escape-state",
  "actorId": "enemy",
  "name": "離脱",
  "start": 36,
  "end": 44,
  "status": "actual",
  "activity": "active",
  "notes": ""
}
```

`0 <= start < end <= duration`。`status`: `actual | planned`。`activity`: `active | quiet`。実際か予定か、活動か平常かは独立した区分です。

State同士の重複を許容します。Actor内で実際のStateを優先し、開始時刻順に既存の段へ詰め、重なる場合は次の段を使います。予定と実際の分岐を同一Actorに表示できます。

描画は `x = plotLeft + (start - viewStart) * scale`、`width = (end - start) * scale`。文字を収めるために幅を引き伸ばさず、収まらないラベルはクリップします。全名称はツールチップ・詳細パネルに表示します。

### 横幅固定の表示範囲

画面のSVG幅はキャンバスの可視幅と一致します。`scale = (可視幅 - Actor列 - 右余白) / viewSpan`。拡大は `viewSpan` を減らし、縮小は増やします。`0 <= viewStart <= duration - viewSpan` を維持します。

描画領域にclipPathを設定して範囲外の図形をクリップします。座標自体は時間比例を保ち、図形の幅を丸めたり伸ばしたりしません。操作の座標から時刻へ戻す式は `time = viewStart + (x - plotLeft) / scale` です。ドラッグ移動量も現在のscaleで換算します。

拡大率・表示開始時刻は一時的な表示状態で、ミッションJSONやUndo履歴には保存しません。ウィンドウサイズが変わっても表示時間範囲を維持して再計算します。SVG出力は全期間・全階層を描画し、出力後の画面は元の表示状態を保ちます。

## Transition

```json
{
  "id": "escape",
  "from": "escape-state",
  "to": "escaped-state",
  "status": "planned",
  "label": "離脱成立"
}
```

接続元・接続先は同一Actorの異なるState。`from.end <= to.start` が必要です。遷移時間は `to.start - from.end` で導出し、別の時刻値を重複保存しません。0なら即時遷移です。分岐は1つのStateから複数のTransitionを作ります。

阻止された状態をTransitionへ直接書き込まず、対応する阻止Interactionの存在から描画時に導出します。これにより作用の削除・Undoで不整合な阻止フラグが残りません。

## Interaction

```json
{
  "id": "hit",
  "fromStateId": "guidance",
  "targetType": "transition",
  "targetId": "escape",
  "label": "命中・離脱阻止",
  "kind": "attack",
  "effect": "block",
  "sourceTime": 46,
  "time": 46,
  "outcomeStateId": "disabled-state",
  "notes": ""
}
```

| フィールド     | 制約                                        |
| -------------- | ------------------------------------------- | ----------- | ----------- | ------- | ------ | ------------- |
| fromStateId    | 作用元State                                 |
| targetType     | `state                                      | transition` |
| targetId       | 作用先StateまたはTransitionのID             |
| kind           | `detection                                  | command     | information | support | attack | interference` |
| effect         | `cause                                      | block`      |
| sourceTime     | 作用元Stateの開始〜終了の範囲（両端を含む） |
| time           | `sourceTime` 以降の到達時刻                 |
| outcomeStateId | 省略可・null可。阻止後に実際に生じたState   |

作用元と作用先のActorは異なる必要があります。State宛の場合、`time == target.start`。Transition宛の場合、その遷移開始〜終了の範囲内に到達する必要があります。

`effect: block` は `targetType: transition` かつ `target.status: planned` の場合のみ有効です。`outcomeStateId` を指定できるのは阻止の場合のみで、対象Transitionと同じActor・`actual`・開始が阻止時刻以降という条件があります。

UIからはState宛の原因作用、Transition宛の阻止作用を作成できます。JSONではTransition宛の原因作用も扱えます。

### 時刻追従

- State移動時：作用元の `sourceTime` を開始時刻の差分だけ移し、新しいState内にクランプ。State宛の `time` は開始時刻に追従。
- State伸縮時：同じルールを適用。作用の発生がState外にならないようクランプ。
- Transition上の阻止時刻は固定。関係するStateの変更で遷移範囲外になった場合、変更全体を拒否します。
- 妨害後のStateへの点線は結果の関連付けです。実際のTransitionは別途登録します。

### 削除と履歴

Actor削除はその子孫ActorとすべてのStateを、State削除はそのTransitionを連鎖削除します。失われたState・Transitionを参照するInteractionも削除します。妨害後のStateだけが消えた場合は `outcomeStateId` をnullにし、阻止関係を残します。

編集はコピー上で実行し、文書全体の検証後にまとめて確定します。ドラッグ中はプレビューだけを変更し、完了時に1操作として履歴へ記録。不正な操作は文書と履歴の両方を保ったまま拒否します。
