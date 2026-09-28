# Document schema v1

時刻は共通の相対時間軸上の数値です。単位は `time.unit`、表示範囲は `[0, time.duration]`。座標は保存しません。JSONから描画時に計算します。

## Document

| フィールド   | 型            | 意味                       |
| ------------ | ------------- | -------------------------- |
| version      | `1`           | スキーマバージョン         |
| title        | string        | ミッション名（1〜300文字） |
| time         | object        | `{ unit, duration, snap }` |
| actors       | Actor[]       | 配列順が縦の表示順         |
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

描画は `x = 208 + start * scale`、`width = (end - start) * scale`。文字を収めるために幅を引き伸ばさず、収まらないラベルはクリップします。全名称はツールチップ・詳細パネルに表示します。

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

Actor削除はそのStateを、State削除はそのTransitionを連鎖削除します。失われたState・Transitionを参照するInteractionも削除します。妨害後のStateだけが消えた場合は `outcomeStateId` をnullにし、阻止関係を残します。

編集はコピー上で実行し、文書全体の検証後にまとめて確定します。ドラッグ中はプレビューだけを変更し、完了時に1操作として履歴へ記録。不正な操作は文書と履歴の両方を保ったまま拒否します。
