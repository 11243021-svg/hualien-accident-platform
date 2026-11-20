// 顯示設定：模式（簡易／完整）、字的大小、畫面風格。記在瀏覽器，只能選這裡列出的選項。
// 設定寫在 <html data-mode data-font data-theme>，樣式由 style.css 依這三個屬性切換。
(function (root) {
  const UI = root.HotUI;
  const KEY = "hotspot.display";
  const OPTIONS = {
    mode: { label: "模式", items: [["simple", "簡易", "地圖＋四個大按鈕，只留最常用的"], ["full", "完整", "所有篩選、圖表、排行都看得到"]] },
    font: { label: "字的大小", items: [["normal", "標準"], ["large", "大"], ["xlarge", "特大"]] },
    theme: { label: "畫面風格", items: [["dark", "深色"], ["light", "淺色"], ["contrast", "高對比"]] },
  };
  const DEFAULT = { mode: "full", font: "normal", theme: "dark" };
  const valid = (k, v) => OPTIONS[k].items.some(([x]) => x === v);

  function load() {
    try {
      const raw = JSON.parse(window.localStorage.getItem(KEY) || "null");
      if (!raw) return null;
      const s = Object.assign({}, DEFAULT);
      Object.keys(DEFAULT).forEach((k) => valid(k, raw[k]) && (s[k] = raw[k]));
      return s;
    } catch (e) {
      return null;
    }
  }
  function save(s) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(s));
    } catch (e) {
      /* 記不住就只用這一次 */
    }
  }
  function apply(s) {
    const html = document.documentElement;
    Object.keys(DEFAULT).forEach((k) => (html.dataset[k] = s[k]));
  }

  UI.settings = {
    OPTIONS,
    // 網頁一打開就先套上次的設定（避免先閃一下預設樣式）
    current() {
      return load() || Object.assign({}, DEFAULT);
    },
    // dialog：<dialog>；openBtn：右上角「顯示設定」；onChange(settings)：設定變了要重畫的部分
    create(dialog, openBtn, onChange) {
      let s = UI.settings.current();
      const firstTime = !load();
      apply(s);
      const box = UI.el("div", "login settings");
      dialog.append(box);
      const set = (k, v) => {
        if (s[k] === v) return;
        s = Object.assign({}, s, { [k]: v });
        save(s);
        apply(s);
        render();
        onChange(s, k);
      };
      function render() {
        box.replaceChildren(UI.el("h2", "login__title", "顯示設定"));
        Object.entries(OPTIONS).forEach(([k, o]) => {
          const g = UI.el("div", "settings__group");
          g.append(UI.el("h3", "settings__label", o.label));
          const seg = UI.el("div", "seg settings__seg");
          seg.setAttribute("role", "group");
          seg.setAttribute("aria-label", o.label);
          o.items.forEach(([v, text]) => {
            const b = UI.el("button", s[k] === v ? "is-on" : "", text);
            b.type = "button";
            b.setAttribute("aria-pressed", String(s[k] === v));
            b.addEventListener("click", () => set(k, v));
            seg.append(b);
          });
          g.append(seg);
          const hint = o.items.find(([v]) => v === s[k])[2];
          if (hint) g.append(UI.el("p", "settings__hint", hint));
          if (k === "theme") g.append(UI.el("p", "settings__hint", "地圖固定用深色底，紅色、黃色的事故點才看得清楚。"));
          box.append(g);
        });
        const btns = UI.el("div", "login__btns");
        const done = UI.el("button", "auth__btn auth__btn--main", "完成");
        done.type = "button";
        done.addEventListener("click", () => dialog.close());
        btns.append(done);
        box.append(btns);
      }
      // 第一次來：先問想簡單看看還是完整功能（之後可以在「顯示設定」改）
      function ask(onDone) {
        box.replaceChildren(UI.el("h2", "login__title", "歡迎！你想怎麼使用？"), UI.el("p", "settings__hint", "之後隨時可以按畫面上方的「顯示設定」換。"));
        const pick = (mode, title, sub) => {
          const b = UI.el("button", "settings__big");
          b.type = "button";
          b.append(UI.el("b", null, title), UI.el("span", null, sub));
          b.addEventListener("click", () => {
            dialog.close();
            if (mode === "simple" && s.font === "normal") set("font", "large"); // 簡單看看：預設大字
            set("mode", mode);
            save(s); // 選的剛好是預設值時 set 不會存，這裡補存，下次就不會再問
            onDone(mode);
          });
          return b;
        };
        box.append(pick("simple", "簡單看看", "大按鈕、大字，直接查路況"), pick("full", "完整功能", "所有篩選、圖表、排行"));
        if (!dialog.open) dialog.showModal();
      }
      dialog.addEventListener("click", (e) => e.target === dialog && dialog.close()); // 點視窗外面也能關
      openBtn.addEventListener("click", () => {
        render();
        if (!dialog.open) dialog.showModal();
      });
      return {
        get: () => s,
        set,
        // 第一次來才問；回傳 true＝有問（呼叫的人等 onDone 再決定要不要開使用說明）
        maybeAsk(onDone) {
          if (!firstTime) return false;
          ask(onDone);
          return true;
        },
      };
    },
  };
})(this);
