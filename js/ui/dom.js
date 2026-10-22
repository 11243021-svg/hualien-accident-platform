// 畫面元件共用：建 DOM 節點（一律 textContent）、顏色。
(function (root) {
  const HotUI = (root.HotUI = root.HotUI || {});
  HotUI.el = function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  };
  // 路段分級用紫色系，紅／橘只留給死亡／受傷
  HotUI.TIER_COLOR = { high: "#7b2cbf", mid: "#a35bd6", low: "#cfa6f0" };
  // AI 偵測種類；機車用綠色，才不會跟「受傷事故」的黃色搞混
  HotUI.KIND_COLOR = { car: "#5b9bd5", moto: "#2ee66b", rock: "#e08a45", debris: "#9aa5b1" };
  // 車禍：死亡＝紅、受傷＝黃（警戒色）；白天淺、晚上深，深色也調得夠亮，在深色地圖上看得到
  HotUI.SEV_COLOR = { death: "#ff1a1a", injury: "#ffe100" };
  HotUI.SEV_SHADE = {
    death: { day: "#ff7070", night: "#d10000" },
    injury: { day: "#fff27a", night: "#f2b200" },
  };
  HotUI.DAY_HOURS = [6, 18]; // 06:00～17:59 算白天
  HotUI.isDay = (hour) => hour >= HotUI.DAY_HOURS[0] && hour < HotUI.DAY_HOURS[1];
  HotUI.sevColor = (severity, hour) => {
    const shade = HotUI.SEV_SHADE[severity] || HotUI.SEV_SHADE.injury;
    return HotUI.isDay(hour) ? shade.day : shade.night;
  };
  HotUI.TEXT_MUT = "#a2b0c0"; // 圖例「真實／模擬」示意用的中性色
})(this);
