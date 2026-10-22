// 即時寫入卡片：偵測程式寫進一筆新事件時，地圖左下角列出這筆資料寫進了哪些欄位
// （AI 自動寫入 vs 等交通警察隊補填），讓人一看就懂資料流程。四種身分都看得到。
(function (root) {
  const UI = root.HotUI;

  function rows(list, pending) {
    const ul = UI.el("ul", "wcard__rows");
    list.forEach((f) => {
      const li = UI.el("li", "wcard__row" + (f.ok ? " is-ok" : pending ? " is-wait" : " is-miss"));
      const mark = UI.el("span", "wcard__mark", f.ok ? "✓" : pending ? "…" : "✗");
      mark.setAttribute("aria-hidden", "true");
      const value = f.ok ? f.value : pending ? "等交通警察隊補填" : "這次沒有寫到";
      li.append(mark, UI.el("span", "wcard__label", f.label), UI.el("span", "wcard__value", value));
      ul.append(li);
    });
    return ul;
  }

  UI.writeCard = {
    // box：卡片容器（地圖裡的 div）；onLocate(ev)：按「在地圖上看」
    create(box, onLocate) {
      let extra = 0;
      const close = () => {
        box.hidden = true;
        extra = 0;
      };
      return {
        show(ev, fields) {
          extra = box.hidden ? 0 : extra + 1;
          box.replaceChildren();
          const head = UI.el("div", "wcard__head");
          head.append(UI.el("b", "wcard__title", "AI 偵測到新事件，已寫進資料庫"));
          const x = UI.el("button", "wcard__close", "×");
          x.type = "button";
          x.setAttribute("aria-label", "關閉");
          x.addEventListener("click", close);
          head.append(x);
          box.append(head);
          if (extra) box.append(UI.el("p", "wcard__more", `（剛剛還有 ${extra} 筆新事件，清單在右側或地圖上）`));
          box.append(UI.el("div", "wcard__sec wcard__sec--auto", "偵測當下 AI 自動寫入"), rows(fields.auto, false));
          box.append(UI.el("div", "wcard__sec wcard__sec--fill", "事後由交通警察隊補填"), rows(fields.pending, true));
          const go = UI.el("button", "auth__btn auth__btn--main wcard__go", "在地圖上看這筆");
          go.type = "button";
          go.addEventListener("click", () => onLocate(ev));
          box.append(go);
          box.hidden = false;
        },
        close,
      };
    },
  };
})(this);
