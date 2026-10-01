# version 3 サンプル更新

現在のJSONとブラウザの各サンプルはversion 3で同期する。examples/comparison-v1とdocs/comparison-v1は旧設計の凍結資料で、現在の読み込み対象ではない。

- 正負のpolarity、w、Task/Actor作用端点を廃止。
- Task途中の追尾報告・指令生成・妨害発生は意味のある結果Stateを追加し、Taskを分割。
- Taskへの外部作用は明示的junctionと結果Stateへ接続。
- 管制・誘導の形式的な待機Taskを削除し、情報・指示受領Stateを開始条件とする。
- 旧研究例の到達時刻だけを持つ時間窓外作用は現行例から削除。実行時に遅れる作用はCDFによって不成立として評価できる。
- シミュレーション例は指令と対象軌道の条件を受領StateでAND合流し、発射Taskの基準所要時間を10秒へ整合。
- q=1−wへ変換。CDF各点に保持率qを追加し、未達確率は最後のpから導出。
- ブラウザ保存キーはimee.document.v3。旧文書を自動変換して意味を推測しない。

再生成: `node scripts/update-examples.cjs`。検証: `node scripts/validate-mission.cjs examples/simulation.json`。生成者のテスト環境は必須ではない。
