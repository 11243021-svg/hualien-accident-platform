// AI 轄區分析視窗：顯示 AI 寫的分析（標題、條列、段落一律 textContent），可複製全文。
(function (root) {
  const UI = root.HotUI;

  function button(text, cls, onClick) {
    const b = UI.el("button", cls, text);
    b.type = "button";
    b.addEventListener("click", onClick);
    return b;
  }

  UI.aiDialog = {
    create(dialog) {
      const box = UI.el("div", "login aidlg");
      dialog.append(box);
      const close = () => dialog.close();
      const open = () => {
        if (!dialog.open) dialog.showModal();
      };
      function frame(scopeText) {
        box.replaceChildren();
        const head = UI.el("div", "wcard__head");
        const x = button("×", "wcard__close", close);
        x.setAttribute("aria-label", "關閉");
        head.append(UI.el("h2", "login__title", "AI 轄區分析"), x);
        box.append(head);
        if (scopeText) box.append(UI.el("p", "login__note", scopeText));
      }
      function closeRow(extra) {
        const btns = UI.el("div", "login__btns");
        if (extra) btns.append(extra);
        btns.append(button("關閉", "auth__btn auth__btn--main", close));
        box.append(btns);
      }
      return {
        loading(scopeText) {
          frame(scopeText);
          box.append(UI.el("p", "aidlg__wait", "AI 正在閱讀統計資料、撰寫分析，大約 10～20 秒…"));
          open();
        },
        show(scopeText, text, model) {
          frame(scopeText);
          const body = UI.el("div", "aidlg__body");
          let list = null;
          root.HotAnalysis.parseAnswer(text).forEach((b) => {
            if (b.type === "li") {
              if (!list) body.append((list = UI.el("ul", "aidlg__list")));
              list.append(UI.el("li", null, b.text));
              return;
            }
            list = null;
            body.append(UI.el(b.type === "h" ? "h3" : "p", b.type === "h" ? "aidlg__h" : "aidlg__p", b.text));
          });
          box.append(body);
          box.append(UI.el("p", "route__note", `由 Google Gemini（${model || "AI"}）根據上面條件的統計數字撰寫，僅供參考，實際改善請再現場勘查。`));
          const copy = button("複製全文", "auth__btn", () => {
            if (!navigator.clipboard) return;
            navigator.clipboard.writeText(`${scopeText}\n\n${text}`).then(
              () => (copy.textContent = "已複製"),
              () => (copy.textContent = "複製失敗"),
            );
          });
          closeRow(copy);
          open();
        },
        error(message) {
          frame("");
          box.append(UI.el("p", "is-error-text", message));
          closeRow();
          open();
        },
      };
    },
  };
})(this);
