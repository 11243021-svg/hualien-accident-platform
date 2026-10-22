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
        box.append(btn, UI.el("span", "auth__tip", "民眾不用登入；公路局、交通警察隊、管理員請登入"));
        return;
      }
      const who = session.role
        ? UI.el("span", "auth__who", `${session.name}（${Roles.ROLE_LABEL[session.role]}${session.role === "mayor" && session.town ? "・" + session.town : ""}）`)
        : UI.el("span", "auth__who is-warn", `${session.email}：這個帳號還沒有設定身分，請找系統管理員`);
      const out = UI.el("button", "auth__btn", "登出");
      out.type = "button";
      out.addEventListener("click", () => handlers.signOut());
      box.append(who, out);
    },

    // 登入卡片：signIn(email, password) 回傳 Promise，失敗時 reject 帶中文訊息
    bindDialog(dialog, signIn) {
      dialog.replaceChildren();
      const form = UI.el("form", "login");
      form.method = "dialog";
      const email = UI.el("input", "auth__input");
      email.type = "email";
      email.placeholder = "Email";
      email.autocomplete = "username";
      email.required = true;
      const pw = UI.el("input", "auth__input");
      pw.type = "password";
      pw.placeholder = "密碼";
      pw.autocomplete = "current-password";
      pw.required = true;
      const msg = UI.el("p", "auth__msg");
      msg.setAttribute("role", "status");
      const submit = UI.el("button", "auth__btn auth__btn--main", "登入");
      submit.type = "submit";
      const cancel = UI.el("button", "auth__btn", "取消");
      cancel.type = "button";
      const btns = UI.el("div", "login__btns");
      btns.append(cancel, submit);
      const field = (label, input) => {
        const l = UI.el("label", "fill__field");
        l.append(UI.el("span", "fill__label", label), input);
        return l;
      };
      form.append(
        UI.el("h2", "login__title", "登入"),
        UI.el("p", "login__note", "公路局、交通警察隊、系統管理員請用管理員給你的帳號登入。帳號由系統管理員在 Supabase 後台建立。"),
        field("Email", email), field("密碼", pw), msg, btns,
      );
      dialog.append(form);

      const reset = () => {
        pw.value = ""; // 不把密碼留在畫面上
        msg.textContent = "";
        submit.disabled = false;
      };
      cancel.addEventListener("click", () => dialog.close());
      dialog.addEventListener("close", reset);
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        if (!email.value.trim() || !pw.value) {
          msg.textContent = "請填 Email 和密碼";
          return;
        }
        submit.disabled = true;
        msg.textContent = "登入中…";
        signIn(email.value.trim(), pw.value)
          .then(() => dialog.close())
          .catch((err) => {
            msg.textContent = "登入失敗：" + err.message;
            submit.disabled = false;
          });
      });
      return {
        open() {
          reset();
          dialog.showModal();
          email.focus();
        },
      };
    },
  };
})(this);
