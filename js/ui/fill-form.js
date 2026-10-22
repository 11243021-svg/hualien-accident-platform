// 員警補填表單（偵測事件小卡片裡）：死亡／受傷人數、肇因（常見清單＋其他自行輸入）、事故型態。
(function (root) {
  const UI = root.HotUI;

  function field(label, control) {
    const wrap = UI.el("label", "fill__field");
    wrap.append(UI.el("span", "fill__label", label), control);
    return wrap;
  }
  function numberInput(value, max) {
    const input = UI.el("input", "fill__input");
    input.type = "number";
    input.min = "0";
    input.max = String(max);
    input.step = "1";
    input.inputMode = "numeric";
    input.required = true;
    if (value !== null && value !== undefined) input.value = String(value);
    return input;
  }
  function select(options, value) {
    const sel = UI.el("select", "fill__input");
    options.forEach(([v, text]) => {
      const opt = UI.el("option", null, text);
      opt.value = v;
      sel.append(opt);
    });
    sel.value = value;
    return sel;
  }

  // causes：常見肇因清單（字串陣列）；onSave(values) 回傳 Promise，失敗時 reject 帶錯誤訊息
  UI.fillForm = function fillForm(ev, causes, onSave) {
    const D = root.HotDetections;
    const form = UI.el("form", "fill");
    form.noValidate = true; // 由 validateFill 統一提示中文訊息
    form.append(UI.el("div", "fill__title", ev.filledBy ? "修改補填內容" : "交通警察隊補填"));

    const deaths = numberInput(ev.deaths, 100);
    const injuries = numberInput(ev.injuries, 500);
    const known = ev.cause && causes.includes(ev.cause);
    const cause = select(
      [["", "請選擇肇因…"], ...causes.map((c) => [c, c]), [D.OTHER_CAUSE, "其他（自行輸入）"]],
      known ? ev.cause : ev.cause ? D.OTHER_CAUSE : "",
    );
    const other = UI.el("input", "fill__input");
    other.type = "text";
    other.maxLength = 60;
    other.placeholder = "輸入肇因";
    other.value = known ? "" : ev.cause || "";
    const otherField = field("自行輸入肇因", other);
    const syncOther = () => (otherField.hidden = cause.value !== D.OTHER_CAUSE);
    cause.addEventListener("change", syncOther);
    syncOther();
    const type = select([["", "不填"], ...D.FILL_TYPES.map((t) => [t, t])], ev.accidentType || "");

    const nums = UI.el("div", "fill__row");
    nums.append(field("死亡人數", deaths), field("受傷人數", injuries));
    const msg = UI.el("p", "fill__msg");
    msg.setAttribute("role", "status");
    const save = UI.el("button", "fill__save", "儲存");
    save.type = "submit";
    form.append(nums, field("肇因", cause), otherField, field("事故型態（選填）", type), save, msg);

    // 在小卡片裡打字時，不要讓地圖把 + − 方向鍵當成縮放／移動
    L.DomEvent.on(form, "keydown keypress keyup", L.DomEvent.stopPropagation);

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const r = D.validateFill({
        deaths: deaths.value, injuries: injuries.value, cause: cause.value, causeOther: other.value, accidentType: type.value,
      });
      msg.className = "fill__msg";
      if (!r.ok) {
        msg.classList.add("is-error");
        msg.textContent = r.error;
        return;
      }
      save.disabled = true;
      msg.textContent = "儲存中…";
      onSave(r.values)
        .catch((err) => {
          msg.classList.add("is-error");
          msg.textContent = "儲存失敗：" + err.message;
        })
        .finally(() => (save.disabled = false));
    });
    return form;
  };
})(this);
