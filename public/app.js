/**
 * Razer Web Hub v2.1 — Complete Onboard Profile Slots, Per-Key Actuation,
 * Hypershift Remapping, and Viper V3 Pro Sensor Calibration
 */
(function () {
  "use strict";

  const P25 = window.RazerProtocol25;

  const TKL_MAIN_ROWS = [
    {
      fnRow: true,
      keys: [
        { label: "ESC", u: 1 },
        { spacer: 1 },
        { label: "F1", u: 1 },
        { label: "F2", u: 1 },
        { label: "F3", u: 1 },
        { label: "F4", u: 1 },
        { spacer: 0.5 },
        { label: "F5", u: 1 },
        { label: "F6", u: 1 },
        { label: "F7", u: 1 },
        { label: "F8", u: 1 },
        { spacer: 0.5 },
        { label: "F9", u: 1 },
        { label: "F10", u: 1 },
        { label: "F11", u: 1 },
        { label: "F12", u: 1 },
      ],
    },
    {
      keys: [
        { label: "`", u: 1 },
        { label: "1", u: 1 },
        { label: "2", u: 1 },
        { label: "3", u: 1 },
        { label: "4", u: 1 },
        { label: "5", u: 1 },
        { label: "6", u: 1 },
        { label: "7", u: 1 },
        { label: "8", u: 1 },
        { label: "9", u: 1 },
        { label: "0", u: 1 },
        { label: "-", u: 1 },
        { label: "=", u: 1 },
        { label: "BKSP", u: 2 },
      ],
    },
    {
      keys: [
        { label: "TAB", u: 1.5 },
        { label: "Q", u: 1 },
        { label: "W", u: 1 },
        { label: "E", u: 1 },
        { label: "R", u: 1 },
        { label: "T", u: 1 },
        { label: "Y", u: 1 },
        { label: "U", u: 1 },
        { label: "I", u: 1 },
        { label: "O", u: 1 },
        { label: "P", u: 1 },
        { label: "[", u: 1 },
        { label: "]", u: 1 },
        { label: "\\", u: 1.5 },
      ],
    },
    {
      keys: [
        { label: "CAPS", u: 1.75 },
        { label: "A", u: 1 },
        { label: "S", u: 1 },
        { label: "D", u: 1 },
        { label: "F", u: 1 },
        { label: "G", u: 1 },
        { label: "H", u: 1 },
        { label: "J", u: 1 },
        { label: "K", u: 1 },
        { label: "L", u: 1 },
        { label: ";", u: 1 },
        { label: "'", u: 1 },
        { label: "ENTER", u: 2.25 },
      ],
    },
    {
      keys: [
        { label: "SHIFT", u: 2.25 },
        { label: "Z", u: 1 },
        { label: "X", u: 1 },
        { label: "C", u: 1 },
        { label: "V", u: 1 },
        { label: "B", u: 1 },
        { label: "N", u: 1 },
        { label: "M", u: 1 },
        { label: ",", u: 1 },
        { label: ".", u: 1 },
        { label: "/", u: 1 },
        { label: "RSHIFT", u: 2.75 },
      ],
    },
    {
      keys: [
        { label: "CTRL", u: 1.25 },
        { label: "WIN", u: 1.25 },
        { label: "ALT", u: 1.25 },
        { label: "SPACE", u: 6.25 },
        { label: "RALT", u: 1.25 },
        { label: "FN", u: 1.25 },
        { label: "MENU", u: 1.25 },
        { label: "RCTRL", u: 1.25 },
      ],
    },
  ];

  const TKL_NAV_ROWS = [
    { fnRow: true, keys: [{ label: "PRT", u: 1 }, { label: "SCR", u: 1 }, { label: "PAU", u: 1 }] },
    { keys: [{ label: "INS", u: 1 }, { label: "HM", u: 1 }, { label: "PGU", u: 1 }] },
    { keys: [{ label: "DEL", u: 1 }, { label: "END", u: 1 }, { label: "PGD", u: 1 }] },
    { keys: [{ spacer: 3 }] },
    { keys: [{ spacer: 1 }, { label: "▲", u: 1 }, { spacer: 1 }] },
    { keys: [{ label: "◀", u: 1 }, { label: "▼", u: 1 }, { label: "▶", u: 1 }] },
  ];

  let devices = [];
  let selectedDevice = {
    vendorId: 5426,
    productId: 679,
    hexPid: "0x02A7",
    productName: "Razer Huntsman V3 Pro Tenkeyless",
    category: "keyboard-analog",
    interface: 3,
    maxSlots: 6,
  };

  let serverState = {
    profilesByPid: {},
  };

  let selectedKeys = new Set();
  let lastClickedControl = "A";
  let currentLayer = "standard"; // "standard" or "hypershift"
  let webHidDevice = null;
  let toastTimer = null;

  function isMouseSelected() {
    return (
      selectedDevice.category === "mouse" ||
      selectedDevice.productId === 193 ||
      selectedDevice.productId === 192
    );
  }

  function getActiveSlotObj() {
    const pid = selectedDevice.productId;
    const devProf = serverState.profilesByPid?.[pid];
    if (!devProf) {
      return {
        slot: 1,
        name: "Standard Default",
        ledColor: "#ffffff",
        actuationMm: 1.2,
        rtEnabled: true,
        rtDownMm: 0.3,
        rtUpMm: 0.3,
        continuousRt: true,
        perKeyOverrides: {},
        snapTapEnabled: true,
        snapKeyA: "A",
        snapKeyB: "D",
        gamingMode: { enabled: false, disableWin: true, disableAltTab: false, disableAltF4: false },
        pollingHz: 1000,
        lighting: { effect: "static", color1: "#00e676", brightness: 100 },
        keyBindings: { standard: {}, hypershift: {} },
        dpiStages: [
          { stage: 1, enabled: true, x: 400, y: 400, color: "#ff5252" },
          { stage: 2, enabled: true, x: 800, y: 800, color: "#40c4ff" },
          { stage: 3, enabled: true, x: 1600, y: 1600, color: "#00e676" },
          { stage: 4, enabled: true, x: 3200, y: 3200, color: "#ffd740" },
          { stage: 5, enabled: true, x: 6400, y: 6400, color: "#e040fb" },
        ],
        activeStageIndex: 3,
        independentXY: false,
        sensorAngle: 0,
        dynamicSensitivity: 0,
        smartTracking: { asymmetric: false, symmetricLevel: 1, liftOffLevel: 14, landingLevel: 10 },
        powerSaving: { idleMinutes: 5, lowPowerPercent: 15 },
        buttonBindings: { standard: {}, hypershift: {} },
      };
    }
    return devProf.slots[devProf.activeSlot || 1] || Object.values(devProf.slots)[0];
  }

  function showSyncedToast(msg = "✓ Synced to Hardware") {
    const el = document.getElementById("saveToast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 1800);
  }

  function hexToRgb(hex) {
    const clean = (hex || "#00e676").replace("#", "");
    const num = parseInt(clean, 16);
    return [(num >> 16) & 0xff, (num >> 8) & 0xff, num & 0xff];
  }

  /**
   * Keeps the 3 actuation preset buttons (0.4mm / 1.2mm / 2.0mm) in sync
   * with the current actuation distance & Rapid Trigger state.
   */
  function updateActuationPresetHighlight(actMm, rtEnabled) {
    const eps = 0.04;
    let matched = null;
    if (Math.abs(actMm - 0.4) < eps && rtEnabled) {
      matched = "esports";
    } else if (Math.abs(actMm - 1.2) < eps && rtEnabled) {
      matched = "balanced";
    } else if (Math.abs(actMm - 2.0) < eps && !rtEnabled) {
      matched = "typing";
    } else if (Math.abs(actMm - 0.4) < eps) {
      matched = "esports";
    } else if (Math.abs(actMm - 1.2) < eps) {
      matched = "balanced";
    } else if (Math.abs(actMm - 2.0) < eps) {
      matched = "typing";
    }

    document.querySelectorAll("[data-act-preset]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.actPreset === matched);
    });
  }

  function syncToolbarSelectionChips(activeMode = null) {
    document.querySelectorAll("[data-sel]").forEach((b) => {
      if (activeMode) {
        b.classList.toggle("active", b.dataset.sel === activeMode);
      } else {
        b.classList.toggle("active", selectedKeys.size === 0 && b.dataset.sel === "all");
      }
    });
  }

  function renderDeviceSwitcher() {
    const container = document.getElementById("deviceSwitcher");
    container.innerHTML = "";
    devices.forEach((dev) => {
      const btn = document.createElement("button");
      btn.className = `dev-pill ${dev.productId === selectedDevice.productId ? "active" : ""}`;
      btn.innerHTML = `<span class="dot"></span><span>${dev.productName.replace("Razer ", "")}</span>`;
      btn.addEventListener("click", () => {
        selectedDevice = dev;
        selectedKeys.clear();
        syncToolbarSelectionChips("all");
        lastClickedControl = isMouseSelected() ? "M1" : "A";
        renderDeviceSwitcher();
        renderSlotBar();
        syncControlsFromSlot();
        updateVisualStage();
      });
      container.appendChild(btn);
    });
  }

  function renderSlotBar() {
    const bar = document.getElementById("slotBar");
    const pid = selectedDevice.productId;
    const devProf = serverState.profilesByPid?.[pid];
    const maxSlots = isMouseSelected() ? 5 : 6;
    const activeSlot = devProf?.activeSlot || 1;

    bar.innerHTML = `<span class="slot-bar-label">Onboard Slot</span>`;
    for (let i = 1; i <= maxSlots; i++) {
      const slotInfo = P25.PROFILE_SLOT_COLORS[i - 1];
      const slotData = devProf?.slots?.[i];
      const btn = document.createElement("button");
      btn.className = `slot-pill ${i === activeSlot ? "active" : ""}`;
      btn.title = `Slot ${i}: ${slotData?.name || slotInfo.name}`;
      btn.innerHTML = `<span class="slot-dot" style="background:${slotInfo.color}; box-shadow:0 0 6px ${slotInfo.color};"></span><span>S${i}</span>`;
      btn.addEventListener("click", () => switchProfileSlot(i));
      bar.appendChild(btn);
    }
  }

  async function switchProfileSlot(slotId) {
    const res = await fetch("/api/profile-slot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "switch",
        productId: selectedDevice.productId,
        slotId,
      }),
    });
    const data = await res.json();
    if (data.ok && data.state) {
      serverState = data.state;
      // Clear per-key selection when switching onboard slots so global slot settings are shown clearly
      selectedKeys.clear();
      syncToolbarSelectionChips("all");
      renderSlotBar();
      syncControlsFromSlot();
      updateVisualStage();
      const slot = getActiveSlotObj();
      showSyncedToast(`✓ Slot ${slotId}: ${slot.name} (${(slot.actuationMm ?? 1.2).toFixed(1)}mm)`);
    }
  }

  async function saveCurrentSlotToHardware() {
    const slot = getActiveSlotObj();
    slot.name = document.getElementById("inpSlotName").value || slot.name;
    const res = await fetch("/api/profile-slot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save",
        productId: selectedDevice.productId,
        slotId: slot.slot,
        slotData: slot,
      }),
    });
    const data = await res.json();
    if (data.ok && data.state) {
      serverState = data.state;
      renderSlotBar();
      updateVisualStage();
      showSyncedToast(`✓ Saved "${slot.name}" to Onboard Slot ${slot.slot}`);
    }
  }

  function buildKeyboardStage() {
    const renderBlock = (containerId, rows) => {
      const container = document.getElementById(containerId);
      container.innerHTML = "";
      rows.forEach((row) => {
        const rowEl = document.createElement("div");
        rowEl.className = `kbd-row ${row.fnRow ? "fn-row" : ""}`;
        row.keys.forEach((k) => {
          if (k.spacer) {
            const sp = document.createElement("div");
            sp.className = "key-spacer";
            sp.style.setProperty("--u", k.spacer);
            rowEl.appendChild(sp);
            return;
          }
          const cap = document.createElement("div");
          cap.className = "keycap";
          cap.dataset.key = k.label;
          cap.style.setProperty("--u", k.u || 1);
          cap.innerHTML = `<span>${k.label}</span><span class="k-sub">1.2</span>`;
          cap.addEventListener("click", () => {
            lastClickedControl = k.label;
            if (selectedKeys.has(k.label)) {
              selectedKeys.delete(k.label);
            } else {
              selectedKeys.add(k.label);
            }
            syncToolbarSelectionChips(null);
            syncControlsFromSlot();
            updateVisualStage();
          });
          rowEl.appendChild(cap);
        });
        container.appendChild(rowEl);
      });
    };
    renderBlock("kbdMainRows", TKL_MAIN_ROWS);
    renderBlock("kbdNavRows", TKL_NAV_ROWS);
  }

  /**
   * Synchronizes all bottom dock controls, preset buttons, and swatches
   * from the active slot (or currently selected key override).
   */
  function syncControlsFromSlot() {
    const slot = getActiveSlotObj();
    document.getElementById("badgeSlotId").textContent = `Slot ${slot.slot}`;
    document.getElementById("inpSlotName").value = slot.name || `Slot ${slot.slot}`;

    if (!isMouseSelected()) {
      // If 1 or more keys are selected and the first selected key has a per-key override, show its values
      const firstSelectedKey = selectedKeys.size > 0 ? Array.from(selectedKeys)[0] : null;
      const keyOverride = firstSelectedKey ? slot.perKeyOverrides?.[firstSelectedKey] : null;

      const act = Number(keyOverride?.act ?? slot.actuationMm ?? 1.2);
      const rt = keyOverride?.rt !== undefined ? !!keyOverride.rt : !!slot.rtEnabled;
      const down = Number(keyOverride?.down ?? slot.rtDownMm ?? 0.3);
      const up = Number(keyOverride?.up ?? slot.rtUpMm ?? 0.3);

      document.getElementById("rngActuation").value = act;
      document.getElementById("valActuation").textContent = `${act.toFixed(1)} mm`;
      document.getElementById("badgeActuation").textContent = `${act.toFixed(1)} mm`;

      document.getElementById("chkRapidTrigger").checked = rt;
      document.getElementById("rngRtDown").value = down;
      document.getElementById("valRtDown").textContent = `${down.toFixed(2)} mm`;
      document.getElementById("rngRtUp").value = up;
      document.getElementById("valRtUp").textContent = `${up.toFixed(2)} mm`;
      document.getElementById("chkContinuousRt").checked = slot.continuousRt !== false;

      // Update the 3 Actuation Preset buttons (0.4mm / 1.2mm / 2.0mm)
      updateActuationPresetHighlight(act, rt);

      // Show "Reset to Global" button if any selected key has a custom override
      const hasOverrideSelected =
        selectedKeys.size > 0 && Array.from(selectedKeys).some((k) => !!slot.perKeyOverrides?.[k]);
      document.getElementById("btnClearKeyOverride").classList.toggle("hidden", !hasOverrideSelected);

      document.getElementById("chkSnapTap").checked = !!slot.snapTapEnabled;
      document.getElementById("inpSnapA").value = slot.snapKeyA || "A";
      document.getElementById("inpSnapB").value = slot.snapKeyB || "D";

      document.getElementById("chkGamingMode").checked = !!slot.gamingMode?.enabled;
      document.getElementById("chkDisWin").checked = slot.gamingMode?.disableWin !== false;
      document.getElementById("chkDisAltTab").checked = !!slot.gamingMode?.disableAltTab;
      document.getElementById("chkDisAltF4").checked = !!slot.gamingMode?.disableAltF4;

      const light = slot.lighting || { effect: "static", color1: "#00e676", brightness: 100 };
      const c1 = (light.color1 || "#00e676").toLowerCase();
      document.getElementById("colorPicker").value = c1;
      document.getElementById("rngBrightness").value = light.brightness ?? 100;
      document.getElementById("valBrightness").textContent = `${light.brightness ?? 100}%`;
      document.getElementById("badgeBright").textContent = `${light.brightness ?? 100}%`;

      // Sync Lighting Effect preset buttons & badge
      const eff = light.effect || "static";
      document.querySelectorAll("#effectGrid .preset-btn").forEach((b) => {
        const match = b.dataset.effect === eff;
        b.classList.toggle("active", match);
        if (match) document.getElementById("badgeEffect").textContent = b.textContent;
      });

      // Sync Color Swatch active state
      document.querySelectorAll("#swatchRow .swatch").forEach((sw) => {
        sw.classList.toggle("active", (sw.dataset.color || "").toLowerCase() === c1);
      });
    } else {
      const stages = slot.dpiStages || [];
      stages.forEach((s, i) => {
        const lbl = document.getElementById(`lblS${i + 1}`);
        if (lbl) lbl.textContent = s.x;
      });
      const activeIdx = (slot.activeStageIndex || 3) - 1;
      const activeStage = stages[activeIdx] || { x: 1600, y: 1600 };
      document.getElementById("rngDpiX").value = activeStage.x;
      document.getElementById("valDpiX").textContent = activeStage.x;
      document.getElementById("rngDpiY").value = activeStage.y;
      document.getElementById("valDpiY").textContent = activeStage.y;
      document.getElementById("chkIndXY").checked = !!slot.independentXY;
      document.getElementById("blockDpiY").classList.toggle("hidden", !slot.independentXY);
      document.getElementById("badgeDpi").textContent = `Stage ${activeIdx + 1} • ${activeStage.x}`;

      document.querySelectorAll("#dpiStageGrid .preset-btn").forEach((b) => {
        b.classList.toggle("active", Number(b.dataset.stage) === activeIdx + 1);
      });

      document.querySelectorAll("#pollingGrid .preset-btn").forEach((b) => {
        b.classList.toggle("active", Number(b.dataset.hz) === (slot.pollingHz || 1000));
      });
      document.getElementById("badgePolling").textContent = `${slot.pollingHz || 1000} Hz`;

      document.getElementById("rngSensorAngle").value = slot.sensorAngle || 0;
      document.getElementById("valSensorAngle").textContent = `${slot.sensorAngle || 0}°`;
      document.getElementById("badgeAngle").textContent = `${slot.sensorAngle || 0}°`;
      document.getElementById("selDynCurve").value = String(slot.dynamicSensitivity || 0);

      const st = slot.smartTracking || { asymmetric: false, symmetricLevel: 1, liftOffLevel: 14, landingLevel: 10 };
      document.getElementById("chkAsymmetric").checked = !!st.asymmetric;
      document.getElementById("symLodGroup").classList.toggle("hidden", !!st.asymmetric);
      document.getElementById("asymLodGroup").classList.toggle("hidden", !st.asymmetric);
      document.querySelectorAll("#symLodGroup .preset-btn").forEach((b) => {
        b.classList.toggle("active", Number(b.dataset.lod) === (st.symmetricLevel || 1));
      });
      document.getElementById("rngLiftOff").value = st.liftOffLevel || 14;
      document.getElementById("valLiftOff").textContent = st.liftOffLevel || 14;
      document.getElementById("rngLanding").value = st.landingLevel || 10;
      document.getElementById("valLanding").textContent = st.landingLevel || 10;

      const ps = slot.powerSaving || { idleMinutes: 5, lowPowerPercent: 15 };
      document.getElementById("rngIdleMin").value = ps.idleMinutes || 5;
      document.getElementById("valIdleMin").textContent = `${ps.idleMinutes || 5} min`;
      document.getElementById("rngLowBatt").value = ps.lowPowerPercent || 15;
      document.getElementById("valLowBatt").textContent = `${ps.lowPowerPercent || 15}%`;
      document.getElementById("badgePower").textContent = `${ps.idleMinutes || 5}m / ${ps.lowPowerPercent || 15}%`;
    }
    updateRemapInspector();
  }

  function updateRemapInspector() {
    const slot = getActiveSlotObj();
    const layerLabel = currentLayer === "hypershift" ? "Hypershift" : "Standard";
    document.getElementById("badgeRemapTarget").textContent = `${lastClickedControl} (${layerLabel})`;

    const mapObj = isMouseSelected()
      ? slot.buttonBindings?.[currentLayer] || {}
      : slot.keyBindings?.[currentLayer] || {};
    const assigned = mapObj[lastClickedControl] || "Default";
    const sel = document.getElementById("selRemapAction");
    if (Array.from(sel.options).some((o) => o.value === assigned)) {
      sel.value = assigned;
    } else {
      sel.value = "Default";
    }
  }

  function updateVisualStage() {
    const mouseMode = isMouseSelected();
    const slot = getActiveSlotObj();

    document.getElementById("keyboardStage").classList.toggle("hidden", mouseMode);
    document.getElementById("kbdToolbar").classList.toggle("hidden", mouseMode);
    document.getElementById("mouseStage").classList.toggle("hidden", !mouseMode);

    // Filter contextual dock tabs
    const tabs = document.querySelectorAll(".dock-tab");
    let activeVisible = false;
    tabs.forEach((t) => {
      const target = t.dataset.for;
      const show =
        target === "all" ||
        (target === "keyboard" && !mouseMode) ||
        (target === "mouse" && mouseMode);
      t.classList.toggle("hidden", !show);
      if (show && t.classList.contains("active")) activeVisible = true;
    });
    if (!activeVisible) {
      const firstVisible = Array.from(tabs).find((t) => !t.classList.contains("hidden"));
      if (firstVisible) firstVisible.click();
    }

    if (!mouseMode) {
      const targetTxt =
        selectedKeys.size === 0
          ? `Actuation Point • Slot ${slot.slot} (All Keys)`
          : `Per-Key Actuation (${selectedKeys.size} Key${selectedKeys.size > 1 ? "s" : ""} Selected)`;
      document.getElementById("actTargetTitle").textContent = targetTxt;

      const act = Number(document.getElementById("rngActuation").value || slot.actuationMm || 1.2);
      const pctStem = Math.max(6, Math.min(100, (act / 4.0) * 100));
      document.getElementById("stemFill").style.height = `${pctStem}%`;

      const light = slot.lighting || { effect: "static", color1: "#00e676", brightness: 100 };
      const color = light.effect === "off" ? "#484f58" : light.color1 || "#00e676";
      const overrides = slot.perKeyOverrides || {};
      const keyMap = slot.keyBindings?.[currentLayer] || {};

      document.getElementById("keyboardStage").style.setProperty(
        "--kbd-glow",
        light.effect === "off" ? "transparent" : `${color}22`
      );

      document.querySelectorAll(".keycap").forEach((cap) => {
        const k = cap.dataset.key;
        const ov = overrides[k];
        const keyAct = ov ? ov.act : slot.actuationMm ?? 1.2;
        const sub = cap.querySelector(".k-sub");
        if (sub) sub.textContent = Number(keyAct).toFixed(1);

        cap.classList.toggle("selected", selectedKeys.has(k));
        cap.classList.toggle("custom-act", !!ov);
        cap.classList.toggle("remapped", !!keyMap[k] && keyMap[k] !== "Default");
        cap.style.setProperty("--key-color", color);

        const isSnap =
          slot.snapTapEnabled &&
          (k === (slot.snapKeyA || "A").toUpperCase() || k === (slot.snapKeyB || "D").toUpperCase());
        cap.classList.toggle("snaptap-key", isSnap);
      });
    } else {
      const stages = slot.dpiStages || [];
      const activeStage = stages[(slot.activeStageIndex || 3) - 1] || { x: 1600, y: 1600 };
      document.getElementById("stageDpiVal").textContent = slot.independentXY
        ? `${activeStage.x} × ${activeStage.y}`
        : `${activeStage.x} DPI`;
      document.getElementById("stagePollVal").textContent = `${slot.pollingHz || 1000} Hz`;
      const lodTxt = slot.smartTracking?.asymmetric
        ? `Asym ${slot.smartTracking.liftOffLevel}/${slot.smartTracking.landingLevel}`
        : ["Low", "Med", "High"][(slot.smartTracking?.symmetricLevel || 1) - 1];
      document.getElementById("stageAngleVal").textContent = `${slot.sensorAngle || 0}° • ${lodTxt}`;
      document.getElementById("stageMouseSlot").textContent = `Slot ${slot.slot} (${slot.name})`;
      document.getElementById("stageSleepVal").textContent = `${slot.powerSaving?.idleMinutes || 5} min`;
    }
  }

  async function sendPacket90(packet90, slotPatch = null, toastLabel = "✓ Synced to Hardware") {
    if (webHidDevice && webHidDevice.opened) {
      try {
        await webHidDevice.sendFeatureReport(0x00, new Uint8Array(packet90));
      } catch {
        // fallback to server
      }
    }

    const res = await fetch("/api/send-packet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: selectedDevice.productId,
        interfaceNum: selectedDevice.interface ?? 3,
        reportId: 0,
        packet90,
        slotPatch,
      }),
    });
    const data = await res.json();
    if (data.state) {
      serverState = data.state;
    }
    showSyncedToast(toastLabel);
    if (data.logItem) prependPacketLog(data.logItem);
    return data;
  }

  function prependPacketLog(item) {
    const list = document.getElementById("packetLogList");
    const pTx = item.parsedTx || {};
    const pRx = item.parsedRx || {};
    const div = document.createElement("div");
    div.className = "log-card";
    div.innerHTML = `
      <div style="display:flex; justify-content:space-between; color:#8b949e; margin-bottom:4px;">
        <span>PID ${item.productId} • Class 0x${(pTx.commandClass ?? 0).toString(16).toUpperCase().padStart(2, "0")} Cmd 0x${(pTx.commandId ?? 0).toString(16).toUpperCase().padStart(2, "0")} • CRC 0x${(pTx.crc ?? 0).toString(16).toUpperCase().padStart(2, "0")}</span>
        <span>${pRx.statusName || "OK"}</span>
      </div>
      <div class="tx">TX: ${item.txHex}</div>
      <div class="rx">RX: ${item.rxHex}</div>
    `;
    list.prepend(div);
  }

  async function refreshStatus() {
    try {
      const res = await fetch("/api/status");
      const data = await res.json();
      if (!data.ok) return;

      devices = data.devices || [];
      if (data.state) serverState = data.state;
      if (devices.length > 0 && !devices.some((d) => d.productId === selectedDevice.productId)) {
        selectedDevice = devices[0];
      }
      renderDeviceSwitcher();
      renderSlotBar();
      syncControlsFromSlot();
      updateVisualStage();

      const list = document.getElementById("packetLogList");
      list.innerHTML = "";
      (data.packetHistory || []).slice().reverse().forEach(prependPacketLog);
    } catch (err) {
      console.warn("Refresh status error:", err);
    }
  }

  async function commitActuationChange() {
    const slot = getActiveSlotObj();
    const act = Number(document.getElementById("rngActuation").value);
    const rt = document.getElementById("chkRapidTrigger").checked;
    const down = Number(document.getElementById("rngRtDown").value);
    const up = Number(document.getElementById("rngRtUp").value);
    const cont = document.getElementById("chkContinuousRt").checked;

    updateActuationPresetHighlight(act, rt);

    const overrides = { ...(slot.perKeyOverrides || {}) };
    if (selectedKeys.size > 0) {
      selectedKeys.forEach((k) => {
        overrides[k] = { act, rt, down, up };
      });
    } else {
      slot.actuationMm = act;
      slot.rtEnabled = rt;
      slot.rtDownMm = down;
      slot.rtUpMm = up;
      slot.continuousRt = cont;
    }

    const pkt90 = P25.Builders.setAnalogActuation({
      slotId: slot.slot,
      actuationMm: act,
      rtEnabled: rt,
      rtDownMm: down,
      rtUpMm: up,
      continuousRt: cont,
      keyCount: selectedKeys.size,
    });

    await sendPacket90(
      pkt90,
      {
        actuationMm: slot.actuationMm,
        rtEnabled: slot.rtEnabled,
        rtDownMm: slot.rtDownMm,
        rtUpMm: slot.rtUpMm,
        continuousRt: slot.continuousRt,
        perKeyOverrides: overrides,
      },
      selectedKeys.size > 0
        ? `✓ Updated ${selectedKeys.size} Key(s) to ${act.toFixed(1)}mm`
        : `✓ Slot ${slot.slot} Actuation ${act.toFixed(1)}mm Synced`
    );
    syncControlsFromSlot();
    updateVisualStage();
  }

  function wireEvents() {
    // Dock Navigation
    document.querySelectorAll(".dock-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".dock-tab").forEach((t) => t.classList.remove("active"));
        document.querySelectorAll(".panel").forEach((p) => p.classList.add("hidden"));
        tab.classList.add("active");
        document.getElementById(tab.dataset.panel).classList.remove("hidden");
      });
    });

    // Save to Slot & Slot Name Change
    document.getElementById("btnSaveSlot").addEventListener("click", saveCurrentSlotToHardware);
    document.getElementById("btnSaveSlotPanel").addEventListener("click", saveCurrentSlotToHardware);
    document.getElementById("inpSlotName").addEventListener("change", saveCurrentSlotToHardware);

    // Clear Per-Key Override button
    document.getElementById("btnClearKeyOverride").addEventListener("click", async () => {
      const slot = getActiveSlotObj();
      const overrides = { ...(slot.perKeyOverrides || {}) };
      selectedKeys.forEach((k) => delete overrides[k]);
      slot.perKeyOverrides = overrides;
      const pkt90 = P25.Builders.setAnalogActuation({
        slotId: slot.slot,
        actuationMm: slot.actuationMm ?? 1.2,
        rtEnabled: !!slot.rtEnabled,
        rtDownMm: slot.rtDownMm ?? 0.3,
        rtUpMm: slot.rtUpMm ?? 0.3,
        continuousRt: slot.continuousRt !== false,
      });
      await sendPacket90(pkt90, { perKeyOverrides: overrides }, "✓ Reset Selected Keys to Global Actuation");
      syncControlsFromSlot();
      updateVisualStage();
    });

    // Reset Slot
    document.getElementById("btnResetSlot").addEventListener("click", async () => {
      const slot = getActiveSlotObj();
      const res = await fetch("/api/profile-slot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reset",
          productId: selectedDevice.productId,
          slotId: slot.slot,
        }),
      });
      const data = await res.json();
      if (data.ok && data.state) {
        serverState = data.state;
        selectedKeys.clear();
        syncToolbarSelectionChips("all");
        renderSlotBar();
        syncControlsFromSlot();
        updateVisualStage();
        showSyncedToast(`✓ Slot ${slot.slot} Reset to Factory Default`);
      }
    });

    // Export / Import Profile JSON
    document.getElementById("btnExportJson").addEventListener("click", () => {
      const slot = getActiveSlotObj();
      const blob = new Blob([JSON.stringify(slot, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `razer-${selectedDevice.productId}-slot-${slot.slot}.json`;
      a.click();
    });

    document.getElementById("btnImportJson").addEventListener("click", () => {
      document.getElementById("fileImportJson").click();
    });
    document.getElementById("fileImportJson").addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const imported = JSON.parse(await file.text());
        const slot = getActiveSlotObj();
        const res = await fetch("/api/profile-slot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "save",
            productId: selectedDevice.productId,
            slotId: slot.slot,
            slotData: imported,
          }),
        });
        const data = await res.json();
        if (data.ok && data.state) {
          serverState = data.state;
          renderSlotBar();
          syncControlsFromSlot();
          updateVisualStage();
          showSyncedToast(`✓ Imported Profile into Slot ${slot.slot}`);
        }
      } catch {
        alert("Invalid profile JSON file");
      }
    });

    // Key Selection Toolbar
    document.querySelectorAll("[data-sel]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const mode = btn.dataset.sel;
        selectedKeys.clear();
        if (mode === "wasd") {
          ["W", "A", "S", "D"].forEach((k) => selectedKeys.add(k));
        } else if (mode === "fps") {
          ["W", "A", "S", "D", "Q", "E", "R", "F", "SPACE", "SHIFT", "CTRL"].forEach((k) =>
            selectedKeys.add(k)
          );
        } else if (mode === "nums") {
          ["1", "2", "3", "4", "5"].forEach((k) => selectedKeys.add(k));
        }
        syncToolbarSelectionChips(mode === "clear" ? "all" : mode);
        syncControlsFromSlot();
        updateVisualStage();
      });
    });

    // Layer Toggle (Standard vs Hypershift)
    const toggleLayer = () => {
      currentLayer = currentLayer === "standard" ? "hypershift" : "standard";
      const btn = document.getElementById("btnLayerToggle");
      btn.textContent = currentLayer === "hypershift" ? "⚡ Layer: Razer Hypershift" : "Layer: Standard";
      btn.classList.toggle("hypershift-active", currentLayer === "hypershift");
      updateRemapInspector();
      updateVisualStage();
    };
    document.getElementById("btnLayerToggle").addEventListener("click", toggleLayer);
    document.getElementById("btnSwitchLayerCard").addEventListener("click", toggleLayer);

    // Mouse Button Hotspots
    document.querySelectorAll(".mouse-hotspot").forEach((hs) => {
      hs.addEventListener("click", () => {
        document.querySelectorAll(".mouse-hotspot").forEach((h) => h.classList.remove("active"));
        hs.classList.add("active");
        lastClickedControl = hs.dataset.mbtn;
        updateRemapInspector();
      });
    });

    // Remap Selector
    document.getElementById("selRemapAction").addEventListener("change", async (e) => {
      const slot = getActiveSlotObj();
      const val = e.target.value;
      const pkt90 = P25.Builders.setKeyBinding({
        slotId: slot.slot,
        keyId: lastClickedControl.charCodeAt(0) & 0xff,
        layer: currentLayer === "hypershift" ? 1 : 0,
      });

      if (isMouseSelected()) {
        const buttonBindings = slot.buttonBindings || { standard: {}, hypershift: {} };
        buttonBindings[currentLayer][lastClickedControl] = val;
        await sendPacket90(pkt90, { buttonBindings }, `✓ Mapped ${lastClickedControl} → ${val}`);
      } else {
        const keyBindings = slot.keyBindings || { standard: {}, hypershift: {} };
        keyBindings[currentLayer][lastClickedControl] = val;
        await sendPacket90(pkt90, { keyBindings }, `✓ Mapped ${lastClickedControl} → ${val}`);
      }
      updateVisualStage();
    });

    // Actuation & Rapid Trigger Sliders
    const rngAct = document.getElementById("rngActuation");
    const rngRtDown = document.getElementById("rngRtDown");
    const rngRtUp = document.getElementById("rngRtUp");
    const chkRt = document.getElementById("chkRapidTrigger");

    rngAct.addEventListener("input", (e) => {
      const v = Number(e.target.value);
      document.getElementById("valActuation").textContent = `${v.toFixed(1)} mm`;
      document.getElementById("badgeActuation").textContent = `${v.toFixed(1)} mm`;
      updateActuationPresetHighlight(v, chkRt.checked);
      updateVisualStage();
    });
    rngAct.addEventListener("change", commitActuationChange);

    rngRtDown.addEventListener("input", (e) => {
      document.getElementById("valRtDown").textContent = `${Number(e.target.value).toFixed(2)} mm`;
    });
    rngRtDown.addEventListener("change", commitActuationChange);

    rngRtUp.addEventListener("input", (e) => {
      document.getElementById("valRtUp").textContent = `${Number(e.target.value).toFixed(2)} mm`;
    });
    rngRtUp.addEventListener("change", commitActuationChange);

    chkRt.addEventListener("change", commitActuationChange);
    document.getElementById("chkContinuousRt").addEventListener("change", commitActuationChange);

    document.querySelectorAll("[data-act-preset]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const p = btn.dataset.actPreset;
        if (p === "esports") {
          rngAct.value = 0.4;
          rngRtDown.value = 0.1;
          rngRtUp.value = 0.1;
          chkRt.checked = true;
        } else if (p === "balanced") {
          rngAct.value = 1.2;
          rngRtDown.value = 0.3;
          rngRtUp.value = 0.3;
          chkRt.checked = true;
        } else {
          rngAct.value = 2.0;
          rngRtDown.value = 0.5;
          rngRtUp.value = 0.5;
          chkRt.checked = false;
        }
        rngAct.dispatchEvent(new Event("input"));
        rngRtDown.dispatchEvent(new Event("input"));
        rngRtUp.dispatchEvent(new Event("input"));
        commitActuationChange();
      });
    });

    // Snap Tap & Gaming Mode
    const syncSnapTap = async () => {
      const snapTapEnabled = document.getElementById("chkSnapTap").checked;
      const snapKeyA = (document.getElementById("inpSnapA").value || "A").toUpperCase();
      const snapKeyB = (document.getElementById("inpSnapB").value || "D").toUpperCase();
      const pkt90 = P25.buildPacket({
        commandClass: 0x0b,
        commandId: 0x08,
        dataSize: 0x04,
        args: [0x01, snapTapEnabled ? 0x01 : 0x00, snapKeyA.charCodeAt(0) & 0xff, snapKeyB.charCodeAt(0) & 0xff],
      });
      await sendPacket90(pkt90, { snapTapEnabled, snapKeyA, snapKeyB }, "✓ Snap Tap Synced");
      updateVisualStage();
    };
    document.getElementById("chkSnapTap").addEventListener("change", syncSnapTap);
    document.getElementById("inpSnapA").addEventListener("change", syncSnapTap);
    document.getElementById("inpSnapB").addEventListener("change", syncSnapTap);

    const syncGamingMode = async () => {
      const gamingMode = {
        enabled: document.getElementById("chkGamingMode").checked,
        disableWin: document.getElementById("chkDisWin").checked,
        disableAltTab: document.getElementById("chkDisAltTab").checked,
        disableAltF4: document.getElementById("chkDisAltF4").checked,
      };
      const pkt90 = P25.Builders.setGamingMode(
        gamingMode.enabled,
        gamingMode.disableAltTab,
        gamingMode.disableAltF4
      );
      await sendPacket90(pkt90, { gamingMode }, "✓ Gaming Mode Synced");
    };
    ["chkGamingMode", "chkDisWin", "chkDisAltTab", "chkDisAltF4"].forEach((id) => {
      document.getElementById(id).addEventListener("change", syncGamingMode);
    });

    // Mouse 5-Stage DPI & Independent X/Y
    const commitMouseDpi = async () => {
      const slot = getActiveSlotObj();
      const stages = [...(slot.dpiStages || [])];
      const activeIdx = (slot.activeStageIndex || 3) - 1;
      const independentXY = document.getElementById("chkIndXY").checked;
      const x = Number(document.getElementById("rngDpiX").value);
      const y = independentXY ? Number(document.getElementById("rngDpiY").value) : x;

      if (stages[activeIdx]) {
        stages[activeIdx] = { ...stages[activeIdx], x, y };
      }
      const pkt90 = P25.Builders.setDpiStages(stages, activeIdx + 1);
      await sendPacket90(
        pkt90,
        { dpiStages: stages, activeStageIndex: activeIdx + 1, independentXY },
        `✓ Stage ${activeIdx + 1} (${x} DPI) Saved`
      );
      syncControlsFromSlot();
      updateVisualStage();
    };

    document.querySelectorAll("#dpiStageGrid .preset-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const slot = getActiveSlotObj();
        slot.activeStageIndex = Number(btn.dataset.stage);
        syncControlsFromSlot();
        await commitMouseDpi();
      });
    });

    document.getElementById("chkIndXY").addEventListener("change", (e) => {
      document.getElementById("blockDpiY").classList.toggle("hidden", !e.target.checked);
      commitMouseDpi();
    });
    document.getElementById("rngDpiX").addEventListener("input", (e) => {
      document.getElementById("valDpiX").textContent = e.target.value;
    });
    document.getElementById("rngDpiX").addEventListener("change", commitMouseDpi);
    document.getElementById("rngDpiY").addEventListener("input", (e) => {
      document.getElementById("valDpiY").textContent = e.target.value;
    });
    document.getElementById("rngDpiY").addEventListener("change", commitMouseDpi);

    document.querySelectorAll("#pollingGrid .preset-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const pollingHz = Number(btn.dataset.hz);
        const pkt90 = P25.Builders.setPollingRate(pollingHz);
        await sendPacket90(pkt90, { pollingHz }, `✓ ${pollingHz} Hz Polling Set`);
        syncControlsFromSlot();
        updateVisualStage();
      });
    });

    // Sensor Angle & Dynamic Curve
    const commitSensorAngle = async () => {
      const sensorAngle = Number(document.getElementById("rngSensorAngle").value);
      const dynamicSensitivity = Number(document.getElementById("selDynCurve").value);
      const pkt90 = P25.Builders.setSensorAngleAndCurve({
        angleDeg: sensorAngle,
        dynamicCurve: dynamicSensitivity,
      });
      await sendPacket90(pkt90, { sensorAngle, dynamicSensitivity }, `✓ Sensor Angle ${sensorAngle}° Synced`);
      syncControlsFromSlot();
      updateVisualStage();
    };
    document.getElementById("rngSensorAngle").addEventListener("input", (e) => {
      document.getElementById("valSensorAngle").textContent = `${e.target.value}°`;
    });
    document.getElementById("rngSensorAngle").addEventListener("change", commitSensorAngle);
    document.getElementById("selDynCurve").addEventListener("change", commitSensorAngle);

    // Smart Tracking / Asymmetric Cut-Off
    const commitSmartTracking = async () => {
      const slot = getActiveSlotObj();
      const asymmetric = document.getElementById("chkAsymmetric").checked;
      const liftOffLevel = Number(document.getElementById("rngLiftOff").value);
      const landingLevel = Number(document.getElementById("rngLanding").value);
      const symmetricLevel = slot.smartTracking?.symmetricLevel || 1;
      const smartTracking = { asymmetric, symmetricLevel, liftOffLevel, landingLevel };
      const pkt90 = P25.Builders.setSmartTracking(smartTracking);
      await sendPacket90(pkt90, { smartTracking }, "✓ Smart Tracking Synced");
      syncControlsFromSlot();
      updateVisualStage();
    };
    document.getElementById("chkAsymmetric").addEventListener("change", commitSmartTracking);
    document.getElementById("rngLiftOff").addEventListener("input", (e) => {
      document.getElementById("valLiftOff").textContent = e.target.value;
    });
    document.getElementById("rngLiftOff").addEventListener("change", commitSmartTracking);
    document.getElementById("rngLanding").addEventListener("input", (e) => {
      document.getElementById("valLanding").textContent = e.target.value;
    });
    document.getElementById("rngLanding").addEventListener("change", commitSmartTracking);

    document.querySelectorAll("#symLodGroup .preset-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        document.querySelectorAll("#symLodGroup .preset-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const slot = getActiveSlotObj();
        slot.smartTracking = {
          ...(slot.smartTracking || {}),
          asymmetric: false,
          symmetricLevel: Number(btn.dataset.lod),
        };
        await commitSmartTracking();
      });
    });

    // Wireless Power Saving
    const commitPowerSaving = async () => {
      const idleMinutes = Number(document.getElementById("rngIdleMin").value);
      const lowPowerPercent = Number(document.getElementById("rngLowBatt").value);
      const pkt90 = P25.Builders.setPowerSaving({ idleMinutes, lowPowerPercent });
      await sendPacket90(pkt90, { powerSaving: { idleMinutes, lowPowerPercent } }, "✓ Power Saving Synced");
      syncControlsFromSlot();
      updateVisualStage();
    };
    document.getElementById("rngIdleMin").addEventListener("input", (e) => {
      document.getElementById("valIdleMin").textContent = `${e.target.value} min`;
    });
    document.getElementById("rngIdleMin").addEventListener("change", commitPowerSaving);
    document.getElementById("rngLowBatt").addEventListener("input", (e) => {
      document.getElementById("valLowBatt").textContent = `${e.target.value}%`;
    });
    document.getElementById("rngLowBatt").addEventListener("change", commitPowerSaving);

    // Lighting
    const commitLighting = async () => {
      const slot = getActiveSlotObj();
      const color1 = document.getElementById("colorPicker").value;
      const brightness = Number(document.getElementById("rngBrightness").value);
      const effect =
        document.querySelector("#effectGrid .preset-btn.active")?.dataset.effect ||
        slot.lighting?.effect ||
        "static";
      const [r, g, b] = hexToRgb(color1);
      const pkt90 = P25.Builders.setChromaEffect({ effect, r, g, b });
      await sendPacket90(pkt90, { lighting: { effect, color1, brightness } }, `✓ Lighting (${effect}) Synced`);
      syncControlsFromSlot();
      updateVisualStage();
    };

    document.querySelectorAll("#effectGrid .preset-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#effectGrid .preset-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        document.getElementById("badgeEffect").textContent = btn.textContent;
        commitLighting();
      });
    });

    document.querySelectorAll("#swatchRow .swatch").forEach((sw) => {
      sw.addEventListener("click", () => {
        document.querySelectorAll("#swatchRow .swatch").forEach((s) => s.classList.remove("active"));
        sw.classList.add("active");
        document.getElementById("colorPicker").value = sw.dataset.color;
        commitLighting();
      });
    });

    document.getElementById("colorPicker").addEventListener("change", commitLighting);
    document.getElementById("rngBrightness").addEventListener("input", (e) => {
      document.getElementById("valBrightness").textContent = `${e.target.value}%`;
      document.getElementById("badgeBright").textContent = `${e.target.value}%`;
    });
    document.getElementById("rngBrightness").addEventListener("change", async (e) => {
      const pct = Number(e.target.value);
      await sendPacket90(P25.Builders.setBrightness(Math.round((pct / 100) * 255)));
      await commitLighting();
    });

    // Hardware Mode
    document.getElementById("btnModeNormal").addEventListener("click", async () => {
      document.getElementById("btnModeNormal").classList.add("active");
      document.getElementById("btnModeDriver").classList.remove("active");
      document.getElementById("badgeMode").textContent = "Onboard (0x00)";
      await sendPacket90(P25.Builders.setDeviceMode(0x00, 0x00, 0x00), null, "✓ Onboard Memory Mode Set");
    });
    document.getElementById("btnModeDriver").addEventListener("click", async () => {
      document.getElementById("btnModeDriver").classList.add("active");
      document.getElementById("btnModeNormal").classList.remove("active");
      document.getElementById("badgeMode").textContent = "Driver (0x03)";
      await sendPacket90(P25.Builders.setDeviceMode(0x03, 0x00, 0x1f), null, "✓ Software Driver Mode Set");
    });

    // Inspector Drawer & WebHID
    const drawer = document.getElementById("protocolDrawer");
    document.getElementById("btnToggleDrawer").addEventListener("click", () => drawer.classList.toggle("open"));
    document.getElementById("btnCloseDrawer").addEventListener("click", () => drawer.classList.remove("open"));
    document.getElementById("btnClearLogs").addEventListener("click", async () => {
      await fetch("/api/clear-logs", { method: "POST" });
      document.getElementById("packetLogList").innerHTML = "";
    });
    document.getElementById("btnWebHid").addEventListener("click", async () => {
      if (!navigator.hid) return;
      try {
        const list = await navigator.hid.requestDevice({ filters: [{ vendorId: 0x1532 }] });
        if (list?.[0]) {
          if (!list[0].opened) await list[0].open();
          webHidDevice = list[0];
          document.getElementById("transportLabel").textContent = "Direct WebHID Connected";
        }
      } catch {
        // ignore
      }
    });
  }

  buildKeyboardStage();
  wireEvents();
  refreshStatus();
})();
