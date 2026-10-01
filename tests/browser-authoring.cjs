/* Optional real-browser workflow review: npm run test:browser (Playwright required). */
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http");
const { chromium } = require("playwright");
const root = path.join(__dirname, ".."),
  output = process.env.QA_OUTPUT_DIR || "/tmp/imee-ui-review";
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const server = http.createServer((req, res) => {
    const relative = decodeURIComponent((req.url || "/").split("?")[0]);
    const font = relative.startsWith("/qa-font/"),
      base = font ? process.env.QA_FONT_DIR : root;
    if (!base) {
      res.writeHead(404).end();
      return;
    }
    const file = path.resolve(
      base,
      font
        ? relative.slice(9)
        : relative === "/"
          ? "index.html"
          : "." + relative,
    );
    if (!file.startsWith(path.resolve(base) + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    try {
      res.setHeader(
        "Content-Type",
        file.endsWith(".js")
          ? "application/javascript"
          : file.endsWith(".css")
            ? "text/css"
            : file.endsWith(".woff2")
              ? "font/woff2"
              : "text/html",
      );
      res.end(fs.readFileSync(file));
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let browser;
  const errors = [];
  try {
    const args = process.env.CHROMIUM_ARGS_FILE
      ? JSON.parse(fs.readFileSync(process.env.CHROMIUM_ARGS_FILE, "utf8"))
      : ["--no-sandbox", "--disable-dev-shm-usage"];
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.CHROMIUM_EXECUTABLE,
      args,
    });
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://127.0.0.1:" + server.address().port);
    if (process.env.QA_FONT_DIR) {
      await page.addStyleTag({ url: "/qa-font/400.css" });
      await page.evaluate(() => document.fonts.ready);
    }
    const fill = (name, value) =>
      page.locator('#editor-form [name="' + name + '"]').fill(String(value));
    const submit = () =>
      page.locator('#editor-form button[type="submit"]').click();
    const document = () => page.evaluate(() => window.IMEE.getDocument());
    await page.screenshot({ path: path.join(output, "01-main.png") });
    await page.locator("#new-document").click();
    await fill("title", "作成フローの確認");
    await page.locator('[name="unit"]').selectOption("seconds");
    await fill("duration", 120);
    await submit();
    await page.locator("#add-actor").click();
    await fill("name", "センサー");
    await submit();
    await page.locator("#add-activity").click();
    await fill("label", "捜索");
    await fill("result", "探知成立");
    await fill("duration", 10);
    await submit();
    let d = await document();
    assert.equal(d.states.length, 2);
    assert.equal(d.tasks.length, 1);
    await page.evaluate(
      (id) => window.IMEE.select({ type: "state", id }),
      d.states[1].id,
    );
    await page
      .getByRole("button", { name: "次の活動を追加", exact: true })
      .click();
    await fill("label", "識別");
    await fill("result", "識別成立");
    await fill("duration", 8);
    await submit();
    d = await document();
    assert.equal(d.states.length, 3);
    assert.equal(d.tasks.length, 2);
    await page.evaluate(
      (id) => window.IMEE.select({ type: "state", id }),
      d.states[2].id,
    );
    await page
      .getByRole("button", { name: "達成目標にする", exact: true })
      .click();
    await page.locator("#checkpoint-btn").click();
    await fill("name", "比較の基準");
    await submit();
    await page.evaluate(
      (id) => window.IMEE.select({ type: "task", id }),
      d.tasks[1].id,
    );
    await page.locator("#branch-btn").click();
    await fill("name", "識別失敗");
    await fill("probability", 0.2);
    await submit();
    d = await document();
    assert.equal(d.tasks[1].junctions[0].simulation.mode, "probability");
    await page.screenshot({ path: path.join(output, "02-created.png") });
    await page
      .locator('.task-label[data-id="' + d.tasks[0].id + '"] text')
      .dblclick();
    await page.locator(".simulation-performance summary").first().click();
    await page.locator('[name="performanceType"]').selectOption("cdf");
    await page.locator("[data-cdf-quality]").click();
    assert.equal(await page.locator(".cdf-curve").count(), 2);
    await page.screenshot({ path: path.join(output, "03-performance.png") });
    const handle = page.locator('[data-cdf-handle="1:1"]');
    await handle.focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.locator('[name="curve-1-t-1"]').inputValue(), "11");
    await handle.scrollIntoViewIfNeeded();
    const box = await handle.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 - 24,
      box.y + box.height / 2 + 8,
      { steps: 3 },
    );
    await page.mouse.up();
    const draggedTime = +(await page
        .locator('[name="curve-1-t-1"]')
        .inputValue()),
      draggedP = +(await page.locator('[name="curve-1-p-1"]').inputValue());
    assert(draggedTime < 11 && draggedTime > 5);
    assert(draggedP < 0.8 && draggedP >= 0.2);
    const applyButton = await page
      .locator('#editor-form button[type="submit"]')
      .boundingBox();
    assert(applyButton.y >= 0 && applyButton.y + applyButton.height <= 900);
    await submit();
    await page.locator("#simulation-btn").click();
    await page.locator("#simulation-run").click();
    await page.waitForFunction(
      () => !document.querySelector("#simulation-export").disabled,
    );
    assert.equal(await page.locator("#simulation-error").textContent(), "");
    await page.screenshot({ path: path.join(output, "04-simulation.png") });
    await page.locator("#all-cdf-open").click();
    await page.locator('#all-cdf-form [name="iterations"]').fill("16");
    await page.locator('#all-cdf-form [name="steps"]').fill("3");
    await page.locator("#all-cdf-run").click();
    await page.waitForFunction(
      () => !document.querySelector("#all-cdf-export").disabled,
    );
    assert.equal(await page.locator("#all-cdf-map .cdf-map-marker").count(), 1);
    await page.screenshot({ path: path.join(output, "05-analysis.png") });
    await page.locator("[data-cdf-edit]").click();
    assert(await page.locator("#editor-dialog").isVisible());
    await page.locator("#dialog-cancel").click();
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.screenshot({ path: path.join(output, "06-compact.png") });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.setViewportSize({ width: 640, height: 800 });
    await page.screenshot({ path: path.join(output, "07-narrow.png") });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.setViewportSize({width:1440,height:1000});
    await page.evaluate(d=>window.IMEE.loadJSON(JSON.stringify(d)),require('../js/time-axis-sample')());
    if(await page.locator('#inspector').isVisible())await page.locator('#close-inspector').click();
    assert.equal(await page.locator('#timeline .fixed-time-node').count(),2);
    assert.equal(await page.locator('#timeline .axis-cdf').count(),2);
    assert(await page.evaluate(()=>[...document.querySelectorAll('#timeline .edge.task .hit')].every(p=>{
      const coords=p.getAttribute('d').match(/-?\d+(?:\.\d+)?/g).map(Number);
      return coords.length===4&&coords[1]===coords[3];
    })), 'the demo Tasks, including the CDF Task, must render as horizontal lines');
    await page.screenshot({path:path.join(output,'08-time-axis-config.png')});
    const cursor=await page.evaluate(()=>{const svg=document.querySelector('#timeline'),line=svg.querySelector('.cdf-axis'),b=line.getBBox(),m=svg.getScreenCTM();return {x:m.a*(b.x+b.width/2)+m.e,y:m.d*(b.y-20)+m.f};});
    await page.mouse.move(cursor.x,cursor.y);
    assert.equal(await page.locator('#axis-cdf-cursor').count(),1);
    const goal=page.locator('.state[data-id="decision"] .body');await goal.scrollIntoViewIfNeeded();
    const node=await goal.boundingBox(),delta=await page.evaluate(()=>{const svg=document.querySelector('#timeline'),m=svg.getScreenCTM();return 2*(+svg.getAttribute('width')-166-36)/40*m.a;});
    await page.mouse.move(node.x+node.width/2,node.y+node.height/2);await page.mouse.down();await page.mouse.move(node.x+node.width/2+delta,node.y+node.height/2,{steps:4});await page.mouse.up();
    const shifted=await document();assert.equal(shifted.states.find(s=>s.id==='decision').timing.at,32);assert.equal(shifted.tasks[1].timing.duration,6);
    await page.locator('#simulation-btn').click();await page.locator('#simulation-run').click();await page.waitForFunction(()=>!document.querySelector('#simulation-export').disabled);await page.locator('#simulation-close').click();
    await page.locator('#axis-cdf-mode').selectOption('results');
    assert.equal(await page.locator('#timeline .axis-cdf[data-cdf-kind="results"]').count(),7);
    assert(await page.locator('#axis-cdf-q').isDisabled());
    if(await page.locator('#inspector').isVisible())await page.locator('#close-inspector').click();
    await page.screenshot({path:path.join(output,'09-time-axis-results.png')});
    await page.setViewportSize({width:640,height:800});
    await page.screenshot({path:path.join(output,'10-time-axis-narrow.png')});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.deepEqual(errors, []);
    console.log("Browser authoring workflow passed; screenshots: " + output);
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
