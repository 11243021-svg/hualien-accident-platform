// 危險路段排行榜（里長）：前 10 名路段，點一下地圖飛過去。
(function (root) {
  const UI = root.HotUI;
  UI.rankings = {
    render(listEl, noteEl, roads, { metric, selectedKey, note }, onPick) {
      const R = root.HotRoads;
      listEl.replaceChildren();
      noteEl.textContent = note || "";
      if (!roads.length) {
        listEl.append(UI.el("li", "rank__empty", "這個條件下沒有達到門檻的路段"));
        return;
      }
      const unit = metric === "count" ? "件" : "人";
      roads.slice(0, 10).forEach((r, i) => {
        const li = UI.el("li", "rank__item" + (r.key === selectedKey ? " is-on" : ""));
        const swatch = UI.el("i", "rank__tier");
        swatch.style.background = UI.TIER_COLOR[r.tier] || "transparent";
        const name = UI.el("span", "rank__name", `${i + 1}. ${r.town} ${r.road}`);
        const val = UI.el("b", "rank__val", `${r.value.toLocaleString()} ${unit}`);
        const sub = UI.el("span", "rank__sub", `${R.METRIC_LABEL.count} ${r.count.toLocaleString()}・死 ${r.deaths}・傷 ${r.injuries}${r.topCause ? "・" + r.topCause : ""}`);
        const btn = UI.el("button", "rank__btn");
        btn.type = "button";
        btn.append(swatch, name, val, sub);
        if (r.topSpots && r.topSpots.length) btn.append(UI.el("span", "rank__spots", "最常出事：" + R.spotsText(r.topSpots)));
        btn.addEventListener("click", () => onPick(r.key));
        li.append(btn);
        listEl.append(li);
      });
    },
  };
})(this);
