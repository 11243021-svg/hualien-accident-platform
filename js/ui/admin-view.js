// 系統管理畫面：帳號管理、誤報清單、補填紀錄。資料庫會再核對是不是管理員。
(function (root) {
  const UI = root.HotUI;
  const ACTION_LABEL = { fill: "補填", dismiss: "標誤報", restore: "復原" };
  const time = (ts) => (ts ? ts.slice(0, 16).replace("T", " ") : "—");

  function block(title, note) {
    const box = UI.el("div", "admin__block");
    const msg = UI.el("p", "admin__msg");
    msg.setAttribute("role", "status");
    const body = UI.el("div");
    box.append(UI.el("h2", null, title), UI.el("p", "admin__note", note), body, msg);
    const say = (text, isError) => {
      msg.textContent = text;
      msg.classList.toggle("is-error", !!isError);
    };
    return { box, body, say };
  }
  function table(heads) {
    const t = UI.el("table", "atable");
    const tr = UI.el("tr");
    heads.forEach((h) => tr.append(UI.el("th", null, h)));
    const thead = UI.el("thead");
    thead.append(tr);
    const tbody = UI.el("tbody");
    t.append(thead, tbody);
    return { t, tbody };
  }
  const td = (content) => {
    const c = UI.el("td");
    if (content instanceof Node) c.append(content);
    else c.textContent = content === null || content === undefined || content === "" ? "—" : String(content);
    return c;
  };
  function selectOf(options, value) {
    const sel = UI.el("select", "fill__input");
    options.forEach(([v, text]) => {
      const o = UI.el("option", null, text);
      o.value = v;
      sel.append(o);
    });
    sel.value = value;
    return sel;
  }
  function emptyRow(tbody, cols, text) {
    const tr = UI.el("tr");
    const c = UI.el("td", "atable__empty", text);
    c.colSpan = cols;
    tr.append(c);
    tbody.append(tr);
  }

  // opts：{ api: HotData.admin, auth: HotData.auth, towns: () => string[], selfId: () => string, onRestore(ev) }
  UI.admin = {
    create(rootEl, opts) {
      const Roles = root.HotRoles;
      const users = block("帳號管理", "設定每個帳號的身分、名字、管理的鄉鎮（公路局才要選）。開新帳號、設密碼請到 Supabase 後台 → Authentication → Add user；自己的身分不能在這裡改。");
      const requests = block("身分申請", "Google 登入者可申請公路局或交通警察隊身分；核可後才會取得對應功能。系統管理員身分必須由現任管理員直接設定。");
      const dism = block("誤報清單", "標為誤報的偵測事件，所有人的地圖上都看不到；按「復原」就會回到地圖上。");
      const log = block("補填紀錄", "最新 100 筆：誰、什麼時候、做了什麼。");
      rootEl.replaceChildren(users.box, requests.box, dism.box, log.box);

      async function loadUsers() {
        users.say("載入中…");
        let list;
        try {
          list = await opts.api.listUsers();
        } catch (err) {
          users.body.replaceChildren();
          return users.say("載入失敗：" + err.message, true);
        }
        const { t, tbody } = table(["Email", "名字", "身分", "管理鄉鎮", "最後登入", ""]);
        if (!list.length) emptyRow(tbody, 6, "還沒有任何帳號");
        const towns = opts.towns();
        list.forEach((u) => {
          const tr = UI.el("tr");
          if (u.userId === opts.selfId()) {
            tr.append(td(u.email), td(u.name), td(Roles.ROLE_LABEL[u.role] || "—"), td(u.town), td(time(u.lastSignIn)), td(UI.el("span", "atable__self", "（自己）")));
            return tbody.append(tr);
          }
          const name = UI.el("input", "fill__input");
          name.type = "text";
          name.maxLength = 30;
          name.value = u.name;
          name.placeholder = "例：王警員";
          const role = selectOf(Roles.ROLES.map((r) => [r, Roles.ROLE_LABEL[r]]), u.role || "citizen");
          const townOpts = [["", "請選擇…"], ...towns.map((x) => [x, x])];
          if (u.town && !towns.includes(u.town)) townOpts.push([u.town, u.town]);
          const town = selectOf(townOpts, u.town);
          const syncTown = () => (town.disabled = role.value !== "mayor");
          role.addEventListener("change", syncTown);
          syncTown();
          const save = UI.el("button", "auth__btn auth__btn--main", "儲存");
          save.type = "button";
          save.addEventListener("click", async () => {
            const r = role.value;
            if (!name.value.trim()) return users.say("請填名字", true);
            if (r === "mayor" && !town.value) return users.say("公路局帳號要選管理的鄉鎮", true);
            save.disabled = true;
            try {
              await opts.api.setUser(u.userId, r, name.value.trim(), r === "mayor" ? town.value : null);
              users.say(`已更新：${u.email}`);
              loadUsers();
            } catch (err) {
              users.say("儲存失敗：" + err.message, true);
              save.disabled = false;
            }
          });
          tr.append(td(u.email), td(name), td(role), td(town), td(time(u.lastSignIn)), td(save));
          tbody.append(tr);
        });
        users.body.replaceChildren(t);
        users.say(`共 ${list.length} 個帳號`);
      }

      async function loadRoleRequests() {
        requests.say("載入中…");
        let list;
        try {
          list = await opts.api.listRoleRequests();
        } catch (err) {
          requests.body.replaceChildren();
          return requests.say("載入失敗：" + err.message, true);
        }
        const { t, tbody } = table(["Email", "名字", "申請身分", "申請時間", "公路局轄區", "處理"]);
        if (!list.length) emptyRow(tbody, 6, "目前沒有待審核申請");
        const towns = opts.towns();
        list.forEach((request) => {
          const tr = UI.el("tr");
          const town = selectOf([["", "請選擇…"], ...towns.map((name) => [name, name])], "");
          town.disabled = request.role !== "mayor";
          const approve = UI.el("button", "auth__btn auth__btn--main", "核可");
          const reject = UI.el("button", "auth__btn", "婉拒");
          approve.type = "button";
          reject.type = "button";
          const setBusy = (busy) => { approve.disabled = busy; reject.disabled = busy; town.disabled = busy || request.role !== "mayor"; };
          approve.addEventListener("click", async () => {
            if (request.role === "mayor" && !town.value) return requests.say("核可公路局身分前，請選擇管理鄉鎮", true);
            setBusy(true);
            try {
              await opts.api.reviewRoleRequest(request.userId, true, town.value);
              requests.say(`已核可：${request.email}`);
              loadRoleRequests();
              loadUsers();
            } catch (err) {
              requests.say("核可失敗：" + err.message, true);
              setBusy(false);
            }
          });
          reject.addEventListener("click", async () => {
            setBusy(true);
            try {
              await opts.api.reviewRoleRequest(request.userId, false, null);
              requests.say(`已婉拒：${request.email}`);
              loadRoleRequests();
            } catch (err) {
              requests.say("處理失敗：" + err.message, true);
              setBusy(false);
            }
          });
          const actions = UI.el("div", "login__btns");
          actions.append(reject, approve);
          tr.append(td(request.email), td(request.name), td(Roles.ROLE_LABEL[request.role] || request.role), td(time(request.createdAt)), td(town), td(actions));
          tbody.append(tr);
        });
        requests.body.replaceChildren(t);
        requests.say(list.length ? `共 ${list.length} 筆待審核申請` : "");
      }

      async function loadDismissed() {
        dism.say("載入中…");
        let list;
        try {
          list = await opts.api.dismissed();
        } catch (err) {
          dism.body.replaceChildren();
          return dism.say("載入失敗：" + err.message, true);
        }
        const F = root.HotFilters;
        const D = root.HotDetections;
        const { t, tbody } = table(["偵測時間", "種類", "地址", "來源", "誰標的", "標記時間", ""]);
        if (!list.length) emptyRow(tbody, 7, "目前沒有誤報");
        list.forEach((ev) => {
          const back = UI.el("button", "auth__btn", "復原");
          back.type = "button";
          back.addEventListener("click", async () => {
            back.disabled = true;
            try {
              const restored = await opts.auth.dismiss(ev.id, false);
              if (restored) opts.onRestore(restored);
              dism.say("已復原，地圖上又看得到這筆了");
              loadDismissed();
              loadLog();
            } catch (err) {
              dism.say("復原失敗：" + err.message, true);
              back.disabled = false;
            }
          });
          const tr = UI.el("tr");
          tr.append(td(time(ev.ts)), td(F.KIND_LABEL[ev.kind]), td(D.shortAddress(ev) || ev.place), td(ev.source === "real" ? "真實" : "模擬"), td(ev.dismissedBy), td(time(ev.dismissedAt)), td(back));
          tbody.append(tr);
        });
        dism.body.replaceChildren(t);
        dism.say(list.length ? `共 ${list.length} 筆` : "");
      }

      async function loadLog() {
        log.say("載入中…");
        let list;
        try {
          list = await opts.api.fillLog(100);
        } catch (err) {
          log.body.replaceChildren();
          return log.say("載入失敗：" + err.message, true);
        }
        const { t, tbody } = table(["時間", "誰", "動作", "偵測事件編號", "內容"]);
        if (!list.length) emptyRow(tbody, 5, "還沒有紀錄");
        list.forEach((r) => {
          const tr = UI.el("tr");
          tr.append(td(time(r.at)), td(r.name), td(ACTION_LABEL[r.action] || r.action), td(`#${r.eventId}`), td(Roles.describeChange(r.before, r.after)));
          tbody.append(tr);
        });
        log.body.replaceChildren(t);
        log.say("");
      }

      return {
        show() {
          loadUsers();
          loadRoleRequests();
          loadDismissed();
          loadLog();
        },
        refreshLog: loadLog,
      };
    },
  };
})(this);
