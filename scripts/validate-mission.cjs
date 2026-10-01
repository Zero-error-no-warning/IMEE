#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const M = require("../js/model.js");
const args = process.argv.slice(2);

function jsonFragment(value) {
  try { return JSON.stringify(value, null, 2); }
  catch (_) { return String(value); }
}

function syntaxContext(text, error) {
  const match = /position\s+(\d+)/i.exec(error.message);
  if (!match) return null;
  const pos = Number(match[1]);
  const before = text.slice(0, pos);
  const line = before.split("\n").length;
  const column = pos - before.lastIndexOf("\n");
  const lines = text.split("\n");
  const start = Math.max(0, line - 3);
  const end = Math.min(lines.length, line + 2);
  return {
    line,
    column,
    excerpt: lines.slice(start, end).map((s, i) =>
      String(start + i + 1).padStart(5) + " | " + s
    ).join("\n"),
  };
}

function printInvalid(error, raw) {
  console.error("INVALID: " + error.message);
  if (error.validationPath)
    console.error("\nJSON path:\n" + error.validationPath);
  if (error.validationFragment !== undefined)
    console.error("\nOffending JSON:\n" + jsonFragment(error.validationFragment));

  if (error instanceof SyntaxError) {
    const info = syntaxContext(raw, error);
    if (info) {
      console.error(`\nJSON syntax location: line ${info.line}, column ${info.column}\n${info.excerpt}`);
    }
  }

  console.error("\n入力ファイルは変更していません。上記の箇所を修正してください。");
}

if (
  args.length !== 1 ||
  (args[0].startsWith("-") && args[0] !== "-" && args[0] !== "--help")
) {
  console.error("使い方: node scripts/validate-mission.cjs <mission.json | ->");
  process.exitCode = 2;
} else if (args[0] === "--help") {
  console.log(
    "使い方: node scripts/validate-mission.cjs <mission.json | ->\n" +
    "- は標準入力。追加パッケージ不要。入力ファイルは変更しません。\n" +
    "違反時は可能な限りJSON pathと問題箇所のJSON断片を表示します。",
  );
} else {
  const raw = fs.readFileSync(args[0] === "-" ? 0 : args[0]).toString("utf8");
  try {
    if (Buffer.byteLength(raw, "utf8") > 8 * 1024 * 1024)
      throw new Error("JSONファイルは8MiB以下にしてください。");
    // Parse once here so syntax errors can be reported with source context.
    JSON.parse(raw);
    const doc = M.parse(raw);
    console.log(
      `VALID: ${doc.title}\nActor ${doc.actors.length} / State ${doc.states.length} / Task ${doc.tasks.length} / CausalLink ${doc.causalLinks.length} / Technology ${doc.technologies.length} / Binding ${doc.bindings.length}`,
    );
    console.log(
      "形式・参照・時間・伝搬設定の検証に通過しました。意味上の妥当性や性能値の根拠は別途確認してください。",
    );
  } catch (error) {
    printInvalid(error, raw);
    process.exitCode = 1;
  }
}
