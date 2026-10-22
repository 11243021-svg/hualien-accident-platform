// 攝影機圖層：攝影機圖示，點開看公路局即時影像（串流）、即時畫面連結、情境模擬影片、偵測件數。
(function (root) {
  const UI = root.HotUI;
  // 即時影像：16:9 黑框先佔好位置；連不上顯示提示
  function liveBox() {
    const wrap = UI.el("div", "cam__live-box");
    const img = UI.el("img", "cam__live-img");
    img.alt = "公路局即時影像";
    const fail = UI.el("p", "cam__live-fail", "這支監視器目前連不上（公路局維修或暫停服務），請稍後再試，或點其他監視器");
    fail.hidden = true;
    img.addEventListener("error", () => (fail.hidden = false));
    img.addEventListener("load", () => (fail.hidden = true));
    wrap.append(img, fail);
    return { wrap, img };
  }
  function popup(cam, snap) {
    const box = UI.el("div", "pop cam");
    let live = null;
    if (snap) {
      live = liveBox();
      box.append(live.wrap, UI.el("p", "cam__live-note", "公路局即時影像（直播）"));
    }
    const nm = root.HotCameras.splitName(cam.name);
    box.append(UI.el("div", "pop__head cam__name", nm.main));
    if (nm.sub) box.append(UI.el("div", "cam__sub", nm.sub));
    const dl = UI.el("dl", "pop__rows");
    const rows = [
      ["座標", `${cam.lat.toFixed(6)}, ${cam.lon.toFixed(6)}`],
      ["偵測件數", `${cam.count} 件`],
      ["最近一次", cam.latest ? cam.latest.replace("T", " ") : "—"],
    ];
    rows.forEach(([k, v]) => dl.append(UI.el("dt", null, k), UI.el("dd", null, v)));
    box.append(dl);
    if (cam.liveUrl) {
      const a = UI.el("a", "cam__live", "開啟即時畫面 ↗");
      a.href = cam.liveUrl;
      a.target = "_blank";
      a.rel = "noopener";
      box.append(a);
    }
    if (cam.videos.length) {
      // 影片框一開始就佔好 16:9 的位置，小卡片打開時高度就固定，不會播放後才長高被切到畫面外
      const player = UI.el("video", "cam__video");
      player.controls = true;
      player.muted = true;
      player.playsInline = true;
      const note = UI.el("p", "pop__note", "點上方按鈕播放");
      player.addEventListener("error", () => {
        if (player.getAttribute("src")) note.textContent = "影片檔未放入 web/videos";
      });
      const btns = UI.el("div", "cam__btns");
      cam.videos.forEach((v) => {
        const b = UI.el("button", "cam__btn", v.title);
        b.type = "button";
        b.addEventListener("click", () => {
          btns.querySelectorAll(".cam__btn").forEach((x) => x.classList.toggle("is-on", x === b));
          note.textContent = `正在播放：${v.title}`;
          player.src = v.file;
          player.play().catch(() => {});
        });
        btns.append(b);
      });
      box.append(UI.el("div", "pop__note", "情境模擬影片："), btns, player, note);
    }
    return { box, img: live && live.img };
  }
  const POPUP_OPTS = { className: "hot-popup", minWidth: 320, maxWidth: 360, autoPanPaddingTopLeft: [60, 20] };
  // 攝影機清單有沒有變：id＋件數＋最近一次都一樣就不用重畫
  const signature = (cams) => cams.map((c) => `${c.id}|${c.count}|${c.latest || ""}`).join(";");
  UI.cameras = {
    // openPopup(lat, lon, content, opts)：由地圖主程式提供，小卡片獨立開在地圖上，
    // 圖層重畫時不會被關掉（正在播放的影片也不會停）
    create(map, openPopup) {
      const layer = L.layerGroup();
      const icon = L.divIcon({ className: "cam-icon", html: "", iconSize: [28, 28] });
      let drawn = null; // 上次畫的 { sig, visible }
      let camPopup = null;
      let liveImg = null;
      // 關掉串流：把圖片的網址拿掉，瀏覽器就會停止下載
      const stopLive = () => {
        if (liveImg) liveImg.removeAttribute("src");
        liveImg = null;
      };
      // 小卡片關掉（按 ×、開了別的小卡片、圖層隱藏）就停止串流，不在背景一直耗網路
      map.on("popupclose", (e) => {
        if (e.popup === camPopup) stopLive();
      });
      function openCam(cam) {
        stopLive();
        const stream = root.HotCameras.streamUrl(cam);
        const { box, img } = popup(cam, stream);
        // 手機地圖較窄，小卡片最小寬度不超過地圖寬度
        const minWidth = Math.max(200, Math.min(POPUP_OPTS.minWidth, map.getSize().x - 60));
        camPopup = openPopup(cam.lat, cam.lon, box, Object.assign({}, POPUP_OPTS, { minWidth }));
        if (!img) return;
        liveImg = img;
        img.src = stream;
      }
      return {
        open: openCam,
        update(cams, visible) {
          const sig = visible ? signature(cams) : "";
          if (drawn && drawn.sig === sig && drawn.visible === visible) return;
          drawn = { sig, visible };
          layer.clearLayers();
          if (!visible) {
            if (camPopup && map.hasLayer(camPopup)) map.closePopup(camPopup);
            camPopup = null;
            map.removeLayer(layer);
            return;
          }
          cams.forEach((cam) => {
            L.marker([cam.lat, cam.lon], { icon, zIndexOffset: 1000 })
              .bindTooltip(() => UI.el("span", null, `${root.HotCameras.splitName(cam.name).main}（偵測 ${cam.count} 件）`), { direction: "top", offset: [0, -14], className: "hot-tip" })
              .on("click", () => openCam(cam))
              .addTo(layer);
          });
          layer.addTo(map);
        },
      };
    },
  };
})(this);
