// 地圖上的即時天氣：中央氣象署測站（局屬站＋自動站），每 10 分鐘更新。
// 圖示用 SVG（不用 emoji）；測站名稱等外部資料一律用 textContent。
(function (root) {
  const UI = root.HotUI;
  const REFRESH_MS = 10 * 60 * 1000;
  const SVG_NS = "http://www.w3.org/2000/svg";
  // 四種天氣圖示（24×24），用簡單形狀組合
  const ICONS = {
    sunny: [["circle", { cx: 12, cy: 12, r: 5, fill: "#FFC93C" }], ["path", { d: "M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2", stroke: "#FFC93C", "stroke-width": 2, "stroke-linecap": "round", fill: "none" }]],
    partly: [["circle", { cx: 9, cy: 9, r: 4.5, fill: "#FFC93C" }], ["path", { d: "M7 19h10a4 4 0 0 0 0-8 5 5 0 0 0-9.6 1.5A3.3 3.3 0 0 0 7 19z", fill: "#E6EDF5" }]],
    cloudy: [["path", { d: "M6 18h12a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.4 1.8A3.7 3.7 0 0 0 6 18z", fill: "#AEB9C6" }]],
    rain: [["path", { d: "M6 14h12a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.5 1.6A3.3 3.3 0 0 0 6 14z", fill: "#AEB9C6" }], ["path", { d: "M8 17l-1 3M12 17l-1 3M16 17l-1 3", stroke: "#4FA3FF", "stroke-width": 2, "stroke-linecap": "round" }]],
    unknown: [["circle", { cx: 12, cy: 12, r: 6, fill: "none", stroke: "#AEB9C6", "stroke-width": 2 }]],
  };
  function icon(kind) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "20");
    svg.setAttribute("height", "20");
    (ICONS[kind] || ICONS.unknown).forEach(([tag, attrs]) => {
      const n = document.createElementNS(SVG_NS, tag);
      Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
      svg.append(n);
    });
    return svg;
  }
  const fmt = (v, unit, digits = 1) => (v === null || v === undefined ? "—" : `${Number(v).toFixed(digits)} ${unit}`);

  function popup(st) {
    const W = root.HotWeather;
    const box = UI.el("div", "pop");
    const head = UI.el("div", "pop__head");
    head.append(icon(W.iconOf(st)), UI.el("b", null, `${st.name}${st.type === "main" ? "氣象站" : "測站"}`));
    box.append(head);
    const dl = UI.el("dl", "pop__rows");
    [
      ["天氣", W.label(st) || "—"],
      ["氣溫", fmt(st.temp, "°C")],
      ["今日雨量", fmt(st.rain, "mm")],
      ["濕度", st.humidity === null ? "—" : `${st.humidity}%`],
      ["風速", fmt(st.wind, "m/s")],
      ["觀測時間", W.obsText(st.obsTime) || "—"],
      ["地點", st.town || "—"],
    ].forEach(([k, v]) => dl.append(UI.el("dt", null, k), UI.el("dd", null, v)));
    box.append(dl, UI.el("p", "pop__note", "資料來源：中央氣象署開放資料"));
    return box;
  }

  UI.weather = {
    // openPopup(lat, lon, content)：由地圖主程式提供（手機會改成下方資料卡）
    create(map, openPopup) {
      const layer = L.layerGroup();
      let visible = false;
      let stations = null;
      let loading = false;
      let timer = 0;
      let errorShown = false;

      async function load() {
        if (loading) return;
        loading = true;
        try {
          const body = await root.HotData.weather.load();
          stations = body.stations || [];
          errorShown = false;
        } catch (err) {
          if (!errorShown && visible) {
            errorShown = true;
            const t = document.getElementById("toast");
            if (t) {
              t.textContent = "天氣資料暫時無法取得：" + err.message;
              t.hidden = false;
              setTimeout(() => (t.hidden = true), 6000);
            }
          }
        } finally {
          loading = false;
        }
        redraw();
      }

      function redraw() {
        layer.clearLayers();
        if (!visible || !stations) return;
        const W = root.HotWeather;
        const bounds = map.getBounds().pad(0.1);
        W.visibleStations(stations, map.getZoom(), (s) => bounds.contains([s.lat, s.lon])).forEach((st) => {
          const html = UI.el("div", "wx-pin" + (st.type === "main" ? " is-main" : ""));
          html.append(icon(W.iconOf(st)), UI.el("span", "wx-pin__t", st.temp === null ? "—" : `${Math.round(st.temp)}°`));
          const m = L.marker([st.lat, st.lon], { icon: L.divIcon({ className: "wx-icon", html, iconSize: [58, 26], iconAnchor: [29, 13] }), zIndexOffset: 500, keyboard: false });
          m.bindTooltip(() => UI.el("span", null, `${st.name}：${W.label(st) || "—"} ${st.temp === null ? "" : st.temp.toFixed(1) + "°C"}`), { direction: "top", offset: [0, -12], className: "hot-tip" });
          m.on("click", () => openPopup(st.lat, st.lon, popup(st)));
          m.addTo(layer);
        });
      }

      return {
        setVisible(on) {
          if (on === visible) return;
          visible = on;
          clearInterval(timer);
          if (!on) {
            map.removeLayer(layer);
            return;
          }
          layer.addTo(map);
          if (!stations) load();
          else redraw();
          timer = setInterval(() => document.visibilityState === "visible" && load(), REFRESH_MS);
        },
        redraw,
      };
    },
  };
})(this);
