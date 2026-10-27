// 「去哪裡拿資料」：AI 偵測事件與車禍資料都從 Supabase 讀；偵測事件另外用 Realtime 即時收新資料。
(function (root) {
  const PAGE = 1000; // Supabase 預設每次最多回 1000 筆

  function loadEvents() {
    const D = root.HotDetections;
    const cfg = root.HOT_CONFIG;
    // 補填／誤報欄位是 002、003 SQL 才加的；還沒跑時依序改讀較少的欄位，地圖照樣能用
    const tryColumns = (i) =>
      fetchAllRows(cfg.tables.detections, D.COLUMN_SETS[i], "id").catch((err) => {
        if (!/does not exist/.test(err.message) || i + 1 >= D.COLUMN_SETS.length) throw err;
        console.warn("資料庫還沒有最新欄位（請執行 supabase/002_police_fill.sql、003_roles.sql）");
        return tryColumns(i + 1);
      });
    return tryColumns(0)
      .then((rows) => ({ events: rows.map((r) => D.normalizeDetection(r, cfg)).filter(Boolean) }))
      .catch((err) => {
        throw new Error("偵測資料載入失敗：" + err.message);
      });
  }

  // supabase-js 用戶端（Realtime＋員警登入共用一個）；套件沒載入時回 null
  let sbClient;
  function client() {
    if (sbClient !== undefined) return sbClient;
    const cfg = root.HOT_CONFIG;
    sbClient = root.supabase && typeof root.supabase.createClient === "function"
      ? root.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey)
      : null;
    return sbClient;
  }

  // 新增／補填偵測事件即時通知；supabase-js 沒載入或連不上時只在 console 警告，不影響其他功能
  function subscribeEvents(onInsert, onUpdate) {
    const cfg = root.HOT_CONFIG;
    const sb = client();
    if (!sb) {
      console.warn("Realtime 套件沒有載入，新偵測事件要重新整理才看得到");
      return null;
    }
    const table = { schema: "public", table: cfg.tables.detections };
    const norm = (row) => root.HotDetections.normalizeDetection(row, cfg);
    return sb
      .channel("detection-events")
      .on("postgres_changes", Object.assign({ event: "INSERT" }, table), (payload) => {
        const ev = norm(payload.new);
        if (ev) onInsert(ev);
      })
      .on("postgres_changes", Object.assign({ event: "UPDATE" }, table), (payload) => {
        const ev = norm(payload.new);
        if (ev && onUpdate) onUpdate(ev);
      })
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") console.warn("Realtime 連線失敗：" + status);
      });
  }

  // 登入：Google OAuth。實際可用權限仍由 app_users 與 RLS 判定，不能由前端選擇身分取得。
  // 登入後查帳號身分表，回傳 { id, email, name, role, town }；還沒設定身分時 name、role 是 null。
  const auth = {
    available: () => !!client(),
    async current() {
      const sb = client();
      if (!sb) return null;
      // Google 登入失敗時，Supabase 會把原因放在網址後面（?error_description=…），讀出來給使用者看
      const oauthError = readOAuthError();
      const { data } = await sb.auth.getSession();
      if (!data.session && oauthError) throw new Error(oauthError);
      if (data.session) {
        // 身分申請送不出去不能害整個登入失敗：先登入，再提示
        await submitStoredRoleRequest().catch((err) => console.warn(err.message));
      }
      return data.session ? lookupRole(data.session.user) : null;
    },
    async signIn(email, password) {
      const sb = client();
      if (!sb) throw new Error("登入套件沒有載入，請重新整理");
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message === "Invalid login credentials" ? "Email 或密碼錯誤" : error.message);
      return lookupRole(data.user);
    },
    async signInWithGoogle(requestedRole) {
      const sb = client();
      if (!sb) throw new Error("登入套件沒有載入，請重新整理");
      if (!/^https?:$/.test(window.location.protocol)) {
        throw new Error("請使用網站網址開啟本頁後再登入，不能直接以檔案方式開啟");
      }
      // 僅記錄使用者期待的身分，不可用來取得系統權限。
      sessionStorage.setItem("hot_requested_role", requestedRole || "citizen");
      if (requestedRole === "mayor" || requestedRole === "police") sessionStorage.setItem("hot_role_request", requestedRole);
      else sessionStorage.removeItem("hot_role_request");
      const { error } = await sb.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}${window.location.pathname}`,
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) throw new Error(error.message);
    },
    async signOut() {
      const sb = client();
      if (sb) await sb.auth.signOut();
      sessionStorage.removeItem("hot_requested_role");
      sessionStorage.removeItem("hot_role_request");
    },
    // 呼叫資料庫的補填函式，回傳補填後的整筆事件（已轉成地圖用格式）
    async fill(id, v) {
      const sb = client();
      if (!sb) throw new Error("登入套件沒有載入，請重新整理");
      const { data, error } = await sb.rpc("fill_detection", {
        p_id: id, p_deaths: v.deaths, p_injuries: v.injuries, p_cause: v.cause, p_accident_type: v.accidentType,
      });
      if (error) throw new Error(error.message || "補填失敗");
      return rowToEvent(data);
    },
    // 標誤報（on=true）／復原（on=false），只有系統管理員能用
    async dismiss(id, on) {
      const { data, error } = await needClient().rpc("dismiss_detection", { p_id: id, p_dismissed: on });
      if (error) throw new Error(error.message || "處理誤報失敗");
      return rowToEvent(data);
    },
  };
  function needClient() {
    const sb = client();
    if (!sb) throw new Error("登入套件沒有載入，請重新整理");
    return sb;
  }
  function readOAuthError() {
    const params = new URLSearchParams(window.location.search + "&" + window.location.hash.replace(/^#/, ""));
    const desc = params.get("error_description") || params.get("error");
    if (!desc) return "";
    // 把錯誤參數從網址拿掉，重新整理才不會一直跳同一個錯誤
    window.history.replaceState(null, "", window.location.origin + window.location.pathname);
    return "Google 登入沒有成功：" + desc.replace(/\+/g, " ");
  }
  async function submitStoredRoleRequest() {
    const role = sessionStorage.getItem("hot_role_request");
    if (role !== "mayor" && role !== "police") return;
    const { error } = await needClient().rpc("submit_role_request", { p_requested_role: role });
    if (error) throw new Error(error.message || "身分申請送出失敗");
    sessionStorage.removeItem("hot_role_request");
  }
  function rowToEvent(data) {
    const row = Array.isArray(data) ? data[0] : data;
    return row ? root.HotDetections.normalizeDetection(row, root.HOT_CONFIG) : null;
  }
  async function lookupRole(user) {
    const { data, error } = await client().from("app_users").select("role,display_name,town").eq("user_id", user.id).maybeSingle();
    if (error) console.warn("查帳號身分失敗：" + error.message);
    // 自己最近一次的身分申請（申請中／已核可／已婉拒）；資料庫還沒跑 008 SQL 時是 undefined（不知道）
    let request;
    const rq = await client().rpc("my_role_request");
    if (rq.error) console.warn("查身分申請失敗：" + rq.error.message);
    else request = rq.data && rq.data[0] ? { role: rq.data[0].requested_role, status: rq.data[0].status } : null;
    return {
      request,
      id: user.id,
      email: user.email || "",
      name: data ? data.display_name : null,
      role: data ? data.role : null,
      town: data ? data.town || "" : "",
      requestedRole: sessionStorage.getItem("hot_requested_role") || "citizen",
    };
  }

  // 系統管理員用：帳號、誤報、補填紀錄（資料庫會再核對是不是管理員）
  const admin = {
    async listRoleRequests() {
      const { data, error } = await needClient().rpc("admin_list_role_requests");
      if (error) throw new Error(error.message);
      return (data || []).map((r) => ({
        userId: r.user_id, email: r.email || "", name: r.display_name || "", role: r.requested_role,
        status: r.status, createdAt: r.created_at ? root.HotDetections.toTaiwanTs(r.created_at) : null,
      }));
    },
    async reviewRoleRequest(userId, approved, town) {
      const { error } = await needClient().rpc("admin_review_role_request", {
        p_user_id: userId, p_approved: approved, p_town: town || null,
      });
      if (error) throw new Error(error.message);
    },
    async listUsers() {
      const { data, error } = await needClient().rpc("admin_list_users");
      if (error) throw new Error(error.message);
      return (data || []).map((u) => ({
        userId: u.user_id, email: u.email || "", role: u.role || null, name: u.display_name || "", town: u.town || "",
        lastSignIn: u.last_sign_in_at ? root.HotDetections.toTaiwanTs(u.last_sign_in_at) : null,
      }));
    },
    async deleteUser(userId) {
      const { error } = await needClient().rpc("admin_delete_user", { p_user_id: userId });
      if (error) throw new Error(error.message);
    },
    async setUser(userId, role, name, town) {
      const { error } = await needClient().rpc("admin_set_user", { p_user_id: userId, p_role: role, p_display_name: name, p_town: town });
      if (error) throw new Error(error.message);
    },
    async fillLog(limit = 100) {
      const { data, error } = await needClient()
        .from("detection_fill_log")
        .select("id,event_id,filled_by_name,filled_at,action,before,after")
        .order("filled_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return (data || []).map((r) => ({
        id: r.id, eventId: r.event_id, name: r.filled_by_name, at: root.HotDetections.toTaiwanTs(r.filled_at),
        action: r.action, before: r.before, after: r.after,
      }));
    },
    async dismissed() {
      const D = root.HotDetections;
      const { data, error } = await needClient()
        .from(root.HOT_CONFIG.tables.detections)
        .select(D.COLUMNS.concat(["dismissed_by_name", "dismissed_at"]).join(","))
        .eq("dismissed", true)
        .order("dismissed_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data || []).map((r) => Object.assign(D.normalizeDetection(r, root.HOT_CONFIG) || {}, {
        dismissedBy: r.dismissed_by_name || "", dismissedAt: r.dismissed_at ? D.toTaiwanTs(r.dismissed_at) : null,
      })).filter((ev) => ev.id !== undefined);
    },
  };

  function selectParam(columns) {
    // 欄名含數字開頭、點、括號、減號時要加雙引號
    return columns.map((c) => (/^[\p{L}_][\p{L}\p{N}_]*$/u.test(c) ? c : `"${c}"`)).join(",");
  }

  async function fetchPage(table, columns, orderBy, offset, withCount, limit = PAGE) {
    const cfg = root.HOT_CONFIG;
    const url = `${cfg.supabaseUrl}/rest/v1/${table}?select=${encodeURIComponent(selectParam(columns))}` +
      `&order=${encodeURIComponent(selectParam([orderBy]))}&limit=${limit}&offset=${offset}`;
    const headers = { apikey: cfg.supabaseAnonKey, Authorization: `Bearer ${cfg.supabaseAnonKey}` };
    if (withCount) headers.Prefer = "count=exact";
    const res = await fetch(url, { headers });
    if (!res.ok) {
      let detail = "";
      try { detail = (await res.json()).message || ""; } catch (e) { /* 不是 JSON 就算了 */ }
      throw new Error(`Supabase 回應 ${res.status} ${detail}`.trim());
    }
    const rows = await res.json();
    const range = res.headers.get("content-range") || "";
    const total = parseInt(range.split("/")[1], 10);
    return { rows, total: Number.isFinite(total) ? total : rows.length };
  }

  async function fetchAllRows(table, columns, orderBy) {
    const first = await fetchPage(table, columns, orderBy, 0, true);
    const offsets = [];
    for (let off = PAGE; off < first.total; off += PAGE) offsets.push(off);
    const rest = await Promise.all(offsets.map((off) => fetchPage(table, columns, orderBy, off, false)));
    return first.rows.concat(...rest.map((p) => p.rows));
  }

  // 只問筆數（抓 1 筆），用來判斷瀏覽器快取是否還是最新
  async function fetchCount(table, orderBy) {
    return (await fetchPage(table, [orderBy], orderBy, 0, true, 1)).total;
  }

  // 快取版本：資料內容有修正但筆數沒變時（例如 2026-10-15 修正匯入亂碼），把版本加 1 讓瀏覽器重抓
  const CACHE_VERSION = 2;
  const cache = {};
  function loadAccidents(city) {
    if (!cache[city]) {
      const A = root.HotAccidents;
      const C = root.HotCache;
      const table = root.HOT_CONFIG.tables[city];
      const spec = city === "tainan"
        ? { columns: A.TAINAN_COLUMNS, order: "Seq", normalize: A.normalizeTainan }
        : { columns: A.HUALIEN_COLUMNS, order: "案件編號", normalize: A.normalizeHualien };
      cache[city] = (async () => {
        const count = await fetchCount(table, spec.order);
        const cacheKey = `${table}@v${CACHE_VERSION}`;
        const entry = C ? await C.get(cacheKey) : null;
        let rows;
        if (C && C.isFresh(entry, count)) {
          rows = entry.rows;
        } else {
          rows = await fetchAllRows(table, spec.columns, spec.order);
          if (C) C.put(cacheKey, { count, rows });
        }
        return rows.map(spec.normalize).filter(Boolean);
      })().catch((err) => {
        delete cache[city]; // 失敗不快取，下次切回來可重試
        throw err;
      });
    }
    return cache[city];
  }

  // 路線安全：地名 → 座標（OpenStreetMap Nominatim，限花蓮縣範圍）、兩點之間的開車路線（OSRM 公開服務）
  const HUALIEN_VIEWBOX = "121.2,24.4,121.8,23.0";
  async function getJson(url, what) {
    let res;
    try {
      res = await fetch(url, { headers: { "Accept-Language": "zh-TW" } });
    } catch (err) {
      throw new Error(`${what}連不上，請確認網路`);
    }
    if (!res.ok) throw new Error(`${what}暫時無法使用（${res.status}），請稍後再試`);
    return res.json();
  }
  const route = {
    async geocode(q) {
      const url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=tw&bounded=1" +
        `&viewbox=${HUALIEN_VIEWBOX}&q=${encodeURIComponent(q)}`;
      return root.HotRoute.parseNominatim(await getJson(url, "地名查詢服務"));
    },
    async drive(a, b) {
      const url = `https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=full&geometries=geojson`;
      return root.HotRoute.parseOsrm(await getJson(url, "路線規劃服務"));
    },
  };

  // AI 轄區分析：交給 Supabase Edge Function ai-analysis 轉問 Gemini（金鑰在後台，網頁看不到）
  const ai = {
    async analyze(stats) {
      const fn = root.HOT_CONFIG.aiFunction || "ai-analysis";
      const { data, error } = await needClient().functions.invoke(fn, { body: { stats } });
      if (error) {
        let msg = error.message || "AI 分析失敗";
        try {
          const j = await error.context.json();
          if (j && j.error) msg = j.error;
        } catch (e) { /* 不是 JSON 就用原本的訊息 */ }
        throw new Error(msg);
      }
      if (!data || !data.text) throw new Error("AI 沒有回答，請再試一次");
      return data;
    },
  };

  root.HotData = { loadEvents, loadAccidents, fetchAllRows, subscribeEvents, auth, admin, route, ai };
})(this);
