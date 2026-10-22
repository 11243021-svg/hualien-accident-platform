// 登入身分規則：哪個身分能看哪些畫面、能做什麼（純函式，瀏覽器與 Node 測試共用）。
// 真正的權限由資料庫把關（supabase/003_roles.sql），這裡只決定畫面上要顯示什麼。
(function (root) {
  const ROLES = ["mayor", "police", "admin"];
  const ROLE_LABEL = { mayor: "公路局", police: "交通警察隊", admin: "系統管理員" };
  const VIEW_LABEL = { mayor: "公路局（路況管理）", police: "交通警察隊", citizen: "一般民眾", admin: "系統管理" };
  const VIEWS = { mayor: ["mayor"], police: ["police"], admin: ["mayor", "police", "citizen", "admin"] };

  // 沒登入、或登入了但還沒設定身分：只看民眾畫面
  const viewsFor = (role) => VIEWS[role] || ["citizen"];
  const defaultView = (role) => (role === "admin" ? "admin" : viewsFor(role)[0]);
  const canFill = (role) => role === "police" || role === "admin";
  const canDismiss = (role) => role === "admin";

  // 補填紀錄的改前／改後翻成白話：第一次填「死亡 0、肇因 酒駕」，修改「受傷 2→3」，清空「型態 追撞→（清空）」
  const FIELDS = [["deaths", "死亡"], ["injuries", "受傷"], ["cause", "肇因"], ["accident_type", "型態"]];
  const show = (v) => (v === null || v === undefined || v === "" ? "—" : String(v));
  function describeChange(before, after) {
    const b = before || {};
    const a = after || {};
    if ("dismissed" in a && a.dismissed !== b.dismissed) return a.dismissed ? "標為誤報" : "復原";
    const parts = FIELDS.filter(([k]) => show(b[k]) !== show(a[k])).map(([k, label]) => {
      if (show(b[k]) === "—") return `${label} ${show(a[k])}`;
      return `${label} ${show(b[k])}→${show(a[k]) === "—" ? "（清空）" : show(a[k])}`;
    });
    return parts.length ? parts.join("、") : "沒有變更";
  }

  const api = { ROLES, ROLE_LABEL, VIEW_LABEL, viewsFor, defaultView, canFill, canDismiss, describeChange };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.HotRoles = api;
})(this);
