#!/usr/bin/env node
"use strict";

// Use the editor's version 2 importer. Never rewrite input.
const fs = require("node:fs");
const M = require("../js/model.js");
const args = process.argv.slice(2);
if (
  args.length !== 1 ||
  (args[0].startsWith("-") && args[0] !== "-" && args[0] !== "--help")
) {
  console.error("使い方: node scripts/validate-mission.cjs <mission.json | ->");
  process.exitCode = 2;
} else if (args[0] === "--help") {
  console.log(
    "使い方: node scripts/validate-mission.cjs <mission.json | ->\n- は標準入力。追加パッケージ不要。入力ファイルは変更しません。",
  );
} else {
  try {
    const bytes = fs.readFileSync(args[0] === "-" ? 0 : args[0]);
    if (bytes.length > 8 * 1024 * 1024)
      throw new Error("JSONファイルは8MiB以下にしてください。");
    const doc = M.parse(bytes.toString("utf8"));
    console.log(
      `VALID: ${doc.title}\nActor ${doc.actors.length} / State ${doc.states.length} / Task ${doc.tasks.length} / CausalLink ${doc.causalLinks.length} / Technology ${doc.technologies.length} / Binding ${doc.bindings.length}`,
    );
    console.log(
      "形式・参照・時刻の検証に通過しました。シナリオの妥当性や経路の条件充足は別途確認してください。",
    );
  } catch (error) {
    console.error(`INVALID: ${error.message}`);
    process.exitCode = 1;
  }
}
