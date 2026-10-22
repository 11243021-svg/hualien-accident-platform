// 最新偵測事件清單（員警）：最新 20 筆，標出待補填。
(function (root) {
  const UI = root.HotUI;
  UI.detList = {
    render(listEl, detections, onPick) {
      const F = root.HotFilters;
      const D = root.HotDetections;
      listEl.replaceChildren();
      const latest = detections.slice().sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0)).slice(0, 20);
      if (!latest.length) {
        listEl.append(UI.el("li", "det__empty", "這個條件下沒有偵測事件"));
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
        btn.addEventListener("click", () => onPick(ev));
        const li = UI.el("li", "det__item");
        li.append(btn);
        listEl.append(li);
      });
    },
  };
})(this);
