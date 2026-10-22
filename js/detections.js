// AI 偵測事件：Supabase detection_events 的列轉成地圖用的格式（純函式，瀏覽器與 Node 測試共用）。
(function (root) {
  const COLUMNS = [
    "id", "ts", "kind", "lat", "lon", "place", "road", "village", "town", "county", "address",
    "source", "snapshot_path", "confidence", "camera", "deaths", "injuries", "cause",
    "accident_type", "filled_by_name", "filled_at", "dismissed",
  ];
  const FILL_COLUMNS = ["accident_type", "filled_by_name", "filled_at"]; // 002_police_fill.sql 新增的欄位
  const ROLE_COLUMNS = ["dismissed"]; // 003_roles.sql 新增的欄位
  // 資料庫還沒跑新 SQL 時，依序退回較少的欄位，地圖照樣能看
  const COLUMN_SETS = [
    COLUMNS,
    COLUMNS.filter((c) => !ROLE_COLUMNS.includes(c)),
    COLUMNS.filter((c) => !ROLE_COLUMNS.includes(c) && !FILL_COLUMNS.includes(c)),
  ];
  const TW_OFFSET_MS = 8 * 3600 * 1000;

  function toTaiwanTs(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return new Date(d.getTime() + TW_OFFSET_MS).toISOString().slice(0, 19);
  }

  function snapshotUrl(path, cfg) {
    if (!path) return null;
    const encoded = path.split("/").map(encodeURIComponent).join("/");
    return `${cfg.supabaseUrl}/storage/v1/object/public/${cfg.snapshotBucket}/${encoded}`;
  }

  const numOrNull = (v) => (v === null || v === undefined ? null : Number(v));

  function normalizeDetection(r, cfg) {
    const ts = toTaiwanTs(r.ts);
    if (!ts) return null;
    return {
      id: r.id,
      ts,
      kind: r.kind,
      lat: Number(r.lat),
      lon: Number(r.lon),
      place: r.place || "",
      source: r.source,
      confidence: Number(r.confidence),
      camera: r.camera || "",
      snapshot: snapshotUrl(r.snapshot_path, cfg),
      road: r.road || "",
      village: r.village || "",
      town: r.town || "",
      county: r.county || "",
      address: r.address || "",
      deaths: numOrNull(r.deaths),
      injuries: numOrNull(r.injuries),
      cause: r.cause || "",
      accidentType: r.accident_type || "",
      filledBy: r.filled_by_name || "",
      filledAt: r.filled_at ? toTaiwanTs(r.filled_at) : null,
      dismissed: r.dismissed === true,
    };
  }

  // 「中正路41號，主農里，花蓮市」：地址查詢有回門牌就接在路名後面
  function shortAddress(ev) {
    const m = `${ev.place || ""} ${ev.address || ""}`.match(/(?:^|[\s,，])(\d+(?:之\d+)?號)/);
    const road = ev.road && m ? ev.road + m[1] : ev.road;
    return [road, ev.village, ev.town].filter(Boolean).join("，") || ev.address || "";
  }

  // 待補填：傷亡與肇因都還沒填
  const isPending = (ev) => ev.deaths === null && ev.injuries === null && !ev.cause;

  // 台灣今天的日期 "YYYY-MM-DD"
  const taiwanDate = (now = new Date()) => new Date(now.getTime() + TW_OFFSET_MS).toISOString().slice(0, 10);

  // 員警補填：事故型態 8 大類（跟車禍篩選的大類一樣，不含「未提供」；資料庫函式也檢查同一份清單）
  const FILL_TYPES = ["側撞", "路口撞", "追撞", "對撞", "撞路人", "自撞", "撞動物", "其他"];
  const OTHER_CAUSE = "__other__"; // 肇因下拉選「其他（自行輸入）」時的值
  const LIMITS = { deaths: 100, injuries: 500, cause: 60 };

  // 表單內容檢查（資料庫函式會再檢查一次，這裡是先在網頁上提示）
  function validateFill(form) {
    const count = (v, max, label) => {
      const s = String(v === null || v === undefined ? "" : v).trim();
      if (!/^\d+$/.test(s)) return { error: `${label}要填 0 以上的整數` };
      const n = Number(s);
      if (n > max) return { error: `${label}最多 ${max}` };
      return { n };
    };
    const d = count(form.deaths, LIMITS.deaths, "死亡人數");
    if (d.error) return { ok: false, error: d.error };
    const i = count(form.injuries, LIMITS.injuries, "受傷人數");
    if (i.error) return { ok: false, error: i.error };
    const cause = (form.cause === OTHER_CAUSE ? form.causeOther || "" : form.cause || "").trim();
    if (!cause) return { ok: false, error: "請選擇或輸入肇因" };
    if (cause.length > LIMITS.cause) return { ok: false, error: `肇因最多 ${LIMITS.cause} 個字` };
    const type = (form.accidentType || "").trim();
    if (type && !FILL_TYPES.includes(type)) return { ok: false, error: "事故型態不在清單內" };
    return { ok: true, values: { deaths: d.n, injuries: i.n, cause, accidentType: type || null } };
  }

  // 即時寫入卡片：這筆新事件寫進資料庫的欄位。auto＝偵測當下 AI 自動寫入，pending＝等交通警察隊補填。
  // ok＝有沒有寫到值；opts：{ cameraName, kindLabel }
  function writeFields(ev, opts) {
    const o = opts || {};
    const addr = shortAddress(ev);
    const field = (label, value) => ({ label, value: value || "", ok: !!value });
    const filledCasualty = ev.deaths !== null || ev.injuries !== null;
    return {
      auto: [
        field("時間", ev.ts ? ev.ts.replace("T", " ") : ""),
        field("種類", o.kindLabel),
        field("GPS", Number.isFinite(ev.lat) && Number.isFinite(ev.lon) ? `${ev.lat.toFixed(6)}, ${ev.lon.toFixed(6)}` : ""),
        field("地址", addr),
        field("監視器", o.cameraName),
        field("截圖", ev.snapshot ? "已上傳" : ""),
        field("信心分數", Number.isFinite(ev.confidence) ? Math.round(ev.confidence * 100) + "%" : ""),
      ],
      pending: [
        field("死亡／受傷人數", filledCasualty ? `死亡 ${ev.deaths ?? "—"}、受傷 ${ev.injuries ?? "—"}` : ""),
        field("肇因", ev.cause),
        field("事故型態", ev.accidentType),
      ],
    };
  }

  // 「王警員・10/16 14:30」；沒補填回空字串
  function fillText(ev) {
    if (!ev.filledBy) return "";
    const t = ev.filledAt ? `・${ev.filledAt.slice(5, 7)}/${ev.filledAt.slice(8, 10)} ${ev.filledAt.slice(11, 16)}` : "";
    return ev.filledBy + t;
  }

  const api = {
    COLUMNS, FILL_COLUMNS, COLUMN_SETS, FILL_TYPES, OTHER_CAUSE, toTaiwanTs, normalizeDetection, shortAddress, isPending, taiwanDate, validateFill, fillText, writeFields,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.HotDetections = api;
})(this);
