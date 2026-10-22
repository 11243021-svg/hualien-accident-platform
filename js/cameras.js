// 攝影機：設定（公路局即時串流、情境模擬影片）與各攝影機偵測統計（純函式，瀏覽器與 Node 測試共用）。
(function (root) {
  // 只自動加入公路局的串流網址（cctv-ss數字.thb.gov.tw），其他網址一律不加
  const THB_URL = /^https:\/\/cctv-ss\d+\.thb\.gov\.tw[:/]/;
  const CAMERAS = [
    { id: "T9-193K+100", name: "台9線 193K+100（花蓮市中正路）", lat: 23.969359, lon: 121.595361, liveUrl: "https://cctv-ss06.thb.gov.tw:443/T9-193K+100", videos: [] },
    { id: "T9-186K+080", name: "台9線 186K+080（新城鄉嘉新路）", lat: 24.010799, lon: 121.609105, liveUrl: "https://cctv-ss06.thb.gov.tw:443/T9-186K+080", videos: [] },
    {
      id: "sim-lab",
      name: "情境模擬",
      lat: 23.998228,
      lon: 121.571209,
      liveUrl: null,
      videos: [
        { title: "落石", file: "videos/sim-rock-clip.mp4" },
        { title: "汽車闖入", file: "videos/sim-car-clip.mp4" },
        { title: "機車闖入", file: "videos/sim-moto-clip.mp4" },
        { title: "汽機車事故", file: "videos/sim-crash-clip.mp4" },
      ],
    },
  ];

  const idFromUrl = (url) => url.split("/").pop();

  // 公路局清單產生的花蓮監視器（web/js/cctv-list.js，用 pipeline/update_cctv.py 產生）；
  // 自己整理過名字的那幾支優先，同一支不重複
  const CCTV = (typeof module !== "undefined" && module.exports ? require("./cctv-list.js") : root.HOT_CCTV) || [];
  const ALL = CAMERAS.concat(CCTV.filter((c) => !CAMERAS.some((k) => k.id === c.id)).map((c) => Object.assign({ videos: [] }, c)));

  // 地圖縮小時只顯示代表性的監視器（花蓮市、吉安、新城、壽豐主要路段），放大到街道才顯示畫面範圍內全部
  const FEATURED = ["T9-193K+100", "T9-186K+080", "T9-189K+630", "T9-191K+050", "T11-006K+080", "T9-182K+600", "T9-198K+750", "T9-206K+400"];
  const ALL_CAMS_ZOOM = 14; // 13 級看得到整個花蓮市，一次 30 幾支太擠
  // 有偵測紀錄的、情境模擬（沒有即時網址）也一直顯示
  function visibleCameras(cams, zoom, inView) {
    if (zoom >= ALL_CAMS_ZOOM) return cams.filter((c) => FEATURED.includes(c.id) || c.count > 0 || !c.liveUrl || inView(c));
    return cams.filter((c) => FEATURED.includes(c.id) || c.count > 0 || !c.liveUrl);
  }

  function withStats(cameras, detections) {
    const list = cameras.map((c) => Object.assign({}, c, { count: 0, latest: null }));
    const find = (camera) => list.find((c) => c.liveUrl === camera || c.id === camera);
    detections.forEach((d) => {
      if (!d.camera) return;
      let cam = find(d.camera);
      if (!cam && d.source === "real" && THB_URL.test(d.camera)) {
        cam = { id: idFromUrl(d.camera), name: `公路局 ${idFromUrl(d.camera)}`, lat: d.lat, lon: d.lon, liveUrl: d.camera, videos: [], count: 0, latest: null };
        list.push(cam);
      }
      if (!cam) return;
      cam.count += 1;
      if (!cam.latest || d.ts > cam.latest) cam.latest = d.ts;
    });
    return list;
  }

  // 公路局監視器的串流網址是 MJPEG（一張接一張的 JPEG），直接放進 <img> 就是即時影像。
  // 不用 <串流網址>/snapshot：2026-10-22 發現 T9-193K+100 的截圖網址壞掉（回傳叉叉圖），串流卻正常。
  function streamUrl(cam) {
    const url = cam && cam.liveUrl;
    if (!url || !THB_URL.test(url)) return null;
    return url.replace(/\/+$/, "");
  }

  // 偵測事件的 camera 欄位（串流網址或 id）→ 攝影機名字；不是攝影機（例如影片檔名）回空字串
  function cameraName(camera) {
    if (!camera) return "";
    const known = ALL.find((c) => c.liveUrl === camera || c.id === camera);
    if (known) return known.name;
    return THB_URL.test(camera) ? `公路局 ${idFromUrl(camera)}` : "";
  }

  // 依畫面決定顯示哪些攝影機："all"＝全部（含情境模擬）、"live"＝只有公路局即時監視器、false＝不顯示
  function camerasFor(cams, mode) {
    if (mode === "all") return cams;
    if (mode === "live") return cams.filter((c) => c.liveUrl);
    return [];
  }

  // 名稱很長時拆成兩行：主標「台9線 206K+400」大字、地點說明小字（| 換成全形比較好讀）
  function splitName(name) {
    const i = (name || "").indexOf("（");
    if (i < 0 || !name.endsWith("）")) return { main: name || "", sub: "" };
    return { main: name.slice(0, i), sub: name.slice(i + 1, -1).replace(/\|/g, "｜") };
  }

  const api = { splitName, CAMERAS, ALL, FEATURED, ALL_CAMS_ZOOM, withStats, streamUrl, cameraName, camerasFor, visibleCameras };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.HotCameras = api;
})(this);
