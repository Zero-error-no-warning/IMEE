# Interactive Mission Engineering Editor

静的HTMLで動くMission Thread編集・時間と品質のシミュレーションツール。`index.html`を開いて使用できます。外部サービスへのアップロードは不要です。

## version 3 のモデル

- State: 条件・事実・結果が成立した時点。
- Task: 同Actor内のStateから次のStateへの時間を要する行為。
- 作用線: StateからStateまたは明示的な分岐点へ伝達。Task/Actor端点と正負分類を廃止。
- 時間: 発生時刻＋非負の所要時間。固定値またはCDFで扱う。
- 品質: q=1−旧w、0〜1。出力q=入力q×品質保持率。
- 合流: ANDは全到達・最小q、ORは成立時点の到達済み最大q。
- 分岐作用: 発生元Stateは対象Taskの実開始を暗黙に待つ。品質と無関係な必須依存。循環は詳細診断。

固定時間は二重線、CDFは実線。結果は線幅と割合で図へ反映できます。旧version 1/2は非互換です。

## 編集

Actorを追加・階層化・複製・折りたたみできます。Stateの位置は基準時刻です。同ActorのState間を結ぶとTask、別ActorのStateまたは既存分岐点へ結ぶと作用線です。接続はState選択後CキーまたはOption/Altドラッグ。分岐はTaskのメニューで追加してから接続します。途中出力はTaskを分割して成立Stateを作ります。

Undo/Redo、コピー・貼り付け、JSON読み込み・保存、SVG/PNG出力、技術カタログ・関連付け、検索・表示フィルタを利用できます。表示設定から暗黙の開始依存を破線表示できます。

Simulationは成功State・期限・試行数・Seedを指定して明示実行します。CDF表は所要時間・累積到達確率・品質保持率を編集します。残余確率は不達。Taskと作用線で同じ計算を使います。

## 仕様・生成

- [データモデル](docs/data-model.md)
- [LLMシナリオ生成](docs/llm-json-generation.md)
- [LLMシミュレーション生成](docs/llm-simulation-generation.md)
- [シミュレーション](docs/simulation.md)
- [サンプル](docs/examples.md)
- [v3移行](docs/sample-migration.md)

生成時にテスト実行環境を必須としません。実行経路に寄与しない形式的な待機State/Taskを作らず、参照・時間・暗黙依存を生成時点で自己点検します。

## 開発確認

Node.js 24以降。

```sh
npm ci
npm test
node scripts/validate-mission.cjs examples/simulation.json
node scripts/update-examples.cjs
```

バリデータは違反JSON path・該当JSON・循環経路を出力します。シナリオonlyとSimulation用の現行例はversion 3です。comparison-v1は旧形式の凍結資料です。
