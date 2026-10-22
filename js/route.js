// 民眾路線安全提醒：路線沿線的車禍、危險路段、監視器（純函式，瀏覽器與 Node 測試共用）。
// 座標一律 [緯度, 經度]；距離用平面近似（花蓮範圍內誤差很小）。
(function (root) {
  const M_PER_DEG_LAT = 110574;
  const mPerDegLon = (lat) => 111320 * Math.cos((lat * Math.PI) / 180);

  // 點到線段的距離（公尺）
  function distToSegment(p, a, b) {
    const k = mPerDegLon(p[0]);
    const ax = (a[1] - p[1]) * k, ay = (a[0] - p[0]) * M_PER_DEG_LAT;
    const bx = (b[1] - p[1]) * k, by = (b[0] - p[0]) * M_PER_DEG_LAT;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    return Math.hypot(ax + t * dx, ay + t * dy);
  }

  function distToRoute(p, line) {
    if (!line.length) return Infinity;
    if (line.length === 1) return distToSegment(p, line[0], line[0]);
    let best = Infinity;
    for (let i = 1; i < line.length; i++) best = Math.min(best, distToSegment(p, line[i - 1], line[i]));
    return best;
  }

  // 路線外框（往外多留 radius 公尺），先用外框篩掉大部分車禍，不用每筆都算距離
  function bbox(line, radius) {
    let s = Infinity, n = -Infinity, w = Infinity, e = -Infinity;
    line.forEach(([lat, lon]) => {
      s = Math.min(s, lat); n = Math.max(n, lat); w = Math.min(w, lon); e = Math.max(e, lon);
    });
    const dLat = radius / M_PER_DEG_LAT;
    const dLon = radius / mPerDegLon((s + n) / 2);
    return { s: s - dLat, n: n + dLat, w: w - dLon, e: e + dLon };
  }
  const inBox = (b, lat, lon) => lat >= b.s && lat <= b.n && lon >= b.w && lon <= b.e;

  function nearRoute(line, items, radius) {
    if (line.length < 2 || !items.length) return [];
    const b = bbox(line, radius);
    return items.filter((x) => inBox(b, x.lat, x.lon) && distToRoute([x.lat, x.lon], line) <= radius);
  }

  const median = (nums) => {
    const s = nums.slice().sort((a, b) => a - b);
    return s[Math.floor((s.length - 1) / 2)];
  };

  // 沿線車禍：依確切地點（路口／門牌；沒有就用路段名）統計前 5
  function routeHazards(line, accidents, radius = 30) {
    const points = nearRoute(line, accidents, radius);
    const groups = new Map();
    let deaths = 0, injuries = 0;
    points.forEach((ev) => {
      deaths += ev.deaths || 0;
      injuries += ev.injuries || 0;
      const name = ev.spot || ev.roadKey || ev.place || "未標明地點";
      const g = groups.get(name) || { name, count: 0, deaths: 0, injuries: 0, lats: [], lons: [] };
      g.count += 1;
      g.deaths += ev.deaths || 0;
      g.injuries += ev.injuries || 0;
      g.lats.push(ev.lat);
      g.lons.push(ev.lon);
      groups.set(name, g);
    });
    const top = [...groups.values()]
      .sort((a, b) => b.count - a.count || b.deaths - a.deaths || a.name.localeCompare(b.name, "zh-Hant"))
      .slice(0, 5)
      .map((g) => ({ name: g.name, count: g.count, deaths: g.deaths, injuries: g.injuries, lat: median(g.lats), lon: median(g.lons) }));
    return { count: points.length, deaths, injuries, top, points };
  }

  const segLen = (a, b) => Math.hypot((b[0] - a[0]) * M_PER_DEG_LAT, (b[1] - a[1]) * mPerDegLon(a[0]));

  // 路線先切成每段約 step 公尺，附近車禍數量到門檻就標成危險（地圖上畫紅色）；
  // 不切的話，路線服務給的一段可能好幾百公尺，整條都會變紅。
  // threshold 給 "auto"：跟這條路線自己比，比平均多 1.5 倍（至少 3 件）才算危險，市區才不會整條紅
  function dangerSegments(line, points, { radius = 30, threshold = 3, step = 100 } = {}) {
    const segs = [];
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1], b = line[i];
      const n = Math.max(1, Math.ceil(segLen(a, b) / step));
      for (let k = 0; k < n; k++) {
        const from = k === 0 ? a : [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n];
        const to = k === n - 1 ? b : [a[0] + ((b[0] - a[0]) * (k + 1)) / n, a[1] + ((b[1] - a[1]) * (k + 1)) / n];
        const count = points.filter((p) => distToSegment([p.lat, p.lon], from, to) <= radius).length;
        segs.push({ from, to, count });
      }
    }
    const avg = segs.length ? segs.reduce((s, x) => s + x.count, 0) / segs.length : 0;
    const thr = threshold === "auto" ? Math.max(3, Math.ceil(avg * 1.5)) : threshold;
    segs.forEach((s) => (s.danger = s.count >= thr));
    return segs;
  }

  function camerasNear(line, cams, radius = 150) {
    return nearRoute(line, cams.filter((c) => c.liveUrl !== null), radius);
  }

  function summaryText(h, periodLabel) {
    const p = periodLabel || "";
    if (!h.count) return `${p}這條路線沿線沒有車禍紀錄，仍請小心駕駛。`;
    return `${p}這條路線沿線發生過 ${h.count.toLocaleString()} 件車禍（死亡 ${h.deaths} 人、受傷 ${h.injuries.toLocaleString()} 人）。`;
  }

  // OSRM 路線回應 → { line: [[lat, lon]...], km, minutes }；沒有路線回 null
  function parseOsrm(data) {
    const r = data && data.code === "Ok" && data.routes && data.routes[0];
    if (!r || !r.geometry || !Array.isArray(r.geometry.coordinates)) return null;
    return {
      line: r.geometry.coordinates.map(([lon, lat]) => [lat, lon]),
      km: Math.round(r.distance / 100) / 10,
      minutes: Math.max(1, Math.round(r.duration / 60)),
    };
  }

  // Nominatim 查地名回應 → { lat, lon, name }；找不到回 null
  function parseNominatim(data) {
    const r = Array.isArray(data) && data[0];
    if (!r) return null;
    const lat = Number(r.lat), lon = Number(r.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon, name: r.display_name || "" };
  }

  const api = { distToRoute, routeHazards, dangerSegments, camerasNear, summaryText, parseOsrm, parseNominatim };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.HotRoute = api;
})(this);
