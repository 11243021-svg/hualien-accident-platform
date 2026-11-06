// 即時天氣（純函式，瀏覽器與 Node 測試共用）：天氣描述 → 圖示種類、天候分組；該顯示哪些測站。
(function (root) {
  const MAIN_ZOOM = 13; // 縮小只顯示局屬站（12 站），放大到這一級才顯示畫面內全部自動站

  // 天氣描述（晴、多雲、陰、陰有雨、晴有霾…）→ 圖示：rain／cloudy（陰）／partly（多雲）／sunny／unknown
  function iconOf(st) {
    const w = (st && st.weather) || "";
    if (/雨|雷/.test(w) || (st && st.rain > 0 && !w)) return "rain";
    if (/陰/.test(w)) return "cloudy";
    if (/雲/.test(w)) return "partly";
    if (/晴/.test(w)) return "sunny";
    return "unknown";
  }

  // 對應車禍資料的天候分組（晴／陰／雨／其他／未提供），讓原本的天候篩選對 AI 偵測也有效
  function weatherGroupOf(text) {
    const w = text || "";
    if (!w) return "未提供";
    if (/雨|雷/.test(w)) return "雨";
    if (/陰/.test(w)) return "陰";
    if (/晴|雲/.test(w)) return "晴";
    return "其他";
  }

  // 部分測站沒有天氣描述：有雨量就說「有雨」，否則只顯示氣溫
  function label(st) {
    if (st.weather) return st.weather;
    if (st.rain > 0) return "有雨";
    return "";
  }

  // 要顯示的測站：縮小只放局屬站；放大放畫面內全部
  function visibleStations(stations, zoom, inView) {
    if (zoom >= MAIN_ZOOM) return stations.filter((s) => s.type === "main" || inView(s));
    return stations.filter((s) => s.type === "main");
  }

  // 「2026-11-05 13:20」
  const obsText = (iso) => (iso ? iso.slice(0, 16).replace("T", " ") : "");

  const api = { MAIN_ZOOM, iconOf, weatherGroupOf, label, visibleStations, obsText };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.HotWeather = api;
})(this);
