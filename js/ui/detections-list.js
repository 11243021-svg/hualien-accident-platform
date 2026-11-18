// 最新偵測事件清單（交通警察隊）：由 heatmap 挑好要顯示的筆數，標出待補填與 AI 判斷狀態。
(function (root) {
  const UI = root.HotUI;
  UI.detList = {
    render(listEl, latest, onPick, emptyText) {
      const F = root.HotFilters;
      const D = root.HotDetections;
      listEl.replaceChildren();
      if (!latest.length) {
        listEl.append(UI.el("li", "det__empty", emptyText || "這個條件下沒有偵測事件"));
        return;
      }
      latest.forEach((ev) => {
        const btn = UI.el("button", "det__btn");
        btn.type = "button";
        const kind = UI.el("i", "det__kind", F.KIND_LABEL[ev.kind]);
        kind.style.background = UI.KIND_COLOR[ev.kind];
        btn.append(kind, UI.el("span", "det__time", ev.ts.slice(5, 16).replace("T", " ")), UI.el("span", "det__addr", D.shortAddress(ev) || ev.place || "—"));
        const pending = ev.deaths === null && ev.injuries === null && !ev.cause;
        if (pending) btn.append(UI.el("span", "det__pending", "待補填"));
        if (ev.source === "sim") btn.append(UI.el("span", "det__sim", "模擬"));
        else if (ev.verdict) btn.append(UI.el("span", `det__verdict is-${ev.verdict}`, D.VERDICT_LABEL[ev.verdict]));
        else btn.append(UI.el("span", "det__verdict", "待確認"));
        btn.addEventListener("click", () => onPick(ev));
        const li = UI.el("li", "det__item");
        li.append(btn);
        listEl.append(li);
      });
    },
  };
})(this);
