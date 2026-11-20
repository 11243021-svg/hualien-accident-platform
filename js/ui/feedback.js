// 回報問題：右下角按鈕，不用登入；自動附上目前畫面與裝置，聯絡方式選填。送到資料庫給系統管理員看。
(function (root) {
  const UI = root.HotUI;
  const MAX = 500;

  // 裝置：手機／平板／電腦＋畫面大小＋瀏覽器（不記 IP、不記帳號）
  function deviceText() {
    const ua = navigator.userAgent || "";
    const w = window.innerWidth, h = window.innerHeight;
    const kind = /iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua)) ? "平板" : /Mobi|iPhone|Android/i.test(ua) ? "手機" : "電腦";
    const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /Firefox\//.test(ua) ? "Firefox" : "其他瀏覽器";
    return `${kind} ${w}×${h} ${browser}`;
  }

  UI.feedback = {
    // dialog：<dialog>；openBtn：右下角按鈕；pageText()：目前畫面的白話描述（例如「一般民眾・查詢 中山路」）
    create(dialog, openBtn, pageText) {
      const box = UI.el("div", "login feedback");
      dialog.append(box);
      function render() {
        box.replaceChildren(UI.el("h2", "login__title", "回報問題"), UI.el("p", "settings__hint", "看不懂、按了沒反應、資料怪怪的，都可以跟我們說。不用登入。"));
        const form = UI.el("form", "feedback__form");
        const label = UI.el("label", "feedback__label", "遇到什麼問題？");
        const text = UI.el("textarea", "feedback__text");
        text.maxLength = MAX;
        text.rows = 5;
        text.required = true;
        text.placeholder = "例如：我查「中山路」，結果找不到";
        const count = UI.el("span", "feedback__count", `0 / ${MAX}`);
        text.addEventListener("input", () => (count.textContent = `${text.value.length} / ${MAX}`));
        label.append(text);
        const contactLabel = UI.el("label", "feedback__label", "聯絡方式（選填，想收到回覆再填）");
        const contact = UI.el("input", "feedback__input");
        contact.type = "text";
        contact.maxLength = 100;
        contact.placeholder = "Email 或其他聯絡方式";
        contactLabel.append(contact);
        const page = pageText();
        const device = deviceText();
        const auto = UI.el("p", "settings__hint", `會一起送出：目前畫面（${page}）、裝置（${device}）。請不要寫身分證字號、密碼等個人資料。`);
        const msg = UI.el("p", "pop__note");
        msg.setAttribute("role", "status");
        const btns = UI.el("div", "login__btns");
        const cancel = UI.el("button", "auth__btn", "取消");
        cancel.type = "button";
        cancel.addEventListener("click", () => dialog.close());
        const send = UI.el("button", "auth__btn auth__btn--main", "送出");
        send.type = "submit";
        btns.append(cancel, send);
        form.append(label, count, contactLabel, auto, msg, btns);
        form.addEventListener("submit", async (e) => {
          e.preventDefault();
          const message = text.value.trim();
          if (!message) {
            msg.textContent = "請先寫下遇到的問題";
            return text.focus();
          }
          send.disabled = true;
          msg.textContent = "送出中…";
          try {
            await root.HotData.feedback.submit({ message, page, device, contact: contact.value.trim() });
            box.replaceChildren(UI.el("h2", "login__title", "謝謝你！"), UI.el("p", "settings__hint", "已經送給系統管理員，我們會盡快處理。"));
            const ok = UI.el("button", "auth__btn auth__btn--main", "關閉");
            ok.type = "button";
            ok.addEventListener("click", () => dialog.close());
            const row = UI.el("div", "login__btns");
            row.append(ok);
            box.append(row);
          } catch (err) {
            msg.textContent = "送出失敗：" + err.message;
            send.disabled = false;
          }
        });
        box.append(form);
        setTimeout(() => text.focus(), 0);
      }
      dialog.addEventListener("click", (e) => e.target === dialog && dialog.close()); // 點視窗外面也能關
      openBtn.setAttribute("aria-label", "回報問題");
      openBtn.title = "回報問題";
      openBtn.addEventListener("click", () => {
        render();
        if (!dialog.open) dialog.showModal();
      });
    },
  };
})(this);
