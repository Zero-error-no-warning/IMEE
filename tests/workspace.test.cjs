const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  W = require("../js/workspace"),
  A = require("../js/authoring");
function storage() {
  const m = new Map();
  return { getItem: (k) => m.get(k) || null, setItem: (k, v) => m.set(k, v) };
}
test("documents and checkpoints survive restart", () => {
  const s = storage(),
    w = W.create(s),
    a = w.add(A.empty("A"));
  w.checkpoint("first", A.empty("A"));
  w.add(A.empty("B"));
  assert.equal(w.list().length, 2);
  w.activate(a);
  const next = W.create(s);
  assert.equal(next.current().title, "A");
  assert.equal(next.current().checkpoints.length, 1);
  assert.equal(next.restore(next.current().checkpoints[0].id).title, "A");
});
test("checkpoints retain twenty versions; the active document cannot be deleted", () => {
  const w = W.create(storage()),
    a = w.add(A.empty("A")),
    b = w.add(A.empty("B"));
  for (let i = 0; i < 25; i++) w.checkpoint("v" + i, A.empty("B"));
  assert.equal(w.current().checkpoints.length, 20);
  assert.throws(() => w.remove(b));
  w.remove(a);
  assert.equal(w.list().length, 1);
});
test("storage failures surface and preserve active selection", () => {
  const s = storage(),
    w = W.create(s),
    id = w.add(A.empty("A"));
  s.setItem = () => {
    throw Error("quota");
  };
  assert.throws(() => w.add(A.empty("B")), /quota/);
  assert.equal(w.active(), id);
});
test("checkpoint document and history are persisted together in one write", () => {
  const s = storage(),
    w = W.create(s);
  w.add(A.empty("A"));
  let writes = 0;
  const save = s.setItem;
  s.setItem = (k, v) => {
    writes++;
    save(k, v);
  };
  w.checkpoint("changed", A.empty("Changed"));
  assert.equal(writes, 1);
  assert.equal(W.create(s).current().title, "Changed");
  const previous = w.current();
  s.setItem = () => {
    throw Error("quota");
  };
  assert.throws(() => w.checkpoint("failed", A.empty("Lost")), /quota/);
  assert.deepEqual(w.current(), previous);
  assert.deepEqual(W.create(s).current(), previous);
});
