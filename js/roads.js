// 路段：從地點文字抽出鄉鎮＋路名、路段統計與分級、路名搜尋、期間比較（純函式，瀏覽器與 Node 測試共用）。
(function (root) {
  const TOWN_PATTERNS = { hualien: /花蓮縣(\S{2,3}?[市鄉鎮])/, tainan: /臺南市(\S{1,3}?區)/ };
  const ROAD_RE = /((?:台|臺)\d+[甲乙丙丁]?線|[一-鿿\d]{1,8}?(?:路|街|大道)(?:[一二三四五六七八九十\d]+段)?)/;
  const SECTION_RE = /[一二三四五六七八九十\d]+段$/;
  // 地點常寫成「平和村中華路」，把開頭的村／里拿掉；但「嘉里路」這種路名本身含「里」的不動
  const VILLAGE_PREFIX = /^[一-鿿]{1,3}[村里](?=[一-鿿\d]+(?:路|街|大道))/;
  const TIERS = { count: [100, 50, 10], casualties: [100, 50, 10], deaths: [10, 5, 1] };
  const METRIC_LABEL = { count: "事故件數", casualties: "傷亡人數", deaths: "死亡人數" };
  const UNKNOWN_CAUSE = "未提供";

  // 地點文字的一段（「/」前後各一段）：拿掉縣市＋鄉鎮，回傳 { town, rest }
  function splitTown(part, region) {
    const tm = part.match(TOWN_PATTERNS[region]);
    return { town: tm ? tm[1] : "", rest: (tm ? part.slice(tm.index + tm[0].length) : part).trim() };
  }
  // 找路名：回傳 { road, after（路名後面的文字） }
  function findRoad(rest) {
    const rm = rest.match(ROAD_RE);
    if (!rm) return { road: "", after: "" };
    return { road: rm[1].replace(VILLAGE_PREFIX, ""), after: rest.slice(rm.index + rm[0].length) };
  }

  function extractRoad(place, region) {
    const { town, rest } = splitTown((place || "").split("/")[0], region);
    return { town, road: findRoad(rest).road };
  }

  // 「中華路2段」→「中華路二段」：同一段路不管寫數字或國字都算同一段
  const DIGIT_CN = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
  const normRoad = (road) => (road || "").replace(/(\d+)段$/, (m, n) => (DIGIT_CN[Number(n)] || n) + "段");
  const roadBase = (road) => (road || "").replace(SECTION_RE, "");
  // 路段依「段」分開統計：建國路一段、建國路二段是不同路段
  const roadKey = (town, road) => (road ? `${town || ""} ${normRoad(road)}`.trim() : "");

  // 確切地點：「建國路一段與北昌五街口」（路口）、「建國路二段81號」（門牌）、「台9線 179公里處」（里程）；
  // 只寫到路名或「東側」這種的回傳空字串（不算確切地點）
  function spotOf(place, region) {
    const parts = (place || "").split("/").map((p) => findRoad(splitTown(p.trim(), region).rest));
    const [a, b] = parts;
    if (!a || !a.road) return "";
    const r1 = normRoad(a.road);
    const r2 = b && b.road ? normRoad(b.road) : "";
    if (r2 && r2 !== r1) return `${r1}與${r2}口`;
    const num = a.after.match(/^([\d巷弄之-]+號)/);
    if (num) return r1 + num[1];
    const alley = a.after.match(/^(\d+巷(?:\d+弄)?)/);
    if (alley) return r1 + alley[1];
    const km = a.after.match(/(\d+(?:\.\d+)?)\s*公里/);
    if (km) return `${r1} ${km[1]}公里處`;
    if (/^口/.test(a.after) || (b && /^口/.test(b.after))) return `${r1}口`;
    return "";
  }

  // 前 3 個最常出事的地點 → 「建國路一段與北昌五街口 3 件、…」
  const spotsText = (spots) => (spots || []).map((x) => `${x.spot} ${x.count} 件`).join("、");

  function annotateAccidents(list, region) {
    list.forEach((ev) => {
      const { town, road } = extractRoad(ev.place, region);
      ev.town = town;
      ev.road = road;
      ev.roadKey = roadKey(town, road);
      ev.spot = spotOf(ev.place, region);
    });
    return list;
  }

  function annotateDetections(list) {
    list.forEach((ev) => {
      ev.roadKey = roadKey(ev.town, ev.road);
    });
    return list;
  }

  function metricValue(g, metric) {
    if (metric === "deaths") return g.deaths;
    if (metric === "casualties") return g.deaths + g.injuries;
    return g.count;
  }

  function tierOf(value, metric) {
    const [high, mid, low] = TIERS[metric] || TIERS.count;
    if (value >= high) return "high";
    if (value >= mid) return "mid";
    if (value >= low) return "low";
    return null;
  }

  function median(nums) {
    const s = nums.slice().sort((a, b) => a - b);
    return s[Math.floor((s.length - 1) / 2)];
  }

  function aggregateRoads(list, metric) {
    const groups = new Map();
    list.forEach((ev) => {
      if (!ev.roadKey) return;
      let g = groups.get(ev.roadKey);
      if (!g) {
        g = { key: ev.roadKey, town: ev.town || "", road: normRoad(ev.road), count: 0, deaths: 0, injuries: 0, lats: [], lons: [], causes: new Map(), spots: new Map() };
        groups.set(ev.roadKey, g);
      }
      g.count += 1;
      g.deaths += ev.deaths || 0;
      g.injuries += ev.injuries || 0;
      g.lats.push(ev.lat);
      g.lons.push(ev.lon);
      if (ev.cause && ev.cause !== UNKNOWN_CAUSE) g.causes.set(ev.cause, (g.causes.get(ev.cause) || 0) + 1);
      if (ev.spot) {
        const sp = g.spots.get(ev.spot) || { count: 0, lats: [], lons: [] };
        sp.count += 1;
        sp.lats.push(ev.lat);
        sp.lons.push(ev.lon);
        g.spots.set(ev.spot, sp);
      }
    });
    const out = [...groups.values()].map((g) => {
      let topCause = "";
      let best = 0;
      g.causes.forEach((n, c) => {
        if (n > best) { best = n; topCause = c; }
      });
      const topSpots = [...g.spots.entries()]
        .map(([spot, sp]) => ({ spot, count: sp.count, lat: median(sp.lats), lon: median(sp.lons) }))
        .sort((x, y) => y.count - x.count || x.spot.localeCompare(y.spot, "zh-Hant"))
        .slice(0, 3);
      const r = { key: g.key, town: g.town, road: g.road, count: g.count, deaths: g.deaths, injuries: g.injuries, lat: median(g.lats), lon: median(g.lons), topCause, topSpots };
      r.value = metricValue(r, metric);
      r.tier = tierOf(r.value, metric);
      return r;
    });
    return out.sort((a, b) => b.value - a.value || b.count - a.count || a.key.localeCompare(b.key));
  }

  // 地圖縮小時路段圓圈太擠：縣的範圍只畫前 10 名，鄉鎮畫前 30 名，放大到街道才全部畫；目前選取的路段一定畫
  function roadLimit(zoom) {
    if (zoom <= 11) return 10;
    if (zoom <= 13) return 30;
    return Infinity;
  }

  function visibleRoads(roads, zoom, selectedKey) {
    const shown = roads.slice(0, roadLimit(zoom));
    if (selectedKey && !shown.some((r) => r.key === selectedKey)) {
      const sel = roads.find((r) => r.key === selectedKey);
      if (sel) shown.push(sel);
    }
    return shown;
  }

  // 越遠圓圈越小，避免整片疊在一起
  function zoomScale(zoom) {
    if (zoom <= 10) return 0.55;
    if (zoom <= 11) return 0.7;
    if (zoom <= 12) return 0.85;
    return 1;
  }

  // 斑點圖的點：縣的範圍縮很小，放大到街道才是原本大小
  function spotScale(zoom) {
    if (zoom <= 10) return 0.4;
    if (zoom <= 11) return 0.5;
    if (zoom <= 12) return 0.65;
    if (zoom <= 13) return 0.85;
    return 1;
  }

  // 點擊或滑鼠位置（螢幕座標）附近最近的點：距離在「點的半徑＋容許誤差」內才算點到；回傳索引，沒有回 -1
  function nearestPoint(pts, x, y, tol) {
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const d = Math.hypot(p.x - x, p.y - y);
      if (d <= p.r + tol && d < bestD) {
        best = i;
        bestD = d;
      }
    }
    return best;
  }

  function circleRadius(value, maxValue) {
    if (!maxValue || maxValue <= 0) return 8;
    return Math.round(8 + 28 * Math.sqrt(Math.max(0, value) / maxValue));
  }

  function matchRoad(ev, query) {
    const norm = (t) => t.replace(/[\s,，]/g, "").replace(/(\d+)段/g, (m, n) => (DIGIT_CN[Number(n)] || n) + "段");
    const noSection = (t) => t.replace(/[一二三四五六七八九十]+段/g, "");
    const q = norm(query || "");
    if (!q) return false;
    // 「建國路」會符合「建國路二段」，「建國路2段」也找得到「建國路二段」；也接受鄉鎮名（「吉安鄉」）
    if (norm(`${ev.town || ""}${ev.road || ""}`).includes(q)) return true;
    // 巷弄、門牌要比對完整地址；地址寫「中正路1段126巷」，只打「中正路126巷」也算
    const place = norm(`${ev.place || ""}${ev.address || ""}`);
    return place.includes(q) || noSection(place).includes(noSection(q));
  }

  // 搜尋找不到時的提示：期間不是 5 年就建議放寬；打了巷弄門牌就建議只打路名
  function noResultText(query, periodLabel) {
    const tips = [];
    if (periodLabel && periodLabel !== "最近 5 年") tips.push("上方「看什麼時候」改選「全部 5 年」");
    const road = (query.match(/^.*?(?:路|街|大道)(?:[一二三四五六七八九十\d]+段)?/) || [])[0];
    if (road && road !== query) tips.push(`只打路名「${road}」`);
    if (!tips.length) tips.push("只打路名，例如 建國路");
    return `${periodLabel || ""}找不到「${query}」的車禍或偵測紀錄。可以試試：${tips.join("，或")}。`;
  }

  const uniqSorted = (arr) => [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-Hant"));
  const towns = (list) => uniqSorted(list.map((ev) => ev.town));
  const villages = (detections, town) => uniqSorted(detections.filter((d) => !town || d.town === town).map((d) => d.village));

  function dataYears(list) {
    if (!list.length) return { start: null, end: null };
    let start = Infinity;
    let end = -Infinity;
    list.forEach((ev) => {
      if (ev.year < start) start = ev.year;
      if (ev.year > end) end = ev.year;
    });
    return { start, end };
  }

  const inLastYears = (ev, years, endYear) => ev.year > endYear - years;

  function comparePrev(list, years, span) {
    const current = list.filter((ev) => ev.year > span.end - years).length;
    const prevStart = span.end - 2 * years + 1;
    if (span.start === null || prevStart < span.start) return { current, previous: null };
    const previous = list.filter((ev) => ev.year > span.end - 2 * years && ev.year <= span.end - years).length;
    return { current, previous };
  }

  // period：{ kind: "last", n } 最近 n 年；{ kind: "year", y } 單一年份
  function inPeriodYears(ev, period, endYear) {
    if (period.kind === "year") return ev.year === period.y;
    return ev.year > endYear - period.n;
  }

  // 單一年份跟前一年比；前一年不在資料範圍 → previous 為 null
  function compareYear(list, y, span) {
    const current = list.filter((ev) => ev.year === y).length;
    if (span.start === null || y - 1 < span.start) return { current, previous: null };
    return { current, previous: list.filter((ev) => ev.year === y - 1).length };
  }

  function percentile(sorted, p) {
    const idx = p * (sorted.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  }

  // 資料最集中的範圍：lat、lon 各取第 10 與第 90 百分位，回傳 Leaflet 用的 [[南, 西], [北, 東]]
  function denseBounds(list) {
    if (!list.length) return null;
    const lats = list.map((e) => e.lat).sort((a, b) => a - b);
    const lons = list.map((e) => e.lon).sort((a, b) => a - b);
    return [[percentile(lats, 0.1), percentile(lons, 0.1)], [percentile(lats, 0.9), percentile(lons, 0.9)]];
  }

  const api = {
    TIERS, METRIC_LABEL, extractRoad, normRoad, roadBase, roadKey, spotOf, spotsText, annotateAccidents, annotateDetections,
    metricValue, tierOf, aggregateRoads, circleRadius, roadLimit, visibleRoads, zoomScale, spotScale, nearestPoint, matchRoad, noResultText, towns, villages, dataYears, inLastYears, comparePrev,
    inPeriodYears, compareYear, denseBounds,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.HotRoads = api;
})(this);
