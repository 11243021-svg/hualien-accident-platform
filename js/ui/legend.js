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
      // 手機（寬 ≤ 600px）圖例預設收起來；電腦預設展開，兩邊都能按「圖例」收合（見 style.css）
      const wrap = UI.el("div", "legend");
      const toggle = UI.el("button", "legend__toggle");
      toggle.type = "button";
      const setOpen = (open) => {
        wrap.classList.toggle("is-open", open);
        wrap.classList.toggle("is-shut", !open);
        toggle.textContent = open ? "圖例 ▴ 收起" : "圖例 ▾";
        toggle.setAttribute("aria-expanded", String(open));
      };
      setOpen(false); // 預設收起，地圖看得比較完整（使用者測試：展開會擋掉三分之一張地圖）
      toggle.addEventListener("click", () => setOpen(!wrap.classList.contains("is-open")));
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
        update({ persona, metric, region, accView, weather, road }) {
          const R = root.HotRoads;
          box.replaceChildren(UI.el("div", "legend__title", "圖例"));
          if (accView === "safety") {
            box.append(UI.el("div", "legend__sub", "道路危險度（每條路段 0～100，越高越危險）"));
            box.append(row(dot("#5a189a"), "危險（危險度最高的前 10%）"));
            box.append(row(dot("#9d4edd"), "注意（接下來的 30%）"));
            box.append(row(dot("#e0aaff"), "安全（其餘 60%）"));
            box.append(UI.el("div", "legend__note", "圓圈越大＝事故越多；數字＝最危險名次"));
            box.append(UI.el("div", "legend__note", "少於 3 件的路段資料不足，不顯示"));
          }
          if (weather) {
            box.append(UI.el("div", "legend__sub", "即時天氣（中央氣象署）"));
            box.append(UI.el("div", "legend__note", "圖示＝天氣、數字＝氣溫；放大地圖會出現更多測站"));
          }
          if (accView === "safety") return;
          if (road && (persona === "mayor" || persona === "citizen")) {
            box.append(UI.el("div", "legend__sub", "選到的路段"));
            box.append(row(dot(UI.TIER_COLOR.high), "路段圓圈：圓圈越大＝出事越多"));
            box.append(row(UI.el("span", "legend__num legend__num--spot", "熱點"), "這條路最常出事的路口／門牌"));
          }
          if (persona === "mayor") {
            const [high, mid, low] = R.TIERS[metric];
            const unit = metric === "count" ? "件" : "人";
            box.append(UI.el("div", "legend__sub", `路段圓圈（依${R.METRIC_LABEL[metric]}）`));
            box.append(row(dot(UI.TIER_COLOR.high), `${high} ${unit}以上`));
            box.append(row(dot(UI.TIER_COLOR.mid), `${mid}～${high - 1} ${unit}`));
            box.append(row(dot(UI.TIER_COLOR.low), `${low}～${mid - 1} ${unit}`));
            box.append(UI.el("div", "legend__note", "圓圈顏色＝這條路的等級；數字＝排行名次"));
          }
          if (accView === "heat") {
            box.append(UI.el("div", "legend__sub", "車禍熱度圖"));
            box.append(row(UI.el("i", "legend__grad"), "藍→紅＝車禍越密集"));
            box.append(UI.el("div", "legend__note", "要看每一件車禍，請切到「斑點圖」"));
          } else {
            box.append(UI.el("div", "legend__sub", "車禍斑點圖（一點＝一件事故）"));
            box.append(row(dot(UI.SEV_SHADE.death.day, "legend__dot--death"), "死亡（白天）"));
            box.append(row(dot(UI.SEV_SHADE.death.night, "legend__dot--death"), "死亡（晚上）"));
            box.append(row(dot(UI.SEV_SHADE.injury.day), "受傷（白天）"));
            box.append(row(dot(UI.SEV_SHADE.injury.night), "受傷（晚上）"));
            box.append(UI.el("div", "legend__note", "死亡是有白框的菱形◆、受傷是圓點；白天＝06:00～17:59"));
          }
          if (region === "hualien") { // 三種身分都會畫 AI 偵測點
            const F = root.HotFilters;
            box.append(UI.el("div", "legend__sub", "AI 偵測"));
            Object.keys(UI.KIND_COLOR).forEach((k) => box.append(row(dot(UI.KIND_COLOR[k], "legend__dot--det"), F.KIND_LABEL[k])));
            box.append(row(dot(UI.TEXT_MUT, "legend__dot--det"), "AI 偵測到的（實心白框）"));
            if (persona !== "citizen") {
              box.append(row(UI.el("i", "legend__dot legend__dot--sim"), "模擬資料（空心虛線）"));
              box.append(row(UI.el("i", "legend__dot legend__dot--test"), "測試資料（灰色點點框，勾「測試」才顯示）"));
            }
          }
          const cams = root.HotPersonas.PERSONAS[persona].layers.cameras;
          if (cams && region === "hualien") box.append(row(UI.el("i", "legend__camico"), cams === "live" ? "公路局監視器（點了看即時路況）" : "攝影機"));
          if (cams && region === "hualien") {
            box.append(row(UI.el("span", "legend__num", "N"), "藍色數字＝這台 AI 偵測到幾件"));
            box.append(row(UI.el("i", "legend__dot legend__dot--viewed"), "天藍色外框＝剛剛點開看的那台"));
          }
          if (cams === "all" && region === "hualien") {
            const sw = UI.el("i", "legend__dot");
            sw.style.background = "#38bdf8";
            box.append(row(sw, "整台天藍色＝AI 偵測選的那台"));
          }
          if (cams && region === "hualien") box.append(UI.el("div", "legend__note", "放大地圖會出現更多監視器"));
        },
      };
    },
  };
})(this);
