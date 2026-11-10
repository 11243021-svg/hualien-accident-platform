// AI 轄區分析：把目前條件下的車禍「統計數字」整理成要送給 AI 的資料，以及把 AI 的回答拆成段落
// （純函式，瀏覽器與 Node 測試共用）。只送統計，不送個別事故的地點文字或時間。
(function (root) {
  const PERIODS = [["清晨05-08", 5, 8], ["白天08-17", 8, 17], ["傍晚17-20", 17, 20]];
  const hourOf = (ts) => Number(String(ts).slice(11, 13));
  const tally = (list, key) => {
    const m = {};
    list.forEach((x) => {
      const k = key(x);
      if (k) m[k] = (m[k] || 0) + 1;
    });
    return m;
  };
  const sortedEntries = (m) => Object.entries(m).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-Hant"));

  // acc：目前條件下的車禍；roads：路段排行（已排序）；meta：{ region, town, period, time }
  function buildPayload(acc, roads, meta) {
    const periods = { "清晨05-08": 0, "白天08-17": 0, "傍晚17-20": 0, "深夜20-05": 0 };
    const hours = new Array(24).fill(0);
    acc.forEach((e) => {
      const h = hourOf(e.ts);
      if (!Number.isFinite(h)) return;
      hours[h] += 1;
      const p = PERIODS.find(([, a, b]) => h >= a && h < b);
      periods[p ? p[0] : "深夜20-05"] += 1;
    });
    const peak = hours
      .map((n, h) => [h, n])
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])
      .slice(0, 3)
      .map(([h, n]) => `${String(h).padStart(2, "0")} 點（${n} 件）`);
    const causes = sortedEntries(tally(acc, (e) => (e.cause && e.cause !== "未提供" ? e.cause : "")))
      .slice(0, 5)
      .map(([肇因, 件數]) => ({ 肇因, 件數 }));
    return {
      條件: { 地區: meta.region, 鄉鎮: meta.town || "全部鄉鎮", 期間: meta.period, 時段: meta.time },
      總件數: acc.length,
      死亡人數: acc.reduce((s, e) => s + (e.deaths || 0), 0),
      受傷人數: acc.reduce((s, e) => s + (e.injuries || 0), 0),
      危險路段前10名: roads.slice(0, 10).map((r) => ({
        路段: `${r.town} ${r.road}`.trim(),
        件數: r.count,
        死亡: r.deaths,
        受傷: r.injuries,
        常見肇因: r.topCause || "未提供",
        最常出事地點: (r.topSpots || []).map((s) => `${s.spot}（${s.count} 件）`),
      })),
      肇因前5名: causes,
      各時段件數: periods,
      事故最多的3個小時: peak,
      天候: Object.fromEntries(sortedEntries(tally(acc, (e) => e.weatherG))),
      事故型態: Object.fromEntries(sortedEntries(tally(acc, (e) => e.typeG))),
    };
  }

  // AI 的回答（簡單 Markdown）→ [{ type: "h"|"li"|"p", text }]，畫面一律用 textContent 顯示
  function parseAnswer(text) {
    const clean = (s) => s.replace(/\*\*|__|`/g, "").trim();
    const blocks = [];
    String(text || "").split(/\r?\n/).forEach((raw) => {
      const line = raw.trim();
      if (!line) return;
      let m;
      if ((m = line.match(/^#{1,6}\s+(.*)$/))) blocks.push({ type: "h", text: clean(m[1]) });
      else if ((m = line.match(/^(?:[-*•]|\d+[.、)])\s+(.*)$/))) blocks.push({ type: "li", text: clean(m[1]) });
      else blocks.push({ type: "p", text: clean(line) });
    });
    return blocks;
  }

  // 24 小時分布的一句結論：最多的兩個時段
  function peakText(hours) {
    const top = hours.map((n, h) => [h, n]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    if (!top.length) return "";
    const fmt = ([h, n]) => `${h}～${h + 1} 點（${n.toLocaleString()} 件）`;
    return `車禍最多的時段是 ${fmt(top[0])}${top[1] ? `，其次是 ${fmt(top[1])}` : ""}。`;
  }

  // 數量最多的前 n 個位置（同數量取前面的；0 不算），圖表用來標紅
  function topIndexes(values, n) {
    return values.map((v, i) => [i, v]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, n).map(([i]) => i);
  }

  // ===== 事故分析分頁（老師 11/9：管理單位和民眾關心的數據做成圖）=====
  const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];
  // 星期分布：[星期一, …, 星期日] 的件數（ts 前 10 碼是日期）
  function weekdayCounts(list) {
    const out = new Array(7).fill(0);
    list.forEach((e) => {
      const d = new Date(`${String(e.ts).slice(0, 10)}T00:00:00Z`);
      if (!Number.isNaN(d.getTime())) out[(d.getUTCDay() + 6) % 7] += 1;
    });
    return out;
  }
  function weekdayText(counts) {
    const total = counts.reduce((a, b) => a + b, 0);
    if (!total) return "";
    const top = counts.indexOf(Math.max(...counts));
    const wd = counts.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
    const we = (counts[5] + counts[6]) / 2;
    const cmp = Math.abs(wd - we) < Math.max(wd, we) * 0.05 ? "平日跟週末差不多" : wd > we ? "平日比週末多" : "週末比平日多";
    return `最常出事的是星期${WEEKDAYS[top]}（${counts[top].toLocaleString()} 件）；${cmp}。`;
  }

  // 年度趨勢：[{ year（西元）, count, casualties }]，依年份排序
  function yearlyStats(list) {
    const m = new Map();
    list.forEach((e) => {
      const y = Number(String(e.ts).slice(0, 4));
      if (!Number.isFinite(y)) return;
      const o = m.get(y) || { year: y, count: 0, casualties: 0 };
      o.count += 1;
      o.casualties += (e.deaths || 0) + (e.injuries || 0);
      m.set(y, o);
    });
    return [...m.values()].sort((a, b) => a.year - b.year);
  }
  function yearlyText(rows) {
    if (rows.length < 2) return rows.length ? "這個地區只有一年的資料，看不出趨勢。" : "";
    const n = rows.length;
    const avg = (k) => Math.round(rows.reduce((s, r) => s + r[k], 0) / n);
    const first = rows[0].count, last = rows[n - 1].count;
    const diff = first ? Math.round(((last - first) / first) * 100) : 0;
    const trend = Math.abs(diff) < 3 ? "跟第一年差不多" : diff > 0 ? `比第一年多 ${diff}%` : `比第一年少 ${-diff}%`;
    return `近 ${n} 年平均每年 ${avg("count").toLocaleString()} 件、傷亡 ${avg("casualties").toLocaleString()} 人；最近一年${trend}。`;
  }

  // 鄉鎮比較：[{ town, count }]，件數多的在前（沒有鄉鎮的不算）
  function townCounts(list) {
    return sortedEntries(tally(list, (e) => e.town || "")).map(([town, count]) => ({ town, count }));
  }
  function townText(rows, selected) {
    if (!rows.length) return "";
    let s = `事故最多的是${rows[0].town}（${rows[0].count.toLocaleString()} 件）`;
    const i = selected ? rows.findIndex((r) => r.town === selected) : -1;
    if (i > 0) s += `；${selected}排第 ${i + 1} 名（${rows[i].count.toLocaleString()} 件）`;
    return s + "。";
  }

  // 事故型態：8 大類件數（「未提供」另外回傳，圖不畫）
  function typeCounts(list) {
    const m = tally(list, (e) => e.typeG || "未提供");
    const unknown = m["未提供"] || 0;
    delete m["未提供"];
    return { rows: sortedEntries(m).map(([type, count]) => ({ type, count })), unknown };
  }
  function typeText(r) {
    const total = r.rows.reduce((s, x) => s + x.count, 0);
    if (!total) return "";
    const top = r.rows[0];
    return `最常見的是「${top.type}」（${top.count.toLocaleString()} 件，占 ${Math.round((top.count / total) * 100)}%）。`;
  }

  const api = { buildPayload, parseAnswer, peakText, topIndexes, WEEKDAYS, weekdayCounts, weekdayText, yearlyStats, yearlyText, townCounts, townText, typeCounts, typeText };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.HotAnalysis = api;
})(this);
