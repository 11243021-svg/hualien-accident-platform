// 道路安全指數（純函式，瀏覽器與 Node 測試共用）。
// 每條路段 0～100 分：① 事故件數（40%）② 嚴重程度（死亡×10＋受傷，40%）③ 近一年比前一年的趨勢（20%）。
// ①② 用「在所有路段中的百分位」，少數件數特別多的路段才不會把其他路段都擠成「安全」。
(function (root) {
  const WEIGHTS = { count: 0.4, severity: 0.4, trend: 0.2 };
  const DEATH_WEIGHT = 10;
  const MIN_COUNT = 3; // 少於 3 件：資料不足，不給分
  const LEVELS = [
    { key: "danger", label: "危險", min: 0 },
    { key: "warn", label: "注意", min: 40 },
    { key: "safe", label: "安全", min: 70 },
  ];
  const DAY = 86400000;

  const severityOf = (deaths, injuries) => (deaths || 0) * DEATH_WEIGHT + (injuries || 0);

  // 每個值在全部值裡的百分位（0＝最小、1＝最大；一樣大的拿平均名次）
  function percentiles(values) {
    const n = values.length;
    if (n <= 1) return values.map(() => 0.5);
    const order = values.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
    const out = new Array(n);
    let i = 0;
    while (i < n) {
      let j = i;
      while (j + 1 < n && order[j + 1][0] === order[i][0]) j++;
      const p = (i + j) / 2 / (n - 1);
      for (let k = i; k <= j; k++) out[order[k][1]] = p;
      i = j + 1;
    }
    return out;
  }

  // 趨勢：最近 12 個月 vs 前 12 個月（以資料最後一天 endTs 往回算），回傳 −1～1（正＝變多）與兩段件數
  function trendOf(events, endTs) {
    const end = Date.parse(endTs);
    let recent = 0;
    let prev = 0;
    events.forEach((ev) => {
      const t = Date.parse(ev.ts);
      if (!(t <= end)) return;
      if (t > end - 365 * DAY) recent++;
      else if (t > end - 730 * DAY) prev++;
    });
    const change = (recent - prev) / Math.max(prev, 1);
    return { recent, prev, change: Math.max(-1, Math.min(1, change)) };
  }

  function levelOf(score) {
    if (score === null || score === undefined) return { key: "none", label: "資料不足" };
    let lv = LEVELS[0];
    LEVELS.forEach((l) => {
      if (score >= l.min) lv = l;
    });
    return lv;
  }

  // accidents：目前篩選後的車禍（算件數、嚴重程度）；trendSource：不受「期間」篩選的車禍（算趨勢）
  // 回傳依危險程度排序的路段清單（資料不足的排在最後）
  function scoreRoads(accidents, trendSource, endTs) {
    const groups = new Map();
    accidents.forEach((ev) => {
      if (!ev.roadKey) return;
      let g = groups.get(ev.roadKey);
      if (!g) {
        g = { key: ev.roadKey, town: ev.town || "", road: ev.road || "", count: 0, deaths: 0, injuries: 0, lats: [], lons: [] };
        groups.set(ev.roadKey, g);
      }
      g.count++;
      g.deaths += ev.deaths || 0;
      g.injuries += ev.injuries || 0;
      g.lats.push(ev.lat);
      g.lons.push(ev.lon);
    });
    const byRoad = new Map();
    (trendSource || []).forEach((ev) => {
      if (!ev.roadKey || !groups.has(ev.roadKey)) return;
      if (!byRoad.has(ev.roadKey)) byRoad.set(ev.roadKey, []);
      byRoad.get(ev.roadKey).push(ev);
    });
    const median = (a) => {
      const s = a.slice().sort((x, y) => x - y);
      return s[Math.floor((s.length - 1) / 2)];
    };
    const all = [...groups.values()];
    const scored = all.filter((g) => g.count >= MIN_COUNT);
    const pc = percentiles(scored.map((g) => g.count));
    const ps = percentiles(scored.map((g) => severityOf(g.deaths, g.injuries)));
    const rows = all.map((g) => ({
      key: g.key, town: g.town, road: g.road, count: g.count, deaths: g.deaths, injuries: g.injuries,
      lat: median(g.lats), lon: median(g.lons), score: null, level: levelOf(null), parts: null,
      trend: endTs ? trendOf(byRoad.get(g.key) || [], endTs) : { recent: 0, prev: 0, change: 0 },
    }));
    const index = new Map(rows.map((r) => [r.key, r]));
    scored.forEach((g, i) => {
      const r = index.get(g.key);
      const t = (r.trend.change + 1) / 2;
      const danger = WEIGHTS.count * pc[i] + WEIGHTS.severity * ps[i] + WEIGHTS.trend * t;
      r.score = Math.round(100 * (1 - danger));
      r.level = levelOf(r.score);
      r.parts = { count: pc[i], severity: ps[i], trend: t };
    });
    return rows.sort((a, b) => {
      if (a.score === null || b.score === null) return (a.score === null) - (b.score === null) || b.count - a.count;
      return a.score - b.score || b.count - a.count || a.key.localeCompare(b.key);
    });
  }

  // 「近一年比前一年 +12 件」這種說明
  function trendText(trend) {
    const d = trend.recent - trend.prev;
    if (!trend.recent && !trend.prev) return "近兩年沒有事故";
    if (d === 0) return `近一年跟前一年一樣（${trend.recent} 件）`;
    return `近一年比前一年${d > 0 ? "多" : "少"} ${Math.abs(d)} 件（${trend.prev} → ${trend.recent}）`;
  }

  const api = { WEIGHTS, DEATH_WEIGHT, MIN_COUNT, LEVELS, percentiles, trendOf, levelOf, scoreRoads, trendText, severityOf };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.HotSafety = api;
})(this);
