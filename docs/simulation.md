# IMEE Simulation — 初回実装

IMEE Simulationは、装備・環境・交戦の詳細挙動をモデル化せず、外部解析によって得られたTask-level performanceをMission Thread上で伝播させ、Mission-level effectivenessおよび必要Capabilityを評価する。

今回実装したのは、CDF入力、Task/State依存のMonte Carlo、固定wの曲線補間、成功StateのAND・期限判定、時間分布、Criticality、追加依存による待ち時間です。Capability要求の逆算はまだ実装していません。座標、装備、交戦・センサ物理モデルは導入しません。

## 使い方

1. `index.html` を開き、ツールバーの **Simulation** → **シミュレーション例を開く**。現在の文書を置き換える確認があり、Undoで戻せます。JSONは `examples/simulation.json` にもあります。
2. Taskを編集し、折りたたみ **Simulation / Performance** を開きます。CDF有効化、各wの曲線、時間tと累積確率pを表で編集できます。プレビューは固定入力wで補間した曲線です。
3. Actorをまたぐ実行依存はTaskの **追加依存State** に指定します。接続元Stateに加え、選んだ全Stateへの到達を待ちます。
4. **Simulation** → **成功条件・実行設定** で成功State（AND）、任意の期限、試行数、Seedを保存します。
5. **Monte Carlo実行**。処理は小さなバッチに分けてUIへ制御を返し、中断・閉じる・Escで中断できます。
6. **結果JSON保存** は実行時のMission文書と結果を保存します。編集すると結果は無効化されます。表示範囲やViewだけの変更では結果を保ちます。

## 実行意味論

- 通常Taskの `fromStateId → toStateId` を実行依存にします。各Taskは1試行につき1回実行します。
- 入力TaskがないStateは初期Stateで、図上の `State.time` がその到達・利用可能時刻です。開始から遅れて利用可能になる初期Stateも設定できます。
- 入力TaskがあるStateは、そのすべてが完了した時刻に到達します（AND合流）。図上の `State.time` に固定・クランプしません。
- Taskは接続元Stateと追加依存Stateがそろい次第開始します。図上のTask開始時刻は追加の開始制約には使いません。
- CDF有効Taskは時間を抽選します。未設定・無効Taskは図上の `Task終了 − Task開始` を固定所要時間にします。無効はTaskの実行除外ではありません。
- `T=∞` を抽選したTaskは未達で、後続Stateに到達しません。依存Taskは開始不能になります。失敗Taskの再試行や失敗用Stateへの遷移は行いません。
- Actorは活動の所属です。同一Actor上のTaskにも、依存関係がなければ並列実行を許します。Actorを自動的な排他Resourceとしては扱いません。
- 作用線の正負・分類・表示時刻から実行依存や成功・失敗を推測しません。作用線がある文書には実行画面と結果に、この扱いを表示します。Actor間の依存は明示的な追加依存Stateを使います。
- 現行junctionの複数結果は確率・選択条件を持たないため、junctionを含む文書は実行前にエラーにします。暗黙の同時実行・等確率選択は行いません。
- ゼロ時間のTaskを許しますが、依存循環・ループは実行前に拒否します。図上の検証に加えて実行用DAGを検証します。
- 全文書のTaskを実行します。独立した他のTaskの失敗は、成功条件に接続していなければMission成功を妨げません。

## CDFと固定w

```json
{
  "simulation": {
    "enabled": true,
    "w": 0.25,
    "waitForStateIds": ["information-ready"],
    "performanceModel": {
      "type": "cdf",
      "degradationInput": "w",
      "curves": [
        { "w": 0, "points": [{ "t": 5, "p": 0.2 }, { "t": 20, "p": 0.9 }], "pInfinity": 0.1 },
        { "w": 1, "points": [{ "t": 5, "p": 0.05 }, { "t": 20, "p": 0.55 }], "pInfinity": 0.45 }
      ]
    }
  }
}
```

時間tは文書の `time.unit` と共通です。CDFは `F(t)=P(T≤t)`。時間点は非負で狭義昇順、pは0〜1で単調非減少です。`w` は0〜1で曲線が入力wを挟む必要があり、外挿しません。省略時の固定入力はw=0。曲線はwの昇順で重複禁止です。

時間方向は点間を線形補間します。最初の点がt>0なら原点(0,0)から補間します。t=0のp>0は即時達成の確率質量です。最後の点以降は平坦で、最終pと `pInfinity` の和は1（許容誤差1e-10）。有限の末尾時間より先での達成確率はありません。UIの未達確率は最終pから算出します。

w間は隣接2曲線の時刻点の和集合上でCDF値を線形補間します。各曲線で時刻点が異なっても確率・単調性を保ちます。逆CDFで1個の一様乱数からTを抽選し、残る確率質量を∞にします。

