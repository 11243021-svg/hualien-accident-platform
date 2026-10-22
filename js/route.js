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

  // ── 找地點：讓「花蓮火車站前站」「慈大」「中山路100號」這種日常說法都找得到 ──
  const CN_NUM = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
  // 全形數字轉半形、臺→台、去掉空白與開頭的「台灣」「花蓮縣」、段的數字統一成國字
  function normPlace(text) {
    return String(text || "")
      .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
      .replace(/\s+/g, "")
      .replace(/臺/g, "台")
      .replace(/^台灣/, "")
      .replace(/^花蓮縣/, "")
      .replace(/(\d+)段/g, (m, n) => (CN_NUM[Number(n)] || n) + "段");
  }

  // 花蓮常用地點（座標 2026-10-22 用 OpenStreetMap 核對過）；exact 的名字太短，只有完全一樣才算
  const LANDMARKS = [
    { label: "花蓮火車站（前站）", lat: 23.99307, lon: 121.60325, names: ["花蓮火車站", "花蓮車站", "花蓮站", "花蓮火車站前站", "花蓮車站前站", "花蓮前站", "火車站前站"], exact: ["火車站", "車站", "前站"] },
    { label: "花蓮火車站（後站）", lat: 23.9938, lon: 121.60005, names: ["花蓮火車站後站", "花蓮車站後站", "花蓮後站", "火車站後站"], exact: ["後站"] },
    { label: "吉安車站", lat: 23.96773, lon: 121.58224, names: ["吉安車站", "吉安火車站", "吉安站"] },
    { label: "新城車站", lat: 24.12764, lon: 121.64141, names: ["新城車站", "新城火車站", "新城站"] },
    { label: "壽豐車站", lat: 23.86891, lon: 121.51081, names: ["壽豐車站", "壽豐火車站", "壽豐站"] },
    { label: "慈濟大學", lat: 23.99422, lon: 121.58929, names: ["慈濟大學"], exact: ["慈大"] },
    { label: "花蓮慈濟醫院", lat: 23.99492, lon: 121.59272, names: ["慈濟醫院", "花蓮慈濟醫院", "花蓮慈濟"], exact: ["慈院"] },
    { label: "慈濟中學", lat: 23.999, lon: 121.57616, names: ["慈濟中學", "慈濟高中", "慈大附中"] },
    { label: "東華大學", lat: 23.89732, lon: 121.54257, names: ["東華大學", "國立東華大學"], exact: ["東華"] },
    { label: "東大門夜市", lat: 23.97254, lon: 121.61131, names: ["東大門夜市", "東大門"] },
    { label: "七星潭", lat: 24.02584, lon: 121.63225, names: ["七星潭"] },
    { label: "花蓮機場", lat: 24.02371, lon: 121.61991, names: ["花蓮機場", "花蓮航空站"], exact: ["機場"] },
    { label: "花蓮港", lat: 23.98778, lon: 121.63432, names: ["花蓮港"] },
    { label: "遠東百貨花蓮店", lat: 23.97824, lon: 121.59918, names: ["遠東百貨", "遠百花蓮", "花蓮遠百"], exact: ["遠百"] },
    { label: "花蓮縣政府", lat: 23.99148, lon: 121.61929, names: ["花蓮縣政府", "縣政府"] },
    { label: "門諾醫院", lat: 23.9881, lon: 121.62586, names: ["門諾醫院"], exact: ["門諾"] },
    { label: "花蓮高中", lat: 23.98629, lon: 121.62556, names: ["花蓮高中"], exact: ["花中"] },
    { label: "花蓮女中", lat: 23.979, lon: 121.61571, names: ["花蓮女中", "花蓮女子高級中學"], exact: ["花女"] },
    { label: "花蓮文創園區", lat: 23.9766, lon: 121.60452, names: ["花蓮文化創意產業園區", "花蓮文創園區", "文創園區"] },
    { label: "北濱公園", lat: 23.9777, lon: 121.61802, names: ["北濱公園", "北濱"] },
    { label: "南濱公園", lat: 23.96727, lon: 121.61031, names: ["南濱公園", "南濱"] },
    { label: "鯉魚潭", lat: 23.92976, lon: 121.51036, names: ["鯉魚潭"] },
    { label: "花蓮巨蛋（縣立體育場）", lat: 24.00441, lon: 121.58448, names: ["花蓮巨蛋", "花蓮縣立體育場", "縣立體育場"] },
    { label: "吉安鄉公所", lat: 23.97396, lon: 121.56344, names: ["吉安鄉公所"] },
    { label: "家樂福花蓮店", lat: 24.01509, lon: 121.61001, names: ["家樂福花蓮", "花蓮家樂福", "家樂福"] },
    { label: "太魯閣（富世村）", lat: 24.1521, lon: 121.62394, names: ["太魯閣"] },
  ];
  const QUICK_PLACES = ["花蓮火車站", "慈濟醫院", "東大門夜市", "七星潭", "東華大學"]; // 面板上的常用地點按鈕

  // 常用地點：名字完全一樣優先；否則找「輸入裡包含的最長名字」（例：慈濟大學附近）
  function findLandmark(text) {
    const t = normPlace(text);
    let best = null;
    let bestLen = 0;
    for (const lm of LANDMARKS) {
      const all = lm.names.concat(lm.exact || []);
      if (all.includes(t)) return lm;
      for (const n of lm.names) {
        if (n.length >= 3 && t.includes(n) && n.length > bestLen) {
          best = lm;
          bestLen = n.length;
        }
      }
    }
    return best;
  }

  // 「我家」「這裡」「我的位置」這類說法：地圖查不到，要改用手機定位
  const HERE_WORDS = ["我家", "家", "這裡", "這邊", "我這裡", "目前位置", "現在位置", "我的位置", "我現在的位置", "我在這", "我在這裡", "所在地"];
  const meansHere = (text) => HERE_WORDS.includes(normPlace(text));

  // 地名查詢服務查不到時，換幾種說法再試
  function placeVariants(text) {
    const t = normPlace(text);
    const strip = t.replace(/(前站|後站|站前|附近|門口|旁邊|對面)$/, "");
    const uniq = (arr) => [...new Set(arr.filter(Boolean))];
    const base = uniq([t, strip]);
    const train = uniq(base.concat(base.map((f) => f.replace("火車站", "車站"))));
    return t.startsWith("花蓮") ? train : train.concat(train.map((f) => "花蓮" + f));
  }

  // 用車禍資料找門牌或路名：車禍地點文字有幾萬筆真實門牌與座標（OpenStreetMap 在台灣缺門牌）
  const TOWNS = ["花蓮市", "吉安鄉", "新城鄉", "壽豐鄉", "秀林鄉", "鳳林鎮", "光復鄉", "豐濱鄉", "瑞穗鄉", "萬榮鄉", "玉里鎮", "卓溪鄉", "富里鄉"];
  const ADDR_RE = /^(.*?(?:路|街|大道)(?:[一二三四五六七八九十]+段)?)(?:(\d+)巷)?(?:(\d+)號)?/;
  function localAddress(text, accidents) {
    let t = normPlace(text);
    const town = TOWNS.find((x) => t.startsWith(x)) || "";
    t = t.slice(town.length);
    const m = t.match(ADDR_RE);
    if (!m || !m[1]) return null;
    const road = m[1];
    const num = m[3] ? Number(m[3]) : m[2] ? Number(m[2]) : null;
    const numRe = new RegExp(road.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(\\d+)(?:巷|號)");
    const cands = [];
    accidents.forEach((ev) => {
      const p = normPlace(ev.place);
      if (!p.includes(road) || (town && !p.includes(town))) return;
      const pm = p.match(numRe);
      cands.push({ ev, n: pm ? Number(pm[1]) : null });
    });
    if (!cands.length) return null;
    const label = `${town}${road}${num !== null ? num + (m[3] ? "號" : "巷") : ""}（依車禍紀錄估計的位置）`;
    const withNum = num !== null ? cands.filter((c) => c.n !== null) : [];
    if (withNum.length) {
      withNum.sort((a, b) => Math.abs(a.n - num) - Math.abs(b.n - num));
      return { lat: withNum[0].ev.lat, lon: withNum[0].ev.lon, label };
    }
    return { lat: median(cands.map((c) => c.ev.lat)), lon: median(cands.map((c) => c.ev.lon)), label };
  }

  const api = { normPlace, LANDMARKS, QUICK_PLACES, findLandmark, meansHere, placeVariants, localAddress, distToRoute, routeHazards, dangerSegments, camerasNear, summaryText, parseOsrm, parseNominatim };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.HotRoute = api;
})(this);
