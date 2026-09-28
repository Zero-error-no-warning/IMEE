"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const M = require("../js/model.js");
const sample = require("../js/sample.js");
const { openApp } = require("./dom-helper.cjs");
async function app(t, d) {
  const a = await openApp(d);
  t.after(() => a.close());
  assert.deepEqual(a.errors, []);
  return a;
}
const rect = (el) =>
  Object.fromEntries(
    ["x", "y", "width", "height"].map((k) => [k, Number(el.getAttribute(k))]),
  );
const labelBox = (el) => JSON.parse(el.dataset.labelBox);
function checkLabels(a) {
  const labels = [
    ...a.d.querySelectorAll(".edge-label:not([display='none'])"),
  ].map(labelBox);
  const states = [...a.d.querySelectorAll(".state .body")].map(rect);
  for (let n = 0; n < labels.length; n++) {
    const b = labels[n];
    assert.ok(
      b.x >= 176 && b.x + b.width <= 1050,
      "label stays in canvas width",
    );
    assert.ok(
      b.y + b.height <= Number(a.$("#timeline").getAttribute("height")),
    );
    for (const other of [...states, ...labels.slice(n + 1)])
      assert.ok(
        !M.boxesOverlap(b, other, 0),
        "labels clear states and other labels",
      );
    for (const path of a.d.querySelectorAll(".edge .line")) {
      const tokens = path.getAttribute("d").split(/\s+/);
      let x = 0,
        y = 0;
      while (tokens.length) {
        const op = tokens.shift(),
          oldX = x,
          oldY = y;
        if (op === "M" || op === "L") {
          x = Number(tokens.shift());
          y = Number(tokens.shift());
        } else if (op === "H") x = Number(tokens.shift());
        else if (op === "V") y = Number(tokens.shift());
        else break;
        if (op !== "M")
          assert.ok(
            !M.boxesOverlap(
              b,
              {
                x: Math.min(x, oldX),
                y: Math.min(y, oldY),
                width: Math.abs(x - oldX),
                height: Math.abs(y - oldY),
              },
              1,
            ),
            "labels clear connection lines",
          );
      }
    }
  }
}
test("State text wraps, shrinks modestly and grows lanes without changing time widths", () => {
  const d = M.migrate(sample());
  d.states.find((s) => s.id === "e5").name =
    "長い状態名の折り返しと高さの自動調整を確認するための表示";
  const l = M.layout(d, 10);
  const p = l.positions.get("e5"),
    q = l.positions.get("e4");
  assert.ok(p.height > 32);
  assert.equal(p.width, 140);
  assert.ok(q.y >= p.y + p.height + 12);
  assert.ok(p.text.fontSize >= 9);
  for (const line of p.text.lines)
    assert.ok(M.textWidth(line, p.text.fontSize) <= p.width - 8);
  assert.equal(p.text.lines.join(""), d.states.find((s) => s.id === "e5").name);
});
test("extremely narrow or long States have bounded height and explicit truncation", () => {
  for (const width of [1, 8, 15, 40]) {
    const fit = M.fitStateText("非常に長い状態名".repeat(30), width);
    assert.ok(fit.truncated);
    assert.ok(fit.height <= 104);
    for (const line of fit.lines)
      assert.ok(M.textWidth(line, fit.fontSize) <= Math.max(0, width - 8));
  }
});
test("Interactions use facing State boundaries upward and downward after text growth", async (t) => {
  const d = M.migrate(sample());
  d.states.find((s) => s.id === "s2").name =
    "観測した対象について継続的に情報を更新し追跡を維持している状態".repeat(3);
  d.interactions.push({
    id: "up",
    fromStateId: "t1",
    targetType: "state",
    targetId: "s2",
    label: "上方向の情報共有",
    kind: "information",
    effect: "cause",
    sourceTime: 10,
    time: 14,
  });
  const a = await app(t, d);
  for (const id of ["detect", "report", "up"]) {
    const i = d.interactions.find((x) => x.id === id);
    const from = rect(a.$(`[data-id="${i.fromStateId}"] .body`));
    const to = rect(a.$(`[data-id="${i.targetId}"] .body`));
    const numbers = a
      .$(`[data-id="${id}"] .line`)
      .getAttribute("d")
      .match(/-?\d*\.?\d+/g)
      .map(Number);
    const down = to.y > from.y;
    assert.equal(numbers[1], from.y + (down ? from.height : 0));
    assert.equal(numbers.at(-1), to.y + (down ? 0 : to.height));
  }
  assert.equal(
    a.$('[data-id="s2"] .state-name').textContent,
    d.states.find((s) => s.id === "s2").name,
  );
});
test("dense interaction and transition labels avoid all state boxes, arrow lines and other labels", async (t) => {
  const d = M.migrate(sample.research());
  for (let n = 0; n < 9; n++)
    d.interactions.push({
      ...d.interactions[1],
      id: `dense-${n}`,
      label: `情報共有 ${n}：観測した対象の状態を管制へ通知`,
    });
  const a = await app(t, d);
  checkLabels(a);
  assert.ok(a.$(".label-leader"), "distant labels receive guides");
  const height = a.$("#timeline").getAttribute("height");
  a.click('[data-id="dense-1"] .hit');
  checkLabels(a);
  a.click('[data-id="dense-1"] .hit');
  assert.equal(
    a.$("#timeline").getAttribute("height"),
    height,
    "repeated selection does not keep expanding the chart",
  );
});
test("placement falls back to a callout area when every in-chart position is occupied", () => {
  const occupied = [{ x: 0, y: 0, width: 100, height: 100 }];
  const box = M.placeLabel({ x: 10, y: 10, width: 40, height: 20 }, occupied, {
    left: 0,
    right: 100,
    top: 0,
    bottom: 100,
  });
  assert.ok(box.y > 100);
  assert.ok(!M.boxesOverlap(box, occupied[0]));
});

test("SVG export preserves wrapped text and displaced labels without changing the document", async (t) => {
  const d = M.migrate(sample());
  d.states.find((s) => s.id === "e5").name =
    "長い状態名を複数行に分けて収める結果状態";
  for (let n = 0; n < 6; n++)
    d.interactions.push({
      ...d.interactions[1],
      id: `export-${n}`,
      label: `追加の情報共有ラベル ${n} を折り返して表示`,
    });
  const a = await app(t, d);
  const before = a.savedDoc();
  a.click("#more-btn");
  a.click(
    [...a.d.querySelectorAll("#context-menu button")].find((b) =>
      b.textContent.includes("SVG"),
    ),
  );
  const text = await a.readBlob(a.downloads.at(-1).blob);
  const exported = new a.w.DOMParser().parseFromString(text, "image/svg+xml");
  assert.equal(exported.querySelector("parsererror"), null);
  assert.ok(exported.querySelector(".state-name tspan"));
  assert.ok(exported.querySelector(".label-leader"));
  const height = Number(exported.documentElement.getAttribute("height"));
  for (const label of exported.querySelectorAll(
    ".edge-label:not([display='none'])",
  )) {
    const b = JSON.parse(label.getAttribute("data-label-box"));
    assert.ok(b.y + b.height <= height);
  }
  assert.deepEqual(a.savedDoc(), before);
  checkLabels(a);
});
