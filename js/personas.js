// 三種使用者身分：各自的說明、要看的篩選列、側邊面板、地圖圖層（純資料，瀏覽器與 Node 測試共用）。
(function (root) {
  const PERSONAS = {
    mayor: {
      label: "公路局（路況管理）",
      hint: "交通部公路局東區養護工程分局：找出轄區最常出事的路段與路口，作為道路改善的依據",
      filters: "mayorFilters",
      panels: ["rankPanel", "causeBox"],
      layers: { roads: true, detections: true, cameras: "live" }, // 也看 AI 偵測點跟歷史車禍比較；可點公路局監視器看即時路況
      showConfidence: false,
    },
    police: {
      label: "交通警察隊",
      hint: "花蓮縣警察局交通警察隊：查看 AI 偵測到的事故，登入後在小卡片裡補填傷亡、肇因與事故型態",
      filters: "policeFilters",
      panels: ["detPanel"],
      layers: { roads: false, detections: true, cameras: "all" }, // 含情境模擬攝影機
      showConfidence: true,
    },
    citizen: {
      label: "一般民眾",
      hint: "輸入路名，看看最近這條路安不安全",
      filters: null, // 路名搜尋三種身分都有，民眾沒有額外的篩選列
      panels: ["searchPanel", "routePanel", "causeBox"],
      layers: { roads: false, detections: true, cameras: "live" }, // 民眾也能點公路局監視器看即時路況
      showConfidence: false,
    },
    admin: {
      label: "系統管理",
      hint: "管理帳號身分、處理誤報、查看補填紀錄",
      filters: null, // 系統管理畫面不顯示地圖與篩選
      panels: [],
      layers: { roads: false, detections: false, cameras: false },
      showConfidence: true,
    },
  };
  const DEFAULT_PERSONA = "citizen"; // 沒登入就是一般民眾
  const ALL_FILTERS = ["mayorFilters", "policeFilters"];
  const ALL_PANELS = ["rankPanel", "detPanel", "searchPanel", "routePanel", "causeBox"];

  function visibility(persona) {
    const p = PERSONAS[persona];
    const filters = {};
    const panels = {};
    ALL_FILTERS.forEach((id) => (filters[id] = id === p.filters));
    ALL_PANELS.forEach((id) => (panels[id] = p.panels.includes(id)));
    return { filters, panels };
  }

  const api = { PERSONAS, DEFAULT_PERSONA, ALL_FILTERS, ALL_PANELS, visibility };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.HotPersonas = api;
})(this);
