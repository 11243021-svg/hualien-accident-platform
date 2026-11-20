// 路名查詢結果（民眾）：件數、常見肇因、最近 30 天的落石／障礙物偵測。
(function (root) {
  const UI = root.HotUI;
  const DAY_MS = 86400000;
  // 「這條路：注意（安全指數 58 分）」：查到的事故裡最多的前 3 條路段
  UI.safetyLines = function (bodyEl, acc, safety) {
    if (!safety || !safety.size) return;
    const counts = new Map();
    acc.forEach((e) => e.roadKey && counts.set(e.roadKey, (counts.get(e.roadKey) || 0) + 1));
    const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => safety.get(k)).filter((r) => r && r.score !== null).slice(0, 3);
    if (!rows.length) return;
    bodyEl.append(UI.el("h3", "search__h", "道路危險度（0～100，越高越危險）"));
    const ul = UI.el("ul", "safety-lines");
    rows.forEach((r) => {
      const li = UI.el("li", null, `${r.town} ${r.road}：`);
      li.append(UI.el("b", `is-${r.level.key}`, `${r.level.label}（危險度 ${100 - r.score}）`));
      ul.append(li);
    });
    bodyEl.append(ul);
  };

  UI.search = {
    render(bodyEl, titleEl, { query, acc, det, periodLabel, safety, groups, picked, onPick, suggestions, onSuggest }) {
      const A = root.HotAccidents;
      const F = root.HotFilters;
      bodyEl.replaceChildren();
      if (!query) {
        titleEl.textContent = "查詢路況";
        bodyEl.append(UI.el("p", "search__hint", "在上方輸入路名（例如：建國路、中正路），看看最近這條路的車禍與偵測事件。"));
        return;
      }
      titleEl.textContent = picked ? `「${picked}」查詢結果` : `「${query}」查詢結果`;
      if (!acc.length && !det.length) {
        bodyEl.append(UI.el("p", "search__hint", root.HotRoads.noResultText(query, periodLabel)));
        if (suggestions && suggestions.length) { // 打錯字：這裡也給建議（手機捲到這裡的人看不到搜尋框下面那行）
          const line = UI.el("p", "search-sum__sug", "你是不是要找：");
          suggestions.forEach((name) => {
            const b = UI.el("button", "search-sum__btn", name);
            b.type = "button";
            b.addEventListener("click", () => onSuggest(name));
            line.append(b);
          });
          bodyEl.append(line);
        }
        return;
      }
      if (picked) {
        const back = UI.el("button", "search-sum__btn", `← 看全部「${query}」`);
        back.type = "button";
        back.addEventListener("click", () => onPick(""));
        bodyEl.append(back);
      } else if (groups && groups.length > 1) { // 同名路在好幾個鄉鎮、好幾段：分開列，點一條只看那一條
        bodyEl.append(UI.el("p", "search__sub", `這個名字有 ${groups.length} 條路段，下面是合計；點一條只看那一條（數字跟路段排行一樣）：`));
        const ul = UI.el("ul", "search-groups");
        groups.slice(0, 8).forEach((g) => {
          const b = UI.el("button", "search-groups__btn");
          b.type = "button";
          b.append(UI.el("span", null, g.key), UI.el("b", null, `${g.count.toLocaleString()} 件`));
          b.addEventListener("click", () => onPick(g.key));
          const li = UI.el("li");
          li.append(b);
          ul.append(li);
        });
        if (groups.length > 8) ul.append(UI.el("li", "search__hint", `還有 ${groups.length - 8} 條，打更完整的路名（例如「花蓮市中山路」）就會列出來`));
        bodyEl.append(ul);
      }
      const deaths = acc.reduce((s, e) => s + (e.deaths || 0), 0);
      const injuries = acc.reduce((s, e) => s + (e.injuries || 0), 0);
      bodyEl.append(UI.el("p", "search__big", `${periodLabel}車禍 ${acc.length.toLocaleString()} 件`));
      bodyEl.append(UI.el("p", "search__sub", `死亡 ${deaths} 人、受傷 ${injuries.toLocaleString()} 人`));
      UI.safetyLines(bodyEl, acc, safety);
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
