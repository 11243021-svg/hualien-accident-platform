// 篩選與統計的純函式：不碰畫面，瀏覽器與 Node 測試共用。
(function (root) {
  const KINDS = ["car", "moto", "rock", "debris"];
  const KIND_LABEL = { car: "汽車", moto: "機車", rock: "落石", debris: "障礙物" };
  const PERIODS = {
    dawn: { label: "清晨", start: 5, end: 8 },
    day: { label: "白天", start: 8, end: 17 },
    dusk: { label: "傍晚", start: 17, end: 20 },
    night: { label: "深夜", start: 20, end: 5 },
  };

  function defaultState() {
    return { mode: "all", period: null, hour: 0, kinds: new Set(KINDS), sources: new Set(["real", "sim"]) };
  }

  function hourOf(ts) {
    return parseInt(ts.slice(11, 13), 10);
  }

  function inPeriod(hour, key) {
    const p = PERIODS[key];
    return p.start < p.end ? hour >= p.start && hour < p.end : hour >= p.start || hour < p.end;
  }

  function matchesCategory(ev, state) {
    return state.kinds.has(ev.kind) && state.sources.has(ev.source);
  }

  function matchesTime(ev, state) {
    if (state.mode === "period") return inPeriod(hourOf(ev.ts), state.period);
    if (state.mode === "hour") return hourOf(ev.ts) === state.hour;
    return true;
  }

  function filterEvents(events, state) {
    return events.filter((ev) => matchesCategory(ev, state) && matchesTime(ev, state));
  }

  function countByKind(events) {
    const counts = { total: events.length };
    KINDS.forEach((k) => (counts[k] = 0));
    events.forEach((ev) => counts[ev.kind]++);
    return counts;
  }

  function hourlyCounts(events, state, match = matchesCategory) {
    const hours = new Array(24).fill(0);
    events.forEach((ev) => {
      if (match(ev, state)) hours[hourOf(ev.ts)]++;
    });
    return hours;
  }

  function isHourHighlighted(hour, state) {
    if (state.mode === "period") return inPeriod(hour, state.period);
    if (state.mode === "hour") return hour === state.hour;
    return true;
  }

  const SEV_LABEL = { death: "死亡", injury: "受傷" };
  const SOURCE_LABEL = { real: "真實", sim: "模擬" };

  // 「看哪種」收起時的一行摘要，例：「死亡＋受傷・全部天候・全部型態・真實＋模擬」
  // sources 為 null 表示這個地區沒有 AI 偵測（不顯示來源）；extras 是身分專屬的非預設條件
  function kindSummary({ severities, weathers, types, sources, extras }) {
    const parts = [];
    if (severities.size >= 2) parts.push("死亡＋受傷");
    else if (severities.size === 1) parts.push(`只看${SEV_LABEL[[...severities][0]]}`);
    else parts.push("不看車禍");
    const listed = (set, all, label, unit) => {
      if (!set.size) return all;
      if (set.size <= 2) return `${label}：${[...set].join("、")}`;
      return `${label} ${set.size} ${unit}`;
    };
    parts.push(listed(weathers, "全部天候", "天候", "種"));
    parts.push(listed(types, "全部型態", "型態", "類"));
    if (sources) {
      if (sources.size >= 2) parts.push("真實＋模擬");
      else if (sources.size === 1) parts.push(`只看${SOURCE_LABEL[[...sources][0]]}`);
      else parts.push("不看偵測");
    }
    return parts.concat(extras || []).join("・");
  }

  const api = {
    KINDS, KIND_LABEL, PERIODS, defaultState, hourOf, inPeriod,
    filterEvents, countByKind, hourlyCounts, isHourHighlighted, kindSummary,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.HotFilters = api;
})(this);
