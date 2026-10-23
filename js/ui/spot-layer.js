// 斑點圖圖層：幾萬個車禍點畫在「同一張畫布」上（不是一個點一個 Leaflet 物件），手機才不會卡。
// 平移地圖只重畫，不重新產生點；點擊／滑鼠移過時再算最靠近的是哪一點（HotRoads.nearestPoint）。
// 畫布在自己的圖層（不接收點擊），點擊事件由地圖轉過來，所以不會擋住上面的路段圓圈與偵測點。
(function (root) {
  const UI = root.HotUI;

  UI.SpotLayer = L.Layer.extend({
    options: { pane: "spotPane" },

    initialize(options) {
      L.setOptions(this, options);
      this._items = []; // { lat, lon, r, fill, alpha, ring, ref }
      this._screen = []; // 上次畫在畫面上的點 { x, y, r, i }
    },

    setItems(items) {
      this._items = items;
      if (this._map) this._redraw();
      return this;
    },

    onAdd(map) {
      this._canvas = L.DomUtil.create("canvas", "leaflet-zoom-animated spot-canvas");
      this.getPane().appendChild(this._canvas);
      map.on("moveend resize viewreset", this._redraw, this);
      if (map.options.zoomAnimation && L.Browser.any3d) map.on("zoomanim", this._animateZoom, this);
      this._redraw();
    },

    onRemove(map) {
      map.off("moveend resize viewreset", this._redraw, this);
      map.off("zoomanim", this._animateZoom, this);
      L.DomUtil.remove(this._canvas);
      this._canvas = null;
      this._screen = [];
    },

    // 縮放動畫時讓畫布跟著放大縮小（跟 Leaflet 自己的圖層一樣），動畫結束再重畫
    _animateZoom(e) {
      if (!this._bounds) return;
      const scale = this._map.getZoomScale(e.zoom);
      const offset = this._map._latLngBoundsToNewLayerBounds(this._bounds, e.zoom, e.center).min;
      L.DomUtil.setTransform(this._canvas, offset, scale);
    },

    _redraw() {
      const map = this._map;
      if (!map || !this._canvas) return;
      const size = map.getSize();
      // 手機螢幕密度常是 3 倍，畫布會大到拖慢手機；最多用 2 倍，點看起來一樣清楚
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const c = this._canvas;
      c.width = Math.round(size.x * dpr);
      c.height = Math.round(size.y * dpr);
      c.style.width = size.x + "px";
      c.style.height = size.y + "px";
      this._bounds = map.getBounds();
      L.DomUtil.setPosition(c, map.containerPointToLayerPoint([0, 0]));
      const ctx = c.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.x, size.y);
      const screen = [];
      const items = this._items;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const p = map.latLngToContainerPoint([it.lat, it.lon]);
        if (p.x < -it.r || p.y < -it.r || p.x > size.x + it.r || p.y > size.y + it.r) continue;
        ctx.globalAlpha = it.alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, it.r, 0, Math.PI * 2);
        ctx.fillStyle = it.fill;
        ctx.fill();
        screen.push({ x: p.x, y: p.y, r: it.r, i });
      }
      ctx.globalAlpha = 1;
      this._screen = screen;
    },

    // 螢幕座標附近最近的點（後畫的在上面，所以從後面找起）；沒有回 null
    hit(containerPoint, tol) {
      const list = this._screen;
      const k = root.HotRoads.nearestPoint(list, containerPoint.x, containerPoint.y, tol);
      return k < 0 ? null : this._items[list[k].i];
    },
  });
})(this);
