// 里長匯出報表：危險路段轉成 CSV（Excel 打得開的中文），純函式，瀏覽器與 Node 測試共用。
(function (root) {
  const TIER_LABEL = { high: "高", mid: "中", low: "低" };
  const HEADER = ["名次", "鄉鎮", "路段", "事故件數", "死亡人數", "受傷人數", "傷亡人數", "等級", "常見肇因", "最常出事地點"];
  const BOM = "﻿"; // 開頭加這個，Excel 才知道是 UTF-8，中文不會亂碼
  const EOL = "\r\n";
  const pad2 = (n) => String(n).padStart(2, "0");

  // 一個欄位：開頭是 = + - @ 會被 Excel 當公式，前面加 ' 擋掉；含逗號、雙引號、換行就用雙引號包起來
  function csvField(value) {
    if (value === null || value === undefined) return "";
    let s = String(value);
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  // 最常出事的路口／門牌：「中正路與中山路口 9 件；中正路41號 4 件」
  const spots = (list) => (list || []).map((x) => `${x.spot} ${x.count} 件`).join("；");
  const csvLine = (fields) => fields.map(csvField).join(",");
  const stamp = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

  // meta：{ region, town（空字串＝全部）, period, time, metric（分級依據文字）, minCount, now（Date） }
  function toCsv(roads, meta) {
    const now = meta.now || new Date();
    const lines = [
      csvLine(["熱點地圖危險路段報表", meta.region, meta.town || "全部", meta.period, meta.time, `依${meta.metric}`, `至少${meta.minCount}件`, `產生時間 ${stamp(now)}`]),
      csvLine(HEADER),
    ];
    roads.forEach((r, i) => {
      lines.push(csvLine([i + 1, r.town, r.road, r.count, r.deaths, r.injuries, r.deaths + r.injuries, TIER_LABEL[r.tier] || "", r.topCause || "", spots(r.topSpots)]));
    });
    return BOM + lines.join(EOL) + EOL;
  }

  function fileName(region, now) {
    const d = now || new Date();
    return `熱點地圖_路段報表_${region}_${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}.csv`;
  }

  const api = { TIER_LABEL, HEADER, csvField, toCsv, fileName };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.HotReport = api;
})(this);
