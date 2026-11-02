// AI 偵測畫面用：跟偵測主機上的「本機偵測服務」（detector/service/server.py）溝通，加上幾個純函式（Node 測試共用）。
(function (root) {
  const BASE = "http://127.0.0.1:8770";

  // 圍籬狀態 → 給人看的說明（跟偵測服務的 fence 欄位對應）
  const FENCE_TEXT = {
    idle: { label: "還沒開始", note: "" },
    empty: { label: "綠色：圍籬內沒有東西", note: "正常" },
    occupied: { label: "深綠色：有車或物體進入圍籬", note: "停超過 15 秒會變紅" },
    alert: { label: "紅色：停留超過 15 秒，判定異常", note: "已自動紀錄" },
  };

  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const round4 = (v) => Math.round(v * 10000) / 10000;

  // 畫面上點的位置（像素）→ 0~1 比例座標：網頁畫面大小跟監視器原始大小不同也不會歪
  function normPoint(x, y, width, height) {
    if (!width || !height) return [0, 0];
    return [round4(clamp01(x / width)), round4(clamp01(y / height))];
  }

  // 能不能按「開始偵測」：依序檢查，回傳 { ok, reason }（reason 直接顯示給使用者）
  function canStart(s) {
    if (!s || !s.service) return { ok: false, reason: "偵測服務沒開：請在偵測主機雙擊「啟動偵測服務.bat」" };
    if (s.models === "error") return { ok: false, reason: "AI 模型載入失敗，請看偵測主機的黑色視窗" };
    if (s.models !== "ready") return { ok: false, reason: "AI 模型載入中，請稍等幾秒" };
    if (!s.camera) return { ok: false, reason: "請先在第 1 步選監視器" };
    if (!s.points || s.points.length < 3) return { ok: false, reason: "請在第 2 步的畫面上點至少 3 個點圍出圍籬" };
    return { ok: true, reason: "" };
  }

  async function request(path, opts) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), (opts && opts.timeout) || 5000);
    try {
      const res = await fetch(BASE + path, Object.assign({ signal: ctrl.signal }, opts && opts.init));
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `偵測服務回應錯誤（${res.status}）`);
      return body;
    } catch (err) {
      if (err.name === "AbortError" || err instanceof TypeError) throw new Error("連不到偵測服務");
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
  const post = (path, body, timeout) => request(path, {
    timeout,
    init: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) },
  });

  const api = {
    BASE,
    FENCE_TEXT,
    normPoint,
    canStart,
    status: () => request("/api/status", { timeout: 2500 }),
    start: (body) => post("/api/start", body, 15000),
    stop: () => post("/api/stop", {}, 15000),
    session: () => request("/api/session").then((b) => b.items || []),
    snapshotUrl: (url) => `${BASE}/api/snapshot?url=${encodeURIComponent(url)}&t=${Date.now()}`,
    streamUrl: () => `${BASE}/api/stream?t=${Date.now()}`,
    shotUrl: (name) => `${BASE}/shots/${encodeURIComponent(name)}`,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.HotDetect = api;
})(this);
