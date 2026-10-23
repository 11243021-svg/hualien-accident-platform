// 熱點地圖畫面：地區＋身分（里長／員警／民眾）決定要看什麼；車禍與 AI 偵測資料都來自 Supabase。
// 所有外部文字一律用 textContent／DOM 節點放進畫面，不用 innerHTML。
(function () {
  const F = window.HotFilters;
  const A = window.HotAccidents;
  const D = window.HotDetections;
  const R = window.HotRoads;
  const P = window.HotPersonas;
  const C = window.HotCategories;
  const CAM = window.HotCameras;
  const RP = window.HotReport;
  const Roles = window.HotRoles;
  const UI = window.HotUI;
  const el = UI.el;
  // mayorScale：里長要看路段圓圈，熱度圖淡一點才不會蓋住圓圈
  const HEAT = { radius: 12, blur: 15, intensity: 0.03, mayorScale: 0.6 };
  const VIEW = { hualien: [23.85, 121.55, 10], tainan: [23.0, 120.25, 11] };
  const POINTS_ZOOM = 13; // 放大到這個層級以上畫個別車禍點（上萬筆，太遠畫會卡）
  const SEARCH_POINTS_MAX = 3000; // 民眾查詢結果超過這麼多件就維持熱度圖，不畫個別點
  const MIN_COUNT_FLOOR = 10; // 路段分級最低一級是 10 件，門檻低於 10 也不會多畫
  const PLAY_INTERVAL_MS = 1000;
  const REGION_LABEL = { hualien: "花蓮", tainan: "台南" };
  const SEV_LABEL = { death: "死亡", injury: "受傷" };
  const SOURCE_LABEL = { real: "真實", sim: "模擬" };
  const FILL_LABEL = { pending: "待補填", filled: "已補填" };
  // 一打開先看這幾個鄉鎮（花蓮車禍最集中的地方），沒列的地區看整個地區最集中的範圍
  const FOCUS_TOWNS = { hualien: ["花蓮市", "吉安鄉"] };
  const FOLD_KEY = "hotspot.filtersOpen"; // 「看哪種」展開狀態記在瀏覽器
  const ACC_VIEW_KEY = "hotspot.accView"; // 車禍呈現方式（斑點圖／熱度圖）記在瀏覽器
  const ROC = 1911; // 民國年 = 西元年 - 1911
  const defaultPeriod = () => ({ kind: "last", n: 1 });

  const app = {
    region: "hualien",
    persona: P.DEFAULT_PERSONA, // 沒登入是一般民眾；登入後依身分切換
    period: defaultPeriod(), // { kind: "last", n } 或 { kind: "year", y }
    time: { mode: "all", period: null, hour: 0 },
    severities: new Set(["death", "injury"]),
    weathers: new Set(), // 空的＝不限
    types: new Set(), // 空的＝不限
    town: "",
    village: "",
    metric: "count",
    minCount: 10,
    sources: new Set(["real", "sim"]),
    kinds: new Set(F.KINDS),
    fill: "all", // all／pending／filled
    showCameras: true,
    query: "",
    selectedRoadKey: null,
    filtersOpen: false, // 「看哪種」預設收起
    accView: "spot", // 車禍呈現方式：spot＝斑點圖（每件事故一個點，預設）、heat＝熱度圖
  };
  const data = { accidents: { hualien: null, tainan: null }, detections: [], detError: null };
  let map, heatLayer, accLayer, roadLayer, detLayer, cameraLayer, legend, sheet, hourChart, causeChart;
  let view = null;
  const PANES = {};
  let playTimer = null;
  let toastTimer = null;
  let accDrawn = null; // 上次算斑點時的條件（資料、縮放、身分、選取路段）：都沒變就不重算
  let regionMsg = false; // mapMsg 目前顯示的是不是地區載入訊息
  let session = null; // 登入狀態：null 或 { id, email, name, role, town }（role 為 null＝還沒設定身分）
  let loginDialog = null;
  let writeCard = null;
  let routePanel = null;
  let aiDialog = null;
  let routeLayer = null;
  let adminView = null;
  const myRole = () => (session ? session.role : null);
  let fillCausesCache = null;
  const FILL_CAUSES_N = 15; // 補填肇因下拉列出歷史資料最常見的幾項

  const $ = (id) => document.getElementById(id);
  const persona = () => P.PERSONAS[app.persona];
  const pad2 = (n) => String(n).padStart(2, "0");
  const hasYears = () => app.region === "hualien" && R.dataYears(data.accidents.hualien || []).end !== null;
  const isDefaultPeriod = () => app.period.kind === "last" && app.period.n === 1;

  // 期間文字：「最近 3 年」或「112 年」
  function periodText() {
    return app.period.kind === "year" ? `${app.period.y - ROC} 年（${app.period.y}）` : `最近 ${app.period.n} 年`;
  }

  // info＝一般提示（例：載入中），不用錯誤的紅色
  function showMapMsg(text, info) {
    $("mapMsg").textContent = text;
    $("mapMsg").classList.toggle("is-info", !!info);
    $("mapMsg").hidden = false;
    regionMsg = false;
  }

  function showRegionMsg(text, info) {
    showMapMsg(text, info);
    regionMsg = true;
  }

  function hideRegionMsg() {
    if (regionMsg) $("mapMsg").hidden = true;
    regionMsg = false;
  }

  // 小卡片一律獨立開在地圖上（不綁在點上），點被重畫時小卡片才不會跟著關掉。
  // 手機（地圖窄）改用地圖下方滑出的資料卡：浮在點上的小卡片會蓋住整張地圖、還會把地圖拖走
  function openPopup(lat, lon, content, opts) {
    const w = map.getSize().x;
    if (w < 520) {
      map.closePopup();
      return sheet.open(lat, lon, content);
    }
    sheet.close();
    const o = Object.assign({}, opts || POPUP_OPTS);
    // 小卡片寬度不能超過「地圖寬 − 左右留白 − 小卡片內距」
    const room = w - 70 - 40;
    o.maxWidth = Math.min(o.maxWidth || 300, room);
    if (o.minWidth) o.minWidth = Math.min(o.minWidth, room);
    return L.popup(o).setLatLng([lat, lon]).setContent(content).openOn(map);
  }

  // 關掉目前的小卡片（電腦版）或資料卡（手機版）
  function closePopup() {
    map.closePopup();
    sheet.close();
  }

  function inTime(ev) {
    if (app.time.mode === "period") return F.inPeriod(F.hourOf(ev.ts), app.time.period);
    if (app.time.mode === "hour") return F.hourOf(ev.ts) === app.time.hour;
    return true;
  }

  // ===== 由 app 狀態推導出畫面要用的資料 =====
  function matchAccident(ev) {
    return app.severities.has(ev.severity) &&
      (!app.town || ev.town === app.town) &&
      (!app.weathers.size || app.weathers.has(ev.weatherG)) &&
      (!app.types.size || app.types.has(ev.typeG)) &&
      (!app.query || R.matchRoad(ev, app.query));
  }

  // 來源（真實／模擬）三種身分都能選；種類、補填狀態只在員警的篩選列出現，所以只有員警套用
  function matchDetection(ev) {
    const police = app.persona === "police";
    return app.sources.has(ev.source) &&
      (!police || (app.kinds.has(ev.kind) && (app.fill === "all" || (app.fill === "pending") === D.isPending(ev)))) &&
      inTime(ev) &&
      (!app.town || ev.town === app.town) &&
      (!app.village || ev.village === app.village) &&
      (!app.query || R.matchRoad(ev, app.query));
  }

  function compute() {
    const accAll = data.accidents[app.region] || [];
    const span = R.dataYears(accAll);
    const useYears = app.region === "hualien" && span.end !== null;
    const base = accAll.filter(matchAccident);
    const accNoTime = useYears ? base.filter((ev) => R.inPeriodYears(ev, app.period, span.end)) : base;
    const acc = accNoTime.filter(inTime);
    const det = app.region === "hualien" ? data.detections.filter(matchDetection) : [];
    // 路段統計納入目前勾選來源的偵測事件（預設真實＋模擬，只勾真實就只算真實）
    const roads = R.aggregateRoads(acc.concat(det), app.metric)
      .filter((r) => r.tier && r.count >= app.minCount);
    let compare = null;
    if (useYears) {
      const timed = base.filter(inTime);
      compare = app.period.kind === "year" ? R.compareYear(timed, app.period.y, span) : R.comparePrev(timed, app.period.n, span);
    }
    // 路線安全用：不受上方路名搜尋、鄉鎮影響（路線會跨鄉鎮），其他條件（嚴重度、天候、型態、期間、時段）照算
    const routeBase = accAll.filter((ev) => app.severities.has(ev.severity) &&
      (!app.weathers.size || app.weathers.has(ev.weatherG)) && (!app.types.size || app.types.has(ev.typeG)));
    const accRoute = (useYears ? routeBase.filter((ev) => R.inPeriodYears(ev, app.period, span.end)) : routeBase).filter(inTime);
    return { span, acc, det, roads, hourBase: accNoTime, compare, accRoute };
  }

  // ===== 地圖 =====
  function initMap() {
    map = L.map("map", { preferCanvas: true, maxZoom: 18 });
    // Esri 深灰底圖（免金鑰，雙擊 file:// 打開也不會被擋）
    const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/";
    const tiles = L.tileLayer(ESRI + "World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
      // Esri 深灰底圖在台灣最多到第 16 級；更大就沿用 16 級的圖放大，避免出現「Map data not yet available」灰格子
      maxNativeZoom: 16,
      maxZoom: 18,
      attribution: "Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors",
    });
    L.tileLayer(ESRI + "World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}", { maxNativeZoom: 16, maxZoom: 18, pane: "overlayPane" }).addTo(map);
    let tileErrorShown = false;
    tiles.on("tileerror", () => {
      if (tileErrorShown) return;
      tileErrorShown = true;
      showMapMsg("地圖底圖載入失敗，請確認網路連線");
    });
    tiles.addTo(map);
    // 熱度圖一直掛在地圖上：leaflet.heat 0.2 在圖層不在地圖上時更新會報錯，放大時改給空資料
    heatLayer = L.heatLayer([], { radius: HEAT.radius, blur: HEAT.blur, maxZoom: POINTS_ZOOM }).addTo(map);
    // 路段圓圈、車禍點、AI 偵測點畫在同一張 canvas：分好幾張的話，最上面那張會把滑鼠點擊全部吃掉，下面的點就點不到。
    // 疊放順序（下→上）由 restack() 控制：路段圓圈 → 車禍點 → AI 偵測點；名次標籤是另一層，在最上面
    [["spotPane", 405], ["vecPane", 410], ["routePane", 415], ["rankPane", 425]].forEach(([name, z]) => (map.createPane(name).style.zIndex = z));
    // 斑點圖畫布不接收點擊（點擊由地圖找最近的點），才不會擋住上面的路段圓圈與偵測點
    map.getPane("spotPane").style.pointerEvents = "none";
    // 路線只是畫給人看，不接收點擊，才不會擋住下面的車禍點
    map.getPane("routePane").style.pointerEvents = "none";
    routeLayer = L.layerGroup();
    // bubblingMouseEvents：點到路段圓圈或偵測點時，不要再傳給地圖（不然會同時打開下面車禍點的小卡片）
    const shared = { pane: "vecPane", renderer: L.canvas({ pane: "vecPane" }), bubblingMouseEvents: false };
    PANES.acc = shared;
    PANES.road = shared;
    PANES.det = shared;
    accLayer = new UI.SpotLayer();
    roadLayer = L.layerGroup().addTo(map);
    detLayer = L.layerGroup().addTo(map);
    cameraLayer = UI.cameras.create(map, openPopup);
    legend = UI.legend.create(map);
    sheet = UI.mapSheet.create(map);
    // 手機資料卡：點地圖空白處就收起來（跟電腦版小卡片一樣）
    map.on("preclick", () => sheet.close());
    map.on("moveend", drawAccidents);
    if (window.ResizeObserver) {
      let t = 0;
      new ResizeObserver(() => {
        clearTimeout(t);
        t = setTimeout(() => {
          // 地圖被藏起來（例如切到系統管理畫面）時寬高是 0，這時重畫熱度圖會出錯，等它再出現才量
          const el = $("map");
          if (el.offsetWidth && el.offsetHeight) map.invalidateSize({ pan: false });
        }, 100);
      }).observe($("map"));
    }
    bindSpotEvents();
    map.on("moveend", () => view && drawCameras());
    map.on("zoomend", () => view && drawRoads());
    const v = VIEW[app.region];
    map.setView([v[0], v[1]], v[2]);
  }

  const shortTime = (ts) => ts.slice(5, 16).replace("T", " ");

  function accPopup(ev) {
    const box = el("div", "pop");
    const head = el("div", "pop__head");
    head.append(el("span", `pop__badge pop__badge--${ev.severity}`, ev.severity === "death" ? "死亡事故" : "受傷事故"), el("span", "pop__time", ev.ts.replace("T", " ")));
    const dl = el("dl", "pop__rows");
    [["地點", ev.place], ["確切位置", ev.spot], ["路段", ev.roadKey], ["肇因", ev.cause], ["傷亡", `死亡 ${ev.deaths}、受傷 ${ev.injuries}`], ["天候", ev.weather], ["事故型態", ev.type]]
      .forEach(([k, v]) => dl.append(el("dt", null, k), el("dd", null, v || "—")));
    box.append(head, dl);
    return box;
  }

  function detPopup(ev) {
    const box = el("div", "pop");
    const head = el("div", "pop__head");
    head.append(el("span", `pop__badge pop__badge--${ev.kind}`, F.KIND_LABEL[ev.kind]), el("span", "pop__time", ev.ts.replace("T", " ")));
    // 跟老師說的「掛號」比喻一樣：偵測當下 AI 自動寫入的欄位，跟事後由交通警察隊補填的欄位分開列
    const cam = CAM.cameraName(ev.camera);
    const auto = [
      ["時間", ev.ts.replace("T", " ")],
      ["種類", F.KIND_LABEL[ev.kind]],
      ["地址", D.shortAddress(ev)],
      ["GPS", `${ev.lat.toFixed(6)}, ${ev.lon.toFixed(6)}`],
      ...(cam ? [["監視器", cam]] : []),
      ...(ev.place && !cam && ev.place !== D.shortAddress(ev) && !/^\d+號,/.test(ev.place) ? [["攝影機地點", ev.place]] : []),
      ...(persona().showConfidence ? [["信心分數", Math.round(ev.confidence * 100) + "%"]] : []),
      ["來源", ev.source === "real" ? "AI 實際偵測" : "模擬資料"],
    ];
    const filled = [
      ["傷亡", ev.deaths === null && ev.injuries === null ? "待補填" : `死亡 ${ev.deaths ?? "—"}、受傷 ${ev.injuries ?? "—"}`],
      ["肇因", ev.cause || "待補填"],
      ["事故型態", ev.accidentType || (ev.filledBy ? "—" : "待補填")],
      ...(ev.filledBy ? [["補填者", D.fillText(ev)]] : []),
    ];
    const section = (title, list, cls) => {
      box.append(el("div", `pop__sec ${cls}`, title));
      const dl = el("dl", "pop__rows");
      list.forEach(([k, v]) => dl.append(el("dt", null, k), el("dd", null, v || "—")));
      box.append(dl);
    };
    box.append(head);
    section("AI 偵測當下自動寫入", auto, "pop__sec--auto");
    section("事後人工補填（交通警察隊）", filled, "pop__sec--fill");
    if (ev.source === "real" && ev.snapshot) {
      const img = el("img", "pop__shot");
      img.alt = "警報截圖";
      img.src = ev.snapshot;
      img.onerror = () => img.replaceWith(el("p", "pop__note", "截圖檔遺失"));
      box.append(img);
    } else {
      box.append(el("p", "pop__note", ev.source === "real" ? "截圖檔遺失" : "模擬資料，無截圖"));
    }
    if (app.persona === "police") {
      if (Roles.canFill(myRole())) box.append(UI.fillForm(ev, fillCauses(), (v) => saveFill(ev, v)));
      else if (!session) box.append(el("p", "pop__note", "交通警察隊登入後可以在這裡補填傷亡與肇因"));
    }
    if (Roles.canDismiss(myRole())) {
      const btn = el("button", "pop__danger", "標為誤報（從地圖上隱藏）");
      btn.type = "button";
      btn.addEventListener("click", () => {
        btn.disabled = true;
        window.HotData.auth.dismiss(ev.id, true)
          .then((updated) => {
            applyUpdate(Object.assign({}, ev, updated || {}, { dismissed: true }));
            closePopup();
            showToast("已標為誤報，可在「系統管理」的誤報清單復原");
          })
          .catch((err) => {
            btn.disabled = false;
            btn.textContent = "失敗：" + err.message;
          });
      });
      box.append(btn);
    }
    return box;
  }

  // 補填肇因清單：花蓮歷史車禍最常見的肇因（資料還沒載入就先空著，只能選「其他」）
  function fillCauses() {
    if (!fillCausesCache && data.accidents.hualien) {
      fillCausesCache = A.topCauses(data.accidents.hualien, FILL_CAUSES_N).top.map((x) => x.cause);
    }
    return fillCausesCache || [];
  }

  async function saveFill(ev, values) {
    const updated = await window.HotData.auth.fill(ev.id, values);
    if (!updated) throw new Error("回傳資料不完整");
    applyUpdate(updated);
    openPopup(updated.lat, updated.lon, detPopup(updated)); // 重開小卡片，顯示補填者與新內容
    showToast(`已補填：${D.shortAddress(updated) || updated.place}`);
  }

  // 偵測事件被補填、標誤報或復原（自己或其他人）：換掉／拿掉／加回那筆再重畫
  function applyUpdate(ev) {
    const i = data.detections.findIndex((e) => e.id === ev.id);
    if (ev.dismissed) {
      if (i < 0) return;
      data.detections.splice(i, 1);
    } else {
      R.annotateDetections([ev]);
      if (i < 0) data.detections.push(ev);
      else data.detections[i] = ev;
    }
    if (app.region === "hualien" && app.persona !== "admin") render();
  }

  // 登入狀態改變：決定能看哪些畫面、預設畫面；里長自動選自己的鄉鎮
  async function setSession(state) {
    session = state;
    renderAuth();
    stopPlay();
    closePopup(); // 小卡片要重開才會出現／收起補填表單
    app.persona = Roles.defaultView(myRole());
    app.selectedRoadKey = null;
    // 換人登入／登出：上一個人選的鄉鎮不要留著（里長下面會再選回自己的）
    if (app.town || app.village) {
      app.town = "";
      app.village = "";
      $("townSel").value = "";
      fillVillages();
    }
    if (myRole() === "mayor" && session.town) {
      if (app.region !== "hualien") {
        $("regionSel").value = "hualien";
        await switchRegion("hualien");
      }
      if (R.towns(data.accidents.hualien || []).includes(session.town)) {
        app.town = session.town;
        app.village = "";
        $("townSel").value = session.town;
        fillVillages();
        render();
        if (view) fitTo(view.acc.length ? view.acc : view.det, 14);
        return;
      }
    }
    render();
  }
  function renderAuth() {
    UI.login.render($("authBox"), session, {
      openLogin: () => loginDialog.open(),
      signOut: () => window.HotData.auth.signOut().then(() => setSession(null)),
    });
  }


  const POPUP_OPTS = { className: "hot-popup", maxWidth: 300, offset: [0, -4], autoPanPaddingTopLeft: [60, 20] };
  const TIP_OPTS = { direction: "top", offset: [0, -6], className: "hot-tip" };

  function drawAccidents() {
    if (!view) return;
    // 斑點圖：每件事故一個點（縮小也畫）；熱度圖：縮小時畫熱度雲，放大到街道或查詢結果不多才畫點
    const zoom = map.getZoom();
    const spot = app.accView === "spot";
    const showPts = spot || zoom >= POINTS_ZOOM || (!!app.query && view.acc.length <= SEARCH_POINTS_MAX);
    // 資料、縮放、身分、選取的路段都沒變就不用重算（平移地圖由斑點圖層自己重畫）
    const key = { view, spot, zoom, showPts, persona: app.persona, sel: app.selectedRoadKey };
    if (accDrawn && Object.keys(key).every((k) => accDrawn[k] === key[k])) return;
    accDrawn = key;
    const k = persona().layers.roads ? HEAT.intensity * HEAT.mayorScale : HEAT.intensity;
    heatLayer.setLatLngs(showPts ? [] : view.acc.map((e) => [e.lat, e.lon, k]));
    if (!showPts) {
      map.removeLayer(accLayer);
      return;
    }
    const scale = R.spotScale(zoom); // 縮小時點小一點，才不會糊成一片
    const sel = app.selectedRoadKey;
    const mayor = app.persona === "mayor"; // 公路局畫面以路段圓圈為主，車禍點改小改淡
    // 死亡事故後畫（疊在最上面）、點大一點，才不會被一大片受傷事故蓋住
    const ordered = view.acc.filter((e) => e.severity !== "death").concat(view.acc.filter((e) => e.severity === "death"));
    accLayer.setItems(ordered.map((ev) => {
      const dim = sel && ev.roadKey !== sel;
      return {
        lat: ev.lat,
        lon: ev.lon,
        r: Math.max(2, ((mayor ? 3.5 : 5.5) + (ev.severity === "death" ? 2.5 : 0)) * scale),
        fill: UI.sevColor(ev.severity, F.hourOf(ev.ts)), // 白天淺、晚上深
        alpha: dim ? 0.15 : mayor ? 0.6 : 0.95,
        ref: ev,
      };
    }));
    if (!map.hasLayer(accLayer)) accLayer.addTo(map);
  }

  // 斑點圖的點不是 Leaflet 物件：點擊、滑鼠移過時由地圖找最近的點
  const HOVER = window.matchMedia && window.matchMedia("(hover: hover)").matches;
  function bindSpotEvents() {
    let spotTip = null;
    let pending = null;
    let raf = 0;
    const pickingRoute = () => map.getContainer().classList.contains("is-picking");
    map.on("click", (e) => {
      if (!map.hasLayer(accLayer) || pickingRoute()) return;
      const hit = accLayer.hit(e.containerPoint, HOVER ? 3 : 10); // 手指比滑鼠粗，容許誤差大一點
      if (hit) openPopup(hit.lat, hit.lon, accPopup(hit.ref));
    });
    if (!HOVER) return; // 手機沒有「滑鼠移過」
    const hideTip = () => {
      if (spotTip && map.hasLayer(spotTip)) map.removeLayer(spotTip);
      map.getContainer().classList.remove("is-over-spot");
    };
    // 滑鼠移動很頻繁，每一畫格最多找一次最近的點
    map.on("mousemove", (e) => {
      pending = e.containerPoint;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const hit = map.hasLayer(accLayer) ? accLayer.hit(pending, 2) : null;
        if (!hit) return hideTip();
        map.getContainer().classList.add("is-over-spot");
        if (!spotTip) spotTip = L.tooltip(Object.assign({}, TIP_OPTS, { offset: [0, -8] }));
        spotTip.setLatLng([hit.lat, hit.lon]).setContent(el("span", null, `${shortTime(hit.ref.ts)}　${hit.ref.cause}`));
        if (!map.hasLayer(spotTip)) spotTip.addTo(map);
      });
    });
    map.on("mouseout", hideTip);
  }


  // 同一張 canvas 依加入順序疊放；每次重畫完把路段圓圈壓到最下面、AI 偵測點拉到最上面
  function restack() {
    roadLayer.eachLayer((l) => l instanceof L.Path && l.bringToBack());
    detLayer.eachLayer((l) => l instanceof L.Path && l.bringToFront());
  }

  function drawRoads() {
    roadLayer.clearLayers();
    if (!persona().layers.roads) return;
    const max = view.roads.reduce((m, r) => Math.max(m, r.value), 0);
    const zoom = map.getZoom();
    const scale = R.zoomScale(zoom);
    const rankOf = new Map(view.roads.slice(0, 10).map((r, i) => [r.key, i + 1]));
    R.visibleRoads(view.roads, zoom, app.selectedRoadKey).forEach((r) => {
      const selected = r.key === app.selectedRoadKey;
      const color = UI.TIER_COLOR[r.tier];
      const radius = Math.max(6, Math.round(R.circleRadius(r.value, max) * scale));
      const m = L.circleMarker([r.lat, r.lon], {
        ...PANES.road,
        radius,
        color: selected ? "#ffffff" : color,
        weight: selected ? 3 : 1,
        fillColor: color,
        fillOpacity: 0.45,
      });
      m.bindTooltip(() => {
        const box = el("div");
        box.append(el("b", null, `${r.town} ${r.road}`), el("div", null, `${r.count.toLocaleString()} 件・死亡 ${r.deaths}・受傷 ${r.injuries}`));
        if (r.topCause) box.append(el("div", null, `常見肇因：${r.topCause}`));
        if (r.topSpots.length) box.append(el("div", null, `最常出事：${R.spotsText(r.topSpots)}`));
        return box;
      }, TIP_OPTS);
      m.on("click", () => pickRoad(r.key));
      m.addTo(roadLayer);
      // 前 10 名在圓圈中間寫名次，對應右邊排行榜
      const rank = rankOf.get(r.key);
      if (rank) {
        const icon = L.divIcon({ className: "road-rank" + (selected ? " is-on" : ""), html: el("span", null, String(rank)), iconSize: [22, 22] });
        L.marker([r.lat, r.lon], { icon, pane: "rankPane", interactive: true, keyboard: false })
          .on("click", () => pickRoad(r.key))
          .bindTooltip(() => el("span", null, `${rank}. ${r.town} ${r.road}（${r.count.toLocaleString()} 件）`), TIP_OPTS) // 路名來自外部資料，用 DOM 節點不用字串
          .addTo(roadLayer);
      }
      // 選到的路段：在最常出事的路口／門牌上標出位置
      if (selected) {
        r.topSpots.forEach((sp, i) => {
          const icon = L.divIcon({ className: "spot-pin", html: el("span", null, `熱點${i + 1}`), iconSize: [46, 20] });
          L.marker([sp.lat, sp.lon], { icon, pane: "rankPane", keyboard: false })
            .bindTooltip(() => el("span", null, `${sp.spot}（${sp.count} 件）`), TIP_OPTS)
            .addTo(roadLayer);
        });
      }
    });
    restack();
  }

  function drawDetections() {
    detLayer.clearLayers();
    if (!persona().layers.detections) return;
    view.det.forEach((ev) => {
      const color = UI.KIND_COLOR[ev.kind];
      const sim = ev.source === "sim";
      // 真實事件：實心＋白框；模擬資料：空心虛線，才不會搶走真實事件的注意力
      const look = sim
        ? { fillOpacity: 0.15, color, weight: 2, dashArray: "3 3" }
        : { fillOpacity: 0.95, color: "#ffffff", weight: 2 };
      const style = Object.assign({ radius: 8, fillColor: color }, look, PANES.det);
      const m = L.circleMarker([ev.lat, ev.lon], style);
      m.bindTooltip(() => el("span", null, `${sim ? "［模擬］" : ""}${shortTime(ev.ts)}　${F.KIND_LABEL[ev.kind]}`), TIP_OPTS);
      m.on("click", () => openPopup(ev.lat, ev.lon, detPopup(ev)));
      m.on("mouseover", () => m.setStyle({ radius: 12 }));
      m.on("mouseout", () => m.setStyle(style));
      m.addTo(detLayer);
    });
    restack();
  }

  function drawCameras() {
    const mode = persona().layers.cameras;
    // 「顯示攝影機」開關只在交通警察隊的篩選列；其他畫面一律顯示公路局監視器
    const visible = app.region === "hualien" && !!mode && (mode !== "all" || app.showCameras);
    const bounds = map.getBounds().pad(0.2);
    const cams = CAM.camerasFor(CAM.withStats(CAM.ALL, data.detections), mode);
    // 縮小只顯示代表性的監視器，放大到街道才顯示畫面範圍內全部（花蓮有兩百多支）
    cameraLayer.update(CAM.visibleCameras(cams, map.getZoom(), (c) => bounds.contains([c.lat, c.lon])), visible);
  }

  // ===== 側邊面板 =====
  function setLabel(id, text, dotClass) {
    $(id).replaceChildren(...(dotClass ? [el("i", "dot " + dotClass)] : []), el("span", null, text));
  }

  function renderCards() {
    const delta = $("statDelta");
    delta.className = "card__delta";
    delta.textContent = "";
    if (app.persona === "police") {
      const today = D.taiwanDate();
      setLabel("statTotalLabel", "偵測件數（目前條件）");
      setLabel("statDeathsLabel", "待補填");
      setLabel("statInjuriesLabel", "今天新增");
      $("statTotal").textContent = view.det.length.toLocaleString();
      $("statDeaths").textContent = view.det.filter(D.isPending).length.toLocaleString();
      $("statInjuries").textContent = view.det.filter((e) => e.ts.slice(0, 10) === today).length.toLocaleString();
      return;
    }
    setLabel("statTotalLabel", hasYears() ? `車禍件數（${periodText()}）` : "車禍件數");
    setLabel("statDeathsLabel", "死亡人數", "dot--death");
    setLabel("statInjuriesLabel", "受傷人數", "dot--injury");
    $("statTotal").textContent = view.acc.length.toLocaleString();
    $("statDeaths").textContent = view.acc.reduce((s, e) => s + (e.deaths || 0), 0).toLocaleString();
    $("statInjuries").textContent = view.acc.reduce((s, e) => s + (e.injuries || 0), 0).toLocaleString();
    if (!view.compare || app.persona !== "mayor") return;
    if (view.compare.previous === null) {
      delta.textContent = "沒有更早的資料可以比較";
      return;
    }
    const diff = view.compare.current - view.compare.previous;
    const pct = view.compare.previous ? Math.round((diff / view.compare.previous) * 100) : 0;
    const than = app.period.kind === "year" ? `比 ${app.period.y - 1 - ROC} 年` : `比前 ${app.period.n} 年`;
    delta.textContent = `${than}${diff >= 0 ? "增加" : "減少"} ${Math.abs(diff).toLocaleString()} 件（${diff >= 0 ? "+" : ""}${pct}%）`;
    delta.classList.add(diff > 0 ? "is-up" : "is-down");
  }

  function renderPanels() {
    const vis = P.visibility(app.persona);
    Object.entries(vis.panels).forEach(([id, on]) => ($(id).hidden = !on));
    if (vis.panels.rankPanel) {
      const notes = [`依${R.METRIC_LABEL[app.metric]}排名，列出出事 ${app.minCount} 次以上的 ${view.roads.length} 條路`];
      if (app.village) notes.push("車禍資料沒有里別，路段以鄉鎮統計；里別只篩選 AI 偵測事件");
      UI.rankings.render($("rankList"), $("rankNote"), view.roads, { metric: app.metric, selectedKey: app.selectedRoadKey, note: notes.join("。") }, pickRoad);
      $("csvBtn").disabled = !view.roads.length;
      // AI 分析：只有登入的公路局、系統管理員看得到（後台也會再核對身分）
      $("aiBtn").hidden = !(myRole() === "mayor" || myRole() === "admin");
      $("aiBtn").disabled = !view.acc.length;
    }
    if (vis.panels.detPanel) {
      $("detNote").textContent = app.region === "hualien" ? `共 ${view.det.length} 筆（最新 20 筆）` : "這個地區沒有 AI 偵測資料";
      UI.detList.render($("detList"), view.det, focusDetection);
    }
    if (vis.panels.searchPanel) {
      const periodLabel = hasYears() ? periodText() : "";
      UI.search.render($("searchBody"), $("searchTitle"), { query: app.query, acc: view.acc, det: view.det, periodLabel });
    }
    if (vis.panels.causeBox) {
      const r = A.topCauses(view.acc, 10);
      $("causeLead").textContent = r.top.length ? `最常見的原因是「${r.top[0].cause}」（${r.top[0].count.toLocaleString()} 件）。` : "";
      causeChart.data.labels = r.top.map((x) => x.cause);
      causeChart.data.datasets[0].data = r.top.map((x) => x.count);
      causeChart.update();
      $("causeNote").textContent = r.unknown ? `另有 ${r.unknown.toLocaleString()} 件未提供肇因（110 年官方資料無此欄位）` : "";
    }
  }

  function renderHourChart() {
    const hours = new Array(24).fill(0);
    view.hourBase.forEach((ev) => (hours[F.hourOf(ev.ts)] += 1));
    const ds = hourChart.data.datasets[0];
    ds.data = hours;
    ds.backgroundColor = hours.map((_, h) => (F.isHourHighlighted(h, app.time) ? "#48c3ac" : "rgba(72,195,172,0.22)"));
    hourChart.update();
    $("hourNote").textContent = window.HotAnalysis.peakText(hours);
  }

  // 分段按鈕：外觀（is-on）和螢幕閱讀器狀態（aria-pressed）一起更新
  function setPressed(b, on) {
    b.classList.toggle("is-on", on);
    b.setAttribute("aria-pressed", String(on));
  }

  const setChecks = (attr, isOn) => document.querySelectorAll(`input[data-${attr}]`).forEach((cb) => (cb.checked = isOn(cb.dataset[attr])));

  function renderControls() {
    const vis = P.visibility(app.persona);
    Object.entries(vis.filters).forEach(([id, on]) => ($(id).hidden = !on));
    document.querySelectorAll("#personaSeg button").forEach((b) => setPressed(b, b.dataset.persona === app.persona));
    $("personaHint").textContent = persona().hint;
    renderTimeFold();
    $("regionNote").hidden = app.region !== "tainan";
    $("mapTip").textContent = HOVER
      ? "小技巧：點地圖上的點看詳細資料；滾輪放大縮小、按住拖曳移動；放大會出現更多監視器。"
      : "小技巧：點地圖上的點看詳細資料；兩指放大縮小、單指拖曳移動；放大會出現更多監視器。";
    $("yearsBox").hidden = !hasYears();
    $("sourceLine").hidden = app.region !== "hualien";
    document.querySelectorAll("#yearsSeg button").forEach((b) => setPressed(b, app.period.kind === "last" && Number(b.dataset.years) === app.period.n));
    $("yearSel").value = app.period.kind === "year" ? String(app.period.y) : "";
    $("yearSel").classList.toggle("is-on", app.period.kind === "year");
    document.querySelectorAll("#periodSeg button").forEach((b) => {
      const p = b.dataset.period;
      setPressed(b, (app.time.mode === "all" && p === "all") || (app.time.mode === "period" && app.time.period === p));
    });
    const hourOn = app.time.mode === "hour";
    $("hourRange").value = String(app.time.hour);
    $("hourRange").classList.toggle("is-off", !hourOn);
    $("hourLabel").textContent = hourOn ? pad2(app.time.hour) + ":00" : "--:--";
    $("hourLabel").classList.toggle("is-on", hourOn);
    $("hourLabel").classList.toggle("is-off", !hourOn);
    $("playBtn").textContent = playTimer ? "⏸ 暫停" : "▶ 自動播放 24 小時";
    setChecks("sev", (v) => app.severities.has(v));
    setChecks("weather", (v) => app.weathers.has(v));
    setChecks("type", (v) => app.types.has(v));
    setChecks("source", (v) => app.sources.has(v));
    setChecks("kind", (v) => app.kinds.has(v));
    $("typeCount").textContent = app.types.size ? `（已選 ${app.types.size}）` : "";
    $("townSel").value = app.town;
    $("villageSel").value = app.village;
    $("metricSel").value = app.metric;
    $("minCount").value = String(app.minCount);
    $("fillSel").value = app.fill;
    $("camLayerChk").checked = app.showCameras;
    $("regionSel").value = app.region;
    renderFold();
    renderChips();
  }

  // localStorage 在無痕模式、封鎖網站資料時可能讀寫失敗，失敗就用預設（收起）
  function loadFoldOpen() {
    try {
      return window.localStorage.getItem(FOLD_KEY) === "1";
    } catch (err) {
      return false;
    }
  }

  function loadAccView() {
    try {
      return window.localStorage.getItem(ACC_VIEW_KEY) === "heat" ? "heat" : "spot";
    } catch (err) {
      return "spot";
    }
  }
  function saveAccView(v) {
    try {
      window.localStorage.setItem(ACC_VIEW_KEY, v);
    } catch (err) {
      /* 記不住就算了，不影響使用 */
    }
  }
  function saveFoldOpen(open) {
    try {
      window.localStorage.setItem(FOLD_KEY, open ? "1" : "0");
    } catch (err) {
      /* 記不住就算了，不影響使用 */
    }
  }

  // 「看哪種」收起時只顯示一行摘要；身分專屬的非預設條件也寫進摘要
  function kindSummaryText() {
    const extras = [];
    if (app.persona === "mayor") {
      if (app.metric !== "count") extras.push(`依${R.METRIC_LABEL[app.metric]}分級`);
      if (app.minCount !== MIN_COUNT_FLOOR) extras.push(`至少 ${app.minCount} 件`);
    }
    if (app.persona === "police" && app.region === "hualien") {
      if (app.kinds.size < F.KINDS.length) extras.push(app.kinds.size ? `只看${F.KINDS.filter((k) => app.kinds.has(k)).map((k) => F.KIND_LABEL[k]).join("、")}` : "不看偵測種類");
      if (app.fill !== "all") extras.push(FILL_LABEL[app.fill]);
      if (!app.showCameras) extras.push("不顯示攝影機");
    }
    return F.kindSummary({
      severities: app.severities,
      weathers: app.weathers,
      types: app.types,
      sources: app.region === "hualien" ? app.sources : null,
      extras,
    });
  }

  let timeOpen = false; // 手機版「看什麼時候」展開了沒（電腦版一直展開，見 style.css）
  function renderTimeFold() {
    $("timeSummary").textContent = `${hasYears() ? periodText() : "全部資料"}・${timeText()}`;
    $("timeToggle").textContent = timeOpen ? "收起 ▴" : "展開 ▾";
    $("timeToggle").setAttribute("aria-expanded", String(timeOpen));
    $("timeGroup").classList.toggle("is-mopen", timeOpen);
  }

  function renderFold() {
    const open = app.filtersOpen;
    $("kindBody").hidden = !open;
    $("kindSummary").hidden = open;
    $("kindSummary").textContent = kindSummaryText();
    $("kindToggle").textContent = open ? "收起 ▴" : "展開 ▾";
    $("kindToggle").setAttribute("aria-expanded", String(open));
    $("kindGroup").classList.toggle("is-closed", !open);
  }

  // 「其他」「未提供」天候和事故型態都有，標籤前面加上是哪一種
  const groupChip = (prefix, v) => (v === "其他" || v === "未提供" ? `${prefix}${v}` : v);

  function activeConditions() {
    const out = [];
    const add = (text, remove) => out.push({ text, remove });
    if (app.town) add(app.town, () => { app.town = ""; app.village = ""; fillVillages(); });
    if (app.village) add(app.village, () => (app.village = ""));
    if (app.query) add(`查詢：${app.query}`, () => { app.query = ""; $("searchInput").value = ""; });
    if (hasYears() && !isDefaultPeriod()) add(periodText(), () => (app.period = defaultPeriod()));
    if (app.time.mode === "period") add(F.PERIODS[app.time.period].label, () => { app.time.mode = "all"; app.time.period = null; });
    if (app.time.mode === "hour") add(pad2(app.time.hour) + ":00", () => { stopPlay(); app.time.mode = "all"; });
    if (app.severities.size < 2) {
      const text = app.severities.size ? `只看${SEV_LABEL[[...app.severities][0]]}` : "不看車禍";
      add(text, () => (app.severities = new Set(["death", "injury"])));
    }
    C.WEATHER_GROUPS.filter((w) => app.weathers.has(w)).forEach((w) => add(groupChip("天候", w), () => app.weathers.delete(w)));
    C.TYPE_GROUPS.filter((t) => app.types.has(t)).forEach((t) => add(groupChip("型態", t), () => app.types.delete(t)));
    if (app.region === "hualien" && app.sources.size < 2) {
      const text = app.sources.size ? `只看${SOURCE_LABEL[[...app.sources][0]]}偵測` : "不看偵測來源";
      add(text, () => (app.sources = new Set(["real", "sim"])));
    }
    if (app.persona === "police" && app.region === "hualien") {
      if (app.kinds.size < F.KINDS.length) {
        const text = app.kinds.size ? `只看${F.KINDS.filter((k) => app.kinds.has(k)).map((k) => F.KIND_LABEL[k]).join("、")}` : "不看偵測種類";
        add(text, () => (app.kinds = new Set(F.KINDS)));
      }
      if (app.fill !== "all") add(FILL_LABEL[app.fill], () => (app.fill = "all"));
    }
    return out;
  }

  function renderChips() {
    const list = $("chipList");
    const conds = activeConditions();
    list.replaceChildren();
    if (!conds.length) list.append(el("span", "active__none", "全部（預設）"));
    conds.forEach((c) => {
      const btn = el("button", "chip");
      btn.type = "button";
      btn.title = "移除這個條件";
      btn.setAttribute("aria-label", `移除條件：${c.text}`);
      btn.append(el("span", null, c.text), el("span", "chip__x", "×"));
      btn.addEventListener("click", () => {
        c.remove();
        app.selectedRoadKey = null;
        render();
      });
      list.append(btn);
    });
    $("resetBtn").disabled = !conds.length;
    if (!view) return;
    const parts = [`共 ${view.acc.length.toLocaleString()} 件車禍`];
    if (app.region === "hualien" && persona().layers.detections) parts.push(`${view.det.length.toLocaleString()} 筆偵測`);
    $("countSummary").textContent = parts.join("・");
  }

  function renderRange() {
    const acc = data.accidents[app.region] || [];
    if (acc.length) {
      const span = R.dataYears(acc);
      $("rangeAcc").textContent = `車禍：${REGION_LABEL[app.region]} ${span.start - ROC}–${span.end - ROC} 年（${span.start}–${span.end}，${acc.length.toLocaleString()} 筆）`;
    } else {
      $("rangeAcc").textContent = "車禍：--";
    }
    const det = $("rangeDet");
    det.hidden = app.region !== "hualien";
    det.textContent = data.detError ? "AI 偵測：載入失敗" : `AI 偵測：即時（${data.detections.length.toLocaleString()} 筆）`;
  }

  // 路線安全只在民眾畫面：其他畫面把路線收起來
  function renderRoute() {
    if (!routePanel) return;
    if (P.visibility(app.persona).panels.routePanel && app.region === "hualien") {
      routeLayer.addTo(map);
      routePanel.refresh();
    } else {
      map.removeLayer(routeLayer);
      routePanel.hide();
    }
  }

  // 畫面切換鈕：只顯示這個身分能看的畫面；只有一個時整組藏起來
  function renderPersonaSeg() {
    const views = Roles.viewsFor(myRole());
    $("personaField").hidden = views.length <= 1;
    document.querySelectorAll("#personaSeg button").forEach((b) => {
      b.hidden = !views.includes(b.dataset.persona);
      setPressed(b, b.dataset.persona === app.persona);
    });
  }

  // 系統管理畫面：藏起篩選與地圖，改顯示管理區；切回地圖畫面時 Leaflet 要重新量一次大小
  let adminShown = false;
  function renderAdminSwitch() {
    const isAdmin = app.persona === "admin";
    document.querySelector(".controls").hidden = isAdmin;
    document.querySelector(".layout").hidden = isAdmin;
    $("adminView").hidden = !isAdmin;
    if (isAdmin && !adminShown) adminView.show();
    if (!isAdmin && adminShown) setTimeout(() => map.invalidateSize(), 0);
    adminShown = isAdmin;
    return isAdmin;
  }

  function render() {
    renderPersonaSeg();
    if (renderAdminSwitch()) return renderRoute();
    if (!data.accidents[app.region]) return;
    view = compute();
    renderRoute(); // 篩選結果算好後，沿線車禍跟著重算
    drawAccidents();
    drawRoads();
    drawDetections();
    drawCameras();
    legend.update({ persona: app.persona, metric: app.metric, region: app.region, accView: app.accView });
    document.querySelectorAll("#accViewSeg button").forEach((b) => setPressed(b, b.dataset.accview === app.accView));
    renderCards();
    renderPanels();
    renderHourChart();
    renderControls();
    const empty = !(view.acc.length > 0 || view.det.length > 0);
    $("emptyHint").hidden = !empty;
    if (empty) {
      const why = [];
      if (app.query) why.push(`路名「${app.query}」`);
      if (app.town) why.push(`鄉鎮「${app.town}」`);
      if (app.time.mode !== "all") why.push(`時段「${timeText()}」`);
      if (app.period.kind === "year") why.push(`年份「${periodText()}」`);
      $("emptyWhy").textContent = why.length ? `可能是 ${why.join("、")} 的範圍太小，按下面的按鈕回到一開始的樣子。` : "按下面的按鈕回到一開始的樣子。";
    }
  }

  // ===== 互動 =====
  // 搜尋結果：同名的路可能在好幾個鄉鎮（例如中正路），飛到事故最多的那一條，再框它最密集的一段
  function fitSearch(points) {
    if (!points.length) return showToast(R.noResultText(app.query, hasYears() ? periodText() : ""), 7000);
    const groups = new Map();
    points.forEach((p) => {
      const k = p.roadKey || "";
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(p);
    });
    const top = [...groups.entries()].filter(([k]) => k).sort((a, b) => b[1].length - a[1].length)[0];
    const pts = top ? top[1] : points;
    const b = pts.length >= 20 ? R.denseBounds(pts) : null;
    if (b) map.fitBounds(b, { padding: [30, 30], maxZoom: 16 });
    else fitTo(pts, 16);
    if (top && groups.size > 1) showToast(`有 ${groups.size} 條同名路段，先帶你看事故最多的：${top[0]}`);
  }

  function fitTo(points, maxZoom) {
    if (!points.length) return;
    map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lon])), { padding: [40, 40], maxZoom });
  }

  // 一打開／切換地區：飛到資料最集中的範圍（不被零星離群點拉遠）；
  // 有預設關注鄉鎮（花蓮：花蓮市＋吉安鄉）就只用那些鄉鎮的車禍點算範圍，拉得更近
  function fitDense() {
    const all = data.accidents[app.region] || [];
    const focus = FOCUS_TOWNS[app.region];
    const pts = focus ? all.filter((e) => focus.includes(e.town)) : [];
    if (pts.length) {
      map.fitBounds(R.denseBounds(pts), { padding: [20, 20], maxZoom: 14 });
      return;
    }
    const b = R.denseBounds(all);
    if (b) map.fitBounds(b, { padding: [20, 20], maxZoom: 13 });
  }

  // 時段文字：「全天」「傍晚 17–20」「08:00」
  function timeText() {
    if (app.time.mode === "period") {
      const p = F.PERIODS[app.time.period];
      return `${p.label} ${pad2(p.start)}–${pad2(p.end)}`;
    }
    if (app.time.mode === "hour") return pad2(app.time.hour) + ":00";
    return "全天";
  }

  // 里長下載報表：目前條件下所有達門檻的路段（不只前 10 名）
  async function runAiAnalysis() {
    if (!view) return;
    const meta = { region: REGION_LABEL[app.region], town: app.town, period: hasYears() ? periodText() : "全部資料", time: timeText() };
    const scope = `條件：${meta.region}・${meta.town || "全部鄉鎮"}・${meta.period}・${meta.time}（共 ${view.acc.length.toLocaleString()} 件）`;
    const stats = window.HotAnalysis.buildPayload(view.acc, view.roads, meta);
    $("aiBtn").disabled = true;
    aiDialog.loading(scope);
    try {
      const r = await window.HotData.ai.analyze(stats);
      aiDialog.show(scope, r.text, r.model);
    } catch (err) {
      aiDialog.error("AI 分析失敗：" + err.message);
    } finally {
      $("aiBtn").disabled = false;
    }
  }

  function downloadCsv() {
    if (!view || !view.roads.length) return;
    const now = new Date();
    const csv = RP.toCsv(view.roads, {
      region: REGION_LABEL[app.region],
      town: app.town,
      period: hasYears() ? periodText() : "全部資料",
      time: timeText(),
      metric: R.METRIC_LABEL[app.metric],
      minCount: app.minCount,
      now,
    });
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = el("a");
    a.href = url;
    a.download = RP.fileName(REGION_LABEL[app.region], now);
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0); // 等瀏覽器開始下載再收回
  }

  function resetFilters() {
    stopPlay();
    closePopup();
    Object.assign(app, {
      period: defaultPeriod(),
      time: { mode: "all", period: null, hour: app.time.hour },
      severities: new Set(["death", "injury"]),
      weathers: new Set(),
      types: new Set(),
      town: "",
      village: "",
      sources: new Set(["real", "sim"]),
      kinds: new Set(F.KINDS),
      fill: "all",
      query: "",
      selectedRoadKey: null,
    });
    $("searchInput").value = "";
    fillVillages();
    render();
  }

  function pickRoad(key) {
    if (!view) return;
    app.selectedRoadKey = app.selectedRoadKey === key ? null : key;
    render();
    if (app.selectedRoadKey) fitTo(view.acc.filter((e) => e.roadKey === key).concat(view.det.filter((e) => e.roadKey === key)), 15);
  }

  function focusDetection(ev) {
    map.setView([ev.lat, ev.lon], 16);
    openPopup(ev.lat, ev.lon, detPopup(ev));
  }

  function stopPlay() {
    if (playTimer) {
      clearInterval(playTimer);
      playTimer = null;
    }
  }

  function togglePlay() {
    if (playTimer) {
      stopPlay();
      renderControls();
      return;
    }
    // 從目前拉桿的小時往後播；已經在最後一小時就從 0 點開始
    if (app.time.hour >= 23) app.time.hour = 0;
    app.time.mode = "hour";
    playTimer = setInterval(() => {
      if (app.time.hour >= 23) {
        stopPlay();
        renderControls();
        return;
      }
      app.time.hour += 1;
      render();
    }, PLAY_INTERVAL_MS);
    render();
  }

  function fillYears() {
    const sel = $("yearSel");
    const span = R.dataYears(data.accidents.hualien || []);
    sel.replaceChildren(new Option("單一年份…", ""));
    if (span.end === null) return;
    for (let y = span.end; y >= span.start; y--) sel.appendChild(new Option(`${y - ROC} 年（${y}）`, String(y)));
  }

  // 天候、事故型態、偵測種類的勾選框依分類清單產生
  function buildCheckboxes() {
    const box = (attr, value, text, color) => {
      const lab = el("label", "chk");
      const cb = el("input");
      cb.type = "checkbox";
      cb.dataset[attr] = value;
      lab.append(cb);
      if (color) {
        const d = el("i", "dot");
        d.style.background = color;
        lab.append(d);
      }
      lab.append(el("span", null, text));
      return lab;
    };
    C.WEATHER_GROUPS.forEach((w) => $("weatherBox").append(box("weather", w, w)));
    C.TYPE_GROUPS.forEach((t) => $("typeBox").append(box("type", t, t)));
    F.KINDS.forEach((k) => $("kindBox").append(box("kind", k, F.KIND_LABEL[k], UI.KIND_COLOR[k])));
    document.querySelectorAll("#periodSeg button").forEach((b) => {
      const p = F.PERIODS[b.dataset.period];
      if (p) b.textContent = `${p.label} ${pad2(p.start)}–${pad2(p.end)}`;
    });
  }

  // 勾選框共用：勾＝加進集合，取消＝拿掉
  function bindSet(attr, getSet) {
    document.querySelectorAll(`input[data-${attr}]`).forEach((cb) =>
      cb.addEventListener("change", () => {
        const set = getSet();
        cb.checked ? set.add(cb.dataset[attr]) : set.delete(cb.dataset[attr]);
        app.selectedRoadKey = null;
        render();
      })
    );
  }

  function fillTowns() {
    const sel = $("townSel");
    sel.replaceChildren(new Option(app.region === "tainan" ? "全部行政區" : "全部鄉鎮", ""));
    R.towns(data.accidents[app.region] || []).forEach((t) => sel.appendChild(new Option(t, t)));
  }

  function fillVillages() {
    const sel = $("villageSel");
    const list = app.region === "hualien" ? R.villages(data.detections, app.town) : [];
    sel.replaceChildren(new Option(list.length ? "全部村里" : "（這裡沒有偵測資料）", ""));
    list.forEach((v) => sel.appendChild(new Option(v, v)));
    sel.disabled = !list.length;
    if (app.village && !list.includes(app.village)) app.village = "";
  }

  async function ensureRegion(region) {
    if (data.accidents[region]) {
      hideRegionMsg(); // 收掉前一次留下的「載入中…」或失敗訊息
      return true;
    }
    showRegionMsg(`${REGION_LABEL[region]}車禍資料載入中…第一次打開大約要 5～10 秒，請稍等`, true);
    try {
      data.accidents[region] = C.annotateAccidents(R.annotateAccidents(await window.HotData.loadAccidents(region), region));
      hideRegionMsg();
      return true;
    } catch (err) {
      showRegionMsg(`${REGION_LABEL[region]}車禍資料載入失敗：${err.message}（可再選一次重試）`);
      return false;
    }
  }

  async function switchRegion(region) {
    if (region === app.region) return;
    const prev = app.region;
    stopPlay();
    closePopup();
    app.region = region;
    app.town = "";
    app.village = "";
    app.query = "";
    app.selectedRoadKey = null;
    accLayer.setItems([]);
    roadLayer.clearLayers();
    detLayer.clearLayers();
    heatLayer.setLatLngs([]);
    cameraLayer.update([], false);
    view = null;
    $("searchInput").value = "";
    const v = VIEW[region];
    map.setView([v[0], v[1]], v[2]);
    const ok = await ensureRegion(region);
    if (app.region !== region) return; // 載入期間又切到別的地區
    if (!ok) {
      // 載入失敗：退回原本的地區，之後再選一次這個地區就會重試
      app.region = prev;
      $("regionSel").value = prev;
      const pv = VIEW[prev];
      map.setView([pv[0], pv[1]], pv[2]);
      if (data.accidents[prev]) {
        fillTowns();
        fillVillages();
        renderRange();
        render();
        fitDense();
      }
      return;
    }
    fillTowns();
    if (app.town && !R.towns(data.accidents[region]).includes(app.town)) app.town = "";
    fillVillages();
    renderRange();
    render();
    fitDense();
  }

  function bindControls() {
    $("regionSel").addEventListener("change", (e) => switchRegion(e.target.value));
    document.querySelectorAll("#accViewSeg button").forEach((b) =>
      b.addEventListener("click", () => {
        app.accView = b.dataset.accview;
        saveAccView(app.accView);
        render();
      })
    );
    document.querySelectorAll("#personaSeg button").forEach((b) =>
      b.addEventListener("click", () => {
        stopPlay();
        closePopup();
        app.persona = b.dataset.persona;
        app.selectedRoadKey = null;
        render();
      })
    );
    document.querySelectorAll("#yearsSeg button").forEach((b) =>
      b.addEventListener("click", () => {
        app.period = { kind: "last", n: Number(b.dataset.years) };
        render();
      })
    );
    $("yearSel").addEventListener("change", (e) => {
      app.period = e.target.value ? { kind: "year", y: Number(e.target.value) } : defaultPeriod();
      render();
    });
    document.querySelectorAll("#periodSeg button").forEach((b) =>
      b.addEventListener("click", () => {
        stopPlay();
        const p = b.dataset.period;
        app.time.mode = p === "all" ? "all" : "period";
        app.time.period = p === "all" ? null : p;
        render();
      })
    );
    $("hourRange").addEventListener("input", (e) => {
      stopPlay();
      app.time.mode = "hour";
      app.time.hour = Number(e.target.value);
      render();
    });
    $("playBtn").addEventListener("click", togglePlay);
    bindSet("sev", () => app.severities);
    bindSet("weather", () => app.weathers);
    bindSet("type", () => app.types);
    bindSet("source", () => app.sources);
    bindSet("kind", () => app.kinds);
    $("fillSel").addEventListener("change", (e) => {
      app.fill = e.target.value;
      render();
    });
    $("camLayerChk").addEventListener("change", (e) => {
      app.showCameras = e.target.checked;
      render();
    });
    $("townSel").addEventListener("change", (e) => {
      app.town = e.target.value;
      app.village = "";
      app.selectedRoadKey = null;
      fillVillages();
      render();
      if (!view) return; // 地區資料還在載入或載入失敗
      const pts = view.acc.length ? view.acc : view.det;
      if (app.town) fitTo(pts, 14);
    });
    $("villageSel").addEventListener("change", (e) => {
      app.village = e.target.value;
      render();
    });
    $("metricSel").addEventListener("change", (e) => {
      app.metric = e.target.value;
      app.selectedRoadKey = null;
      render();
    });
    $("minCount").addEventListener("change", (e) => {
      app.minCount = Math.max(MIN_COUNT_FLOOR, Math.floor(Number(e.target.value) || MIN_COUNT_FLOOR));
      e.target.value = String(app.minCount);
      render();
    });
    $("searchForm").addEventListener("submit", (e) => {
      e.preventDefault();
      app.query = $("searchInput").value.trim();
      app.selectedRoadKey = null;
      render();
      if (!view) return; // 地區資料還在載入或載入失敗
      fitSearch(view.acc.concat(view.det));
    });
    $("searchClear").addEventListener("click", () => {
      app.query = "";
      $("searchInput").value = "";
      render();
    });
    $("resetBtn").addEventListener("click", resetFilters);
    $("emptyReset").addEventListener("click", resetFilters);
    $("accViewHelp").addEventListener("click", () =>
      showToast("斑點圖：一個點＝一件車禍，看得出每件事故的位置。熱度圖：把車禍多的地方畫成一片顏色，越紅＝越密集，適合看整體哪裡最危險。", 8000));
    $("csvBtn").addEventListener("click", downloadCsv);
    $("aiBtn").addEventListener("click", runAiAnalysis);
    $("timeToggle").addEventListener("click", () => {
      timeOpen = !timeOpen;
      renderTimeFold();
    });
    $("kindToggle").addEventListener("click", () => {
      app.filtersOpen = !app.filtersOpen;
      saveFoldOpen(app.filtersOpen);
      renderFold();
    });
  }

  function initCharts() {
    hourChart = new Chart($("hourChart"), {
      type: "bar",
      data: { labels: Array.from({ length: 24 }, (_, h) => String(h)), datasets: [{ data: new Array(24).fill(0), backgroundColor: [], borderRadius: 3 }] },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { title: (items) => `${items[0].label}:00`, label: (item) => `${item.raw} 件` } } },
        scales: {
          x: { ticks: { color: "#a2b0c0" }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { color: "#a2b0c0", precision: 0 }, grid: { color: "rgba(255,255,255,0.08)" } },
        },
      },
    });
    causeChart = new Chart($("causeChart"), {
      type: "bar",
      data: { labels: [], datasets: [{ data: [], backgroundColor: "#48c3ac", borderRadius: 3 }] },
      options: {
        indexAxis: "y",
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { title: (items) => items[0].label, label: (item) => `${item.raw} 件` } } },
        scales: {
          x: { beginAtZero: true, ticks: { color: "#a2b0c0", precision: 0 }, grid: { color: "rgba(255,255,255,0.08)" } },
          y: { ticks: { color: "#a2b0c0", font: { size: 11 }, callback(v) { const s = this.getLabelForValue(v); return s.length > 9 ? s.slice(0, 9) + "…" : s; } }, grid: { display: false } },
        },
      },
    });
  }

  // Realtime 收到新偵測事件：加進清單、重畫、閃一下、跳提示
  function onNewDetection(ev) {
    if (data.detections.some((e) => e.id === ev.id)) return;
    R.annotateDetections([ev]);
    data.detections.push(ev);
    if (app.region !== "hualien") return;
    fillVillages();
    renderRange();
    render();
    const icon = L.divIcon({ className: "hot-pulse", iconSize: [36, 36] });
    const marker = L.marker([ev.lat, ev.lon], { icon, interactive: false }).addTo(map);
    setTimeout(() => map.removeLayer(marker), 3000);
    showToast(`新偵測：${F.KIND_LABEL[ev.kind]}　${D.shortAddress(ev) || ev.place}`);
    // 展示資料流程：列出這筆寫進資料庫的欄位（AI 自動寫入／等交通警察隊補填）
    if (app.persona !== "admin") {
      writeCard.show(ev, D.writeFields(ev, { cameraName: CAM.cameraName(ev.camera), kindLabel: F.KIND_LABEL[ev.kind] }));
    }
  }

  function showToast(text, ms = 4000) {
    const box = $("toast");
    box.textContent = text;
    box.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (box.hidden = true), ms);
  }

  async function start() {
    // 資料還沒下載完前，數字卡先寫「載入中」，不要顯示 0（看起來像壞掉）
    ["statTotal", "statDeaths", "statInjuries"].forEach((id) => ($(id).textContent = "載入中"));
    $("rangeAcc").textContent = "車禍：載入中…";
    app.filtersOpen = loadFoldOpen();
    app.accView = loadAccView();
    renderFold(); // 資料載入前就先收好，畫面不會先展開再收起
    initMap();
    initCharts();
    buildCheckboxes();
    bindControls();
    writeCard = UI.writeCard.create($("writeCard"), focusDetection);
    aiDialog = UI.aiDialog.create($("aiDialog"));
    const tour = UI.tour.create($("tourDialog"), $("helpBtn"));
    routePanel = UI.routePanel.create($("routeBody"), {
      map,
      layer: routeLayer,
      lineOpts: { pane: "routePane", renderer: L.svg({ pane: "routePane" }) },
      accidents: () => (view ? view.accRoute : []),
      allAccidents: () => data.accidents.hualien || [],
      cameras: () => CAM.withStats(CAM.ALL, data.detections).filter((c) => c.liveUrl),
      periodLabel: () => (hasYears() ? periodText() : ""),
      openCam: (c) => cameraLayer.open(c),
    });
    loginDialog = UI.login.bindDialog(
      $("loginDialog"),
      (requestedRole) => window.HotData.auth.signInWithGoogle(requestedRole),
      (email, password) => window.HotData.auth.signIn(email, password).then(setSession),
    );
    adminView = UI.admin.create($("adminView"), {
      api: window.HotData.admin,
      auth: window.HotData.auth,
      towns: () => R.towns(data.accidents.hualien || []),
      selfId: () => (session ? session.id : ""),
      onRestore: applyUpdate,
    });
    renderAuth();
    const sessionPromise = window.HotData.auth.current().catch((err) => {
      console.warn("讀取登入狀態失敗：" + err.message);
      return null;
    });
    const detPromise = window.HotData.loadEvents()
      .then((d) => (data.detections = R.annotateDetections(d.events)))
      .catch((err) => {
        data.detError = err.message;
        console.warn(err.message);
      });
    const ok = await ensureRegion(app.region);
    await detPromise;
    fillTowns();
    fillVillages();
    fillYears();
    renderRange();
    if (ok) {
      render();
      fitDense();
    }
    tour.maybeOpen(); // 第一次來：資料載好後跳出使用說明
    const saved = await sessionPromise; // 上次登入還沒登出：直接進該身分的畫面
    if (saved) await setSession(saved);
    window.HotData.subscribeEvents(onNewDetection, applyUpdate);
    window.HotApp = { onNewDetection, map }; // 給自動測試用（模擬收到新偵測、查地圖狀態），不會寫進資料庫
  }

  start();
})();
