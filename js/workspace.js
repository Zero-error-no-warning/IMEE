/* Local documents and durable checkpoints, independent of undo history. */
(function (root) {
  "use strict";
  const M =
    typeof module !== "undefined" && module.exports
      ? require("./model")
      : root.ME;
  const KEY = "imee.workspace.v1";
  function create(storage) {
    let data = { version: 1, activeId: null, documents: [] };
    try {
      const saved = JSON.parse(storage.getItem(KEY));
      if (saved?.version === 1 && Array.isArray(saved.documents)) data = saved;
    } catch (_) {}
    const save = () => storage.setItem(KEY, JSON.stringify(data));
    function transaction(fn) {
      const before = M.clone(data);
      try {
        const result = fn();
        save();
        return result;
      } catch (e) {
        data = before;
        throw e;
      }
    }
    const current = () => data.documents.find((x) => x.id === data.activeId);
    function updateDocument(document) {
      let x = current();
      if (!x) {
        x = { id: M.id("document"), checkpoints: [] };
        data.documents.push(x);
        data.activeId = x.id;
      }
      x.document = M.clone(document);
      x.title = document.title;
      x.updatedAt = new Date().toISOString();
      return x.id;
    }
    function update(document) {
      return transaction(() => updateDocument(document));
    }
    function add(document) {
      const old = data.activeId;
      data.activeId = null;
      try {
        return update(document);
      } catch (e) {
        data.activeId = old;
        throw e;
      }
    }
    function activate(id) {
      return transaction(() => {
        const x = data.documents.find((x) => x.id === id);
        if (!x) throw new Error("文書が見つかりません。");
        data.activeId = id;
        return M.clone(x.document);
      });
    }
    function checkpoint(name, document) {
      return transaction(() => {
        updateDocument(document);
        const x = current();
        x.checkpoints.unshift({
          id: M.id("checkpoint"),
          name,
          date: new Date().toISOString(),
          document: M.clone(document),
        });
        x.checkpoints = x.checkpoints.slice(0, 20);
      });
    }
    function restore(id) {
      const x = current()?.checkpoints.find((x) => x.id === id);
      if (!x) throw new Error("保存時点が見つかりません。");
      return M.clone(x.document);
    }
    function remove(id) {
      return transaction(() => {
        if (id === data.activeId)
          throw new Error(
            "開いている文書は削除できません。別の文書を開いてから削除してください。",
          );
        data.documents = data.documents.filter((x) => x.id !== id);
      });
    }
    return {
      update,
      add,
      activate,
      checkpoint,
      restore,
      remove,
      list: () => M.clone(data.documents),
      active: () => data.activeId,
      current: () => M.clone(current() || null),
    };
  }
  const api = { create, KEY };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.MEWorkspace = api;
})(globalThis);
