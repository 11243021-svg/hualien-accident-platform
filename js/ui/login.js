// 登入：右上角的登入按鈕／登入者資訊，以及跳出來的登入卡片（<dialog>）。
(function (root) {
  const UI = root.HotUI;

  UI.login = {
    // session：null（沒登入）或 { email, name, role, town }（role 為 null＝還沒設定身分）
    // handlers：{ openLogin(), signOut() → Promise }
    render(box, session, handlers) {
      const Roles = root.HotRoles;
      box.replaceChildren();
      if (!session) {
        const btn = UI.el("button", "auth__btn auth__btn--main", "登入");
        btn.type = "button";
        btn.addEventListener("click", () => handlers.openLogin());
        box.append(btn, UI.el("span", "auth__tip", "使用 Google 登入並選擇身分；管理身分需核可"));
        return;
      }
      const pendingText = session.requestedRole === "admin"
        ? "系統管理員身分只能由現任管理員指派"
        : session.requestedRole === "mayor" || session.requestedRole === "police"
          ? `已送出「${Roles.VIEW_LABEL[session.requestedRole]}」申請，等待系統管理員核可`
          : "一般民眾";
      // Google 新帳號一開始都是「一般民眾」；如果是申請公路局／交通警察隊進來的，要讓他知道還在等核可
      const waiting = (!session.role || session.role === "citizen") && session.requestedRole && session.requestedRole !== "citizen";
      const who = session.role && !waiting
        ? UI.el("span", "auth__who", `${session.name}（${Roles.ROLE_LABEL[session.role]}${session.role === "mayor" && session.town ? "・" + session.town : ""}）`)
        : UI.el("span", "auth__who is-warn", `${session.name || session.email}：${pendingText}`);
      const out = UI.el("button", "auth__btn", "登出");
      out.type = "button";
      out.addEventListener("click", () => handlers.signOut());
      box.append(who, out);
    },

    // 登入卡片：先選欲使用的身分，再以 Google OAuth 登入（主要方式）；
    // 下面另外留「帳號密碼登入」備用：既有的管理員／測試帳號、Google 臨時出狀況、比賽現場都還能登入。
    bindDialog(dialog, signInWithGoogle, signInWithPassword) {
      dialog.replaceChildren();
      const form = UI.el("form", "login");
      form.method = "dialog";
      const msg = UI.el("p", "auth__msg");
      msg.setAttribute("role", "status");
      let selectedRole = "citizen";
      const roles = [
        ["citizen", "一般民眾", "查詢路段事故風險與即時路況"],
        ["mayor", "公路局", "檢視轄區道路安全與改善依據"],
        ["police", "交通警察隊", "查看 AI 偵測並補填事故資訊"],
        ["admin", "系統管理員", "管理帳號、權限與誤報紀錄"],
      ];
      const choices = UI.el("div", "login__roles");
      const cards = [];
      const selectRole = (role) => {
        selectedRole = role;
        cards.forEach((card) => {
          const on = card.dataset.role === role;
          card.classList.toggle("is-selected", on);
          card.setAttribute("aria-pressed", String(on));
        });
      };
      roles.forEach(([id, label, note]) => {
        const card = UI.el("button", "login__role");
        card.type = "button";
        card.dataset.role = id;
        card.setAttribute("aria-pressed", "false");
        card.append(UI.el("strong", null, label), UI.el("span", null, note));
        card.addEventListener("click", () => selectRole(id));
        cards.push(card);
        choices.append(card);
      });
      selectRole(selectedRole);
      const submit = UI.el("button", "auth__btn auth__btn--google", "使用 Google 帳號繼續");
      submit.type = "submit";
      const cancel = UI.el("button", "auth__btn", "取消");
      cancel.type = "button";
      const btns = UI.el("div", "login__btns");
      btns.append(cancel, submit);
      form.append(
        UI.el("h2", "login__title", "登入平台"),
        UI.el("p", "login__note", "先選擇您要使用的身分，再以 Google 帳號登入。民眾可直接使用；其他身分需經系統管理員核可後，才會開通對應功能。"),
        UI.el("p", "login__label", "您要以哪種身分使用？"), choices, msg, btns,
      );
      dialog.append(form);

      // 備用：帳號密碼登入（收在摺疊區塊裡，平常不佔位置）
      const alt = UI.el("details", "login__alt");
      alt.append(UI.el("summary", null, "用帳號密碼登入（管理員、測試帳號備用）"));
      const pwForm = UI.el("div", "login__altform"); // 不用 <form>：外面已經是 Google 登入的表單，表單不能包表單
      const email = UI.el("input", "auth__input");
      email.type = "email";
      email.placeholder = "Email";
      email.autocomplete = "username";
      const pw = UI.el("input", "auth__input");
      pw.type = "password";
      pw.placeholder = "密碼";
      pw.autocomplete = "current-password";
      const pwMsg = UI.el("p", "auth__msg");
      pwMsg.setAttribute("role", "status");
      const pwBtn = UI.el("button", "auth__btn auth__btn--main", "登入");
      pwBtn.type = "button";
      pwForm.append(email, pw, pwBtn, pwMsg);
      alt.append(pwForm);
      form.append(alt);
      const submitPassword = () => {
        if (!email.value.trim() || !pw.value) {
          pwMsg.textContent = "請填 Email 和密碼";
          return;
        }
        pwBtn.disabled = true;
        pwMsg.textContent = "登入中…";
        signInWithPassword(email.value.trim(), pw.value)
          .then(() => dialog.close())
          .catch((err) => {
            pwMsg.textContent = "登入失敗：" + err.message;
            pwBtn.disabled = false;
          });
      };
      pwBtn.addEventListener("click", submitPassword);
      [email, pw].forEach((el) => el.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault(); // 不要觸發外面的 Google 登入
          submitPassword();
        }
      }));

      const reset = () => {
        msg.textContent = "";
        submit.disabled = false;
        pw.value = ""; // 不把密碼留在畫面上
        pwMsg.textContent = "";
        pwBtn.disabled = false;
      };
      cancel.addEventListener("click", () => dialog.close());
      dialog.addEventListener("close", reset);
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        if (!/^https?:$/.test(window.location.protocol)) {
          msg.textContent = "Google 登入要用網站網址開啟才能用；在自己電腦測試請改用下方「帳號密碼登入」。";
          alt.open = true;
          return;
        }
        submit.disabled = true;
        msg.textContent = "即將前往 Google 登入…";
        signInWithGoogle(selectedRole)
          .catch((err) => {
            msg.textContent = "登入失敗：" + err.message;
            submit.disabled = false;
          });
      });
      return {
        open() {
          reset();
          dialog.showModal();
          cards[0].focus();
        },
      };
    },
  };
})(this);
