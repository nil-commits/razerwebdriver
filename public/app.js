/**
 * Razer Web Hub — Wootility / MCHOSE / Corsair Web Hub Inspired Controller
 * Instant auto-apply, interactive TKL keyboard & Viper V3 Pro visualizers,
 * and zero-bloat local Protocol 25 hardware sync.
 */
(function () {
  "use strict";

  const P25 = window.RazerProtocol25;

  // TKL Keyboard Layout Definition for Interactive Stage
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
        { label: "SHIFT", u: 2.75 },
      ],
    },
    {
      keys: [
        { label: "CTRL", u: 1.25 },
        { label: "WIN", u: 1.25 },
        { label: "ALT", u: 1.25 },
        { label: "SPACE", u: 6.25 },
        { label: "ALT", u: 1.25 },
        { label: "FN", u: 1.25 },
        { label: "MENU", u: 1.25 },
        { label: "CTRL", u: 1.25 },
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
    protocol: "25",
  };

  let uiState = {
    actuationMm: 1.2,
    rtEnabled: true,
    rtDownMm: 0.3,
    rtUpMm: 0.3,
    snapTapEnabled: true,
    snapKeyA: "A",
    snapKeyB: "D",
    effect: "static",
    colorHex: "#00e676",
    brightness: 100,
    dpi: 1600,
    pollingHz: 1000,
    deviceMode: "normal",
  };

  let webHidDevice = null;
  let toastTimer = null;

  // Expose window.apiElectron compatibility bridge
  window.apiElectron = {
    doRzDeviceAction: async (arg) => {
      const res = await fetch("/api/rpc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: "doRzDeviceAction", arg }),
      });
      return (await res.json()).result;
    },
    doMappingEngineAction: async (arg) => {
      const res = await fetch("/api/rpc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: "doMappingEngineAction", arg }),
      });
      return (await res.json()).result;
    },
  };

  function showSyncedToast(msg = "✓ Synced to Hardware") {
    const el = document.getElementById("saveToast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 1600);
  }

  function hexToRgb(hex) {
    const clean = (hex || "#00e676").replace("#", "");
    const num = parseInt(clean, 16);
    return [(num >> 16) & 0xff, (num >> 8) & 0xff, num & 0xff];
  }

  // Render interactive TKL keyboard
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
          cap.innerHTML = `<span>${k.label}</span><span class="k-sub">${uiState.actuationMm.toFixed(1)}</span>`;
          cap.addEventListener("click", () => {
            cap.classList.toggle("selected");
          });
          rowEl.appendChild(cap);
        });
        container.appendChild(rowEl);
      });
    };
    renderBlock("kbdMainRows", TKL_MAIN_ROWS);
    renderBlock("kbdNavRows", TKL_NAV_ROWS);
    updateVisualStage();
  }

  // Synchronize visual keyboard & mouse stage with current state
  function updateVisualStage() {
    const isMouse =
      selectedDevice.category === "mouse" ||
      selectedDevice.productId === 193 ||
      selectedDevice.productId === 192;

    document.getElementById("keyboardStage").classList.toggle("hidden", isMouse);
    document.getElementById("mouseStage").classList.toggle("hidden", !isMouse);
    document.getElementById("metaName").textContent = selectedDevice.productName;
    document.getElementById("metaPid").textContent = selectedDevice.hexPid || `0x${selectedDevice.productId.toString(16)}`;

    // Filter contextual dock tabs
    const tabs = document.querySelectorAll(".dock-tab");
    let activeVisible = false;
    tabs.forEach((t) => {
      const target = t.dataset.for;
      const show =
        target === "all" ||
        (target === "keyboard" && !isMouse) ||
        (target === "mouse" && isMouse);
      t.classList.toggle("hidden", !show);
      if (show && t.classList.contains("active")) activeVisible = true;
    });

    if (!activeVisible) {
      const firstVisible = Array.from(tabs).find((t) => !t.classList.contains("hidden"));
      if (firstVisible) firstVisible.click();
    }

    // Update stem gauge height (0.1mm..4.0mm -> 5%..100%)
    const pctStem = Math.max(6, Math.min(100, (uiState.actuationMm / 4.0) * 100));
    document.getElementById("stemFill").style.height = `${pctStem}%`;

    // Update keycaps lighting, actuation sub-labels, and Snap Tap highlights
    const alpha = Math.max(0.12, (uiState.brightness / 100) * 0.65);
    const color = uiState.effect === "off" ? "#484f58" : uiState.colorHex;
    const kbdStage = document.getElementById("keyboardStage");
    kbdStage.style.setProperty("--kbd-glow", uiState.effect === "off" ? "transparent" : `${color}22`);

    document.querySelectorAll(".keycap").forEach((cap) => {
      const k = cap.dataset.key;
      const sub = cap.querySelector(".k-sub");
      if (sub) sub.textContent = `${uiState.actuationMm.toFixed(1)}`;
      cap.style.setProperty("--key-color", uiState.effect === "off" ? "#6e7681" : color);
      cap.style.setProperty(
        "--key-glow",
        uiState.effect === "off" ? "transparent" : `${color}${Math.round(alpha * 90).toString(16).padStart(2, "0")}`
      );
      const isSnap =
        uiState.snapTapEnabled &&
        (k === uiState.snapKeyA.toUpperCase() || k === uiState.snapKeyB.toUpperCase());
      cap.classList.toggle("snaptap-key", isSnap);
    });

    // Update Mouse stage metrics & glow
    document.getElementById("stageDpiVal").textContent = `${uiState.dpi} DPI`;
    document.getElementById("stagePollVal").textContent = `${uiState.pollingHz} Hz`;
    document.getElementById("mouseWheelGlow").style.borderColor = color;
    document.getElementById("mouseLogoGlow").style.background = color;
  }

  async function sendPacket90(packet90, statePatch = null, toastLabel = "✓ Synced to Hardware") {
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
        statePatch,
      }),
    });
    const data = await res.json();
    showSyncedToast(toastLabel);
    if (data.logItem) {
      prependPacketLog(data.logItem);
    }
    return data;
  }

  function renderDeviceSwitcher() {
    const container = document.getElementById("deviceSwitcher");
    container.innerHTML = "";
    devices.forEach((dev) => {
      const btn = document.createElement("button");
      btn.className = `dev-pill ${dev.productId === selectedDevice.productId ? "active" : ""}`;
      btn.innerHTML = `
        <span class="dot"></span>
        <span>${dev.productName.replace("Razer ", "")}</span>
      `;
      btn.addEventListener("click", () => {
        selectedDevice = dev;
        renderDeviceSwitcher();
        updateVisualStage();
        queryDeviceFirmware();
      });
      container.appendChild(btn);
    });
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

  async function queryDeviceFirmware() {
    try {
      const res = await sendPacket90(P25.Builders.getFirmwareVersion(), null, "✓ Device Ready");
      const args = res.parsedRx?.args || [];
      if (args.length >= 2 && (args[0] > 0 || args[1] > 0)) {
        const fw = `v${args[0]}.${String(args[1]).padStart(2, "0")}.00`;
        document.getElementById("metaFw").textContent = fw;
        if (selectedDevice.productId === 193) {
          document.getElementById("stageMouseFw").textContent = fw;
        }
      }
    } catch {
      // ignore
    }
  }

  async function refreshStatus() {
    try {
      const res = await fetch("/api/status");
      const data = await res.json();
      if (!data.ok) return;

      devices = data.devices || [];
      if (devices.length > 0 && !devices.some((d) => d.productId === selectedDevice.productId)) {
        selectedDevice = devices[0];
      }
      renderDeviceSwitcher();
      updateVisualStage();

      const label = document.getElementById("transportLabel");
      label.textContent = data.nativeStatus?.hidLoaded ? "Native HID.node Active" : "Local Bridge Ready";

      const list = document.getElementById("packetLogList");
      list.innerHTML = "";
      (data.packetHistory || []).slice().reverse().forEach(prependPacketLog);
    } catch (err) {
      console.warn("Status refresh error:", err);
    }
  }

  // Push Actuation & Rapid Trigger to hardware
  async function syncActuationHardware() {
    const actUnits = Math.round(uiState.actuationMm * 10);
    const downUnits = Math.round(uiState.rtDownMm * 10);
    const upUnits = Math.round(uiState.rtUpMm * 10);
    const pkt90 = P25.buildPacket({
      commandClass: 0x0b,
      commandId: 0x02,
      dataSize: 0x06,
      args: [0x01, actUnits, uiState.rtEnabled ? 0x01 : 0x00, downUnits, upUnits, 0x00],
    });
    await sendPacket90(
      pkt90,
      {
        huntsman: {
          actuationMm: uiState.actuationMm,
          rapidTriggerEnabled: uiState.rtEnabled,
          rapidTriggerDownMm: uiState.rtDownMm,
          rapidTriggerUpMm: uiState.rtUpMm,
        },
      },
      `✓ Actuation ${uiState.actuationMm.toFixed(1)}mm Synced`
    );
  }

  // Push Chroma Lighting to hardware
  async function syncLightingHardware() {
    const [r, g, b] = hexToRgb(uiState.colorHex);
    const pkt90 = P25.Builders.setChromaEffect({
      effect: uiState.effect,
      r,
      g,
      b,
    });
    await sendPacket90(
      pkt90,
      {
        lighting: {
          effect: uiState.effect,
          color1: uiState.colorHex,
          brightness: uiState.brightness,
        },
      },
      `✓ Lighting (${uiState.effect}) Synced`
    );
  }

  function wireEvents() {
    // Dock tabs
    document.querySelectorAll(".dock-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".dock-tab").forEach((t) => t.classList.remove("active"));
        document.querySelectorAll(".panel").forEach((p) => p.classList.add("hidden"));
        tab.classList.add("active");
        document.getElementById(tab.dataset.panel).classList.remove("hidden");
      });
    });

    // Inspector Drawer
    const drawer = document.getElementById("protocolDrawer");
    document.getElementById("btnToggleDrawer").addEventListener("click", () => {
      drawer.classList.toggle("open");
    });
    document.getElementById("btnCloseDrawer").addEventListener("click", () => {
      drawer.classList.remove("open");
    });
    document.getElementById("btnClearLogs").addEventListener("click", async () => {
      await fetch("/api/clear-logs", { method: "POST" });
      document.getElementById("packetLogList").innerHTML = "";
    });

    // Browser WebHID
    document.getElementById("btnWebHid").addEventListener("click", async () => {
      if (!navigator.hid) return;
      try {
        const list = await navigator.hid.requestDevice({ filters: [{ vendorId: 0x1532 }] });
        if (list && list[0]) {
          if (!list[0].opened) await list[0].open();
          webHidDevice = list[0];
          document.getElementById("transportLabel").textContent = "Direct WebHID Connected";
        }
      } catch {
        // user cancelled
      }
    });

    // Actuation slider & presets
    const rngAct = document.getElementById("rngActuation");
    const rngRtDown = document.getElementById("rngRtDown");
    const rngRtUp = document.getElementById("rngRtUp");
    const chkRt = document.getElementById("chkRapidTrigger");

    rngAct.addEventListener("input", (e) => {
      uiState.actuationMm = Number(e.target.value);
      const txt = `${uiState.actuationMm.toFixed(1)} mm`;
      document.getElementById("valActuation").textContent = txt;
      document.getElementById("badgeActuation").textContent = txt;
      updateVisualStage();
    });
    rngAct.addEventListener("change", syncActuationHardware);

    rngRtDown.addEventListener("input", (e) => {
      uiState.rtDownMm = Number(e.target.value);
      document.getElementById("valRtDown").textContent = `${uiState.rtDownMm.toFixed(1)} mm`;
    });
    rngRtDown.addEventListener("change", syncActuationHardware);

    rngRtUp.addEventListener("input", (e) => {
      uiState.rtUpMm = Number(e.target.value);
      document.getElementById("valRtUp").textContent = `${uiState.rtUpMm.toFixed(1)} mm`;
    });
    rngRtUp.addEventListener("change", syncActuationHardware);

    chkRt.addEventListener("change", (e) => {
      uiState.rtEnabled = e.target.checked;
      syncActuationHardware();
    });

    document.querySelectorAll("[data-act-preset]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("[data-act-preset]").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const p = btn.dataset.actPreset;
        if (p === "esports") {
          uiState.actuationMm = 0.4;
          uiState.rtEnabled = true;
          uiState.rtDownMm = 0.1;
          uiState.rtUpMm = 0.1;
        } else if (p === "balanced") {
          uiState.actuationMm = 1.2;
          uiState.rtEnabled = true;
          uiState.rtDownMm = 0.3;
          uiState.rtUpMm = 0.3;
        } else {
          uiState.actuationMm = 2.0;
          uiState.rtEnabled = false;
          uiState.rtDownMm = 0.5;
          uiState.rtUpMm = 0.5;
        }
        rngAct.value = uiState.actuationMm;
        chkRt.checked = uiState.rtEnabled;
        rngRtDown.value = uiState.rtDownMm;
        rngRtUp.value = uiState.rtUpMm;
        rngAct.dispatchEvent(new Event("input"));
        rngRtDown.dispatchEvent(new Event("input"));
        rngRtUp.dispatchEvent(new Event("input"));
        syncActuationHardware();
      });
    });

    // Snap Tap
    const syncSnapTap = async () => {
      uiState.snapTapEnabled = document.getElementById("chkSnapTap").checked;
      uiState.snapKeyA = (document.getElementById("inpSnapA").value || "A").toUpperCase();
      uiState.snapKeyB = (document.getElementById("inpSnapB").value || "D").toUpperCase();
      updateVisualStage();
      const pkt90 = P25.buildPacket({
        commandClass: 0x0b,
        commandId: 0x08,
        dataSize: 0x04,
        args: [
          0x01,
          uiState.snapTapEnabled ? 0x01 : 0x00,
          uiState.snapKeyA.charCodeAt(0) & 0xff,
          uiState.snapKeyB.charCodeAt(0) & 0xff,
        ],
      });
      await sendPacket90(pkt90, null, "✓ Snap Tap Synced");
    };
    document.getElementById("chkSnapTap").addEventListener("change", syncSnapTap);
    document.getElementById("inpSnapA").addEventListener("change", syncSnapTap);
    document.getElementById("inpSnapB").addEventListener("change", syncSnapTap);

    // Mouse DPI & Polling
    const rngDpi = document.getElementById("rngDpi");
    rngDpi.addEventListener("input", (e) => {
      uiState.dpi = Number(e.target.value);
      document.getElementById("valDpiSlider").textContent = uiState.dpi;
      document.getElementById("badgeDpi").textContent = `${uiState.dpi} DPI`;
      updateVisualStage();
    });
    rngDpi.addEventListener("change", async () => {
      const pkt90 = P25.Builders.setDpiXY(uiState.dpi, uiState.dpi);
      await sendPacket90(pkt90, { mouse: { dpiX: uiState.dpi, dpiY: uiState.dpi } }, `✓ ${uiState.dpi} DPI Synced`);
    });

    document.querySelectorAll("#dpiStageGrid .preset-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        document.querySelectorAll("#dpiStageGrid .preset-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        uiState.dpi = Number(btn.dataset.dpi);
        rngDpi.value = uiState.dpi;
        rngDpi.dispatchEvent(new Event("input"));
        const pkt90 = P25.Builders.setDpiXY(uiState.dpi, uiState.dpi);
        await sendPacket90(pkt90, { mouse: { dpiX: uiState.dpi, dpiY: uiState.dpi } }, `✓ ${uiState.dpi} DPI Synced`);
      });
    });

    document.querySelectorAll("#pollingGrid .preset-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        document.querySelectorAll("#pollingGrid .preset-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        uiState.pollingHz = Number(btn.dataset.hz);
        document.getElementById("badgePolling").textContent = `${uiState.pollingHz} Hz`;
        updateVisualStage();
        const pkt90 = P25.Builders.setPollingRate(uiState.pollingHz);
        await sendPacket90(pkt90, { mouse: { pollingHz: uiState.pollingHz } }, `✓ ${uiState.pollingHz} Hz Synced`);
      });
    });

    // Lighting Effects, Swatches & Brightness
    document.querySelectorAll("#effectGrid .preset-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#effectGrid .preset-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        uiState.effect = btn.dataset.effect;
        document.getElementById("badgeEffect").textContent = btn.textContent;
        updateVisualStage();
        syncLightingHardware();
      });
    });

    document.querySelectorAll("#swatchRow .swatch").forEach((sw) => {
      sw.addEventListener("click", () => {
        document.querySelectorAll("#swatchRow .swatch").forEach((s) => s.classList.remove("active"));
        sw.classList.add("active");
        uiState.colorHex = sw.dataset.color;
        document.getElementById("colorPicker").value = uiState.colorHex;
        updateVisualStage();
        syncLightingHardware();
      });
    });

    document.getElementById("colorPicker").addEventListener("input", (e) => {
      uiState.colorHex = e.target.value;
      updateVisualStage();
    });
    document.getElementById("colorPicker").addEventListener("change", syncLightingHardware);

    const rngBright = document.getElementById("rngBrightness");
    rngBright.addEventListener("input", (e) => {
      uiState.brightness = Number(e.target.value);
      const txt = `${uiState.brightness}%`;
      document.getElementById("valBrightness").textContent = txt;
      document.getElementById("badgeBright").textContent = txt;
      updateVisualStage();
    });
    rngBright.addEventListener("change", async () => {
      const raw255 = Math.round((uiState.brightness / 100) * 255);
      await sendPacket90(
        P25.Builders.setBrightness(raw255),
        { lighting: { brightness: uiState.brightness } },
        `✓ Brightness ${uiState.brightness}% Synced`
      );
    });

    // Device Mode
    document.getElementById("btnModeNormal").addEventListener("click", async () => {
      document.getElementById("btnModeNormal").classList.add("active");
      document.getElementById("btnModeDriver").classList.remove("active");
      document.getElementById("metaMode").textContent = "Onboard Memory";
      document.getElementById("badgeMode").textContent = "Onboard (0x00)";
      await sendPacket90(P25.Builders.setDeviceMode(0x00, 0x00, 0x00), { deviceMode: "normal" }, "✓ Onboard Mode Set");
    });

    document.getElementById("btnModeDriver").addEventListener("click", async () => {
      document.getElementById("btnModeDriver").classList.add("active");
      document.getElementById("btnModeNormal").classList.remove("active");
      document.getElementById("metaMode").textContent = "Software Driver";
      document.getElementById("badgeMode").textContent = "Driver (0x03)";
      await sendPacket90(P25.Builders.setDeviceMode(0x03, 0x00, 0x1f), { deviceMode: "driver" }, "✓ Driver Mode Set");
    });

    document.getElementById("btnQueryFw").addEventListener("click", queryDeviceFirmware);

    document.getElementById("chkMappingHooks").addEventListener("change", async (e) => {
      const action = e.target.checked ? "enableAllDevicesHooks" : "disableAllDevicesHooks";
      await window.apiElectron.doMappingEngineAction({ action });
      showSyncedToast(e.target.checked ? "✓ Mapping Hooks Enabled" : "✓ Mapping Hooks Disabled");
    });
  }

  buildKeyboardStage();
  wireEvents();
  refreshStatus();
})();
