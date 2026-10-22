// 路線安全面板（民眾）：輸入起點、終點或在地圖上點兩個點 → 畫出開車路線，標出危險路段，
// 列出沿線最常出事的地點與公路局監視器。外部文字一律 textContent。
(function (root) {
  const UI = root.HotUI;
  const COORD_RE = /^\s*(-?\d+(?:\.\d+)?)\s*[,，]\s*(-?\d+(?:\.\d+)?)\s*$/;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function input(placeholder, label) {
    const el = UI.el("input", "search__input route__input");
    el.type = "text";
    el.placeholder = placeholder;
    el.setAttribute("aria-label", label);
    el.autocomplete = "off";
    return el;
  }
  function button(text, cls) {
    const b = UI.el("button", cls || "auth__btn", text);
    b.type = "button";
    return b;
  }

  // ctx：{ map, layer, lineOpts（路線畫在哪一層）, accidents(), cameras(), periodLabel(), openCam(cam) }
  UI.routePanel = {
    create(body, ctx) {
      const R = root.HotRoute;
      const from = input("起點，例：花蓮火車站", "起點");
      const to = input("終點，例：慈濟大學", "終點");
      const go = button("查路線", "search__go");
      const pick = button("在地圖上點選");
      const clear = button("清除");
      const msg = UI.el("p", "route__msg");
      msg.setAttribute("role", "status");
      const result = UI.el("div", "route__result");
      const row = UI.el("div", "route__btns");
      row.append(go, pick, clear);
      body.replaceChildren(
        UI.el("p", "search__hint", "輸入起點和終點（地名、地址），或在地圖上依序點兩個點，看看沿路過去哪裡最常出事。"),
        from, to, row, msg, result,
        UI.el("p", "route__note", "依過去車禍紀錄提醒，不是即時路況或導航；路線與地名查詢使用 OpenStreetMap／OSRM 公開服務，偶爾較慢。"),
      );

      let picked = []; // 地圖上點的點
      let pickHandler = null;
      let last = null; // 上次查到的路線，篩選條件改變時重算
      const say = (t, err) => {
        msg.textContent = t;
        msg.classList.toggle("is-error", !!err);
      };
      const pin = (p, text) =>
        L.marker([p.lat, p.lon], { icon: L.divIcon({ className: "route-pin", html: UI.el("span", null, text), iconSize: [26, 26] }), keyboard: false }).addTo(ctx.layer);

      function stopPick() {
        if (pickHandler) ctx.map.off("click", pickHandler);
        pickHandler = null;
        pick.textContent = "在地圖上點選";
        ctx.map.getContainer().classList.remove("is-picking");
      }

      async function locate(text) {
        const m = text.match(COORD_RE);
        if (m) return { lat: Number(m[1]), lon: Number(m[2]), name: text.trim() };
        return root.HotData.route.geocode(text);
      }

      function draw(r) {
        ctx.layer.clearLayers();
        const pts = ctx.accidents();
        const h = R.routeHazards(r.line, pts, 30);
        R.dangerSegments(r.line, h.points, { radius: 30, threshold: "auto" }).forEach((s) => {
          L.polyline([s.from, s.to], Object.assign({ color: s.danger ? "#ff2e2e" : "#48c3ac", weight: s.danger ? 7 : 5, opacity: 0.9, interactive: false }, ctx.lineOpts)).addTo(ctx.layer);
        });
        pin(r.a, "起");
        pin(r.b, "終");
        result.replaceChildren();
        result.append(UI.el("p", "route__sum", R.summaryText(h, ctx.periodLabel())));
        result.append(UI.el("p", "route__meta", `開車約 ${r.km} 公里、${r.minutes} 分鐘；紅色＝這條路上車禍特別密集的路段`));
        if (h.top.length) {
          result.append(UI.el("h3", "search__h", "沿路最常出事的地點"));
          const ol = UI.el("ol", "route__list");
          h.top.forEach((t) => {
            const b = button(`${t.name}（${t.count} 件${t.deaths ? `，死亡 ${t.deaths}` : ""}）`, "route__item");
            b.addEventListener("click", () => ctx.map.setView([t.lat, t.lon], 17));
            const li = UI.el("li");
            li.append(b);
            ol.append(li);
          });
          result.append(ol);
        }
        const cams = R.camerasNear(r.line, ctx.cameras(), 150);
        if (cams.length) {
          result.append(UI.el("h3", "search__h", `沿路的公路局監視器（${cams.length} 支，點了看即時路況）`));
          const ul = UI.el("ul", "route__list");
          cams.slice(0, 8).forEach((c) => {
            const b = button(c.name, "route__item");
            b.addEventListener("click", () => {
              ctx.map.setView([c.lat, c.lon], 16);
              ctx.openCam(c);
            });
            const li = UI.el("li");
            li.append(b);
            ul.append(li);
          });
          result.append(ul);
        }
      }

      async function run(a, b) {
        say("查詢路線中…");
        go.disabled = true;
        try {
          const r = await root.HotData.route.drive(a, b);
          if (!r) return say("這兩個地點之間找不到開車路線，請換個地點試試", true);
          last = Object.assign({ a, b }, r);
          draw(last);
          ctx.map.fitBounds(L.latLngBounds(r.line), { padding: [30, 30] });
          say("");
        } catch (err) {
          say(err.message, true);
        } finally {
          go.disabled = false;
        }
      }

      go.addEventListener("click", async () => {
        stopPick();
        if (!from.value.trim() || !to.value.trim()) return say("請輸入起點和終點，或按「在地圖上點選」", true);
        say("查詢地點中…");
        go.disabled = true;
        try {
          const a = await locate(from.value);
          if (!a) return say(`在花蓮找不到「${from.value.trim()}」，請換個寫法（例：花蓮火車站、中山路 100 號）`, true);
          await sleep(1100); // 地名查詢服務規定一秒最多一次
          const b = await locate(to.value);
          if (!b) return say(`在花蓮找不到「${to.value.trim()}」，請換個寫法`, true);
          await run(a, b);
        } catch (err) {
          say(err.message, true);
        } finally {
          go.disabled = false;
        }
      });
      // 在地圖上依序點兩個點
      pick.addEventListener("click", () => {
        if (pickHandler) return stopPick();
        picked = [];
        ctx.layer.clearLayers();
        say("請在地圖上點起點");
        pick.textContent = "取消點選";
        ctx.map.getContainer().classList.add("is-picking");
        pickHandler = (e) => {
          const p = { lat: e.latlng.lat, lon: e.latlng.lng };
          picked.push(p);
          pin(p, picked.length === 1 ? "起" : "終");
          if (picked.length === 1) return say("請在地圖上點終點");
          stopPick();
          from.value = `${picked[0].lat.toFixed(5)}, ${picked[0].lon.toFixed(5)}`;
          to.value = `${picked[1].lat.toFixed(5)}, ${picked[1].lon.toFixed(5)}`;
          run(picked[0], picked[1]);
        };
        ctx.map.on("click", pickHandler);
      });
      clear.addEventListener("click", () => {
        stopPick();
        ctx.layer.clearLayers();
        result.replaceChildren();
        from.value = "";
        to.value = "";
        last = null;
        say("");
      });
      [from, to].forEach((el) => el.addEventListener("keydown", (e) => {
        if (e.key === "Enter") go.click();
      }));

      return {
        // 篩選條件（期間、時段）改了：沿線車禍跟著重算
        refresh() {
          if (last) draw(last);
        },
        hide() {
          stopPick();
        },
      };
    },
  };
})(this);
