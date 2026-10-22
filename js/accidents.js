// 車禍資料：台南／花蓮 Supabase 列轉成統一格式，加上篩選與統計（純函式，瀏覽器與 Node 測試共用）。
(function (root) {
  const F = typeof module !== "undefined" && module.exports ? require("./filters.js") : root.HotFilters;

  const TAINAN_COLUMNS = [
    "Seq", "發生日期", "1.發生時間", "GPS經度", "GPS緯度", "發生縣市名稱", "24小時內死亡人數",
    "30日內死亡人數", "受傷人數", "天候", "事故類型及型態", "初步分析研判子類別-主要",
  ];
  const HUALIEN_COLUMNS = [
    "案件編號", "年度", "發生日期", "發生時間", "GPS經度", "GPS緯度", "發生地點",
    "死亡人數", "受傷人數", "天候", "事故類型及型態", "主要肇因",
  ];
  const UNKNOWN_CAUSE = "未提供";

  const num = (v) => (v === null || v === undefined || v === "" ? NaN : Number(v));
  const int = (v) => (Number.isFinite(num(v)) ? Math.trunc(num(v)) : 0);

  function toTs(date, time) {
    const d = String(int(date)).padStart(8, "0");
    const t = String(int(time)).padStart(6, "0");
    return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4, 6)}`;
  }

  function build(id, date, time, lon, lat, place, deaths, injuries, cause, weather, type) {
    const la = num(lat);
    const lo = num(lon);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
    return {
      id: String(id),
      ts: toTs(date, time),
      year: Math.trunc(int(date) / 10000),
      lat: la,
      lon: lo,
      place: place || "",
      deaths,
      injuries,
      severity: deaths > 0 ? "death" : "injury",
      cause: cause || UNKNOWN_CAUSE,
      weather: weather || "",
      type: type || "",
    };
  }

  function normalizeTainan(r) {
    const deaths = int(r["24小時內死亡人數"]) + int(r["30日內死亡人數"]);
    return build(r.Seq, r["發生日期"], r["1.發生時間"], r["GPS經度"], r["GPS緯度"], r["發生縣市名稱"],
      deaths, int(r["受傷人數"]), r["初步分析研判子類別-主要"], r["天候"], r["事故類型及型態"]);
  }

  function normalizeHualien(r) {
    return build(r["案件編號"], r["發生日期"], r["發生時間"], r["GPS經度"], r["GPS緯度"], r["發生地點"],
      int(r["死亡人數"]), int(r["受傷人數"]), r["主要肇因"], r["天候"], r["事故類型及型態"]);
  }

  function defaultAccState() {
    return { mode: "all", period: null, hour: 0, severities: new Set(["death", "injury"]), year: null };
  }

  function matchesCategory(a, state) {
    return state.severities.has(a.severity) && (state.year === null || a.year === state.year);
  }

  function matchesTime(a, state) {
    if (state.mode === "period") return F.inPeriod(F.hourOf(a.ts), state.period);
    if (state.mode === "hour") return F.hourOf(a.ts) === state.hour;
    return true;
  }

  function filterAccidents(list, state) {
    return list.filter((a) => matchesCategory(a, state) && matchesTime(a, state));
  }

  function countCasualties(list) {
    const c = { total: list.length, deaths: 0, injuries: 0 };
    list.forEach((a) => {
      c.deaths += a.deaths;
      c.injuries += a.injuries;
    });
    return c;
  }

  function topCauses(list, n = 10) {
    const counts = new Map();
    let unknown = 0;
    list.forEach((a) => {
      if (!a.cause || a.cause === UNKNOWN_CAUSE) unknown++;
      else counts.set(a.cause, (counts.get(a.cause) || 0) + 1);
    });
    const top = [...counts.entries()]
      .map(([cause, count]) => ({ cause, count }))
      .sort((x, y) => y.count - x.count || x.cause.localeCompare(y.cause))
      .slice(0, n);
    return { top, unknown };
  }

  function yearsOf(list) {
    return [...new Set(list.map((a) => a.year))].sort((x, y) => x - y);
  }

  const api = {
    TAINAN_COLUMNS, HUALIEN_COLUMNS, UNKNOWN_CAUSE, normalizeTainan, normalizeHualien,
    defaultAccState, matchesCategory, filterAccidents, countCasualties, topCauses, yearsOf,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.HotAccidents = api;
})(this);
