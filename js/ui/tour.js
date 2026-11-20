// 第一次打開的小導覽：4 步說明這個網站能做什麼。看過就記在瀏覽器，右上角「使用說明」可以再叫出來。
(function (root) {
  const UI = root.HotUI;
  const KEY = "hotspot.tourSeen";

  const STEPS = [
    {
      title: "這個網站可以幫你做什麼",
      lines: [
        "看看花蓮哪些路最常出車禍，出門前查一下要走的路安不安全。",
        "用公路局的監視器看現在的路況；AI 會幫忙盯著，發現落石、路上停車等異常就通報。",
        "資料來自政府公開的車禍紀錄（110～114 年），一般民眾不用登入就能用。",
      ],
    },
    {
      title: "看地圖：每個點是一件車禍",
      lines: [
        "紅色菱形（有白框）＝有人死亡的車禍，黃色圓點＝有人受傷的車禍；顏色淺是白天、深是晚上。",
        "點一下地圖上的點，就能看到那件車禍的時間、地點和原因。",
        "方形的攝影機圖示是公路局監視器，點了可以看現在的即時路況。",
      ],
    },
    {
      title: "查路名、查路線",
      lines: [
        "上方「看哪裡」輸入路名（例如：建國路、中山路100號），看看這條路最近安不安全。",
        "右側「路線安全」輸入起點和終點（例如：花蓮火車站 → 慈濟醫院），會標出沿路最常出事的地方。",
        "不想打字也可以點「常用地點」，或用「用我現在的位置」。",
      ],
    },
    {
      title: "調整條件、登入",
      lines: [
        "「看什麼時候」可以改成最近 3 年、5 年，或只看晚上；「看哪種」可以只看死亡車禍。",
        "不小心篩到沒有資料，按「全部重設」就回到一開始的樣子。",
        "公路局、交通警察隊、系統管理員請按右上角「登入」；一般民眾不用登入。",
      ],
    },
  ];

  // 簡易模式：只講四個大按鈕
  const SIMPLE_STEPS = [
    {
      title: "這個網站可以幫你做什麼",
      lines: [
        "看看花蓮哪些路最常出車禍，出門前查一下要走的路安不安全。",
        "資料來自政府公開的車禍紀錄（110～114 年），不用登入就能用。",
      ],
    },
    {
      title: "四個大按鈕",
      lines: [
        "查一條路：打路名（例如 中山路），看這條路出過幾次車禍。",
        "查路線：打起點、終點，看沿路哪裡最常出事。",
        "看最危險的路：直接列出最該小心的 10 條路。",
        "看監視器：點地圖上的攝影機圖示，看現在的路況。",
        "地圖上的點：紅色菱形＝有人死亡、黃色圓點＝有人受傷。字太小可以按上方「顯示設定」調大。",
      ],
    },
  ];
  const steps = () => (document.documentElement.dataset.mode === "simple" ? SIMPLE_STEPS : STEPS);

  const seen = () => {
    try {
      return window.localStorage.getItem(KEY) === "1";
    } catch (e) {
      return false;
    }
  };
  const markSeen = () => {
    try {
      window.localStorage.setItem(KEY, "1");
    } catch (e) {
      /* 記不住就算了，下次再顯示一次 */
    }
  };

  UI.tour = {
    // dialog：<dialog> 元素；openBtn：右上角「使用說明」按鈕
    create(dialog, openBtn) {
      let i = 0;
      const box = UI.el("div", "login tour");
      dialog.append(box);
      const close = () => {
        markSeen();
        dialog.close();
      };
      function btn(text, cls, onClick) {
        const b = UI.el("button", cls, text);
        b.type = "button";
        b.addEventListener("click", onClick);
        return b;
      }
      function render() {
        const list = steps();
        const s = list[i];
        box.replaceChildren();
        box.append(UI.el("p", "tour__step", `使用說明 ${i + 1} / ${list.length}`), UI.el("h2", "login__title", s.title));
        const ul = UI.el("ul", "tour__list");
        s.lines.forEach((t) => ul.append(UI.el("li", null, t)));
        box.append(ul);
        const btns = UI.el("div", "login__btns");
        btns.append(btn("略過", "auth__btn tour__skip", close));
        if (i > 0) btns.append(btn("上一步", "auth__btn", () => { i--; render(); }));
        btns.append(i < list.length - 1
          ? btn("下一步", "auth__btn auth__btn--main", () => { i++; render(); })
          : btn("開始使用", "auth__btn auth__btn--main", close));
        box.append(btns);
      }
      const open = () => {
        i = 0;
        render();
        if (!dialog.open) dialog.showModal();
      };
      dialog.addEventListener("cancel", markSeen); // 按 Esc 關掉也算看過
      openBtn.addEventListener("click", open);
      return {
        // 第一次來才自動打開
        maybeOpen() {
          if (!seen()) open();
        },
      };
    },
  };
})(this);
