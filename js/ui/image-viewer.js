// 截圖放大：點一下截圖就用整個畫面看大圖，點任何地方或按 Esc 關掉（交通警察隊確認 AI 判斷時看得清楚）。
(function (root) {
  const UI = root.HotUI;
  let dialog, big;

  function ensure() {
    if (dialog) return;
    dialog = UI.el("dialog", "img-viewer");
    dialog.setAttribute("aria-label", "放大的截圖");
    big = UI.el("img", "img-viewer__img");
    const hint = UI.el("p", "img-viewer__hint", "點任何地方或按 Esc 關閉");
    dialog.append(big, hint);
    dialog.addEventListener("click", () => dialog.close());
    document.body.append(dialog);
  }

  // img：要可以放大的 <img>；滑鼠移上去顯示放大鏡游標
  UI.zoomable = function zoomable(img) {
    img.classList.add("is-zoomable");
    img.title = "點一下放大";
    img.addEventListener("click", (e) => {
      e.stopPropagation();
      ensure();
      big.src = img.currentSrc || img.src;
      big.alt = img.alt;
      if (!dialog.open) dialog.showModal();
    });
    return img;
  };
})(this);
