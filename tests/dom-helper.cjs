"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM, VirtualConsole } = require("jsdom");
const root = path.join(__dirname, "..");
async function openApp(saved) {
  const errors = [],
    downloads = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => errors.push(e.message));
  const html = fs
    .readFileSync(path.join(root, "index.html"), "utf8")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");
  const dom = new JSDOM(html, {
    url: "https://imee.test/",
    runScripts: "outside-only",
    pretendToBeVisual: true,
    virtualConsole: vc,
  });
  const w = dom.window,
    d = w.document;
  w.HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  w.HTMLElement.prototype.scrollTo = function ({ left = 0, top = 0 }) {
    this.scrollLeft = left;
    this.scrollTop = top;
    this.dispatchEvent(new w.Event("scroll"));
  };
  Object.defineProperty(w, "innerWidth", { value: 1440 });
  const scroll = d.querySelector("#canvas-scroll");
  Object.defineProperty(scroll, "clientWidth", {
    value: 1050,
    configurable: true,
  });
  Object.defineProperty(scroll, "clientHeight", { value: 700 });
  d.querySelector("#timeline").getBoundingClientRect = () => ({
    left: -scroll.scrollLeft,
    top: -scroll.scrollTop,
    width: 1050,
    height: 700,
  });
  let blob;
  w.URL.createObjectURL = (b) => {
    blob = b;
    return "blob:test";
  };
  w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function () {
    downloads.push({ name: this.download, blob });
  };
  if (saved) w.localStorage.setItem("imee.document.v1", JSON.stringify(saved));
  for (const file of ["model.js", "sample.js", "app.js"])
    w.eval(fs.readFileSync(path.join(root, "js", file), "utf8"));
  await new Promise((resolve) => w.requestAnimationFrame(resolve));
  const $ = (s) => d.querySelector(s);
  const event = (el, type, options = {}) =>
    el.dispatchEvent(
      new w.MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        button: 0,
        ...options,
      }),
    );
  const click = (el) => {
    if (typeof el === "string") el = $(el);
    event(el, "pointerdown");
    event(el, "pointerup");
    event(el, "click");
  };
  const submit = () =>
    $("#editor-form").dispatchEvent(
      new w.Event("submit", { bubbles: true, cancelable: true }),
    );
  const fill = (name, value) => {
    $(`[name="${name}"]`).value = String(value);
  };
  const key = (key, options = {}) =>
    scroll.dispatchEvent(
      new w.KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
        ...options,
      }),
    );
  const savedDoc = () => JSON.parse(w.localStorage.getItem("imee.document.v1"));
  const readBlob = (b) =>
    new Promise((resolve) => {
      const reader = new w.FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsText(b);
    });
  return {
    w,
    d,
    $,
    event,
    click,
    submit,
    fill,
    key,
    savedDoc,
    errors,
    downloads,
    readBlob,
    close: () => w.close(),
  };
}
module.exports = { openApp };
