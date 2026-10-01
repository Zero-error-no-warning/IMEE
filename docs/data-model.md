# IMEE version 3 データモデル

Stateは成立した条件・事実、Taskは同Actor内の時間を要する状態遷移、CausalLinkはStateからStateまたは明示的な分岐点への伝達です。Taskと作用線は同じ時間・品質の計算を使います。version 1/2は非互換です。

## 文書

必須: `version:3`, `title`, `time:{unit,duration,snap}`, `actors`, `states`, `tasks`, `causalLinks`。`technologies`, `bindings`, `views`は省略可能です。IDはjunctionを含め全体で一意。時間単位はseconds/minutes/hoursです。

## State

`{id,actorId,name,time,simulation?:{q,join}}`。`time`は図の基準成立時刻。初期Stateはその時刻に外生的に成立します。生成元のあるStateは実到達時刻で成立し、図の時刻に固定しません。

- `q`は初期Stateの品質（既定1）。到達した品質を固定値で上書きしません。
- `join:"all"`（既定）: すべての生成元Task/作用線の到達を待ち、最小q。
- `join:"any"`: 最初の到達時点で成立し、同時刻までに到達済みの最大q。後着入力は成立済みの品質を変更しません。
- Stateの固定q=0と不達は異なります。

## Task

`{id,fromStateId,toStateId?,label,kind?,junctions?,simulation?}`。接続先は同Actorの別State。Taskは各試行1回実行し、実行中の入力qは変更しません。途中出力には結果Stateを設けてTaskを分けます。`toStateId`がない場合は結果分岐が必要です。

`simulation`:

- `enabled`: trueならCDF、false/省略なら図のState間の固定所要時間。
- `qualityRetention`: 固定時間処理の品質保持率、既定1。
- `performanceModel`: 下記のCDF。
- `qInput:{stateIds,mode:"all"|"any"}`: 指定Stateを品質入力とする。ANDはすべてを待ち最小q、ORは到達済みの最大q。省略/空配列なら接続元Stateのq。
- `waitForStateIds`: 品質計算には加えない追加の必須開始条件。
- `cancelOnStateIds`: いずれかが成立するとTaskを中止。

通常は開始条件を受領Stateに合流し、そのStateからTaskを開始します。基準図で追加依存がTask開始より遅い構造は避けます。

## 分岐点

`junctions:[{id,time,outcomes:[{label,toStateId,delay?,probability?}],simulation:{mode}}]`。

- `mode:"effect"`: State起点の作用線で指定された結果へ分岐。
- `mode:"probability"`: Taskの抽選時間に応じた相対進捗で確率分岐。累積分岐確率の残りは通常継続。
- `delay`を省略すると結果State.time−junction.timeが分岐後の固定時間。
- 作用分岐の結果品質は、作用線が届けたq_out。
- 確率分岐の結果品質は、分岐時点までのTask所要時間に対応する保持率×入力q。

## 作用線

```json
{
  "id":"report", "label":"追尾情報",
  "source":{"type":"state","id":"track-established"},
  "target":{"type":"state","id":"track-received"},
  "propagation":{"duration":3,"qualityRetention":0.95},
  "simulation":{"enabled":true}
}
```

分岐点へのtarget:

```json
{"type":"junction","taskId":"flight","id":"intercept-point","outcomeStateId":"destroyed"}
```

`source`はStateのみ。`target`はState/junctionのみ。`source.time`, `target.time`, `polarity`, `simulation.type`, `simulation.w`, `holdUntilStart`は廃止。到達先からState成立/分岐の処理を決めます。`kind`は説明・分析用です。

`propagation.duration`は必須の非負の基準所要時間。図の到達時刻は発生元State.time＋duration。Stateへの各入力の基準到達時刻は異なってよい。State.timeは全生成元Task/作用線の基準到達のうち、ANDなら最大、ORなら最小と一致させます（暗黙の開始依存があれば、その開始条件との最大）。分岐点への基準到達はjunction.timeと一致させます。異なる入力到達は図の小丸で示し、成立Stateとの間は待機／後着を示す灰色破線で結びます。CDFは`propagation.performanceModel`へ指定。実行時の所要時間そのものを抽選し、durationへ加算しません。`simulation.enabled`がfalse/省略なら表示専用です。junction作用には`simulation.stopTargetActor`で同Actorの他Taskを中止できます。

## 共通CDFと品質q

q=1−旧w。0〜1で、大きいほど高品質です。点のqは品質保持率です。

```json
{
  "type":"cdf", "qualityInput":"q",
  "curves":[{"q":1,"points":[
    {"t":5,"p":0.3,"q":1},
    {"t":10,"p":0.8,"q":0.2},
    {"t":15,"p":0.8,"q":0}
  ]}]
}
```

- 曲線のqは入力品質の軸。点のqは所要時間に対応する品質保持率。
- 単一曲線は全入力品質に共通。複数曲線はq昇順で0〜1を覆う。
- tは非負・厳密昇順、pは0〜1・単調非減少、点のqは0〜1。
- CDFと保持率は時間方向・入力qの曲線間とも線形補間。
- CDFは原点(0,0)から補間。ただしt=0の点は即時到達の確率質量。保持率は最初の点まで最初のqを使う。
- 最終時刻より先はCDFを一定にし、残余1−最終pは不達。別の`pInfinity`は保存しない。
- 到達した試行の所要時間Tに対して **q_out=q_in×保持率(T,q_in)**。
- 不達ではq_outを作らず、到達先も成立しない。上記例では20%不達。10〜15秒のpは増えないため、その区間の到達はない。

## 分岐作用の暗黙依存

junctionを対象とする作用線ごとに、起点Stateが対象Taskの**実際の開始**を必須条件として待ちます。S本来の成立条件に加え、対象Task開始が揃った時点でSを成立させます。

- `t_S=max(S本来の成立可能時刻,対象Taskの実開始時刻)`。
- 時間0・確率1の開始許可。品質計算には参加しない。
- SのjoinがORでも暗黙依存は必須。
- 対象Taskが開始しなければSは成立せず、作用も発生しない。
- Sが複数の対象Taskへ分岐作用を出す場合、全対象Taskの開始を待つ。独立した発生が必要ならSを対象ごとに分ける。
- Sから出る他の作用線もSの成立を待つ。汎用情報Stateを共有する際はこの意味を確認する。
- 追加開始条件・品質入力待ちも対象Taskの実開始に含める。
- 開始前到達は内部不整合の詳細エラー。終了後は作用不成立。開始/終了と同時刻は実行中のTaskへの作用を先に処理する。
- Task開始を別ノードとして扱い、完了待ちと混同しない。潜在依存も含め循環は禁止し、依存経路と該当JSONを出す。
- `views.main.filters.implicitDependencies:true`で開始依存を破線表示。通常の作用線と分離する。

## Mission・表示・技術

`simulation:{successStateIds,successMode:"all"|"any",deadline?,iterations?,seed?}`。成功は指定Stateの到達と任意の期限で判定し、q=0を自動的に不達へ変換しません。CDFなどで品質依存の性能を指定します。

Actorは`{id,name,side,parentId?,isGroup?,color?}`。技術は`technologies`と`bindings:{id,technologyId,targetType,targetId}`でActor/Task/作用線へ関連付けます。Stateへの既存技術Bindingも保持可能です。

折りたたみ・Actor順・ズーム・フィルタは`views.main`に保存。固定時間は二重線、CDFは実線。正負での線種分けはしません。実行結果の割合と線幅は表示として適用し、文書の基準時刻・設定は変更しません。