現段階の各Taskの抽選は独立です。入力性能間の相関・共通環境による同時劣化は表現していません。wはTaskごとの固定入力であり、State/作用線からのw伝播、ランダムWの抽選は未実装です。

CDF無効時も保存済み曲線は保持します。Task編集・JSON保存/読込・Undo/Redo・Actor複製で性能情報を保持し、複製内部の依存State IDを再マップします。複製外への追加依存は元のStateを参照し続けます。削除時には失われたState参照を追加依存・成功条件から除きます。成功条件が空になった場合は再設定するまで実行できません。

## Mission設定と統計

文書トップレベルに追加します（version 2のまま・既存文書では省略可）。

```json
{
  "simulation": {
    "successStateIds": ["target-completed", "asset-survived"],
    "deadline": 30,
    "iterations": 5000,
    "seed": 17
  }
}
```

`deadline` は開始からの絶対時刻です。null/省略なら期限なし。選択した全Stateへの到達時刻の最大がMission完了時刻で、期限以内なら成功です。成功率は成功数 / 全試行数。表示する95%区間は二項比率のWilson区間で、Monte Carlo標本誤差を示します。外部の性能入力そのものの誤差を含みません。

- Mission P50/P90：成功Stateすべてに到達した試行の条件付き完了時間分布。期限超過も含み、∞は除外します。到達なしならnull/「—」。
- Mission CDF：ある時刻までに成功Stateすべてへ到達した試行数 / 全試行数。グラフの終点は到達率で、未達の確率質量を取り除いて100%へ正規化しません。期限は別途線で表示します。
- Task開始・待ちP50/P90：開始できた試行のみ。追加依存待ちは接続元Stateへの到達からTask開始までの時間です。
- Task終了P50/P90：完了した試行のみ。開始後未達と、依存未達による開始不能を分けて集計します。
- Critical Path：有限のMission完了時刻から、最大到達時刻を与えた依存を逆向きにたどります。複数成功State・AND合流・追加依存を含み、同時刻の経路をすべて数えます。比較許容差は1e-9 × max(1, |時刻|)。
- CI：TaskがCriticalだった試行数 / 全試行数。Mission未達試行はCritical Path未定義として数えません。期限を超えて到達した試行の経路も数えます。
- 成功時CI：期限内に成功した試行における条件付きCI。成功なしならnull/「—」。

Seedは0〜2^32−1の整数、試行数は1〜100,000。State数+Task数と試行数の積を500万以下に制限します。初回実装は画面の主スレッド上でバッチ処理し、試行を個別保存せず集計用時間標本を保持します。最終集計・グラフ描画は同期処理です。大きいモデルでは試行数を下げてください。

同じ文書・設定・Seedで結果が再現します。文書のTask順序を変更した場合の同じ抽選割当は保証しません。Seedはエンジン内の32bit疑似乱数に用い、描画・編集処理の乱数とは分離します。

## APIと検証

`js/performance.js`、`js/simulation.js` はclassic script / CommonJS共通で、外部依存はありません。Nodeでは以下で実行できます。

```js
const S = require('./js/simulation.js');
const result = S.run(mission, { iterations: 5000, seed: 17 });
// successStateIds等は文書設定を使い、optionsで上書き可能
```

画面は `createRun(document)` → `step(batch)` → `result()` を使用します。文書を複製して実行するため、実行で図の時刻を書き換えません。公開 `compile` / `trial` で1試行の開始・終了・State到達時刻とCritical Task集合も調べられます。Task失敗の∞は試行内部だけに使い、集計結果JSONは有限数またはnullです。

自動テストは、直列Taskの解析的成功確率・完了時間分位点との比較、不揃いCDF点のw補間、失敗伝播、AND合流、並列経路のCriticality、同時刻の経路、初期Stateの利用可能時刻、期限、CDF・依存検証、コピー/削除/履歴、Seed/バッチ再現性、DOMの編集・実行・中断・出力・結果無効化を確認します。

## 次段階

1. Task分岐の明示的な選択・条件規則。現行のjunctionは意味が未確定なので、通常到達先との関係を先に決めます。
2. State / 作用線からのw入力と伝播。入力の発生・到達時刻、複数入力の合成、途中到達時のTask性能更新規則を明文化して実装します。
3. Task時間・wを振る感度解析とMission要求からの時間性能要求・Capability Gap導出。
4. 独立したResource pool、requiresの確保・解放、consumesの消費と数量感度。数量をwに統合しません。

OR条件、期限付き失敗への遷移、再試行、Resource競合、F(t|w,N)、数量分析は今回の実行モデルに含みません。
