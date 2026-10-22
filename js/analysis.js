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

  const api = { buildPayload, parseAnswer, peakText };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.HotAnalysis = api;
})(this);
