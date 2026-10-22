// 車禍分類：天候、事故型態歸成幾個大類，給篩選用（純函式，瀏覽器與 Node 測試共用）。
(function (root) {
  const WEATHER_GROUPS = ["晴", "陰", "雨", "其他", "未提供"];
  const WEATHER_MAP = { 晴: "晴", 陰: "陰", 雨: "雨", 暴雨: "雨" };

  const TYPE_GROUPS = ["側撞", "路口撞", "追撞", "對撞", "撞路人", "自撞", "撞動物", "其他", "未提供"];
  const TYPE_LIST = {
    側撞: ["側撞", "同向擦撞", "對向擦撞"],
    路口撞: ["路口交岔撞"],
    追撞: ["追撞", "倒車撞"],
    對撞: ["對撞"],
    // 人與車：資料只有細項沒有大類，所以用列舉（含「從停車後(或中)穿出」）
    撞路人: ["穿越道路中", "同向通行中", "對向通行中", "在路上嬉戲", "在路上作業中", "在路邊", "走出路外", "佇立路邊(外)", "從停車後(或中)穿出"],
    自撞: [
      "路上翻車、摔倒", "衝出路外", "撞護欄(樁)", "撞路樹", "撞電桿", "撞路樹、電桿", "撞交通島", "撞號誌、標誌桿",
      "撞建築物", "撞橋樑、建築物", "撞橋樑(橋墩)", "撞非固定設施", "撞工程施工", "撞收費亭",
    ],
    撞動物: ["撞動物"],
    其他: ["其他", "衝進路中"],
  };
  const TYPE_MAP = {};
  Object.entries(TYPE_LIST).forEach(([g, list]) => list.forEach((t) => (TYPE_MAP[t] = g)));

  const clean = (v) => (v === null || v === undefined ? "" : String(v).trim());

  function weatherGroup(w) {
    const s = clean(w);
    if (!s) return "未提供";
    return WEATHER_MAP[s] || "其他";
  }

  function typeGroup(t) {
    const s = clean(t);
    if (!s) return "未提供";
    return TYPE_MAP[s] || "其他";
  }

  function annotateAccidents(list) {
    list.forEach((ev) => {
      ev.weatherG = weatherGroup(ev.weather);
      ev.typeG = typeGroup(ev.type);
    });
    return list;
  }

  const api = { WEATHER_GROUPS, TYPE_GROUPS, weatherGroup, typeGroup, annotateAccidents };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.HotCategories = api;
})(this);
