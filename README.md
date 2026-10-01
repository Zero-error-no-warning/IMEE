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

「新規」で空の文書を作り、「登場主体」→「活動」→「相互作用」→「達成目標」のガイドに沿って作成できます。活動の開始条件・所要時間・成果をまとめて入力し、成果から次の活動を追加できます。Stateの位置は基準時刻です。同ActorのState間を結ぶとTask、別Actorへ結ぶと作用線です。図の＋接続、ツールバー、CキーまたはOption/Altドラッグを使います。Taskへ作用を結ぶと、分岐・結果と一括して設定できます。

詳細パネルで名前・時刻・所要時間を編集し、関連時刻の変更をプレビューできます。途中の成果はTaskを分割して追加。Actorの階層化・複製・折りたたみ、全対象の検索、関連先への移動、全体概観も使えます。実行前は「実行準備」で設定漏れを確認します。[操作ガイド](docs/authoring-workflow.md)に作成手順と46項目の改善対応を記載しています。

Undo/Redo、コピー・貼り付け、JSON読み込み・保存、SVG/PNG出力、技術カタログ・関連付け、検索・表示フィルタを利用できます。表示設定から暗黙の開始依存を破線表示できます。

Simulationは成功State・期限・試行数・Seedを指定して明示実行します。Task・作用線の共通CDFをグラフの点のドラッグ、キー、数値表で編集できます。入力品質のスライダーはプレビュー専用です。残余確率は不達。名前や備考の変更では結果を維持し、計算条件を変えた場合は変更前の結果を旧入力と一緒に残します。

「文書」で複数文書・別案を管理し、「保存時点」で文書ごとに最新20件を復元できます。ブラウザ内保存とは別に、共有用のJSONを書き出せます。

「全CDFの自動感度分析」で入力品質qを一括評価し、成功率グラフと改善・劣化のランキングを表示できます。共通の番号・色でグラフとシナリオ図を対応付け、クリックで相互に強調表示します。

## 仕様・生成

- [データモデル](docs/data-model.md)
- [LLMシナリオ生成](docs/llm-json-generation.md)
- [LLMシミュレーション生成](docs/llm-simulation-generation.md)
- [シミュレーション](docs/simulation.md)
- [人が作成するための操作ガイド](docs/authoring-workflow.md)
- [時間軸・直交線・ノード・図上CDFの設計案（未実装）](docs/time-axis-design.md)
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
