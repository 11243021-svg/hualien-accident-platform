// 路名查詢結果（民眾）：件數、常見肇因、最近 30 天的落石／障礙物偵測。
(function (root) {
  const UI = root.HotUI;
  const DAY_MS = 86400000;
  UI.search = {
    render(bodyEl, titleEl, { query, acc, det, periodLabel }) {
      const A = root.HotAccidents;
      const F = root.HotFilters;
      bodyEl.replaceChildren();
      if (!query) {
        titleEl.textContent = "查詢路況";
        bodyEl.append(UI.el("p", "search__hint", "在上方輸入路名（例如：建國路、中正路），看看最近這條路的車禍與偵測事件。"));
        return;
      }
      titleEl.textContent = `「${query}」查詢結果`;
      if (!acc.length && !det.length) {
        bodyEl.append(UI.el("p", "search__hint", root.HotRoads.noResultText(query, periodLabel)));
        return;
      }
      const deaths = acc.reduce((s, e) => s + (e.deaths || 0), 0);
      const injuries = acc.reduce((s, e) => s + (e.injuries || 0), 0);
      bodyEl.append(UI.el("p", "search__big", `${periodLabel}車禍 ${acc.length.toLocaleString()} 件`));
      bodyEl.append(UI.el("p", "search__sub", `死亡 ${deaths} 人、受傷 ${injuries.toLocaleString()} 人`));
      const top = A.topCauses(acc, 3).top;
      if (top.length) {
        bodyEl.append(UI.el("h3", "search__h", "最常見肇因"));
        const ol = UI.el("ol", "search__causes");
        top.forEach((t) => ol.append(UI.el("li", null, `${t.cause}（${t.count} 件）`)));
        bodyEl.append(ol);
      }
      const R = root.HotRoads;
      const spots = R.aggregateRoads(acc.map((e) => Object.assign({}, e, { roadKey: "q" })), "count")[0];
      if (spots && spots.topSpots.length) {
        bodyEl.append(UI.el("h3", "search__h", "最常出事的路口／門牌"));
        const ol = UI.el("ol", "search__causes");
        spots.topSpots.forEach((t) => ol.append(UI.el("li", null, `${t.spot}（${t.count} 件）`)));
        bodyEl.append(ol);
      }
      bodyEl.append(UI.el("h3", "search__h", "最近 30 天落石／障礙物"));
      const now = Date.now();
      const hazards = det.filter((e) => (e.kind === "rock" || e.kind === "debris") && now - new Date(e.ts + "+08:00").getTime() <= 30 * DAY_MS);
      if (!hazards.length) bodyEl.append(UI.el("p", "search__ok", "最近沒有偵測到落石或障礙物"));
      else hazards.forEach((e) => bodyEl.append(UI.el("p", "search__warn", `${e.ts.slice(5, 16).replace("T", " ")} ${F.KIND_LABEL[e.kind]}`)));
    },
  };
})(this);
