// 手機用的「底部資料卡」：點地圖上的點，資料改從地圖下方滑出來（最多佔地圖一半高），
// 不再用浮在點上的小卡片（手機上會蓋住整張地圖、還會把地圖拖來拖去）。
// 回傳的物件跟 Leaflet 小卡片一樣有 close()、isOpen()，關掉時也會發出地圖的 "popupclose" 事件，
// 所以攝影機串流「小卡片關掉就停止下載」的邏輯不用改。
(function (root) {
  const UI = root.HotUI;

  UI.mapSheet = {
    create(map) {
      const wrap = map.getContainer();
      const sheet = UI.el("div", "map-sheet");
      sheet.hidden = true;
      const close = UI.el("button", "map-sheet__close", "×");
      close.type = "button";
      close.setAttribute("aria-label", "關閉");
      const body = UI.el("div", "map-sheet__body");
      sheet.append(close, body);
      wrap.append(sheet);
      // 在資料卡上點、滑都不要傳給地圖（不然會同時拖動地圖或關掉自己）
      L.DomEvent.disableClickPropagation(sheet);
      L.DomEvent.disableScrollPropagation(sheet);
      ["touchstart", "pointerdown"].forEach((t) => sheet.addEventListener(t, (e) => e.stopPropagation()));

      // 選到的點畫一個白圈，資料卡打開時看得出是哪一點
      const ring = L.marker([0, 0], {
        icon: L.divIcon({ className: "sheet-ring", html: "", iconSize: [26, 26] }),
        interactive: false,
        keyboard: false,
        pane: "rankPane",
      });

      let current = null;
      function hide() {
        if (!current) return;
        const h = current;
        current = null;
        sheet.hidden = true;
        body.replaceChildren();
        map.removeLayer(ring);
        map.fire("popupclose", { popup: h });
      }
      close.addEventListener("click", hide);

      return {
        open(lat, lon, content) {
          hide();
          body.replaceChildren(content);
          sheet.hidden = false;
          sheet.scrollTop = 0;
          ring.setLatLng([lat, lon]).addTo(map);
          // 點如果被資料卡蓋住，地圖往上移一點，讓點留在資料卡上方
          const free = map.getSize().y - sheet.offsetHeight;
          const p = map.latLngToContainerPoint([lat, lon]);
          if (p.y > free - 24 || p.y < 24) map.panBy([0, p.y - free / 2]);
          const h = { close: () => current === h && hide(), isOpen: () => current === h };
          current = h;
          return h;
        },
        close: hide,
        isOpen: () => !!current,
      };
    },
  };
})(this);
