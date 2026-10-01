/* Visible authoring workflows layered over the v3 editor. */
(function (root) {
  "use strict";
  function controller(api) {
    const {
      getDocument: doc,
      change,
      applyEdit,
      dialog,
      field,
      choices,
      select,
      selected,
      edit,
      beginConnection,
      addActor,
      navigate,
      workspace,
      loadDocument,
      getImport,
      repairImport,
      toast,
    } = api;
    const M = root.ME,
      A = root.MEAuthoring,
      R = root.MERender,
      esc = R.esc,
      $ = (s) => document.querySelector(s);
    const unit = () =>
      ({ seconds: "秒", minutes: "分", hours: "時間" })[doc().time.unit];
    const checked = (name, label, value = false) =>
      `<label class="simulation-check"><input type="checkbox" name="${name}" ${value ? "checked" : ""}>${esc(label)}</label>`;
    const stateOptions = (actor) =>
      doc()
        .states.filter((s) => !actor || s.actorId === actor)
        .map((s) => [s.id, A.label(doc(), "state", s.id)]);
    function preview(operation) {
      const holder = document.createElement("div");
      holder.className = "authoring-preview";
      holder.setAttribute("role", "status");
      $("#dialog-fields").append(holder);
      const update = () => {
        try {
          const before = M.clone(doc()),
            next = M.clone(before);
          operation(next, Object.fromEntries(new FormData($("#editor-form"))));
          const changes = A.changes(before, next);
          holder.innerHTML = `<strong>${changes.length ? `${changes.length}件の時間を更新` : "時間の変更なし"}</strong>${next.time.duration > before.time.duration ? `<p>全期間を ${next.time.duration} ${unit()}まで延長します。</p>` : ""}<ul>${changes
            .slice(0, 12)
            .map((c) => `<li>${esc(c.label)}：${c.from} → ${c.to}</li>`)
            .join(
              "",
            )}</ul><p class="muted">CDFの時間軸は自動変更しません。活動の基準時間とは別に確認してください。</p>`;
        } catch (e) {
          holder.innerHTML = `<p class="danger">${esc(e.message)}</p>`;
        }
      };
      $("#editor-form").oninput = update;
      $("#editor-form").onchange = update;
      update();
    }
    function activity(actorId, fromStateId, start = 0) {
      const selection = selected(),
        s = fromStateId
          ? M.get(doc(), "state", fromStateId)
          : selection?.type === "state"
            ? M.get(doc(), "state", selection.id)
            : null;
      actorId =
        s?.actorId ||
        actorId ||
        (selection?.type === "actor"
          ? selection.id
          : doc().actors.find((a) => !a.isGroup)?.id);
      if (!actorId) {
        toast("まず登場主体を追加してください。");
        addActor();
        return;
      }
      dialog(
        "活動を追加",
        choices(
          "actorId",
          "登場主体",
          doc().actors.map((a) => [a.id, a.name]),
          actorId,
        ) +
          choices(
            "fromStateId",
            "開始条件・State",
            [["", "新しい開始Stateを作る"], ...stateOptions(actorId)],
            s?.id || "",
          ) +
          field(
            "start",
            "開始時刻 (" + unit() + ")",
            s?.time ?? start,
            "number",
          ) +
          field("label", "活動名", "") +
          field("duration", "所要時間 (" + unit() + ")", 10, "number") +
          field("result", "到達する状態・成果", "") +
          '<p class="muted">開始条件・活動・到達Stateをまとめて作成します。名前は例として「捜索」「探知成立」のように入力します。</p>',
        (v) =>
          applyEdit((d) =>
            A.activity(d, { ...v, start: +v.start, duration: +v.duration }),
          ),
      );
      const f = $("#editor-form"),
        sync = () => {
          const actor = f.elements.actorId.value,
            previous = f.elements.fromStateId.value;
          f.elements.fromStateId.innerHTML = [
            ["", "新しい開始Stateを作る"],
            ...stateOptions(actor),
          ]
            .map(
              ([id, name]) =>
                `<option value="${esc(id)}">${esc(name)}</option>`,
            )
            .join("");
          if (stateOptions(actor).some(([id]) => id === previous))
            f.elements.fromStateId.value = previous;
          syncStart();
        };
      function syncStart() {
        const source = M.get(doc(), "state", f.elements.fromStateId.value);
        f.elements.start.disabled = !!source;
        if (source) f.elements.start.value = source.time;
      }
      f.elements.actorId.onchange = sync;
      f.elements.fromStateId.onchange = syncStart;
      syncStart();
      f.elements.label.required = f.elements.result.required = true;
      f.elements.label.placeholder = "例：捜索";
      f.elements.result.placeholder = "例：探知成立";
      f.elements.label.focus();
    }
    function split(taskId, time) {
      const t = M.get(doc(), "task", taskId),
        w = M.taskWindow(doc(), t);
      dialog(
        "途中の成果を追加",
        field(
          "time",
          "成果が成立する基準時刻",
          time ?? (w.start + w.end) / 2,
          "number",
        ) +
          field("name", "成果State名", "") +
          checked(
            "resetCDF",
            "固定時間に戻して分割（両方の活動にCDFを再設定する）",
          ) +
          `<p class="muted">${esc(t.label)}を二つの活動へ分割します。技術と中止条件は引き継ぎます。固定時間の品質保持率は前半に引き継ぎ、後半を1にして二重の劣化を避けます。途中の品質は分割後に見直してください。既存CDFを二つに配分する根拠はないため、CDF付き活動では再設定が必要です。</p>`,
        (v) =>
          applyEdit((d) => A.split(d, taskId, +v.time, v.name, !!v.resetCDF)),
      );
      $("#editor-form").elements.name.required = true;
    }
    function branch(taskId, context = {}, connection) {
      const t = M.get(doc(), "task", taskId),
        w = M.taskWindow(doc(), t),
        actorId = M.get(doc(), "state", t.fromStateId).actorId,
        time = Math.max(
          w.start,
          connection ? M.get(doc(), "state", connection.id).time : 0,
          Math.min(w.end, context.time ?? w.end),
        );
      dialog(
        connection ? "作用を受ける分岐を作成" : "分岐を追加",
        `<p>${esc(A.label(doc(), "task", taskId))}</p>` +
          choices(
            "mode",
            "結果を変える方式",
            [
              ["probability", "確率で分かれる"],
              ["effect", "外部の作用で変わる"],
              ["display", "図示だけ（実行前に方式の設定が必要）"],
            ],
            connection ? "effect" : "probability",
          ) +
          field("time", "分岐する基準時刻", time, "number") +
          field("label", "結果ラベル", "別の結果") +
          choices(
            "toStateId",
            "到達先",
            [
              ["", "新しい結果Stateを作る"],
              ...stateOptions(actorId).filter(([id]) => id !== t.fromStateId),
            ],
            "",
          ) +
          field("name", "新規結果State名", "") +
          field("stateTime", "結果が成立する時刻", time, "number") +
          field("probability", "選択確率 (0〜1)", 0.5, "number") +
          field("delay", "結果到達までの時間", 0, "number") +
          (connection
            ? field("causalLabel", "作用の名前", "作用") +
              checked("causalEnabled", "シミュレーションで実行する", true)
            : "") +
          '<p id="branch-remainder" role="status"></p>',
        (v) =>
          applyEdit((d) => {
            const tt = M.get(d, "task", taskId),
              bt = +v.time;
            let sid = v.toStateId;
            if (!sid) {
              if (!v.name.trim())
                throw Error("結果State名を入力してください。");
              sid = M.id("state");
              d.states.push({
                id: sid,
                actorId,
                name: v.name,
                time: +v.stateTime,
              });
            }
            if (+v.delay < 0) throw Error("遅延は0以上にしてください。");
            const target = M.get(d, "state", sid);
            target.time = bt + +v.delay;
            let j = tt.junctions?.find((j) => j.time === bt);
            if (!j) {
              j = { id: M.id("junction"), time: bt, outcomes: [] };
              (tt.junctions ??= []).push(j);
            }
            if (j.outcomes.some((o) => o.toStateId === sid))
              throw Error("この分岐には同じ到達先が既にあります。");
            j.outcomes.push({
              label: v.label,
              toStateId: sid,
              delay: +v.delay,
              ...(v.mode === "probability"
                ? { probability: +v.probability }
                : {}),
            });
            if (v.mode === "display") delete j.simulation;
            else j.simulation = { mode: v.mode };
            if (
              v.mode === "probability" &&
              j.outcomes.some((o) => o.probability === undefined)
            )
              throw Error(
                "既存の結果にも確率を設定してから、確率分岐へ変更してください。",
              );
            if (connection) {
              const from = M.get(d, "state", connection.id);
              if (from.time < M.nominalStart(d, tt))
                throw Error(
                  "作用元が対象活動の開始前です。発生条件の時刻を確認してください。",
                );
              const duration = bt - from.time;
              if (duration < 0)
                throw Error("分岐時刻は作用元以降にしてください。");
              d.causalLinks.push({
                id: M.id("cause"),
                label: v.causalLabel,
                source: { type: "state", id: from.id },
                target: {
                  type: "junction",
                  id: j.id,
                  taskId,
                  outcomeStateId: sid,
                },
                propagation: { duration },
                simulation: { enabled: !!v.causalEnabled },
              });
            }
            A.reconcile(d, doc());
            return { type: "task", id: taskId };
          }),
      );
      const f = $("#editor-form");
      f.elements.time.readOnly = !!context.fixedTime;
      const update = () => {
        const existing = t.junctions?.find(
            (j) => j.time === +f.elements.time.value,
          ),
          sum =
            (existing?.outcomes || []).reduce(
              (v, o) => v + (o.probability || 0),
              0,
            ) + (+f.elements.probability.value || 0),
          isProbability = f.elements.mode.value === "probability";
        f.elements.probability.closest(".field").hidden = !isProbability;
        f.elements.probability.disabled = !isProbability;
        const newState = !f.elements.toStateId.value;
        f.elements.name.closest(".field").hidden = f.elements.stateTime.closest(
          ".field",
        ).hidden = !newState;
        f.elements.stateTime.readOnly = true;
        f.elements.stateTime.value =
          +f.elements.time.value + +f.elements.delay.value;
        $("#branch-remainder").textContent = isProbability
          ? `通常継続：${((1 - sum) * 100).toFixed(1)}% / 分岐合計：${(sum * 100).toFixed(1)}%`
          : "作用が届かなければ通常経路を継続します。";
        $("#branch-remainder").className =
          sum > 1 && isProbability ? "danger" : "muted";
      };
      f.oninput = update;
      f.onchange = update;
      update();
      f.elements.name.placeholder = "例：識別失敗";
    }
    function newDocument() {
      dialog(
        "新しいシナリオ",
        field("title", "タイトル", "新しいシナリオ") +
          choices(
            "unit",
            "時間単位",
            [
              ["seconds", "秒"],
              ["minutes", "分"],
              ["hours", "時間"],
            ],
            "minutes",
          ) +
          field("duration", "全期間", 60, "number"),
        (v) => {
          const d = A.empty(v.title, v.unit, +v.duration);
          M.validate(d);
          workspace.add(d);
          loadDocument(d);
        },
      );
    }
    function documents() {
      const entries = workspace.list(),
        active = workspace.active(),
        points = workspace.current()?.checkpoints || [];
      dialog(
        "文書と保存時点",
        `<div class="workspace-actions"><button type="button" id="workspace-copy">現在の文書を別案として複製</button><button type="button" id="workspace-checkpoint">保存時点を作成</button></div><div class="workspace-list">${entries.map((x) => `<article><strong>${esc(x.title)}</strong><small>${esc(x.updatedAt?.replace("T", " ").slice(0, 16) || "")} ${x.id === active ? "・編集中" : ""}</small><button type="button" data-document-open="${esc(x.id)}">開く</button>${x.id !== active ? `<button type="button" data-document-delete="${esc(x.id)}">削除</button>` : ""}</article>`).join("")}</div><h3>現在の文書の保存時点</h3><div class="workspace-list">${points.map((x) => `<article><strong>${esc(x.name)}</strong><small>${esc(x.date.replace("T", " ").slice(0, 16))}</small><button type="button" data-checkpoint-restore="${esc(x.id)}">復元</button></article>`).join("") || "<p>保存時点はまだありません。</p>"}</div>`,
        () => {},
      );
      $("#workspace-copy").onclick = () => {
        try {
          const d = M.clone(doc());
          d.title += "（別案）";
          workspace.add(d);
          loadDocument(d);
          $("#editor-dialog").close();
        } catch (error) {
          $("#dialog-error").textContent =
            "別案を保存できません：" + error.message;
        }
      };
      $("#workspace-checkpoint").onclick = checkpoint;
      $("#dialog-fields").onclick = (e) => {
        const open = e.target.closest("[data-document-open]"),
          remove = e.target.closest("[data-document-delete]"),
          restore = e.target.closest("[data-checkpoint-restore]");
        if (open) {
          try {
            const d = workspace.activate(open.dataset.documentOpen);
            loadDocument(d);
            $("#editor-dialog").close();
          } catch (err) {
            toast(err.message);
          }
        }
        if (remove) {
          const id = remove.dataset.documentDelete;
          dialog(
            "文書を削除",
            "<p>この文書と保存時点をブラウザから削除します。JSON書き出し済みのファイルは残ります。</p>",
            () => {
              workspace.remove(id);
              setTimeout(documents, 0);
            },
          );
        }
        if (restore) {
          const next = workspace.restore(restore.dataset.checkpointRestore);
          dialog(
            "保存時点へ戻る",
            "<p>現在の内容を自動で保存時点に残してから復元します。</p>",
            () => {
              workspace.checkpoint("復元前", doc());
              loadDocument(next);
            },
          );
        }
      };
    }
    function checkpoint() {
      dialog(
        "保存時点を作成",
        field("name", "名前", "検討案 " + new Date().toLocaleString("ja-JP")) +
          "<p>再読込後も復元できます。保存時点は文書ごとに最新20件を保持します。</p>",
        (v) => {
          workspace.checkpoint(v.name, doc());
          toast("保存時点を作成しました。");
        },
      );
    }
    function goals(id) {
      change((d) => {
        d.simulation ??= {
          successStateIds: [],
          successMode: "all",
          iterations: 1000,
          seed: 1,
        };
        const ids = d.simulation.successStateIds;
        d.simulation.successStateIds = ids.includes(id)
          ? ids.filter((x) => x !== id)
          : [...ids, id];
      });
    }
    function issues() {
      const imported = getImport(),
        list = imported
          ? imported.errors.map((e) => ({
              severity: "error",
              message: e.message,
              path: e.path,
              fragment: e.fragment,
            }))
          : A.issues(doc());
      dialog(
        imported ? "読み込み診断" : "実行準備・問題一覧",
        `<p>${imported ? "元JSONを保持して診断しています。" : "構造が完成していても、実行設定が未完了の項目があります。説明用の線は意図した設定ならそのままで構いません。"}</p>${list.map((x, i) => `<article class="issue ${esc(x.severity)}"><strong>${x.severity === "error" ? "要設定" : x.severity === "warning" ? "確認" : "案内"}</strong><p>${esc(x.message)}</p>${x.target ? `<button type="button" data-issue-target="${i}">図で確認</button><button type="button" data-issue-edit="${i}">設定する</button>` : ""}${x.path ? `<details><summary>詳細</summary><pre>${esc(x.path + "\n" + JSON.stringify(x.fragment, null, 2))}</pre></details>` : ""}</article>`).join("") || "<p>実行に必要な設定は揃っています。</p>"}${imported ? '<button type="button" id="repair-times">時刻の整合を修正する案を確認</button>' : ""}`,
        () => {},
      );
      $("#dialog-fields").onclick = (e) => {
        const target = e.target.closest("[data-issue-target]"),
          editButton = e.target.closest("[data-issue-edit]");
        if (target || editButton) {
          const x =
            list[
              +(target?.dataset.issueTarget ?? editButton.dataset.issueEdit)
            ];
          $("#editor-dialog").close();
          navigate(x.target);
          if (editButton) edit(x.target);
        }
      };
      if (imported)
        $("#repair-times").onclick = () => {
          try {
            const proposal = A.repairTimes(imported.original);
            dialog(
              "時刻修正の確認",
              `<p>元JSONは修正前の保存時点に残します。</p><ul>${proposal.changes.map((c) => `<li>${esc(c.label)}：${c.from} → ${c.to}</li>`).join("")}</ul>`,
              () => repairImport(proposal.document),
            );
          } catch (e) {
            $("#dialog-error").textContent =
              "時刻だけでは修正できません：" + e.message;
          }
        };
    }
    function neighbor(direction) {
      const s = selected();
      if (!s) return;
      let state =
        s.type === "state"
          ? M.get(doc(), "state", s.id)
          : s.type === "task"
            ? M.get(
                doc(),
                "state",
                M.get(doc(), "task", s.id)[
                  direction > 0 ? "toStateId" : "fromStateId"
                ],
              )
            : null;
      if (!state) return;
      const list = doc()
        .states.filter((x) => x.actorId === state.actorId)
        .sort((a, b) => a.time - b.time);
      const next =
        s.type === "task"
          ? state
          : list[list.findIndex((x) => x.id === state.id) + direction];
      if (next) navigate({ type: "state", id: next.id });
    }
    function related(s) {
      const d = doc(),
        ids = [];
      if (s.type === "state") {
        for (const c of d.causalLinks) {
          if (c.source.id === s.id)
            ids.push({
              type: c.target.type === "state" ? "state" : "task",
              id: c.target.type === "state" ? c.target.id : c.target.taskId,
              label: "作用先",
            });
          if (c.target.id === s.id)
            ids.push({ type: "state", id: c.source.id, label: "入力元" });
        }
        for (const t of d.tasks) {
          if (t.fromStateId === s.id && t.toStateId)
            ids.push({ type: "state", id: t.toStateId, label: "次の到達" });
          if (t.toStateId === s.id)
            ids.push({ type: "state", id: t.fromStateId, label: "前の条件" });
        }
      }
      if (s.type === "task") {
        const t = M.get(d, "task", s.id);
        ids.push({ type: "state", id: t.fromStateId, label: "開始条件" });
        if (t.toStateId)
          ids.push({ type: "state", id: t.toStateId, label: "到達先" });
        for (const id of t.simulation?.waitForStateIds || [])
          ids.push({ type: "state", id, label: "追加開始条件" });
        for (const id of t.simulation?.qInput?.stateIds || [])
          ids.push({ type: "state", id, label: "品質入力" });
        for (const id of t.simulation?.cancelOnStateIds || [])
          ids.push({ type: "state", id, label: "中止条件" });
      }
      return ids;
    }
    function quickInspector() {
      const s = selected(),
        x = s && M.get(doc(), s.type, s.id),
        panel = $("#inspector");
      if (!x) return;
      const section = document.createElement("section");
      section.className = "quick-editor";
      section.innerHTML = "<h3>作成・調整</h3>";
      const action = (text, fn) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = text;
        b.onclick = fn;
        section.append(b);
      };
      if (s.type === "state") {
        action("次の活動を追加", () => activity(x.actorId, x.id));
        action(
          doc().simulation?.successStateIds?.includes(x.id)
            ? "達成目標を解除"
            : "達成目標にする",
          () => goals(x.id),
        );
      }
      if (s.type === "task") action("途中の成果を追加", () => split(x.id));
      const html =
        field("quickName", "名前", x.name || x.label) +
        (s.type === "state"
          ? field("quickTime", "基準時刻", x.time, "number") +
            choices(
              "quickPolicy",
              "後続の扱い",
              [
                ["follow", "後続の所要時間を保って移動"],
                ["keep", "後続の基準時刻を維持"],
              ],
              "follow",
            ) +
            choices(
              "quickJoin",
              "成立条件",
              [
                ["all", "全入力を待つ (AND)"],
                ["any", "最初の入力で成立 (OR)"],
              ],
              x.simulation?.join || "all",
            )
          : s.type === "task"
            ? field(
                "quickDuration",
                "基準所要時間",
                M.taskWindow(doc(), x).end - M.taskWindow(doc(), x).start,
                "number",
              )
            : s.type === "causalLink"
              ? field(
                  "quickDelay",
                  "基準伝搬時間",
                  x.propagation.duration,
                  "number",
                ) +
                checked("quickEnabled", "実行する作用", !!x.simulation?.enabled)
              : "");
      const form = document.createElement("form");
      form.innerHTML =
        html + '<button class="primary">変更の影響を確認</button>';
      form.onsubmit = (e) => {
        e.preventDefault();
        const v = Object.fromEntries(new FormData(form));
        const operation = (d) => {
          const xx = M.get(d, s.type, s.id);
          if ("name" in xx) xx.name = v.quickName;
          else xx.label = v.quickName;
          if (s.type === "state") {
            if (+v.quickTime !== xx.time)
              A.moveState(d, x.id, +v.quickTime, v.quickPolicy);
            const oldJoin = xx.simulation?.join || "all",
              before = M.clone(d);
            xx.simulation = { ...xx.simulation, join: v.quickJoin };
            if (oldJoin !== v.quickJoin) A.reconcile(d, before);
          }
          if (
            s.type === "task" &&
            +v.quickDuration !==
              M.taskWindow(d, xx).end - M.taskWindow(d, xx).start
          )
            A.resizeActivity(d, x.id, +v.quickDuration);
          if (s.type === "causalLink") {
            xx.simulation = { ...xx.simulation, enabled: !!v.quickEnabled };
            if (+v.quickDelay !== xx.propagation.duration)
              A.propagation(d, x.id, +v.quickDelay);
          }
        };
        try {
          const next = M.clone(doc());
          operation(next);
          dialog(
            "変更内容を確認",
            `<ul>${A.changes(doc(), next)
              .map((c) => `<li>${esc(c.label)}：${c.from} → ${c.to}</li>`)
              .join(
                "",
              )}</ul><p>名前・実行条件の変更も適用します。CDFは現在の設定を保持します。</p>`,
            () => applyEdit(operation),
          );
        } catch (err) {
          toast(err.message);
        }
      };
      section.append(form);
      for (const t of related(s))
        action(t.label + "：" + A.label(doc(), t.type, t.id), () =>
          navigate(t),
        );
      if (
        s.type === "state" &&
        doc().states.filter((st) => st.actorId === x.actorId).length > 1
      ) {
        action("前のState", () => neighbor(-1));
        action("次のState", () => neighbor(1));
      }
      panel.append(section);
    }
    function overview(g) {
      const panel = $("#overview-panel");
      if (panel.hidden) return;
      const width = 230,
        height = 100,
        scale = (width - 16) / doc().time.duration,
        y = (id) =>
          8 +
          ((Math.max(
            0,
            g.rows.findIndex((r) => r.actor.id === M.visibleActor(doc(), id)),
          ) +
            0.5) *
            (height - 16)) /
            Math.max(1, g.rows.length);
      const range = doc().views.main.visibleTimeRange;
      panel.innerHTML = `<strong>全体概観</strong><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="クリックした時刻へ移動"><rect x="${8 + range.start * scale}" y="0" width="${(range.end - range.start) * scale}" height="${height}" fill="#cce7e4"/>${doc()
        .states.map(
          (s) =>
            `<circle cx="${8 + s.time * scale}" cy="${y(s.actorId)}" r="2.5" fill="${M.actorColor(doc(), M.get(doc(), "actor", s.actorId))}"/>`,
        )
        .join("")}</svg>`;
      panel.querySelector("svg").onclick = (e) => {
        const box = e.currentTarget.getBoundingClientRect(),
          time = (((e.clientX - box.left) / box.width) * width - 8) / scale;
        api.pan(time);
      };
    }
    function render(g) {
      const imported = getImport(),
        problems = imported ? imported.errors : A.issues(doc()),
        blocking = problems.filter(
          (x) => x.severity === "error" || imported,
        ).length;
      $("#issues-btn").textContent = imported
        ? `読み込み診断 ${blocking}件`
        : blocking
          ? `実行準備：要設定 ${blocking}件`
          : "実行準備 OK";
      const steps = [
        ["登場主体", doc().actors.length],
        ["活動", doc().tasks.length],
        ["相互作用", doc().causalLinks.length],
        ["達成目標", doc().simulation?.successStateIds?.length],
      ];
      $("#creation-guide").innerHTML =
        steps
          .map(
            ([name, n], i) =>
              `<button type="button" data-guide="${i}" class="${n ? "complete" : ""}">${n ? "✓" : i + 1} ${name}</button>`,
          )
          .join("") +
        '<button type="button" data-guide="tutorial">練習する</button>';
      $("#creation-guide").onclick = (e) => {
        const b = e.target.closest("[data-guide]");
        if (!b) return;
        switch (b.dataset.guide) {
          case "0":
            addActor();
            break;
          case "1":
            activity();
            break;
          case "2":
            toast(
              "Stateの右側にある＋接続ボタンから、別の登場主体へ線を結びます。",
            );
            break;
          case "3":
            toast(
              "到達したいStateを選び、詳細パネルの「達成目標にする」を押してください。",
            );
            break;
          default:
            tutorial();
        }
      };
      for (const id of ["add-activity", "connect-btn", "branch-btn"])
        $("#" + id).disabled =
          !!imported ||
          (id === "connect-btn" && selected()?.type !== "state") ||
          (id === "branch-btn" && selected()?.type !== "task");
      if (!imported) {
        quickInspector();
        const svg = $("#timeline");
        const actors = g.rows
          .map(
            (r) =>
              `<g class="authoring-handle" data-add-activity="${esc(r.actor.id)}" role="button" tabindex="0" aria-label="${esc(r.actor.name)}に活動を追加"><rect x="${g.vp.left - 34}" y="${r.y + 5}" width="24" height="22" rx="4" fill="white" stroke="#c5d8dc"/><text x="${g.vp.left - 22}" y="${r.y + 20}" text-anchor="middle">＋</text></g>`,
          )
          .join("");
        const s = selected(),
          point = s?.type === "state" ? g.states.get(s.id) : null;
        const handles = point
          ? `<g class="authoring-handle" data-connect-state="${esc(s.id)}" role="button" tabindex="0" aria-label="ここから接続"><rect x="${point.x + 12}" y="${point.y - 28}" width="54" height="20" rx="4" fill="#087f80"/><text x="${point.x + 39}" y="${point.y - 14}" text-anchor="middle" fill="white">＋接続</text></g>`
          : "";
        svg.insertAdjacentHTML("beforeend", actors + handles);
        if (s?.type === "task" || s?.type === "state") drawDependencies(g, s);
      }
      overview(g);
    }
    function drawDependencies(g, s) {
      const ids = related(s).filter((t) =>
        ["追加開始条件", "品質入力", "中止条件"].includes(t.label),
      );
      if (s.type === "state")
        for (const c of doc().causalLinks.filter(
          (c) => c.source.id === s.id && c.target.type === "junction",
        )) {
          const task = M.get(doc(), "task", c.target.taskId);
          for (const id of M.startStateIds(task))
            ids.push({ type: "state", id, label: "対象活動の開始を待つ" });
        }
      const target =
        s.type === "state"
          ? g.states.get(s.id)
          : g.states.get(M.get(doc(), "task", s.id).fromStateId);
      if (!target) return;
      $("#timeline").insertAdjacentHTML(
        "beforeend",
        ids
          .map((t) => {
            const p = g.states.get(t.id);
            if (!p) return "";
            const color = t.label === "中止条件" ? "#b42318" : "#8061a8";
            return `<g class="authoring-dependency" pointer-events="none"><title>${esc(t.label)}：${esc(A.label(doc(), "state", t.id))}</title><path d="M${p.x},${p.y} L${target.x},${target.y}" fill="none" stroke="${color}" stroke-width="2" stroke-dasharray="6 4"/><circle cx="${p.x}" cy="${p.y}" r="12" fill="none" stroke="${color}"/><text x="${(p.x + target.x) / 2}" y="${(p.y + target.y) / 2 - 6}" fill="${color}" font-size="10">${esc(t.label)}</text></g>`;
          })
          .join(""),
      );
    }
    let tutorialStep = 0;
    function tutorial() {
      const text = [
        "登場主体を追加します。「＋ 登場主体」で名前を入力してください。",
        "Actor行の＋から活動を追加します。活動名・所要時間・成果を入力してください。",
        "成果Stateを選び、「＋接続」で別のActorへ情報を伝えます。",
        "活動を選んで「分岐」を追加し、結果と確率を設定してください。",
        "達成したいStateを目標に指定して、「実行準備」を確認します。",
      ];
      dialog(
        "作成練習 " + (tutorialStep + 1) + "/5",
        `<p>${text[tutorialStep]}</p><p class="muted">現在の文書を使って練習できます。空の文書が必要な場合は「新規」から開始してください。</p>`,
        () => {
          tutorialStep = (tutorialStep + 1) % text.length;
          toast("操作後、「練習する」で次の案内へ進めます。");
        },
      );
    }
    $("#new-document").onclick = newDocument;
    $("#documents-btn").onclick = documents;
    $("#checkpoint-btn").onclick = checkpoint;
    $("#issues-btn").onclick = issues;
    $("#add-activity").onclick = () => activity();
    $("#connect-btn").onclick = () => beginConnection();
    $("#branch-btn").onclick = () => {
      const s = selected();
      if (s?.type === "task") branch(s.id);
    };
    $("#fit-selection").onclick = () => {
      const s = selected();
      if (s) navigate(s);
    };
    $("#overview-btn").onclick = () => {
      $("#overview-panel").hidden = !$("#overview-panel").hidden;
      $("#overview-btn").setAttribute(
        "aria-pressed",
        String(!$("#overview-panel").hidden),
      );
      api.render();
    };
    const svg = $("#timeline"),
      activate = (e) => {
        const actor = e.target.closest("[data-add-activity]"),
          connect = e.target.closest("[data-connect-state]");
        if (actor) {
          e.preventDefault();
          e.stopPropagation();
          activity(actor.dataset.addActivity);
        }
        if (connect) {
          e.preventDefault();
          e.stopPropagation();
          beginConnection({ type: "state", id: connect.dataset.connectState });
        }
      };
    svg.addEventListener("click", activate, true);
    svg.addEventListener(
      "keydown",
      (e) => {
        if (
          ["Enter", " "].includes(e.key) &&
          e.target.closest(".authoring-handle")
        )
          activate(e);
      },
      true,
    );
    return {
      activity,
      split,
      branch,
      newDocument,
      documents,
      checkpoint,
      issues,
      render,
      preview,
      goals,
      tutorial,
      neighbor,
    };
  }
  root.MEAuthoringUI = { controller };
})(globalThis);
