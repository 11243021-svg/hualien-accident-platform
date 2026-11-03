// AI 偵測畫面：同一頁走完 ①選監視器 ②畫圍籬 ③開始偵測 ④觀察 ⑤紀錄 ⑥本次紀錄 ⑦歷史紀錄。
// 真正的 AI 在偵測主機上的本機服務跑（雙擊「啟動偵測服務.bat」），這裡只是遙控器。
(function (root) {
  const UI = root.HotUI;
  const D = () => root.HotDetect;
  const time = (ts) => (ts ? ts.slice(0, 19).replace("T", " ") : "—");

  function step(no, title, note) {
    const box = UI.el("section", "dstep");
    const head = UI.el("div", "dstep__head");
    head.append(UI.el("span", "dstep__no", String(no)), UI.el("h2", "dstep__title", title));
    box.append(head);
    if (note) box.append(UI.el("p", "dstep__note", note));
    const body = UI.el("div", "dstep__body");
    box.append(body);
    return { box, body };
  }
  function button(text, cls, onClick) {
    const b = UI.el("button", cls || "auth__btn", text);
    b.type = "button";
    b.addEventListener("click", onClick);
    return b;
  }

  // opts：{ cameras() → 公路局監視器清單, history(cam) → 這支監視器的偵測事件（新到舊）,
  //         kindLabel(kind), onShowMap(), onRecorded() }
  UI.detectConsole = {
    create(rootEl, opts) {
      const st = { service: false, models: "", camera: null, points: [], running: false, status: null, shown: false };
      let statusTimer = 0;
      let sessionTimer = 0;
      let lastSessionTop = "";

      // ===== 服務狀態列 =====
      const banner = UI.el("div", "dbanner");
      const bannerText = UI.el("p", "dbanner__text");
      const recheck = button("重新檢查", "auth__btn", () => refreshStatus());
      banner.append(bannerText, recheck);

      const intro = UI.el("p", "dintro", "照著 1～7 步做：選一支公路局監視器 → 在畫面上圍出要監看的範圍 → 開始偵測。AI 在偵測主機上執行，車輛或落石在圍籬內停超過 15 秒就會自動紀錄到資料庫、地圖上也會出現。");

      // ===== ① 選監視器 =====
      const s1 = step(1, "選監視器", "可以打路名或編號搜尋；也可以在地圖上點監視器，按「用這台偵測」。");
      const search = UI.el("input", "auth__input dpick__search");
      search.type = "search";
      search.placeholder = "搜尋，例如 中正路、台9線、193K";
      const pick = UI.el("select", "fill__input dpick__select");
      pick.size = 6;
      const chosen = UI.el("p", "dpick__chosen", "還沒選監視器");
      const busy = UI.el("div", "dbusy");
      busy.hidden = true;
      const busyText = UI.el("p", "dbusy__text");
      const busyStop = button("停止目前的偵測", "pop__danger dstop", () => stop());
      busy.append(busyText, busyStop);
      s1.body.append(search, pick, chosen, busy);
      function fillPick() {
        const q = search.value.trim();
        const road = (c) => root.HotCameras.roadText(c);
        const list = opts.cameras().filter((c) => !q || (c.name + c.id + road(c)).includes(q));
        pick.replaceChildren();
        list.slice(0, 300).forEach((c) => {
          const o = UI.el("option", null, road(c) ? `${c.name}｜${road(c)}` : c.name);
          o.value = c.id;
          pick.append(o);
        });
        if (st.camera) pick.value = st.camera.id;
      }
      search.addEventListener("input", fillPick);
      pick.addEventListener("change", () => {
        const cam = opts.cameras().find((c) => c.id === pick.value);
        if (cam) selectCamera(cam);
      });

      // ===== ② 畫圍籬 =====
      const s2 = step(2, "畫圍籬", "在畫面上點一下就加一個點，至少 3 個點，圍出要監看的車道或路口（會自動接回第一個點）。");
      const stage = UI.el("div", "dfence");
      const snap = UI.el("img", "dfence__img");
      snap.alt = "監視器畫面（畫圍籬用）";
      const canvas = UI.el("canvas", "dfence__canvas");
      const stageMsg = UI.el("p", "dfence__msg", "先在第 1 步選監視器");
      stage.append(snap, canvas, stageMsg);
      const fenceBtns = UI.el("div", "dbtns");
      const undo = button("上一步", "auth__btn", () => { st.points.pop(); drawFence(); renderButtons(); });
      const clear = button("全部清除", "auth__btn", () => { st.points = []; drawFence(); renderButtons(); });
      const reload = button("重新抓畫面", "auth__btn", () => loadSnapshot());
      const fenceInfo = UI.el("span", "dbtns__info");
      fenceBtns.append(undo, clear, reload, fenceInfo);
      s2.body.append(stage, fenceBtns);
      snap.addEventListener("load", () => {
        stageMsg.hidden = true;
        drawFence();
      });
      snap.addEventListener("error", () => {
        if (!snap.getAttribute("src")) return;
        stageMsg.hidden = false;
        stageMsg.textContent = st.service ? "這支監視器目前連不上，換一支試試，或按「重新抓畫面」" : "偵測服務沒開，抓不到畫面";
      });
      canvas.addEventListener("click", (e) => {
        if ((st.running && sameAsRunning()) || !snap.naturalWidth) return;
        const r = canvas.getBoundingClientRect();
        st.points.push(D().normPoint(e.clientX - r.left, e.clientY - r.top, r.width, r.height));
        drawFence();
        renderButtons();
      });
      function drawFence() {
        const w = snap.clientWidth;
        const h = snap.clientHeight;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        canvas.style.width = w + "px";
        canvas.style.height = h + "px";
        const ctx = canvas.getContext("2d");
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        if (!st.points.length) return;
        ctx.strokeStyle = "#2ee66b";
        ctx.fillStyle = "rgba(46, 230, 107, 0.18)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        st.points.forEach(([x, y], i) => (i ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h)));
        if (st.points.length >= 3) {
          ctx.closePath();
          ctx.fill();
        }
        ctx.stroke();
        ctx.fillStyle = "#ffffff";
        st.points.forEach(([x, y]) => {
          ctx.beginPath();
          ctx.arc(x * w, y * h, 5, 0, Math.PI * 2);
          ctx.fill();
        });
      }
      window.addEventListener("resize", () => st.shown && drawFence());

      // ===== ③ 開始偵測 =====
      const s3 = step(3, "開始偵測", "按下去後 AI 會一直監看這支監視器，直到按「停止偵測」。");
      const stayBox = UI.el("div", "dstay");
      stayBox.append(UI.el("span", "dstay__label", "停留幾秒算異常："));
      const stayInput = UI.el("input", "auth__input dstay__input");
      stayInput.type = "number";
      stayInput.min = "3";
      stayInput.max = "600";
      stayInput.step = "1";
      stayInput.value = "15";
      stayInput.setAttribute("aria-label", "停留幾秒算異常");
      const stayPresets = [["展示 5 秒", 5], ["測試 15 秒", 15], ["正式 30 秒", 30], ["長紅燈 60 秒", 60]].map(([t, v]) => {
        const b = button(t, "dstay__preset", () => { stayInput.value = String(v); renderButtons(); });
        b.dataset.value = String(v);
        return b;
      });
      stayBox.append(stayInput, UI.el("span", null, "秒"), ...stayPresets);
      const stayNote = UI.el("p", "dstep__note", "車輛或物體在圍籬內停超過這個秒數就紀錄。每個路口紅燈秒數不同：圍籬有包到停止線前面時，秒數要比紅燈長，不然等紅燈的車都會被記到；展示時間不夠可以設短，但圍籬只圍路肩或路段中間。");
      stayInput.addEventListener("input", () => renderButtons());
      const testWrap = UI.el("label", "chk");
      const testChk = UI.el("input");
      testChk.type = "checkbox";
      testChk.checked = true;
      testWrap.append(testChk, document.createTextNode(" 這次是測試（紀錄存成「測試資料」，不算正式資料，地圖預設不顯示、不發 LINE）"));
      const lineWrap = UI.el("label", "chk");
      const lineChk = UI.el("input");
      lineChk.type = "checkbox";
      lineWrap.append(lineChk, document.createTextNode(" 偵測到異常時同時發 LINE 通報給團隊（測試時不會發）"));
      testChk.addEventListener("change", () => renderButtons());
      const startBtn = button("▶ 開始偵測", "auth__btn auth__btn--main dstart", () => start());
      const stopBtn = button("■ 停止偵測", "pop__danger dstop", () => stop());
      const startWhy = UI.el("p", "dstep__why");
      const s3btns = UI.el("div", "dbtns");
      s3btns.append(startBtn, stopBtn);
      s3.body.append(stayBox, stayNote, testWrap, lineWrap, s3btns, startWhy);

      // ===== ④ 觀察 ⑤ 紀錄 =====
      const s4 = step("4・5", "觀察與自動紀錄", "畫面上的框框是 AI 認出來的車輛或物體；圍籬顏色代表目前狀況。停超過 15 秒會自動紀錄（寫進資料庫、存截圖），不用另外按。");
      const live = UI.el("img", "dlive");
      live.alt = "AI 偵測即時畫面";
      live.hidden = true;
      const liveEmpty = UI.el("p", "dlive__empty", "開始偵測後，這裡會出現 AI 即時畫面");
      const legend = UI.el("div", "dlegend");
      [["empty", "#00ff00"], ["occupied", "#006400"], ["alert", "#ff0000"]].forEach(([k, c]) => {
        const item = UI.el("span", "dlegend__item");
        const sw = UI.el("i", "dlegend__sw");
        sw.style.background = c;
        item.append(sw, document.createTextNode(D().FENCE_TEXT[k].label));
        legend.append(item);
      });
      const liveState = UI.el("p", "dlive__state");
      const liveCam = UI.el("p", "dlive__cam");
      s4.body.append(liveEmpty, liveCam, live, liveState, legend);

      // ===== ⑥ 本次偵測紀錄 =====
      const s6 = step(6, "本次偵測紀錄", "這次開啟偵測服務以來自動紀錄的事件（每 2 秒更新），已經寫進資料庫，地圖上也看得到。");
      const sessionList = UI.el("div", "dsession");
      s6.body.append(sessionList);

      // ===== ⑦ 歷史紀錄 =====
      const s7 = step(7, "歷史紀錄／事件", "這支監視器過去所有的偵測事件（資料庫）。");
      const histBody = UI.el("div");
      const toMap = button("到地圖看全部偵測事件", "auth__btn", () => opts.onShowMap());
      s7.body.append(histBody, toMap);

      rootEl.replaceChildren(banner, intro, s1.box, s2.box, s3.box, s4.box, s6.box, s7.box);

      // ===== 狀態 =====
      async function refreshStatus() {
        let s;
        try {
          s = await D().status();
          st.service = true;
        } catch {
          st.service = false;
          s = null;
        }
        st.status = s;
        if (s && s.running && s.stay) stayInput.value = String(s.stay);
        if (s && s.running) testChk.checked = !!s.test;
        st.models = s ? s.models : "";
        const wasRunning = st.running;
        st.running = !!(s && s.running);
        // 偵測主機已經在偵測（例如重新整理網頁）而且還沒選監視器：直接帶入正在偵測的那台。
        // 已經自己選了別台就不蓋掉，改在第 1 步提示「主機正在偵測另一台」
        if (st.running && s.camera && !st.camera) {
          const cam = opts.cameras().find((c) => c.id === s.camera.id);
          if (cam) selectCamera(cam, { keepPoints: true });
        }
        if (st.running !== wasRunning) toggleLive();
        renderBanner();
        renderButtons();
        renderLiveState();
      }
      function renderBanner() {
        const s = st.status;
        banner.className = "dbanner";
        if (!st.service) {
          banner.classList.add("is-warn");
          bannerText.textContent = "偵測服務沒有開：請在偵測主機（有顯示卡的那台電腦）雙擊「交通事故通報平台」資料夾裡的「啟動偵測服務.bat」，再按「重新檢查」。如果瀏覽器跳出「要允許存取本機網路裝置嗎？」請按允許。";
        } else if (s.models === "loading") {
          banner.classList.add("is-info");
          bannerText.textContent = "偵測服務已開啟，AI 模型載入中（大約 10～30 秒）…";
        } else if (s.models === "error") {
          banner.classList.add("is-warn");
          bannerText.textContent = s.error || "AI 模型載入失敗";
        } else {
          banner.classList.add("is-ok");
          bannerText.textContent = `偵測服務已就緒（${s.gpu || "AI 模型已載入"}）` + (s.running ? `｜正在偵測：${s.camera.name}` : "");
        }
        recheck.hidden = st.service && s.models === "ready";
      }
      // 偵測主機正在偵測的監視器（沒在偵測是 null）；跟自己選的是不是同一台
      const runningCam = () => (st.running && st.status && st.status.camera) || null;
      const sameAsRunning = () => !!(runningCam() && st.camera && runningCam().id === st.camera.id);
      function renderButtons() {
        const check = D().canStart({ service: st.service, models: st.models, camera: st.camera, points: st.points });
        const other = st.running && !sameAsRunning();
        startBtn.disabled = st.running || !check.ok;
        startBtn.hidden = st.running;
        stopBtn.hidden = !st.running;
        startWhy.textContent = !st.running ? check.reason
          : other ? `偵測主機正在偵測「${runningCam().name}」，要改偵測你選的這台，請先按「停止偵測」再按開始`
            : "偵測中…要改圍籬，請先停止偵測";
        busy.hidden = !other;
        if (other) busyText.textContent = `偵測主機目前正在偵測「${runningCam().name}」。你選的這台可以先畫好圍籬，停止目前的偵測後再按「開始偵測」。`;
        const locked = st.running && sameAsRunning(); // 正在偵測的那台不能改圍籬
        undo.disabled = locked || !st.points.length;
        clear.disabled = locked || !st.points.length;
        reload.disabled = !st.camera;
        lineChk.disabled = st.running || testChk.checked;
        testChk.disabled = st.running;
        stayInput.disabled = st.running;
        stayPresets.forEach((b) => {
          b.disabled = st.running;
          b.classList.toggle("is-on", b.dataset.value === String(Number(stayInput.value)));
        });
        const stay = Number(stayInput.value);
        if (!st.running && check.ok && !(stay >= 3 && stay <= 600)) {
          startBtn.disabled = true;
          startWhy.textContent = "停留秒數要填 3～600 秒";
        }
        fenceInfo.textContent = st.points.length ? `已點 ${st.points.length} 個點${st.points.length < 3 ? "（至少要 3 個）" : ""}` : "";
      }
      function renderLiveState() {
        const s = st.status;
        liveCam.textContent = st.running && s && s.camera ? `即時畫面：${s.camera.name}｜停 ${s.stay} 秒算異常${s.test ? "｜測試中（存成測試資料）" : ""}` : "";
        if (!st.running || !s) {
          liveState.textContent = "";
          return;
        }
        const f = D().FENCE_TEXT[s.fence] || D().FENCE_TEXT.idle;
        liveState.className = "dlive__state is-" + s.fence;
        liveState.textContent = `${f.label}${s.inFence ? `（圍籬內 ${s.inFence} 個）` : ""}${f.note ? "｜" + f.note : ""}${s.message && s.message !== "偵測中" ? "｜" + s.message : ""}`;
      }
      function toggleLive() {
        if (st.running) {
          live.src = D().streamUrl();
          live.hidden = false;
          liveEmpty.hidden = true;
        } else {
          live.removeAttribute("src"); // 拿掉網址瀏覽器就會停止接收畫面
          live.hidden = true;
          liveEmpty.hidden = false;
        }
      }

      // ===== 動作 =====
      function selectCamera(cam, o) {
        st.camera = cam;
        if (!(o && o.keepPoints)) st.points = [];
        const road = root.HotCameras.roadText(cam);
        chosen.textContent = `已選：${cam.name}${road ? `｜${road}` : ""}`;
        fillPick();
        loadSnapshot();
        renderHistory();
        renderButtons();
      }
      function loadSnapshot() {
        if (!st.camera) return;
        stageMsg.hidden = false;
        stageMsg.textContent = "正在抓監視器畫面…";
        if (!st.service) {
          stageMsg.textContent = "偵測服務沒開，抓不到畫面（看最上面的黃色提示）";
          return;
        }
        snap.src = D().snapshotUrl(st.camera.liveUrl);
      }
      async function start() {
        startBtn.disabled = true;
        startWhy.textContent = "正在開始…";
        try {
          const cam = st.camera;
          await D().start({
            camera: { id: cam.id, name: cam.name, url: cam.liveUrl, lat: cam.lat, lon: cam.lon },
            fence: st.points,
            line: lineChk.checked && !testChk.checked,
            stay: Number(stayInput.value),
            test: testChk.checked,
          });
          await refreshStatus();
          live.scrollIntoView({ behavior: "smooth", block: "center" });
        } catch (err) {
          startWhy.textContent = "開始失敗：" + err.message;
          startBtn.disabled = false;
        }
      }
      async function stop() {
        stopBtn.disabled = true;
        try {
          await D().stop();
        } catch (err) {
          startWhy.textContent = "停止失敗：" + err.message;
        }
        stopBtn.disabled = false;
        await refreshStatus();
      }

      // ===== 紀錄 =====
      async function refreshSession() {
        if (!st.service) {
          sessionList.replaceChildren(UI.el("p", "dempty", "偵測服務沒開，看不到本次紀錄"));
          return;
        }
        let items;
        try {
          items = await D().session();
        } catch {
          return;
        }
        const top = items.length ? items[0].id : "";
        if (top && lastSessionTop && top !== lastSessionTop && opts.onRecorded) opts.onRecorded(items[0]);
        renderHistory(); // 新紀錄寫進資料庫後，網站收到就會出現在第 7 步
        lastSessionTop = top;
        if (!items.length) {
          sessionList.replaceChildren(UI.el("p", "dempty", "這次還沒有紀錄。偵測到車輛或物體在圍籬內停超過 15 秒，就會出現在這裡。"));
          return;
        }
        sessionList.replaceChildren(...items.slice(0, 30).map((it) => {
          const card = UI.el("article", "dsession__item");
          const img = UI.el("img", "dsession__shot");
          img.alt = `${it.kindLabel} 截圖`;
          img.loading = "lazy";
          img.src = D().shotUrl(it.shot);
          const text = UI.el("div", "dsession__text");
          text.append(
            UI.el("strong", null, `${it.test ? "［測試］" : ""}${it.kindLabel}・信心 ${Math.round(it.confidence * 100)}%`),
            UI.el("span", null, time(it.ts)),
            UI.el("span", null, it.camera),
          );
          card.append(img, text);
          return card;
        }));
      }
      function renderHistory() {
        if (!st.camera) {
          histBody.replaceChildren(UI.el("p", "dempty", "選了監視器之後，這裡會列出它過去的偵測事件"));
          return;
        }
        const list = opts.history(st.camera);
        if (!list.length) {
          histBody.replaceChildren(UI.el("p", "dempty", `「${st.camera.name}」還沒有偵測紀錄`));
          return;
        }
        const t = UI.el("table", "atable");
        const head = UI.el("tr");
        ["時間", "種類", "來源", "傷亡／肇因"].forEach((h) => head.append(UI.el("th", null, h)));
        const thead = UI.el("thead");
        thead.append(head);
        const tbody = UI.el("tbody");
        list.slice(0, 20).forEach((ev) => {
          const tr = UI.el("tr");
          const filled = ev.deaths != null || ev.injuries != null || ev.cause;
          [time(ev.ts), opts.kindLabel(ev.kind), { real: "真實", sim: "模擬", test: "測試" }[ev.source] || ev.source,
            filled ? `死 ${ev.deaths ?? "—"}／傷 ${ev.injuries ?? "—"}${ev.cause ? "／" + ev.cause : ""}` : "等交通警察隊補填"]
            .forEach((v) => tr.append(UI.el("td", null, v)));
          tbody.append(tr);
        });
        t.append(thead, tbody);
        histBody.replaceChildren(UI.el("p", "dstep__note", `共 ${list.length} 筆，顯示最新 ${Math.min(20, list.length)} 筆`), t);
      }

      return {
        show() {
          st.shown = true;
          fillPick();
          renderHistory();
          refreshStatus().then(() => {
            if (st.camera && !snap.getAttribute("src")) loadSnapshot();
          });
          refreshSession();
          clearInterval(statusTimer);
          clearInterval(sessionTimer);
          statusTimer = setInterval(() => document.visibilityState === "visible" && refreshStatus(), 2000);
          sessionTimer = setInterval(() => document.visibilityState === "visible" && refreshSession(), 2000);
        },
        hide() {
          if (!st.shown) return;
          st.shown = false;
          clearInterval(statusTimer);
          clearInterval(sessionTimer);
          live.removeAttribute("src"); // 切走就不收即時畫面（偵測主機照樣繼續偵測）
          live.hidden = true;
          liveEmpty.hidden = false;
          st.running = false; // 下次 show 時依服務狀態重新開啟畫面
        },
        selected: () => st.camera,
        pickCamera(cam) {
          selectCamera(cam); // 偵測中也可以先選、先畫圍籬，第 1 步會提示要先停止目前的偵測
        },
        refreshHistory: renderHistory,
      };
    },
  };
})(this);
