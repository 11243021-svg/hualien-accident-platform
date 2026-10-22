// 地圖右下角圖例：依身分與分級依據顯示顏色說明。
(function (root) {
  const UI = root.HotUI;
  function row(swatch, text) {
    const r = UI.el("div", "legend__row");
    r.append(swatch, UI.el("span", null, text));
    return r;
  }
  function dot(color, extra) {
    const d = UI.el("i", "legend__dot" + (extra ? " " + extra : ""));
    d.style.background = color;
    return d;
  }
  UI.legend = {
    create(map) {
      // 手機（寬 ≤ 600px）圖例預設收成「圖例」小按鈕，點了才展開；桌機按鈕不顯示、內容一直展開（見 style.css）
      const wrap = UI.el("div", "legend");
      const toggle = UI.el("button", "legend__toggle", "圖例 ▾");
      toggle.type = "button";
      toggle.setAttribute("aria-expanded", "false");
      toggle.addEventListener("click", () => {
        const open = wrap.classList.toggle("is-open");
        toggle.textContent = open ? "圖例 ▴" : "圖例 ▾";
        toggle.setAttribute("aria-expanded", String(open));
      });
      const box = UI.el("div", "legend__body");
      wrap.append(toggle, box);
      const ctl = L.control({ position: "bottomright" });
      ctl.onAdd = () => {
        L.DomEvent.disableClickPropagation(wrap);
        L.DomEvent.disableScrollPropagation(wrap);
        return wrap;
      };
      ctl.addTo(map);
      return {
        update({ persona, metric, region, accView }) {
          const R = root.HotRoads;
          box.replaceChildren(UI.el("div", "legend__title", "圖例"));
          if (persona === "mayor") {
            const [high, mid, low] = R.TIERS[metric];
            const unit = metric === "count" ? "件" : "人";
            box.append(UI.el("div", "legend__sub", `路段圓圈（依${R.METRIC_LABEL[metric]}）`));
            box.append(row(dot(UI.TIER_COLOR.high), `${high} ${unit}以上`));
            box.append(row(dot(UI.TIER_COLOR.mid), `${mid}～${high - 1} ${unit}`));
            box.append(row(dot(UI.TIER_COLOR.low), `${low}～${mid - 1} ${unit}`));
            box.append(UI.el("div", "legend__note", "圓圈越大＝數字越大；數字＝排行名次"));
            box.append(UI.el("div", "legend__note", "縮小時只顯示前 10 名，放大會顯示更多"));
          }
          box.append(UI.el("div", "legend__sub", accView === "heat" ? "車禍（熱度圖，放大才出現個別點）" : "車禍斑點圖（一點＝一件事故）"));
          box.append(row(dot(UI.SEV_SHADE.death.day), "死亡（白天）"));
          box.append(row(dot(UI.SEV_SHADE.death.night), "死亡（晚上）"));
          box.append(row(dot(UI.SEV_SHADE.injury.day), "受傷（白天）"));
          box.append(row(dot(UI.SEV_SHADE.injury.night), "受傷（晚上）"));
          box.append(UI.el("div", "legend__note", "白天＝06:00～17:59，其餘算晚上"));
          const grad = UI.el("i", "legend__grad");
          if (accView === "heat") box.append(row(grad, "熱度：藍→紅＝越密集"));
          if (region === "hualien") { // 三種身分都會畫 AI 偵測點
            const F = root.HotFilters;
            box.append(UI.el("div", "legend__sub", "AI 偵測"));
            Object.keys(UI.KIND_COLOR).forEach((k) => box.append(row(dot(UI.KIND_COLOR[k], "legend__dot--det"), F.KIND_LABEL[k])));
            box.append(row(dot(UI.TEXT_MUT, "legend__dot--det"), "真實偵測（實心白框）"));
            box.append(row(UI.el("i", "legend__dot legend__dot--sim"), "模擬資料（空心虛線）"));
          }
          const cams = root.HotPersonas.PERSONAS[persona].layers.cameras;
          if (cams && region === "hualien") box.append(row(UI.el("span", "legend__cam", "📷"), cams === "live" ? "公路局監視器（點了看即時路況）" : "攝影機"));
          if (cams && region === "hualien") box.append(UI.el("div", "legend__note", "放大地圖會出現更多監視器"));
        },
      };
    },
  };
})(this);
