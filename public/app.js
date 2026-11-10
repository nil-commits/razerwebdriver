/**
 * Razer Web Hub v3.0 — Chroma Hardware Studio Edition
 * Universal Browser Support (Firefox, Safari, Chrome, Edge, Brave, Zen)
 * Zero Cloud · Native HID.node Bridge · 8 Chroma Studio Themes · Ambient Matrix Backdrop
 */
/* global Protocol25 */

(function () {
  "use strict";

  const Protocol25 = window.RazerProtocol25 || window.Protocol25;

  // ==========================================================================
  // 1. Ambient Chroma Geometric SVG Matrix Backdrop
  // ==========================================================================
  function renderChromaBackdrop(rePulse = false) {
    const host = document.getElementById("chromaBackdrop");
    if (!host) return;
    if (rePulse) {
      host.classList.remove("is-pulsing");
      void host.offsetWidth;
      host.classList.add("is-pulsing");
    }
    const cols = 28;
    const rows = 12;
    const spacingX = 22;
    const spacingY = 22;
    const width = cols * spacingX;
    const height = rows * spacingY;
    const circles = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const nx = (cols - 1 - c) / cols;
        const ny = r / rows;
        const radial = Math.hypot(nx * 1.15, ny * 1.35);
        if (radial > 1.05) continue;
        const wave = 0.5 + 0.5 * Math.cos((c * 0.42 - r * 0.55));
        const alpha = Math.max(0.02, (1 - radial) * (0.14 + 0.18 * wave)).toFixed(3);
        const radius = (1.1 + (1 - radial) * 1.45).toFixed(2);
        const cx = c * spacingX + 10;
        const cy = r * spacingY + 10;
        circles.push(`<circle cx="${cx}" cy="${cy}" r="${radius}" fill="currentColor" fill-opacity="${alpha}"/>`);
      }
    }
    host.innerHTML = `<svg viewBox="0 0 ${width} ${height}" width="100%" height="100%" preserveAspectRatio="xMaxYMin slice" style="color:var(--accent);display:block;">${circles.join("")}</svg>`;
  }

  // ==========================================================================
  // 2. Minimal Web Audio Feedback Tone Generator
  // ==========================================================================
  let studioAudioCtx = null;
  function playUiTone(mode = "success") {
    if (!uiPrefs.soundsEnabled) return;
    try {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return;
      if (!studioAudioCtx) studioAudioCtx = new AudioCtor();
      if (studioAudioCtx.state === "suspended") void studioAudioCtx.resume();
      const now = studioAudioCtx.currentTime;
      const osc = studioAudioCtx.createOscillator();
      const env = studioAudioCtx.createGain();
      osc.type = mode === "error" ? "sawtooth" : "triangle";
      const startHz = mode === "error" ? 240 : mode === "info" ? 480 : 587.33;
      const endHz = mode === "error" ? 180 : mode === "info" ? 640 : 880;
      osc.frequency.setValueAtTime(startHz, now);
      osc.frequency.exponentialRampToValueAtTime(endHz, now + 0.14);
      env.gain.setValueAtTime(0.001, now);
      env.gain.linearRampToValueAtTime(0.11, now + 0.015);
      env.gain.exponentialRampToValueAtTime(0.0001, now + 0.19);
      osc.connect(env);
      env.connect(studioAudioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.2);
    } catch {
      // ignore audio context restrictions
    }
  }

  // ==========================================================================
  // 3. 8 Chroma Studio Palettes
  // ==========================================================================
  const THEME_LIST = [
    { slug: "venom", name: "Razer Venom" },
    { slug: "chroma-cyber", name: "Chroma Cyber" },
    { slug: "stealth", name: "Stealth Carbon" },
    { slug: "quartz", name: "Quartz Rose" },
    { slug: "amber", name: "Optical Amber" },
    { slug: "ultraviolet", name: "Ultraviolet" },
    { slug: "crimson", name: "Esports Crimson" },
    { slug: "mercury", name: "Mercury Light" },
  ];

  let uiPrefs = {
    theme: "venom",
    reducedMotion: false,
    instantFlash: true,
    soundsEnabled: false,
    sidebarCollapsed: false,
  };

  // ==========================================================================
  // 4. TKL 87-Key Layout & State
  // ==========================================================================
  const TKL_ROWS = [
    [
      { label: "ESC", w: 1 },
      { spacer: true },
      { label: "F1", w: 1 }, { label: "F2", w: 1 }, { label: "F3", w: 1 }, { label: "F4", w: 1 },
      { spacer: true },
      { label: "F5", w: 1 }, { label: "F6", w: 1 }, { label: "F7", w: 1 }, { label: "F8", w: 1 },
      { spacer: true },
      { label: "F9", w: 1 }, { label: "F10", w: 1 }, { label: "F11", w: 1 }, { label: "F12", w: 1 },
      { spacer: true },
      { label: "PRT", w: 1 }, { label: "SCR", w: 1 }, { label: "PAU", w: 1 },
    ],
    [
      { label: "`", w: 1 }, { label: "1", w: 1 }, { label: "2", w: 1 }, { label: "3", w: 1 },
      { label: "4", w: 1 }, { label: "5", w: 1 }, { label: "6", w: 1 }, { label: "7", w: 1 },
      { label: "8", w: 1 }, { label: "9", w: 1 }, { label: "0", w: 1 }, { label: "-", w: 1 },
      { label: "=", w: 1 }, { label: "BKSP", w: 2 },
      { spacer: true },
      { label: "INS", w: 1 }, { label: "HOME", w: 1 }, { label: "PGUP", w: 1 },
    ],
    [
      { label: "TAB", w: 1.5 }, { label: "Q", w: 1 }, { label: "W", w: 1 }, { label: "E", w: 1 },
      { label: "R", w: 1 }, { label: "T", w: 1 }, { label: "Y", w: 1 }, { label: "U", w: 1 },
      { label: "I", w: 1 }, { label: "O", w: 1 }, { label: "P", w: 1 }, { label: "[", w: 1 },
      { label: "]", w: 1 }, { label: "\\", w: 1.5 },
      { spacer: true },
      { label: "DEL", w: 1 }, { label: "END", w: 1 }, { label: "PGDN", w: 1 },
    ],
    [
      { label: "CAPS", w: 1.75 }, { label: "A", w: 1 }, { label: "S", w: 1 }, { label: "D", w: 1 },
      { label: "F", w: 1 }, { label: "G", w: 1 }, { label: "H", w: 1 }, { label: "J", w: 1 },
      { label: "K", w: 1 }, { label: "L", w: 1 }, { label: ";", w: 1 }, { label: "'", w: 1 },
      { label: "ENTER", w: 2.25 },
    ],
    [
      { label: "LSHIFT", w: 2.25 }, { label: "Z", w: 1 }, { label: "X", w: 1 }, { label: "C", w: 1 },
      { label: "V", w: 1 }, { label: "B", w: 1 }, { label: "N", w: 1 }, { label: "M", w: 1 },
      { label: ",", w: 1 }, { label: ".", w: 1 }, { label: "/", w: 1 }, { label: "RSHIFT", w: 2.75 },
      { spacer: true },
      { label: "", w: 1, hidden: true }, { label: "↑", w: 1 }, { label: "", w: 1, hidden: true },
    ],
    [
      { label: "LCTRL", w: 1.25 }, { label: "WIN", w: 1.25 }, { label: "LALT", w: 1.25 },
      { label: "SPACE", w: 6.25 },
      { label: "RALT", w: 1.25 }, { label: "FN", w: 1.25 }, { label: "MENU", w: 1.25 }, { label: "RCTRL", w: 1.25 },
      { spacer: true },
      { label: "←", w: 1 }, { label: "↓", w: 1 }, { label: "→", w: 1 },
    ],
  ];

  const MOUSE_BUTTON_META = [
    { id: "M1", name: "Left Click (Button 1)" },
    { id: "M2", name: "Right Click (Button 2)" },
    { id: "M3", name: "Scroll Click (Button 3)" },
    { id: "M4", name: "Side Back (Button 4)" },
    { id: "M5", name: "Side Forward (Button 5)" },
    { id: "DPI", name: "Top / Bottom DPI Button" },
  ];

  const MOUSE_FUNCTIONS = [
    "Left Click",
    "Right Click",
    "Scroll Click",
    "Mouse Back (Button 4)",
    "Mouse Forward (Button 5)",
    "DPI Stage Cycle",
    "DPI Stage Up",
    "DPI Stage Down",
    "Clutch DPI (Sniper 400 DPI)",
    "Onboard Profile Cycle",
    "Razer Hypershift",
    "Media Play/Pause",
    "Volume Up",
    "Volume Down",
    "Mute Audio",
    "Disabled",
  ];

  const BATTERY_HOURS_BY_HZ = {
    125: 110,
    500: 100,
    1000: 95,
    2000: 62,
    4000: 34,
    8000: 17,
  };

  let devices = [];
  let selectedPid = 679;
  let driverState = {
    selectedPid: 679,
    deviceMode: "normal",
    profilesByPid: {},
  };

  let selectedKeys = new Set();
  let focusedRemapKey = "W";
  let kbdActiveLayer = "standard";
  let mouseActiveLayer = "standard";
  let stagedQueue = []; // Used when uiPrefs.instantFlash === false
  let lastTestReport = null;

  // ==========================================================================
  // 5. Helpers: Range Fill, Switch Tile Sync, Toast & Packet Dispatcher
  // ==========================================================================
  function updateRangeFill(input) {
    if (!input) return;
    const min = parseFloat(input.min) || 0;
    const max = parseFloat(input.max) || 100;
    const val = parseFloat(input.value) || 0;
    const pct = Math.max(0, Math.min(100, ((val - min) / Math.max(0.0001, max - min)) * 100));
    input.style.setProperty("--fill", `${pct.toFixed(1)}%`);
  }

  function syncSwitchTile(tileId, checked) {
    const tile = document.getElementById(tileId);
    if (tile) tile.dataset.state = checked ? "on" : "off";
  }

  function showToast(message, isOk = true) {
    const container = document.getElementById("toastContainer");
    if (!container) return;
    const el = document.createElement("div");
    el.className = `toast ${isOk ? "is-ok" : ""}`;
    el.innerHTML = `<span>${message}</span><span style="color:var(--accent);font-family:var(--font-mono);font-size:11px;">${isOk ? "0x02 OK" : "INFO"}</span>`;
    container.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  function getActiveDeviceProfileObj() {
    if (!driverState.profilesByPid) driverState.profilesByPid = {};
    if (!driverState.profilesByPid[selectedPid]) {
      driverState.profilesByPid[selectedPid] = { activeSlot: 1, slots: {} };
    }
    return driverState.profilesByPid[selectedPid];
  }

  function getActiveSlotData() {
    const devProf = getActiveDeviceProfileObj();
    const slotId = devProf.activeSlot || 1;
    if (!devProf.slots[slotId]) devProf.slots[slotId] = { slot: slotId, name: `Slot ${slotId}` };
    return devProf.slots[slotId];
  }

  async function sendPacket90(packet90, label = "Command", slotPatch = null, statePatch = null, forceImmediate = false) {
    if (slotPatch) Object.assign(getActiveSlotData(), slotPatch);
    if (statePatch) Object.assign(driverState, statePatch);

    if (!uiPrefs.instantFlash && !forceImmediate) {
      // Stage in floating Apply Bar
      stagedQueue.push({ productId: selectedPid, packet90, label, slotPatch, statePatch });
      renderPendingApplyBar();
      renderOverviewPanels();
      updateProfileKeyBox();
      return;
    }

    renderProfileSlotBar();
    renderOverviewPanels();

    try {
      const res = await fetch("/api/send-packet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: selectedPid,
          interfaceNum: selectedPid === 193 ? 0 : 3,
          reportId: 0,
          packet90,
          slotPatch,
          statePatch,
        }),
      });
      const data = await res.json();
      if (data.state) driverState = data.state;
      if (data.logItem) prependPacketLog(data.logItem);
      const status = data.parsedRx?.statusName || "OK";
      showToast(`${label} → ${status}`);
      void playUiTone("success");
      updateProfileKeyBox();
      return data;
    } catch (err) {
      showToast(`Error: ${err.message}`, false);
      void playUiTone("error");
    }
  }

  function renderPendingApplyBar() {
    const bar = document.getElementById("pendingApplyBar");
    if (!bar) return;
    if (stagedQueue.length === 0) {
      bar.hidden = true;
      return;
    }
    bar.hidden = false;
    document.getElementById("pendingCountText").textContent =
      `${stagedQueue.length} staged ${stagedQueue.length === 1 ? "change" : "changes"}`;
    document.getElementById("pendingSummaryText").textContent =
      stagedQueue.map((item) => item.label).slice(-3).join(" · ");
  }

  // ==========================================================================
  // 6. Theme & Preferences Management
  // ==========================================================================
  function applyThemeAndPrefs(rePulse = false) {
    const activeTheme = uiPrefs.theme || "venom";
    document.documentElement.setAttribute("data-ws-theme", activeTheme);
    const shell = document.getElementById("wsShell");
    if (shell) {
      shell.setAttribute("data-ws-theme", activeTheme);
      shell.classList.toggle("reduce-interface-motion", !!uiPrefs.reducedMotion);
      shell.classList.toggle("sidebar-collapsed", !!uiPrefs.sidebarCollapsed);
    }
    const sidebar = document.getElementById("wsSidebar");
    if (sidebar) sidebar.classList.toggle("is-collapsed", !!uiPrefs.sidebarCollapsed);

    const chkInstant = document.getElementById("chkInstantFlash");
    if (chkInstant) chkInstant.checked = uiPrefs.instantFlash !== false;
    syncSwitchTile("tileInstantFlash", uiPrefs.instantFlash !== false);

    const chkSounds = document.getElementById("chkUiSounds");
    if (chkSounds) chkSounds.checked = !!uiPrefs.soundsEnabled;
    syncSwitchTile("tileUiSounds", !!uiPrefs.soundsEnabled);

    const chkMotion = document.getElementById("chkReducedMotion");
    if (chkMotion) chkMotion.checked = !!uiPrefs.reducedMotion;
    syncSwitchTile("tileReducedMotion", !!uiPrefs.reducedMotion);

    document.querySelectorAll(".ws-theme-tile").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.wsTheme === activeTheme);
    });

    if (rePulse) renderChromaBackdrop(true);
  }

  async function savePreferences(patch) {
    uiPrefs = { ...uiPrefs, ...patch };
    applyThemeAndPrefs(Boolean(patch.theme));
    try {
      await fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: uiPrefs }),
      });
    } catch {
      // ignore
    }
  }

  function renderThemeGallery() {
    const grid = document.getElementById("themeGalleryGrid");
    if (!grid) return;
    grid.innerHTML = THEME_LIST.map(
      (t) => `
      <button type="button" class="ws-theme-tile ${uiPrefs.theme === t.slug ? "is-active" : ""}" data-ws-theme="${t.slug}">
        <span class="ws-theme-preview" aria-hidden="true">
          <span class="ws-theme-preview-side"></span>
          <span class="ws-theme-preview-main">
            <span class="ws-theme-preview-line is-title"></span>
            <span class="ws-theme-preview-line"></span>
            <span class="ws-theme-preview-sheet">
              <span class="ws-theme-preview-accent"></span>
              <span class="ws-theme-preview-line" style="width:48%"></span>
            </span>
          </span>
        </span>
        <span class="ws-theme-name">${t.name}</span>
      </button>
    `
    ).join("");

    grid.querySelectorAll(".ws-theme-tile").forEach((tile) => {
      tile.addEventListener("click", () => {
        savePreferences({ theme: tile.dataset.wsTheme });
        showToast(`Theme switched to ${tile.querySelector(".ws-theme-name").textContent}`);
      });
    });
  }

  // ==========================================================================
  // 7. Portable Profile Key (RZW1: Base64 Export / Import)
  // ==========================================================================
  function updateProfileKeyBox() {
    const box = document.getElementById("txtProfileKeyExport");
    if (!box) return;
    const payload = {
      v: 1,
      pid: selectedPid,
      slotData: getActiveSlotData(),
    };
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    box.value = `RZW1:${b64}`;
  }

  // ==========================================================================
  // 8. Overview Telemetry Figures & Sparkline Chart
  // ==========================================================================
  function renderOverviewPanels() {
    const isMouse = selectedPid === 193 || selectedPid === 192;
    const slot = getActiveSlotData();
    const devProf = getActiveDeviceProfileObj();
    const slotId = devProf.activeSlot || 1;

    const titleEl = document.getElementById("overviewDeviceTitle");
    const metaEl = document.getElementById("overviewDeviceMeta");
    const figLabel1 = document.getElementById("figLabel1");
    const figVal1 = document.getElementById("figVal1");
    const figUnit1 = document.getElementById("figUnit1");
    const figSub1 = document.getElementById("figSub1");
    const figVal2 = document.getElementById("figVal2");
    const figSub2 = document.getElementById("figSub2");
    const figLabel3 = document.getElementById("figLabel3");
    const figVal3 = document.getElementById("figVal3");
    const figSub3 = document.getElementById("figSub3");
    const figVal4 = document.getElementById("figVal4");
    const figSub4 = document.getElementById("figSub4");
    const chipsLabel = document.getElementById("setupChipsLabel");
    const chipsList = document.getElementById("setupChipsList");

    if (!titleEl) return;

    if (!isMouse) {
      titleEl.textContent = "Razer Huntsman V3 Pro Tenkeyless";
      metaEl.textContent = "Connected · USB Optical Analog · VID 0x1532 · PID 0x02A7 (TxID 0x1F)";
      figLabel1.textContent = "Actuation point";
      figVal1.textContent = Number(slot.actuationMm ?? 1.2).toFixed(1);
      figUnit1.textContent = "mm";
      const overrideCount = Object.keys(slot.perKeyOverrides || {}).length;
      figSub1.textContent = overrideCount > 0 ? `${overrideCount} per-key overrides active` : "Global 87-key optical trigger";

      const hz = Number(slot.pollingHz || 1000);
      figVal2.textContent = hz.toLocaleString();
      figSub2.textContent = `${(1000 / hz).toFixed(2)} ms USB interval`;

      figLabel3.textContent = "Rapid Trigger";
      figVal3.textContent = slot.rtEnabled ? `${Number(slot.rtDownMm ?? 0.3).toFixed(2)} mm` : "Off";
      figSub3.textContent = slot.rtEnabled ? `Upstroke ${Number(slot.rtUpMm ?? 0.3).toFixed(2)} mm` : "Fixed reset point";

      figVal4.textContent = `S${slotId}`;
      figSub4.textContent = slot.name || `Slot ${slotId}`;

      chipsLabel.textContent = "Active features";
      chipsList.innerHTML = [
        `<span class="ws-chip ${slot.rtEnabled ? "is-on" : ""}">Rapid Trigger ${slot.rtEnabled ? "On" : "Off"}</span>`,
        `<span class="ws-chip ${slot.snapTapEnabled ? "is-on" : ""}">Snap Tap (${slot.snapKeyA || "A"}+${slot.snapKeyB || "D"})</span>`,
        `<span class="ws-chip ${slot.gamingMode?.enabled ? "is-on" : ""}">Gaming Mode ${slot.gamingMode?.enabled ? "On" : "Off"}</span>`,
        `<span class="ws-chip is-on">Chroma: ${(slot.lighting?.effect || "static").toUpperCase()}</span>`,
      ].join("");

      // Render analog switch response curve in sparkline
      document.getElementById("sparkPanelTitle").textContent = "Analog switch actuation curve";
      document.getElementById("sparkPanelMeta").textContent = `Trigger at ${Number(slot.actuationMm ?? 1.2).toFixed(1)} mm · RT ${slot.rtEnabled ? "Active" : "Off"}`;
      document.getElementById("sparkAxisStart").textContent = "0.1 mm top of keystroke";
      document.getElementById("sparkAxisEnd").textContent = "4.0 mm bottws-out";
      const actRatio = Math.min(1, Math.max(0.05, (slot.actuationMm ?? 1.2) / 4.0));
      const xTrig = Math.round(actRatio * 600);
      const yTrig = Math.round(80 - actRatio * 62);
      const linePath = `M0,78 L${xTrig},${yTrig} L600,12`;
      const areaPath = `${linePath} L600,86 L0,86 Z`;
      document.getElementById("telemetrySparkLine").setAttribute("d", linePath);
      document.getElementById("telemetrySparkArea").setAttribute("d", areaPath);
    } else {
      titleEl.textContent = "Razer Viper V3 Pro · HyperPolling Wireless";
      metaEl.textContent = "Connected · 8K HyperPolling Dongle · VID 0x1532 · PID 0x00C1 (TxID 0xFF)";
      const stages = slot.dpiStages || [];
      const activeIdx = (slot.activeStageIndex || 3) - 1;
      const activeStage = stages[activeIdx] || stages[0] || { x: 1600, y: 1600 };

      figLabel1.textContent = "Sensitivity";
      figVal1.textContent = activeStage.x === activeStage.y ? activeStage.x.toLocaleString() : `${activeStage.x}/${activeStage.y}`;
      figUnit1.textContent = "DPI";
      figSub1.textContent = `Stage ${activeIdx + 1} of ${stages.filter((s) => s.enabled !== false).length}`;

      const hz = Number(slot.pollingHz || 1000);
      figVal2.textContent = hz.toLocaleString();
      figSub2.textContent = `${(1000 / hz).toFixed(3)} ms wireless interval`;

      const estHours = BATTERY_HOURS_BY_HZ[hz] || 95;
      figLabel3.textContent = "Battery Runtime";
      figVal3.textContent = `~${estHours}h`;
      figSub3.textContent = `Full charge @ ${hz} Hz`;

      figVal4.textContent = `S${slotId}`;
      figSub4.textContent = slot.name || `Slot ${slotId}`;

      chipsLabel.textContent = "DPI stages (click to switch)";
      chipsList.innerHTML = stages
        .map(
          (st, i) =>
            `<button type="button" class="ws-chip ${i === activeIdx ? "is-on" : ""}" data-quick-dpi-stage="${i + 1}">${st.x.toLocaleString()} DPI</button>`
        )
        .join("");

      chipsList.querySelectorAll("[data-quick-dpi-stage]").forEach((btn) => {
        btn.addEventListener("click", () => {
          slot.activeStageIndex = Number(btn.dataset.quickDpiStage);
          renderDpiStagesEditor();
          renderOverviewPanels();
          commitMouseDpiStages();
        });
      });

      // Also populate mouseQuickStageButtons in the mouse SVG hero
      const heroStages = document.getElementById("mouseQuickStageButtons");
      if (heroStages) {
        heroStages.innerHTML = chipsList.innerHTML;
        heroStages.querySelectorAll("[data-quick-dpi-stage]").forEach((btn) => {
          btn.addEventListener("click", () => {
            slot.activeStageIndex = Number(btn.dataset.quickDpiStage);
            renderDpiStagesEditor();
            renderOverviewPanels();
            commitMouseDpiStages();
          });
        });
      }

      document.getElementById("sparkPanelTitle").textContent = "Wireless battery discharge curve";
      document.getElementById("sparkPanelMeta").textContent = `Estimated ~${estHours}h runtime at ${hz.toLocaleString()} Hz`;
      document.getElementById("sparkAxisStart").textContent = "100% full charge";
      document.getElementById("sparkAxisEnd").textContent = `${estHours}h @ ${hz} Hz`;
      const slope = Math.min(76, Math.round((8000 / Math.max(125, hz)) * 8 + 38));
      const linePath = `M0,12 L200,${Math.round(12 + slope * 0.32)} L400,${Math.round(12 + slope * 0.66)} L600,${Math.min(82, 86 - Math.round(slope * 0.25))}`;
      const areaPath = `${linePath} L600,86 L0,86 Z`;
      document.getElementById("telemetrySparkLine").setAttribute("d", linePath);
      document.getElementById("telemetrySparkArea").setAttribute("d", areaPath);
    }
  }

  // ==========================================================================
  // 9. Sidebar Devices List & Devices Shelf View
  // ==========================================================================
  function renderDeviceTabs() {
    const container = document.getElementById("deviceTabs");
    if (!container) return;
    container.innerHTML = "";

    devices.forEach((dev) => {
      const isKbd = dev.category === "keyboard" || dev.productId === 679;
      const active = Number(dev.productId) === Number(selectedPid);
      const devProf = driverState.profilesByPid?.[dev.productId];
      const slotNum = devProf?.activeSlot || 1;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `ws-side-device ${active ? "is-active" : ""}`;
      btn.innerHTML = `
        <span class="ws-side-device-art">
          <span>${isKbd ? "⌨️" : "🖱️"}</span>
          <span class="ws-side-device-live"></span>
        </span>
        <span class="ws-side-device-text">
          <span class="ws-side-device-name">${isKbd ? "Huntsman V3 Pro TKL" : "Viper V3 Pro"}</span>
          <span class="ws-side-device-sub">
            <span>Slot S${slotNum}</span>
            <span>·</span>
            <span>${isKbd ? "Optical" : "8K Wireless"}</span>
          </span>
        </span>
      `;
      btn.addEventListener("click", () => {
        selectedPid = Number(dev.productId);
        driverState.selectedPid = selectedPid;
        switchMainView("workspace");
        renderDeviceTabs();
        renderProfileSlotBar();
        syncControlsFromSlot();
        renderOverviewPanels();
      });
      container.appendChild(btn);
    });

    const countBadge = document.getElementById("navDeviceCount");
    if (countBadge) countBadge.textContent = String(devices.length);
    renderDevicesShelf();
  }

  function renderDevicesShelf() {
    const grid = document.getElementById("devicesShelfGrid");
    if (!grid) return;
    grid.innerHTML = devices
      .map((dev) => {
        const isKbd = dev.category === "keyboard" || dev.productId === 679;
        const devProf = driverState.profilesByPid?.[dev.productId];
        const slotNum = devProf?.activeSlot || 1;
        const slot = devProf?.slots?.[slotNum] || {};
        return `
        <article class="ws-device-block">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
            <strong style="font-size:16px;font-weight:650;">${dev.productName}</strong>
            <span class="ws-badge is-ok"><span class="ws-dot is-ok"></span>Connected</span>
          </div>
          <span class="ws-meta">Razer · ${isKbd ? "Analog Optical Keyboard" : "HyperPolling Wireless Mouse"} · PID 0x${Number(dev.productId).toString(16).toUpperCase().padStart(4, "0")}</span>
          <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:12px;color:var(--text-2);font-variant-numeric:tabular-nums;">
            <span><b>Slot S${slotNum}</b> (${slot.name || "Default"})</span>
            <span>·</span>
            <span><b>${slot.pollingHz || 1000} Hz</b></span>
            <span>·</span>
            <span><b>${isKbd ? `${Number(slot.actuationMm ?? 1.2).toFixed(1)} mm` : `${slot.dpiStages?.[(slot.activeStageIndex || 3) - 1]?.x || 1600} DPI`}</b></span>
          </div>
          <div class="ws-device-block-art">
            <div style="font-size:56px;">${isKbd ? "⌨️" : "🖱️"}</div>
          </div>
          <button type="button" class="ws-btn is-primary" data-shelf-open-pid="${dev.productId}" style="width:100%;">
            Configure ${isKbd ? "Huntsman V3 Pro TKL" : "Viper V3 Pro"}
          </button>
        </article>
      `;
      })
      .join("");

    grid.querySelectorAll("[data-shelf-open-pid]").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedPid = Number(btn.dataset.shelfOpenPid);
        driverState.selectedPid = selectedPid;
        switchMainView("workspace");
        renderDeviceTabs();
        renderProfileSlotBar();
        syncControlsFromSlot();
        renderOverviewPanels();
      });
    });
  }

  function switchMainView(viewName) {
    document.querySelectorAll("[data-main-view]").forEach((b) => {
      b.classList.toggle("is-active", b.dataset.mainView === viewName);
    });
    document.getElementById("viewWorkspace").hidden = viewName !== "workspace";
    document.getElementById("viewShelf").hidden = viewName !== "shelf";
    document.getElementById("viewHardwareTest").hidden = viewName !== "hwtest";
    document.getElementById("viewSettings").hidden = viewName !== "settings";
    if (viewName === "settings") updateProfileKeyBox();
  }

  // ==========================================================================
  // 10. Onboard Profile Slots Bar (S1..S6) & Preset Highlight Sync
  // ==========================================================================
  function renderProfileSlotBar() {
    const bar = document.getElementById("profileSlotBar");
    const nameTag = document.getElementById("activeProfileNameTag");
    if (!bar) return;

    const isMouse = selectedPid === 193 || selectedPid === 192;
    const maxSlots = isMouse ? 5 : 6;
    const devProf = getActiveDeviceProfileObj();
    const activeSlot = Number(devProf.activeSlot || 1);

    bar.innerHTML = "";
    for (let i = 1; i <= maxSlots; i++) {
      const sData = devProf.slots?.[i] || { name: `Slot ${i}`, ledColor: "#5dde89" };
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `slot-pill ${i === activeSlot ? "active" : ""}`;
      btn.title = `Onboard Slot ${i}: ${sData.name || `Slot ${i}`}`;
      btn.innerHTML = `
        <span class="slot-led" style="--slot-color: ${sData.ledColor || "#5dde89"}"></span>
        <span>S${i}</span>
      `;
      btn.addEventListener("click", () => switchProfileSlot(i));
      bar.appendChild(btn);
    }

    const activeData = getActiveSlotData();
    if (nameTag) {
      nameTag.textContent = `Slot ${activeSlot} · ${activeData.name || "Custom Profile"}`;
    }
  }

  async function switchProfileSlot(slotId) {
    selectedKeys.clear();
    syncToolbarSelectionChips("all");

    try {
      const res = await fetch("/api/profile-slot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "switch", productId: selectedPid, slotId }),
      });
      const data = await res.json();
      if (data.state) driverState = data.state;
      renderDeviceTabs();
      renderProfileSlotBar();
      syncControlsFromSlot();
      renderOverviewPanels();
      updateProfileKeyBox();
      const sData = getActiveSlotData();
      showToast(`Switched to Onboard Slot ${slotId} (${sData.name})`);
      void playUiTone("info");
    } catch (err) {
      showToast(`Slot switch error: ${err.message}`, false);
    }
  }

  function updateActuationPresetHighlight(actMm, rtEnabled) {
    const numAct = Number(actMm);
    let matchedPreset = null;
    if (Math.abs(numAct - 1.2) < 0.05) {
      matchedPreset = "balanced";
    } else if (Math.abs(numAct - 0.4) < 0.05 && rtEnabled !== false) {
      matchedPreset = "esports";
    } else if (Math.abs(numAct - 2.0) < 0.05 && !rtEnabled) {
      matchedPreset = "typing";
    }
    document.querySelectorAll("[data-act-preset]").forEach((b) => {
      b.classList.toggle("active", b.dataset.actPreset === matchedPreset);
    });
  }

  // ==========================================================================
  // 11. Keyboard Matrix & Synchronize All Controls From Active Slot
  // ==========================================================================
  function updateChromaVisuals() {
    const container = document.getElementById("keyboardMatrix");
    if (!container) return;
    const slot = getActiveSlotData();
    const light = slot.lighting || { effect: "static", color1: "#00e676", color2: "#00d2ff", brightness: 100 };
    const eff = light.effect || "static";
    const brPct = Math.max(0, Math.min(100, Number(light.brightness ?? 100)));
    const hex = light.color1 || "#00e676";
    const num = parseInt(hex.replace("#", ""), 16) || 0x00e676;
    const r = (num >> 16) & 0xff;
    const g = (num >> 8) & 0xff;
    const b = num & 0xff;
    const hex2 = light.color2 || "#00d2ff";
    const num2 = parseInt(hex2.replace("#", ""), 16) || 0x00d2ff;
    const r2 = (num2 >> 16) & 0xff;
    const g2 = (num2 >> 8) & 0xff;
    const b2 = num2 & 0xff;
    const scale = eff === "off" ? 0 : brPct / 100;

    container.dataset.chromaEffect = eff;
    container.style.setProperty("--key-color-2", `rgba(${r2}, ${g2}, ${b2}, ${Math.max(0.35, scale).toFixed(2)})`);
    if (eff === "off" || scale <= 0.01) {
      container.style.setProperty("--key-color", "#6e7785");
      container.style.setProperty("--key-glow", "transparent");
      container.style.setProperty("--kbd-glow", "transparent");
    } else if (eff === "reactive" || eff === "ripple") {
      container.style.setProperty("--key-color", `rgba(${r}, ${g}, ${b}, 0.28)`);
      container.style.setProperty("--key-glow", "transparent");
      container.style.setProperty("--kbd-glow", "transparent");
      container.style.setProperty("--reactive-color", `rgba(${r}, ${g}, ${b}, 1)`);
      container.style.setProperty("--reactive-glow", `rgba(${r}, ${g}, ${b}, 0.55)`);
    } else {
      const keyAlpha = Math.max(0.35, scale).toFixed(2);
      const glowAlpha = (0.24 * scale).toFixed(2);
      const chassisAlpha = (0.22 * scale).toFixed(2);
      container.style.setProperty("--key-color", `rgba(${r}, ${g}, ${b}, ${keyAlpha})`);
      container.style.setProperty("--key-glow", `rgba(${r}, ${g}, ${b}, ${glowAlpha})`);
      container.style.setProperty("--kbd-glow", `rgba(${r}, ${g}, ${b}, ${chassisAlpha})`);
    }
  }

  function renderKeyboardMatrix() {
    const container = document.getElementById("keyboardMatrix");
    if (!container) return;

    if (!container.dataset.built) {
      container.innerHTML = "";
      TKL_ROWS.forEach((row, rowIdx) => {
        const rowEl = document.createElement("div");
        rowEl.className = "kbd-row";
        row.forEach((k, colIdx) => {
          if (k.spacer) {
            const sp = document.createElement("div");
            sp.className = "kbd-spacer";
            rowEl.appendChild(sp);
            return;
          }
          const keyEl = document.createElement("button");
          keyEl.type = "button";
          keyEl.className = "keycap";
          keyEl.style.setProperty("--col-idx", String(colIdx));
          keyEl.style.setProperty("--row-idx", String(rowIdx));
          if (k.w && k.w !== 1) keyEl.style.width = `${Math.round(k.w * 44 + (k.w - 1) * 5)}px`;
          if (k.hidden) {
            keyEl.style.visibility = "hidden";
            rowEl.appendChild(keyEl);
            return;
          }

          const keyId = k.label;
          keyEl.dataset.key = keyId;
          keyEl.innerHTML = `
            <span class="keycap-label">${keyId}</span>
            <span class="keycap-meta">
              <span class="keycap-act-val">1.2</span>
              <span class="keycap-rt-dot" hidden>RT</span>
            </span>
          `;

          keyEl.addEventListener("click", (ev) => {
            const slot = getActiveSlotData();
            if (ev.ctrlKey || ev.metaKey || ev.shiftKey) {
              if (selectedKeys.has(keyId)) selectedKeys.delete(keyId);
              else selectedKeys.add(keyId);
            } else {
              if (selectedKeys.size === 1 && selectedKeys.has(keyId)) selectedKeys.clear();
              else {
                selectedKeys.clear();
                selectedKeys.add(keyId);
              }
            }
            focusedRemapKey = keyId;
            const remapIn = document.getElementById("txtRemapTargetKey");
            if (remapIn) remapIn.value = keyId;
            syncRemapControlsForFocusedKey();

            const singleKey = selectedKeys.size === 1 ? Array.from(selectedKeys)[0] : null;
            const keyOv = singleKey ? slot.perKeyOverrides?.[singleKey] : null;
            const displayAct = keyOv ? keyOv.act : (slot.actuationMm ?? 1.2);
            const displayRt = keyOv ? !!keyOv.rt : !!slot.rtEnabled;
            const displayDown = keyOv ? keyOv.down : (slot.rtDownMm ?? 0.3);
            const displayUp = keyOv ? keyOv.up : (slot.rtUpMm ?? 0.3);

            const rngAct = document.getElementById("rngActuation");
            if (rngAct) {
              rngAct.value = displayAct;
              updateRangeFill(rngAct);
              updateActuationVisuals(displayAct);
            }
            const chkRt = document.getElementById("chkRapidTrigger");
            if (chkRt) chkRt.checked = displayRt;
            syncSwitchTile("tileRtEnable", displayRt);

            const rngDown = document.getElementById("rngRtDown");
            if (rngDown) {
              rngDown.value = displayDown;
              updateRangeFill(rngDown);
              document.getElementById("valRtDown").textContent = `${Number(displayDown).toFixed(2)} mm`;
              document.getElementById("valRtDownText").textContent = `${Number(displayDown).toFixed(2)} mm`;
            }
            const rngUp = document.getElementById("rngRtUp");
            if (rngUp) {
              rngUp.value = displayUp;
              updateRangeFill(rngUp);
              document.getElementById("valRtUp").textContent = `${Number(displayUp).toFixed(2)} mm`;
            }
            updateActuationPresetHighlight(displayAct, displayRt);
            updateSelectionScopeBadge();
            renderKeyboardMatrix();
          });

          rowEl.appendChild(keyEl);
        });
        container.appendChild(rowEl);
      });
      container.dataset.built = "true";
    }

    updateChromaVisuals();

    const slot = getActiveSlotData();
    const globalAct = Number(slot.actuationMm ?? 1.2).toFixed(1);
    const globalRt = !!slot.rtEnabled;
    const overrides = slot.perKeyOverrides || {};
    const snapOn = !!slot.snapTapEnabled;
    const snapA = slot.snapKeyA || "A";
    const snapB = slot.snapKeyB || "D";
    const bindings = slot.keyBindings?.[kbdActiveLayer] || {};

    container.querySelectorAll(".keycap[data-key]").forEach((keyEl) => {
      const keyId = keyEl.dataset.key;
      const ov = overrides[keyId];
      const actVal = ov ? Number(ov.act).toFixed(1) : globalAct;
      const rtVal = ov ? !!ov.rt : globalRt;
      const boundFunc = bindings[keyId];

      keyEl.classList.toggle("selected", selectedKeys.has(keyId));
      keyEl.classList.toggle("has-override", !!ov);
      keyEl.classList.toggle("snap-key", snapOn && (keyId === snapA || keyId === snapB));
      keyEl.classList.toggle("remapped-key", !!(boundFunc && boundFunc !== "Default"));

      const actEl = keyEl.querySelector(".keycap-act-val");
      if (actEl && actEl.textContent !== actVal) actEl.textContent = actVal;
      const rtEl = keyEl.querySelector(".keycap-rt-dot");
      if (rtEl) rtEl.hidden = !rtVal;
    });
  }

  function updateSelectionScopeBadge() {
    const badge = document.getElementById("selectionScopeBadge");
    const clearBtn = document.getElementById("btnClearKeyOverride");
    const slot = getActiveSlotData();
    if (!badge) return;
    if (selectedKeys.size === 0) {
      badge.textContent = "Scope: All 87 keys (Global)";
      if (clearBtn) clearBtn.hidden = true;
    } else {
      const list = Array.from(selectedKeys);
      badge.textContent = `Scope: ${list.length} key(s) (${list.slice(0, 5).join(", ")}${list.length > 5 ? "…" : ""})`;
      const anyOverride = list.some((k) => slot.perKeyOverrides && slot.perKeyOverrides[k]);
      if (clearBtn) clearBtn.hidden = !anyOverride;
    }
  }

  function syncToolbarSelectionChips(mode) {
    document.querySelectorAll("[data-select-keys]").forEach((b) => {
      b.classList.toggle("active", b.dataset.selectKeys === mode);
    });
  }

  function updateActuationVisuals(mm) {
    const num = Number(mm);
    const valEl = document.getElementById("valActuation");
    const badgeEl = document.getElementById("badgeActuation");
    const fillEl = document.getElementById("stemFill");
    const lineEl = document.getElementById("stemActuationLine");
    if (valEl) valEl.textContent = `${num.toFixed(1)} mm`;
    if (badgeEl) badgeEl.textContent = `${num.toFixed(1)} mm`;
    const pct = Math.min(100, Math.max(4, (num / 4.0) * 100));
    if (fillEl) fillEl.style.height = `${pct}%`;
    if (lineEl) lineEl.style.top = `${pct}%`;
  }

  function syncRemapControlsForFocusedKey() {
    const slot = getActiveSlotData();
    const map = slot.keyBindings?.[kbdActiveLayer] || {};
    const current = map[focusedRemapKey] || "Default";
    const sel = document.getElementById("selKeyFunction");
    if (sel) sel.value = current;
  }

  function syncControlsFromSlot() {
    const isMouse = selectedPid === 193 || selectedPid === 192;
    document.getElementById("keyboardStageWrap").hidden = isMouse;
    document.getElementById("kbdTabNav").hidden = isMouse;
    document.getElementById("kbdPanelsWrap").hidden = isMouse;

    document.getElementById("mouseStageWrap").hidden = !isMouse;
    document.getElementById("mouseTabNav").hidden = !isMouse;
    document.getElementById("mousePanelsWrap").hidden = !isMouse;

    const slot = getActiveSlotData();

    if (!isMouse) {
      const actMm = slot.actuationMm ?? 1.2;
      const rngAct = document.getElementById("rngActuation");
      if (rngAct) {
        rngAct.value = actMm;
        updateRangeFill(rngAct);
        updateActuationVisuals(actMm);
      }

      const chkRt = document.getElementById("chkRapidTrigger");
      if (chkRt) chkRt.checked = !!slot.rtEnabled;
      syncSwitchTile("tileRtEnable", !!slot.rtEnabled);
      updateActuationPresetHighlight(actMm, !!slot.rtEnabled);

      const chkCont = document.getElementById("chkContinuousRt");
      if (chkCont) chkCont.checked = slot.continuousRt !== false;
      syncSwitchTile("tileRtContinuous", slot.continuousRt !== false);

      const rngDown = document.getElementById("rngRtDown");
      if (rngDown) {
        rngDown.value = slot.rtDownMm ?? 0.3;
        updateRangeFill(rngDown);
        document.getElementById("valRtDown").textContent = `${Number(rngDown.value).toFixed(2)} mm`;
        document.getElementById("valRtDownText").textContent = `${Number(rngDown.value).toFixed(2)} mm`;
      }
      const rngUp = document.getElementById("rngRtUp");
      if (rngUp) {
        rngUp.value = slot.rtUpMm ?? 0.3;
        updateRangeFill(rngUp);
        document.getElementById("valRtUp").textContent = `${Number(rngUp.value).toFixed(2)} mm`;
      }

      const chkSnap = document.getElementById("chkSnapTap");
      if (chkSnap) chkSnap.checked = !!slot.snapTapEnabled;
      syncSwitchTile("tileSnapTap", !!slot.snapTapEnabled);
      document.getElementById("selSnapKeyA").value = slot.snapKeyA || "A";
      document.getElementById("selSnapKeyB").value = slot.snapKeyB || "D";

      const gm = slot.gamingMode || { enabled: false, disableWin: true, disableAltTab: false, disableAltF4: false };
      document.getElementById("chkGamingMode").checked = !!gm.enabled;
      syncSwitchTile("tileGamingMode", !!gm.enabled);
      document.getElementById("chkDisableWin").checked = gm.disableWin !== false;
      syncSwitchTile("tileDisableWin", gm.disableWin !== false);
      document.getElementById("chkDisableAltTab").checked = !!gm.disableAltTab;
      syncSwitchTile("tileDisableAltTab", !!gm.disableAltTab);
      document.getElementById("chkDisableAltF4").checked = !!gm.disableAltF4;
      syncSwitchTile("tileDisableAltF4", !!gm.disableAltF4);

      const light = slot.lighting || { effect: "static", color1: "#00e676", brightness: 100, speed: 2, waveDirection: 1 };
      const rngBr = document.getElementById("rngBrightness");
      if (rngBr) {
        rngBr.value = light.brightness ?? 100;
        updateRangeFill(rngBr);
        document.getElementById("valBrightness").textContent = `${rngBr.value}%`;
        document.getElementById("valBrightnessOut").textContent = `${rngBr.value}%`;
      }
      document.getElementById("inpChromaColor").value = light.color1 || "#00e676";
      const inpColor2 = document.getElementById("inpChromaColor2");
      if (inpColor2) inpColor2.value = light.color2 || "#00d2ff";
      document.querySelectorAll("#effectGrid .preset-btn").forEach((b) => {
        b.classList.toggle("active", b.dataset.effect === (light.effect || "static"));
      });
      document.querySelectorAll("#swatchRow .swatch").forEach((s) => {
        s.classList.toggle("active", (s.dataset.color || "").toLowerCase() === (light.color1 || "#00e676").toLowerCase());
      });
      document.querySelectorAll("#chromaDirGroup [data-chroma-dir]").forEach((b) => {
        b.classList.toggle("active", Number(b.dataset.chromaDir) === Number(light.waveDirection || 1));
      });
      document.querySelectorAll("#chromaSpeedGroup [data-chroma-speed]").forEach((b) => {
        b.classList.toggle("active", Number(b.dataset.chromaSpeed) === Number(light.speed || 2));
      });

      const kbdHz = Number(slot.pollingHz || 1000);
      document.getElementById("kbdPollingFigure").textContent = `${kbdHz} Hz`;
      document.querySelectorAll("[data-kbd-hz]").forEach((b) => {
        const on = Number(b.dataset.kbdHz) === kbdHz;
        b.classList.toggle("active", on);
        b.classList.toggle("is-on", on);
      });

      syncRemapControlsForFocusedKey();
      updateSelectionScopeBadge();
      renderKeyboardMatrix();
    } else {
      // Mouse controls
      document.getElementById("chkIndependentXY").checked = !!slot.independentXY;
      renderDpiStagesEditor();

      const hz = Number(slot.pollingHz || 1000);
      document.getElementById("mousePollingFigure").textContent = `${hz} Hz`;
      document.querySelectorAll("#mousePollingGroup .poll-pill").forEach((b) => {
        const on = Number(b.dataset.hz) === hz;
        b.classList.toggle("active", on);
        b.classList.toggle("is-on", on);
      });
      const estHours = BATTERY_HOURS_BY_HZ[hz] || 95;
      document.getElementById("mouseBatteryEstimateNote").textContent =
        `Estimated battery life at ${hz.toLocaleString()} Hz: ~${estHours} hours`;

      const st = slot.smartTracking || { asymmetric: false, symmetricLevel: 1, liftOffLevel: 14, landingLevel: 10 };
      document.getElementById("chkAsymLod").checked = !!st.asymmetric;
      document.getElementById("symLodWrap").hidden = !!st.asymmetric;
      document.getElementById("asymLodWrap").hidden = !st.asymmetric;
      document.querySelectorAll("#symLodGroup .preset-btn").forEach((b) => {
        const on = Number(b.dataset.lod) === Number(st.symmetricLevel || 1);
        b.classList.toggle("active", on);
        b.classList.toggle("selected", on);
      });

      const rngLo = document.getElementById("rngLiftOff");
      const rngLa = document.getElementById("rngLanding");
      if (rngLo) {
        rngLo.value = st.liftOffLevel ?? 14;
        updateRangeFill(rngLo);
        document.getElementById("valLiftOff").textContent = `${rngLo.value} / 26`;
      }
      if (rngLa) {
        const clampedLa = Math.min(st.landingLevel ?? 10, Math.max(1, (st.liftOffLevel ?? 14) - 1));
        rngLa.value = clampedLa;
        updateRangeFill(rngLa);
        document.getElementById("valLanding").textContent = `${clampedLa} / 25`;
      }

      const rngAng = document.getElementById("rngSensorAngle");
      if (rngAng) {
        rngAng.value = slot.sensorAngle ?? 0;
        updateRangeFill(rngAng);
        document.getElementById("valSensorAngle").textContent = `${rngAng.value}°`;
      }
      document.getElementById("selDynSens").value = String(slot.dynamicSensitivity ?? 0);

      const ps = slot.powerSaving || { idleMinutes: 5, lowPowerPercent: 15 };
      const rngIdle = document.getElementById("rngIdleSleep");
      if (rngIdle) {
        rngIdle.value = ps.idleMinutes ?? 5;
        updateRangeFill(rngIdle);
        document.getElementById("valIdleSleep").textContent = `${rngIdle.value} min`;
      }
      const rngLp = document.getElementById("rngLowPower");
      if (rngLp) {
        rngLp.value = ps.lowPowerPercent ?? 15;
        updateRangeFill(rngLp);
        document.getElementById("valLowPower").textContent = `${rngLp.value}%`;
      }

      renderMouseButtonsList();
    }
  }

  // ==========================================================================
  // 12. 5-Stage DPI Table Editor (with X/Y Link/Unlink per stage)
  // ==========================================================================
  function renderDpiStagesEditor() {
    const container = document.getElementById("dpiStagesContainer");
    if (!container) return;
    const slot = getActiveSlotData();
    const showXY = !!slot.independentXY;
    const stages = slot.dpiStages || [
      { stage: 1, enabled: true, x: 400, y: 400, color: "#ff5252" },
      { stage: 2, enabled: true, x: 800, y: 800, color: "#40c4ff" },
      { stage: 3, enabled: true, x: 1600, y: 1600, color: "#00e676" },
      { stage: 4, enabled: true, x: 3200, y: 3200, color: "#ffd740" },
      { stage: 5, enabled: true, x: 6400, y: 6400, color: "#e040fb" },
    ];
    slot.dpiStages = stages;
    const activeIdx = Number(slot.activeStageIndex || 3);

    container.innerHTML = "";
    stages.forEach((st, idx) => {
      const stageNum = idx + 1;
      const isActive = stageNum === activeIdx;
      const unlinked = showXY || st.x !== st.y;
      const row = document.createElement("div");
      row.className = `dpi-editor-row ${isActive ? "is-active" : ""}`;
      if (!unlinked) {
        row.style.gridTemplateColumns = "28px 46px 86px minmax(0, 1fr)";
      }

      const pct = Math.max(0, Math.min(100, ((st.x - 100) / (35000 - 100)) * 100)).toFixed(1);

      row.innerHTML = `
        <input type="checkbox" class="dpi-enable-chk" ${st.enabled !== false ? "checked" : ""} title="Enable Stage ${stageNum}" />
        <button type="button" class="dpi-editor-index" title="Click to set Stage ${stageNum} active">
          <span class="dpi-stage-swatch" style="background:${st.color || "#00e676"}"></span>
          <span>0${stageNum}</span>
        </button>
        <input type="number" class="dpi-axis-input dpi-x-in" min="100" max="35000" step="50" value="${st.x}" title="X Axis DPI" />
        ${
          unlinked
            ? `<button type="button" class="dpi-axis-lock is-unlinked" title="Link X & Y axes">⛓</button>
               <input type="number" class="dpi-axis-input dpi-y-in" min="100" max="35000" step="50" value="${st.y}" title="Y Axis DPI" />`
            : ""
        }
        <input type="range" class="dpi-row-rng" min="100" max="35000" step="50" value="${st.x}" style="--fill:${pct}%" />
      `;

      row.querySelector(".dpi-editor-index").addEventListener("click", () => {
        slot.activeStageIndex = stageNum;
        renderDpiStagesEditor();
        renderOverviewPanels();
      });

      row.querySelector(".dpi-enable-chk").addEventListener("change", (ev) => {
        st.enabled = ev.target.checked;
      });

      const xIn = row.querySelector(".dpi-x-in");
      const yIn = row.querySelector(".dpi-y-in");
      const rng = row.querySelector(".dpi-row-rng");
      const lockBtn = row.querySelector(".dpi-axis-lock");

      if (lockBtn) {
        lockBtn.addEventListener("click", () => {
          st.y = st.x;
          slot.independentXY = false;
          document.getElementById("chkIndependentXY").checked = false;
          renderDpiStagesEditor();
        });
      }

      rng.addEventListener("input", () => {
        st.x = Number(rng.value);
        xIn.value = st.x;
        if (!unlinked) st.y = st.x;
        else if (yIn && !slot.independentXY) {
          st.y = st.x;
          yIn.value = st.y;
        }
        updateRangeFill(rng);
      });

      xIn.addEventListener("change", () => {
        st.x = Math.min(35000, Math.max(100, Number(xIn.value) || 800));
        xIn.value = st.x;
        rng.value = st.x;
        updateRangeFill(rng);
        if (!unlinked) st.y = st.x;
      });

      if (yIn) {
        yIn.addEventListener("change", () => {
          st.y = Math.min(35000, Math.max(100, Number(yIn.value) || st.x));
          yIn.value = st.y;
        });
      }

      container.appendChild(row);
    });

    const activeStage = stages[activeIdx - 1] || stages[0];
    const badge = document.getElementById("mouseActiveStageBadge");
    if (badge && activeStage) {
      badge.textContent = `${activeStage.x} DPI (Stage ${activeIdx})`;
    }
  }

  function commitMouseDpiStages() {
    const slot = getActiveSlotData();
    const pkt = Protocol25.Builders.setDpiStages(slot.dpiStages, slot.activeStageIndex || 3);
    sendPacket90(pkt, `DPI Stages (Active Stage ${slot.activeStageIndex || 3})`, {
      dpiStages: slot.dpiStages,
      activeStageIndex: slot.activeStageIndex,
      independentXY: slot.independentXY,
    });
  }

  function renderMouseButtonsList() {
    const container = document.getElementById("mouseButtonsList");
    if (!container) return;
    const slot = getActiveSlotData();
    if (!slot.buttonBindings) slot.buttonBindings = { standard: {}, hypershift: {} };
    const layerMap = slot.buttonBindings[mouseActiveLayer] || {};

    container.innerHTML = "";
    MOUSE_BUTTON_META.forEach((btnMeta) => {
      const curr = layerMap[btnMeta.id] || "Default";
      const row = document.createElement("div");
      row.className = "setting-card";
      row.style.padding = "12px";
      row.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
          <div>
            <strong style="font-size:13px;">${btnMeta.name}</strong>
            <div class="ws-meta">Layer: ${mouseActiveLayer === "hypershift" ? "⚡ Hypershift" : "Standard"}</div>
          </div>
          <select class="mouse-btn-sel" data-btn-id="${btnMeta.id}">
            ${MOUSE_FUNCTIONS.map((fn) => `<option value="${fn}" ${fn === curr ? "selected" : ""}>${fn}</option>`).join("")}
          </select>
        </div>
      `;
      row.querySelector("select").addEventListener("change", (ev) => {
        const val = ev.target.value;
        slot.buttonBindings[mouseActiveLayer][btnMeta.id] = val;
        const btnIdx = MOUSE_BUTTON_META.findIndex((b) => b.id === btnMeta.id) + 1;
        const pkt = Protocol25.Builders.setMouseButtonBinding({
          slotId: getActiveDeviceProfileObj().activeSlot || 1,
          buttonIndex: btnIdx,
          isHypershift: mouseActiveLayer === "hypershift",
          functionId: MOUSE_FUNCTIONS.indexOf(val) + 1,
        });
        sendPacket90(pkt, `Mouse ${btnMeta.id} (${mouseActiveLayer}) → ${val}`, {
          buttonBindings: slot.buttonBindings,
        });
      });
      container.appendChild(row);
    });
  }

  // ==========================================================================
  // 13. Hardware Diagnostic Suite & Live USB Pointer Rate Analyzer
  // ==========================================================================
  function analyzePointerRates(deltasMs, windowMs) {
    const valid = deltasMs.filter((dt) => dt > 0.04 && dt <= 500);
    const count = valid.length;
    if (count < 3) {
      return { avgHz: 0, peakHz: 0, low5Hz: 0, jitter: 0, stability: 0, dropouts: 0, events: 0 };
    }
    let totalMs = 0;
    for (let i = 0; i < count; i++) totalMs += valid[i];
    const meanDt = totalMs / count;
    const meanHz = 1000 / meanDt;

    let varianceAcc = 0;
    let gapCount = 0;
    const gapThreshold = meanDt * 2.4;
    for (let i = 0; i < count; i++) {
      const diff = valid[i] - meanDt;
      varianceAcc += diff * diff;
      if (valid[i] > gapThreshold) gapCount++;
    }
    const stdDevDt = Math.sqrt(varianceAcc / count);
    const cvRatio = Math.min(1, stdDevDt / Math.max(0.05, meanDt));
    const consistency = Math.max(0, Math.min(100, (1 - cvRatio * 0.65) * 100));

    const orderedRates = valid.map((dt) => 1000 / dt).sort((a, b) => a - b);
    const p05Rate = orderedRates[Math.max(0, Math.floor(count * 0.05))] || 0;
    const p95Rate = orderedRates[Math.min(count - 1, Math.floor(count * 0.95))] || meanHz;

    return {
      avgHz: Math.round(meanHz),
      peakHz: Math.round(Math.min(p95Rate, meanHz * 1.15)),
      low5Hz: Math.round(p05Rate),
      jitter: Number((100 - consistency).toFixed(1)),
      stability: Number(consistency.toFixed(1)),
      dropouts: gapCount,
      events: count,
      durationSec: Number((windowMs / 1000).toFixed(2)),
    };
  }

  async function runLivePointerSample(durationMs = 5000) {
    const progressBar = document.getElementById("testSampleProgressBar");
    const intervals = [];
    let lastT = 0;

    const onMove = (event) => {
      const subs =
        typeof event.getCoalescedEvents === "function" && event.getCoalescedEvents().length > 0
          ? event.getCoalescedEvents()
          : [event];
      for (const ev of subs) {
        if (lastT > 0) {
          const delta = ev.timeStamp - lastT;
          if (delta >= 0.05 && delta <= 1000) {
            intervals.push(delta);
          }
        }
        lastT = ev.timeStamp;
      }
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    const start = performance.now();

    while (performance.now() - start < durationMs) {
      const elapsed = performance.now() - start;
      if (progressBar) progressBar.style.width = `${Math.min(100, (elapsed / durationMs) * 100).toFixed(1)}%`;
      if (intervals.length >= 4) {
        const live = analyzePointerRates(intervals, elapsed);
        document.getElementById("testAvgHz").textContent = live.avgHz.toLocaleString();
        document.getElementById("testEventsCount").textContent = `${live.events.toLocaleString()} coalesced events`;
        document.getElementById("testPeakLowHz").textContent = `${live.peakHz} / ${live.low5Hz} Hz`;
        document.getElementById("testStability").textContent = String(live.stability);
        document.getElementById("testJitterMeta").textContent = `Jitter: ${live.jitter}%`;
        document.getElementById("testDropouts").textContent = String(live.dropouts);
      }
      await new Promise((r) => setTimeout(r, 120));
    }

    window.removeEventListener("pointermove", onMove);
    if (progressBar) progressBar.style.width = "100%";
    return analyzePointerRates(intervals, durationMs);
  }

  async function runFullHardwareTestSuite() {
    const btn = document.getElementById("btnRunHardwareTest");
    const dlBtn = document.getElementById("btnDownloadTestReport");
    const listEl = document.getElementById("hardwareTestStagesList");
    const badge = document.getElementById("hwTestVerdictBadge");
    if (!listEl) return;

    btn.disabled = true;
    dlBtn.disabled = true;
    badge.textContent = "Running…";
    badge.className = "ws-badge is-accent";
    listEl.innerHTML = "";

    const renderStageRow = (idx, label, detail, state) => `
      <div class="hardware-test-stage ${state}">
        <span style="font-weight:700;color:var(--text-3);">${idx}</span>
        <div>
          <div style="font-weight:600;">${label}</div>
          <div class="ws-meta">${detail || ""}</div>
        </div>
        <span class="hw-stage-badge">${state.toUpperCase()}</span>
      </div>
    `;

    try {
      // 1. Run backend Protocol 25 checks
      const res = await fetch("/api/hardware-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: selectedPid }),
      });
      const hwData = await res.json();
      const stages = [...(hwData.checks || [])];

      listEl.innerHTML = stages.map((c, i) => renderStageRow(i + 1, c.label, c.detail, c.status)).join("");

      // 2. Run 5s interactive pointer polling sample
      listEl.innerHTML += renderStageRow(
        stages.length + 1,
        "Live pointer polling rate sampling (5 seconds)",
        "Move your mouse in continuous circles inside the window now…",
        "running"
      );

      const sampleStats = await runLivePointerSample(5000);
      const samplePass = sampleStats.events > 25;
      stages.push({
        key: "pointer-sampling",
        label: "Live pointer polling rate sampling (5 seconds)",
        status: samplePass ? "pass" : "skip",
        detail: samplePass
          ? `Avg ${sampleStats.avgHz} Hz · Peak ${sampleStats.peakHz} Hz · Stability ${sampleStats.stability}% (${sampleStats.events} events)`
          : "No pointer movement detected during sampling window",
      });

      listEl.innerHTML = stages.map((c, i) => renderStageRow(i + 1, c.label, c.detail, c.status)).join("");

      const allPassed = stages.every((s) => s.status === "pass" || s.status === "skip");
      badge.textContent = allPassed ? "Verified Pass" : "Check Failed";
      badge.className = `ws-badge ${allPassed ? "is-ok" : "is-warn"}`;

      lastTestReport = {
        runAt: new Date().toISOString(),
        driver: "Razer Web Hub v3.0 (Chroma Studio Edition)",
        productId: selectedPid,
        deviceName: hwData.deviceName,
        firmware: hwData.firmware,
        pointerStats: sampleStats,
        stages,
      };
      dlBtn.disabled = false;
      void playUiTone("success");
    } catch (e) {
      badge.textContent = "Error";
      showToast(`Hardware test error: ${e.message}`, false);
    } finally {
      btn.disabled = false;
    }
  }

  // ==========================================================================
  // 14. Packet Log Drawer
  // ==========================================================================
  function prependPacketLog(item) {
    const list = document.getElementById("packetList");
    const badge = document.getElementById("packetCountBadge");
    if (!list) return;

    const div = document.createElement("div");
    div.className = "packet-item";
    div.innerHTML = `
      <div style="display:flex;justify-content:space-between;color:var(--accent);font-weight:600;">
        <span>PID ${item.productId} · Class ${item.parsedTx?.commandClassHex || "--"} / Cmd ${item.parsedTx?.commandIdHex || "--"}</span>
        <span>${item.parsedRx?.statusName || "OK"} (CRC 0x${(item.parsedRx?.crc ?? 0).toString(16).toUpperCase()})</span>
      </div>
      <div class="packet-hex">TX: ${item.txHex?.slice(0, 78)}…</div>
      <div class="packet-hex">RX: ${item.rxHex?.slice(0, 78)}…</div>
    `;
    list.prepend(div);
    if (badge) badge.textContent = String(list.children.length);
  }

  // ==========================================================================
  // 15. Wire All UI Event Listeners
  // ==========================================================================
  function bindEvents() {
    // Sidebar Collapse
    document.getElementById("btnCollapseSidebar")?.addEventListener("click", () => {
      savePreferences({ sidebarCollapsed: !uiPrefs.sidebarCollapsed });
    });

    // Main Sidebar Views
    document.querySelectorAll("[data-main-view]").forEach((btn) => {
      btn.addEventListener("click", () => switchMainView(btn.dataset.mainView));
    });

    // Stepper Buttons (- / +) on all StepperSliders
    document.querySelectorAll(".stepper-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const targetId = btn.dataset.stepTarget;
        const delta = parseFloat(btn.dataset.stepDelta) || 0;
        const input = document.getElementById(targetId);
        if (!input) return;
        const min = parseFloat(input.min) || 0;
        const max = parseFloat(input.max) || 100;
        const next = Math.min(max, Math.max(min, Number((parseFloat(input.value) + delta).toFixed(2))));
        input.value = next;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
    });

    // Keyboard Sub-Tabs
    document.querySelectorAll("#kbdTabNav .nav-pill").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#kbdTabNav .nav-pill").forEach((b) => b.classList.remove("active", "is-active"));
        btn.classList.add("active", "is-active");
        const target = btn.dataset.kbdTab;
        document.querySelectorAll(".kbd-tab-panel").forEach((p) => {
          p.hidden = p.dataset.panel !== target;
        });
      });
    });

    // Mouse Sub-Tabs
    document.querySelectorAll("#mouseTabNav .nav-pill").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#mouseTabNav .nav-pill").forEach((b) => b.classList.remove("active", "is-active"));
        btn.classList.add("active", "is-active");
        const target = btn.dataset.mouseTab;
        document.querySelectorAll(".mouse-tab-panel").forEach((p) => {
          p.hidden = p.dataset.panel !== target;
        });
      });
    });

    // Key Selection Filter Toolbar
    document.querySelectorAll("[data-select-keys]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const mode = btn.dataset.selectKeys;
        syncToolbarSelectionChips(mode);
        selectedKeys.clear();
        if (mode === "wasd") ["W", "A", "S", "D"].forEach((k) => selectedKeys.add(k));
        else if (mode === "movement") ["W", "A", "S", "D", "↑", "←", "↓", "→", "SPACE", "LSHIFT"].forEach((k) => selectedKeys.add(k));
        else if (mode === "numbers") ["1", "2", "3", "4", "5", "6"].forEach((k) => selectedKeys.add(k));
        updateSelectionScopeBadge();
        renderKeyboardMatrix();
      });
    });

    // Actuation & Rapid Trigger Controls
    const rngAct = document.getElementById("rngActuation");
    const chkRt = document.getElementById("chkRapidTrigger");
    const chkCont = document.getElementById("chkContinuousRt");
    const rngDown = document.getElementById("rngRtDown");
    const rngUp = document.getElementById("rngRtUp");

    const commitActuationChange = () => {
      const slot = getActiveSlotData();
      const actMm = Number(rngAct.value);
      const rtEnabled = chkRt.checked;
      const continuousRt = chkCont.checked;
      const rtDownMm = Number(rngDown.value);
      const rtUpMm = Number(rngUp.value);

      syncSwitchTile("tileRtEnable", rtEnabled);
      syncSwitchTile("tileRtContinuous", continuousRt);
      updateActuationPresetHighlight(actMm, rtEnabled);

      if (selectedKeys.size > 0) {
        if (!slot.perKeyOverrides) slot.perKeyOverrides = {};
        selectedKeys.forEach((k) => {
          slot.perKeyOverrides[k] = { act: actMm, rt: rtEnabled, down: rtDownMm, up: rtUpMm };
        });
      } else {
        slot.actuationMm = actMm;
        slot.rtEnabled = rtEnabled;
        slot.continuousRt = continuousRt;
        slot.rtDownMm = rtDownMm;
        slot.rtUpMm = rtUpMm;
      }

      renderKeyboardMatrix();
      updateSelectionScopeBadge();
      const pkt = Protocol25.Builders.setAnalogActuation({
        slotId: getActiveDeviceProfileObj().activeSlot || 1,
        actuationMm: actMm,
        rtEnabled,
        rtDownMm,
        rtUpMm,
        continuousRt,
      });
      sendPacket90(
        pkt,
        selectedKeys.size > 0
          ? `Per-Key Actuation (${selectedKeys.size} keys: ${actMm}mm)`
          : `Global Actuation (${actMm}mm, RT: ${rtEnabled ? "ON" : "OFF"})`,
        {
          actuationMm: slot.actuationMm,
          rtEnabled: slot.rtEnabled,
          continuousRt: slot.continuousRt,
          rtDownMm: slot.rtDownMm,
          rtUpMm: slot.rtUpMm,
          perKeyOverrides: slot.perKeyOverrides,
        }
      );
    };

    rngAct?.addEventListener("input", () => {
      updateRangeFill(rngAct);
      updateActuationVisuals(rngAct.value);
      updateActuationPresetHighlight(Number(rngAct.value), chkRt?.checked);
    });
    rngAct?.addEventListener("change", commitActuationChange);
    chkRt?.addEventListener("change", commitActuationChange);
    chkCont?.addEventListener("change", commitActuationChange);

    rngDown?.addEventListener("input", () => {
      updateRangeFill(rngDown);
      document.getElementById("valRtDown").textContent = `${Number(rngDown.value).toFixed(2)} mm`;
      document.getElementById("valRtDownText").textContent = `${Number(rngDown.value).toFixed(2)} mm`;
    });
    rngDown?.addEventListener("change", commitActuationChange);

    rngUp?.addEventListener("input", () => {
      updateRangeFill(rngUp);
      document.getElementById("valRtUp").textContent = `${Number(rngUp.value).toFixed(2)} mm`;
    });
    rngUp?.addEventListener("change", commitActuationChange);

    // Clear Per-Key Overrides
    document.getElementById("btnClearKeyOverride")?.addEventListener("click", () => {
      const slot = getActiveSlotData();
      if (slot.perKeyOverrides) {
        selectedKeys.forEach((k) => delete slot.perKeyOverrides[k]);
      }
      syncControlsFromSlot();
      renderOverviewPanels();
      showToast("Reset selected keys to global slot actuation");
    });

    // Actuation Presets
    document.querySelectorAll("[data-act-preset]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const p = btn.dataset.actPreset;
        if (p === "balanced") {
          rngAct.value = 1.2; chkRt.checked = true; rngDown.value = 0.3; rngUp.value = 0.3;
        } else if (p === "esports") {
          rngAct.value = 0.4; chkRt.checked = true; rngDown.value = 0.1; rngUp.value = 0.1;
        } else if (p === "typing") {
          rngAct.value = 2.0; chkRt.checked = false; rngDown.value = 0.5; rngUp.value = 0.5;
        }
        updateRangeFill(rngAct);
        updateRangeFill(rngDown);
        updateRangeFill(rngUp);
        updateActuationVisuals(rngAct.value);
        document.getElementById("valRtDown").textContent = `${Number(rngDown.value).toFixed(2)} mm`;
        document.getElementById("valRtDownText").textContent = `${Number(rngDown.value).toFixed(2)} mm`;
        document.getElementById("valRtUp").textContent = `${Number(rngUp.value).toFixed(2)} mm`;
        commitActuationChange();
      });
    });

    // Snap Tap
    const commitSnapTap = () => {
      const slot = getActiveSlotData();
      slot.snapTapEnabled = document.getElementById("chkSnapTap").checked;
      slot.snapKeyA = document.getElementById("selSnapKeyA").value;
      slot.snapKeyB = document.getElementById("selSnapKeyB").value;
      syncSwitchTile("tileSnapTap", slot.snapTapEnabled);
      renderKeyboardMatrix();
      const pkt = Protocol25.Builders.setSnapTap({
        slotId: getActiveDeviceProfileObj().activeSlot || 1,
        enabled: slot.snapTapEnabled,
        keyA: slot.snapKeyA,
        keyB: slot.snapKeyB,
      });
      sendPacket90(pkt, `Snap Tap (${slot.snapKeyA}+${slot.snapKeyB}: ${slot.snapTapEnabled ? "ON" : "OFF"})`, {
        snapTapEnabled: slot.snapTapEnabled,
        snapKeyA: slot.snapKeyA,
        snapKeyB: slot.snapKeyB,
      });
    };
    document.getElementById("chkSnapTap")?.addEventListener("change", commitSnapTap);
    document.getElementById("selSnapKeyA")?.addEventListener("change", commitSnapTap);
    document.getElementById("selSnapKeyB")?.addEventListener("change", commitSnapTap);

    // Gaming Mode
    const commitGamingMode = () => {
      const slot = getActiveSlotData();
      slot.gamingMode = {
        enabled: document.getElementById("chkGamingMode").checked,
        disableWin: document.getElementById("chkDisableWin").checked,
        disableAltTab: document.getElementById("chkDisableAltTab").checked,
        disableAltF4: document.getElementById("chkDisableAltF4").checked,
      };
      syncSwitchTile("tileGamingMode", slot.gamingMode.enabled);
      syncSwitchTile("tileDisableWin", slot.gamingMode.disableWin);
      syncSwitchTile("tileDisableAltTab", slot.gamingMode.disableAltTab);
      syncSwitchTile("tileDisableAltF4", slot.gamingMode.disableAltF4);
      const pkt = Protocol25.Builders.setGamingMode(slot.gamingMode);
      sendPacket90(pkt, `Gaming Mode (${slot.gamingMode.enabled ? "ON" : "OFF"})`, {
        gamingMode: slot.gamingMode,
      });
    };
    ["chkGamingMode", "chkDisableWin", "chkDisableAltTab", "chkDisableAltF4"].forEach((id) => {
      document.getElementById(id)?.addEventListener("change", commitGamingMode);
    });

    // Keyboard Remap & Hypershift
    document.querySelectorAll("#kbdLayerToggle .layer-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#kbdLayerToggle .layer-btn").forEach((b) => b.classList.remove("active", "selected"));
        btn.classList.add("active", "selected");
        kbdActiveLayer = btn.dataset.layer;
        syncRemapControlsForFocusedKey();
        renderKeyboardMatrix();
      });
    });

    document.getElementById("btnBindKey")?.addEventListener("click", () => {
      const slot = getActiveSlotData();
      if (!slot.keyBindings) slot.keyBindings = { standard: {}, hypershift: {} };
      const fn = document.getElementById("selKeyFunction").value;
      slot.keyBindings[kbdActiveLayer][focusedRemapKey] = fn;
      renderKeyboardMatrix();
      const pkt = Protocol25.Builders.setKeyBinding({
        slotId: getActiveDeviceProfileObj().activeSlot || 1,
        keyId: focusedRemapKey.charCodeAt(0),
        keyLabel: focusedRemapKey,
        isHypershift: kbdActiveLayer === "hypershift",
        functionName: fn,
      });
      sendPacket90(pkt, `Bind [${focusedRemapKey}] (${kbdActiveLayer}) → ${fn}`, {
        keyBindings: slot.keyBindings,
      });
    });

    document.getElementById("btnResetKeyBind")?.addEventListener("click", () => {
      const slot = getActiveSlotData();
      if (slot.keyBindings?.[kbdActiveLayer]) delete slot.keyBindings[kbdActiveLayer][focusedRemapKey];
      document.getElementById("selKeyFunction").value = "Default";
      renderKeyboardMatrix();
      const pkt = Protocol25.Builders.setKeyBinding({
        slotId: getActiveDeviceProfileObj().activeSlot || 1,
        keyId: focusedRemapKey.charCodeAt(0),
        keyLabel: focusedRemapKey,
        isHypershift: kbdActiveLayer === "hypershift",
        functionName: "Default",
      });
      sendPacket90(pkt, `Reset [${focusedRemapKey}] (${kbdActiveLayer}) → Default`, {
        keyBindings: slot.keyBindings,
      });
    });

    // Custom Protocol 25 Packet
    document.getElementById("btnSendCustomPacket")?.addEventListener("click", () => {
      const cls = parseInt(document.getElementById("inpCustomClass").value, 16) || 0;
      const id = parseInt(document.getElementById("inpCustomId").value, 16) || 0;
      const args = (document.getElementById("inpCustomArgs").value || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((x) => parseInt(x, 16) || 0);
      const pkt = Protocol25.buildPacket({ commandClass: cls, commandId: id, args });
      sendPacket90(pkt, `Custom 0x${cls.toString(16).toUpperCase()}/0x${id.toString(16).toUpperCase()}`, null, null, true);
    });

    // Chroma Lighting
    const sendChroma = (effect, hexColor, hexColor2) => {
      const slot = getActiveSlotData();
      if (!slot.lighting) {
        slot.lighting = { effect: "static", color1: "#00e676", color2: "#00d2ff", brightness: 100, speed: 2, waveDirection: 1 };
      }
      slot.lighting.effect = effect;
      slot.lighting.color1 = hexColor || slot.lighting.color1 || "#00e676";
      slot.lighting.color2 = hexColor2 || document.getElementById("inpChromaColor2")?.value || slot.lighting.color2 || "#00d2ff";
      if (slot.lighting.brightness === undefined) {
        slot.lighting.brightness = Number(document.getElementById("rngBrightness")?.value ?? 100);
      }
      updateChromaVisuals();
      const num = parseInt(slot.lighting.color1.replace("#", ""), 16) || 0x00e676;
      const num2 = parseInt(slot.lighting.color2.replace("#", ""), 16) || 0x00d2ff;
      const pkt = Protocol25.Builders.setChromaEffect({
        varStore: getActiveDeviceProfileObj().activeSlot || 1,
        effect,
        r: (num >> 16) & 0xff,
        g: (num >> 8) & 0xff,
        b: num & 0xff,
        r2: (num2 >> 16) & 0xff,
        g2: (num2 >> 8) & 0xff,
        b2: num2 & 0xff,
        speed: slot.lighting.speed || 2,
        direction: slot.lighting.waveDirection || 1,
      });
      sendPacket90(pkt, `Chroma (${effect})`, { lighting: slot.lighting });
    };

    document.querySelectorAll("#chromaDirGroup [data-chroma-dir]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#chromaDirGroup [data-chroma-dir]").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const slot = getActiveSlotData();
        if (!slot.lighting) slot.lighting = {};
        slot.lighting.waveDirection = Number(btn.dataset.chromaDir) || 1;
        const activeEff = document.querySelector("#effectGrid .preset-btn.active")?.dataset.effect || slot.lighting.effect || "wave";
        sendChroma(
          activeEff,
          document.getElementById("inpChromaColor")?.value || slot.lighting.color1 || "#00e676",
          document.getElementById("inpChromaColor2")?.value || slot.lighting.color2 || "#00d2ff"
        );
      });
    });

    document.querySelectorAll("#chromaSpeedGroup [data-chroma-speed]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#chromaSpeedGroup [data-chroma-speed]").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const slot = getActiveSlotData();
        if (!slot.lighting) slot.lighting = {};
        slot.lighting.speed = Number(btn.dataset.chromaSpeed) || 2;
        const activeEff = document.querySelector("#effectGrid .preset-btn.active")?.dataset.effect || slot.lighting.effect || "static";
        sendChroma(
          activeEff,
          document.getElementById("inpChromaColor")?.value || slot.lighting.color1 || "#00e676",
          document.getElementById("inpChromaColor2")?.value || slot.lighting.color2 || "#00d2ff"
        );
      });
    });

    document.querySelectorAll("#effectGrid .preset-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#effectGrid .preset-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        sendChroma(
          btn.dataset.effect,
          document.getElementById("inpChromaColor")?.value || "#00e676",
          document.getElementById("inpChromaColor2")?.value || "#00d2ff"
        );
      });
    });

    document.querySelectorAll("#swatchRow .swatch").forEach((sw) => {
      sw.addEventListener("click", () => {
        document.querySelectorAll("#swatchRow .swatch").forEach((s) => s.classList.remove("active"));
        sw.classList.add("active");
        const c = sw.dataset.color;
        document.getElementById("inpChromaColor").value = c;
        const activeEff = document.querySelector("#effectGrid .preset-btn.active")?.dataset.effect || "static";
        sendChroma(activeEff, c, document.getElementById("inpChromaColor2")?.value || "#00d2ff");
      });
    });

    let chromaColorTimer = null;
    document.getElementById("inpChromaColor")?.addEventListener("input", (ev) => {
      const c = ev.target.value;
      const slot = getActiveSlotData();
      if (!slot.lighting) slot.lighting = {};
      slot.lighting.color1 = c;
      document.querySelectorAll("#swatchRow .swatch").forEach((s) => {
        s.classList.toggle("active", (s.dataset.color || "").toLowerCase() === c.toLowerCase());
      });
      updateChromaVisuals();
      clearTimeout(chromaColorTimer);
      chromaColorTimer = setTimeout(() => {
        const activeEff = document.querySelector("#effectGrid .preset-btn.active")?.dataset.effect || "static";
        sendChroma(activeEff, c, document.getElementById("inpChromaColor2")?.value || slot.lighting.color2 || "#00d2ff");
      }, 45);
    });

    document.getElementById("inpChromaColor")?.addEventListener("change", (ev) => {
      clearTimeout(chromaColorTimer);
      const activeEff = document.querySelector("#effectGrid .preset-btn.active")?.dataset.effect || "static";
      sendChroma(activeEff, ev.target.value, document.getElementById("inpChromaColor2")?.value || "#00d2ff");
    });

    let chromaColor2Timer = null;
    document.getElementById("inpChromaColor2")?.addEventListener("input", (ev) => {
      const c2 = ev.target.value;
      const slot = getActiveSlotData();
      if (!slot.lighting) slot.lighting = {};
      slot.lighting.color2 = c2;
      updateChromaVisuals();
      clearTimeout(chromaColor2Timer);
      chromaColor2Timer = setTimeout(() => {
        const activeEff = document.querySelector("#effectGrid .preset-btn.active")?.dataset.effect || "static";
        sendChroma(activeEff, document.getElementById("inpChromaColor")?.value || slot.lighting.color1 || "#00e676", c2);
      }, 45);
    });

    document.getElementById("inpChromaColor2")?.addEventListener("change", (ev) => {
      clearTimeout(chromaColor2Timer);
      const activeEff = document.querySelector("#effectGrid .preset-btn.active")?.dataset.effect || "static";
      sendChroma(activeEff, document.getElementById("inpChromaColor")?.value || "#00e676", ev.target.value);
    });

    const rngBr = document.getElementById("rngBrightness");
    let brTimer = null;
    rngBr?.addEventListener("input", () => {
      updateRangeFill(rngBr);
      const pct = Number(rngBr.value);
      document.getElementById("valBrightness").textContent = `${pct}%`;
      document.getElementById("valBrightnessOut").textContent = `${pct}%`;
      const slot = getActiveSlotData();
      if (!slot.lighting) slot.lighting = {};
      slot.lighting.brightness = pct;
      updateChromaVisuals();
      clearTimeout(brTimer);
      brTimer = setTimeout(() => {
        const activeSlotId = getActiveDeviceProfileObj().activeSlot || 1;
        sendPacket90(
          Protocol25.Builders.setBrightness(Math.round((pct / 100) * 255), 0x00, activeSlotId),
          `Brightness ${pct}%`,
          { lighting: slot.lighting }
        );
      }, 45);
    });
    rngBr?.addEventListener("change", async () => {
      clearTimeout(brTimer);
      const pct = Number(rngBr.value);
      const slot = getActiveSlotData();
      if (!slot.lighting) slot.lighting = {};
      slot.lighting.brightness = pct;
      updateChromaVisuals();
      const activeSlotId = getActiveDeviceProfileObj().activeSlot || 1;
      await sendPacket90(
        Protocol25.Builders.setBrightness(Math.round((pct / 100) * 255), 0x00, activeSlotId),
        `Brightness ${pct}%`,
        { lighting: slot.lighting }
      );
      const activeEff = document.querySelector("#effectGrid .preset-btn.active")?.dataset.effect || slot.lighting.effect || "static";
      sendChroma(activeEff, document.getElementById("inpChromaColor").value);
    });

    // Keyboard Polling Rate
    document.querySelectorAll("[data-kbd-hz]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("[data-kbd-hz]").forEach((b) => b.classList.remove("active", "is-on"));
        btn.classList.add("active", "is-on");
        const hz = Number(btn.dataset.kbdHz);
        document.getElementById("kbdPollingFigure").textContent = `${hz} Hz`;
        const slot = getActiveSlotData();
        slot.pollingHz = hz;
        sendPacket90(Protocol25.Builders.setPollingRate(hz), `Keyboard Polling ${hz} Hz`, { pollingHz: hz });
      });
    });

    // Mouse DPI & Polling
    document.getElementById("chkIndependentXY")?.addEventListener("change", (ev) => {
      const slot = getActiveSlotData();
      slot.independentXY = ev.target.checked;
      renderDpiStagesEditor();
    });
    document.getElementById("btnApplyDpi")?.addEventListener("click", commitMouseDpiStages);

    document.querySelectorAll("#mousePollingGroup .poll-pill").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#mousePollingGroup .poll-pill").forEach((b) => b.classList.remove("active", "is-on"));
        btn.classList.add("active", "is-on");
        const hz = Number(btn.dataset.hz);
        document.getElementById("mousePollingFigure").textContent = `${hz} Hz`;
        const estHours = BATTERY_HOURS_BY_HZ[hz] || 95;
        document.getElementById("mouseBatteryEstimateNote").textContent =
          `Estimated battery life at ${hz.toLocaleString()} Hz: ~${estHours} hours`;
        const slot = getActiveSlotData();
        slot.pollingHz = hz;
        sendPacket90(Protocol25.Builders.setPollingRate(hz), `HyperPolling ${hz} Hz`, { pollingHz: hz });
      });
    });

    // Mouse Smart Tracking & Asymmetric Cut-off (landing bounded below lift-off)
    const commitSmartTracking = () => {
      const slot = getActiveSlotData();
      const asym = document.getElementById("chkAsymLod").checked;
      const symBtn = document.querySelector("#symLodGroup .preset-btn.active");
      const symLvl = symBtn ? Number(symBtn.dataset.lod) : 1;
      const liftOff = Number(document.getElementById("rngLiftOff").value);
      const rawLanding = Number(document.getElementById("rngLanding").value);
      const landing = Math.min(rawLanding, Math.max(1, liftOff - 1));
      document.getElementById("rngLanding").value = landing;
      updateRangeFill(document.getElementById("rngLanding"));
      document.getElementById("valLanding").textContent = `${landing} / 25`;

      slot.smartTracking = {
        asymmetric: asym,
        symmetricLevel: symLvl,
        liftOffLevel: liftOff,
        landingLevel: landing,
      };
      const pkt = Protocol25.Builders.setSmartTracking({
        asymmetric: asym,
        liftOff: asym ? liftOff : symLvl,
        landing,
      });
      sendPacket90(pkt, `Smart Tracking (${asym ? `Asym ${liftOff}/${landing}` : `Level ${symLvl}`})`, {
        smartTracking: slot.smartTracking,
      });
    };

    document.getElementById("chkAsymLod")?.addEventListener("change", (ev) => {
      document.getElementById("symLodWrap").hidden = ev.target.checked;
      document.getElementById("asymLodWrap").hidden = !ev.target.checked;
      commitSmartTracking();
    });
    document.querySelectorAll("#symLodGroup .preset-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#symLodGroup .preset-btn").forEach((b) => b.classList.remove("active", "selected"));
        btn.classList.add("active", "selected");
        commitSmartTracking();
      });
    });
    document.getElementById("rngLiftOff")?.addEventListener("input", (ev) => {
      updateRangeFill(ev.target);
      document.getElementById("valLiftOff").textContent = `${ev.target.value} / 26`;
    });
    document.getElementById("rngLiftOff")?.addEventListener("change", commitSmartTracking);
    document.getElementById("rngLanding")?.addEventListener("input", (ev) => {
      updateRangeFill(ev.target);
      document.getElementById("valLanding").textContent = `${ev.target.value} / 25`;
    });
    document.getElementById("rngLanding")?.addEventListener("change", commitSmartTracking);

    // Sensor Angle, Dynamic Sensitivity & Power Saving
    const rngAng = document.getElementById("rngSensorAngle");
    rngAng?.addEventListener("input", () => {
      updateRangeFill(rngAng);
      document.getElementById("valSensorAngle").textContent = `${rngAng.value}°`;
    });
    rngAng?.addEventListener("change", () => {
      const slot = getActiveSlotData();
      slot.sensorAngle = Number(rngAng.value);
      sendPacket90(Protocol25.Builders.setSensorAngle(slot.sensorAngle), `Sensor Angle ${slot.sensorAngle}°`, {
        sensorAngle: slot.sensorAngle,
      });
    });
    document.getElementById("btnZeroAngle")?.addEventListener("click", () => {
      rngAng.value = 0;
      updateRangeFill(rngAng);
      document.getElementById("valSensorAngle").textContent = "0°";
      rngAng.dispatchEvent(new Event("change"));
    });

    document.getElementById("selDynSens")?.addEventListener("change", (ev) => {
      const slot = getActiveSlotData();
      slot.dynamicSensitivity = Number(ev.target.value);
      sendPacket90(
        Protocol25.Builders.setDynamicSensitivity({ enabled: slot.dynamicSensitivity > 0, preset: slot.dynamicSensitivity }),
        `Dynamic Sensitivity (Preset ${slot.dynamicSensitivity})`,
        { dynamicSensitivity: slot.dynamicSensitivity }
      );
    });

    const commitPowerSaving = () => {
      const slot = getActiveSlotData();
      slot.powerSaving = {
        idleMinutes: Number(document.getElementById("rngIdleSleep").value),
        lowPowerPercent: Number(document.getElementById("rngLowPower").value),
      };
      sendPacket90(
        Protocol25.Builders.setPowerSaving(slot.powerSaving),
        `Power Saving (${slot.powerSaving.idleMinutes}m, ${slot.powerSaving.lowPowerPercent}%)`,
        { powerSaving: slot.powerSaving }
      );
    };
    document.getElementById("rngIdleSleep")?.addEventListener("input", (ev) => {
      updateRangeFill(ev.target);
      document.getElementById("valIdleSleep").textContent = `${ev.target.value} min`;
    });
    document.getElementById("rngIdleSleep")?.addEventListener("change", commitPowerSaving);
    document.getElementById("rngLowPower")?.addEventListener("input", (ev) => {
      updateRangeFill(ev.target);
      document.getElementById("valLowPower").textContent = `${ev.target.value}%`;
    });
    document.getElementById("rngLowPower")?.addEventListener("change", commitPowerSaving);

    // Mouse Layer Toggle & SVG Hotspots
    document.querySelectorAll("#mouseLayerToggle .layer-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#mouseLayerToggle .layer-btn").forEach((b) => b.classList.remove("active", "selected"));
        btn.classList.add("active", "selected");
        mouseActiveLayer = btn.dataset.mouseLayer;
        renderMouseButtonsList();
      });
    });

    document.querySelectorAll(".mouse-hotspot").forEach((hs) => {
      hs.addEventListener("click", () => {
        document.querySelectorAll(".mouse-hotspot").forEach((h) => h.classList.remove("selected"));
        hs.classList.add("selected");
        document.querySelector('[data-mouse-tab="buttons"]')?.click();
      });
    });

    // Save / Reset / Export / Import Onboard Slots
    document.getElementById("btnSaveSlot")?.addEventListener("click", async () => {
      const devProf = getActiveDeviceProfileObj();
      const slotId = devProf.activeSlot || 1;
      const slotData = getActiveSlotData();
      const res = await fetch("/api/profile-slot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", productId: selectedPid, slotId, slotData }),
      });
      const data = await res.json();
      if (data.state) driverState = data.state;
      showToast(`Flashed configuration to Onboard Slot S${slotId}`);
      void playUiTone("success");
    });

    document.getElementById("btnResetSlot")?.addEventListener("click", async () => {
      const devProf = getActiveDeviceProfileObj();
      const slotId = devProf.activeSlot || 1;
      const res = await fetch("/api/profile-slot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset", productId: selectedPid, slotId }),
      });
      const data = await res.json();
      if (data.state) driverState = data.state;
      renderProfileSlotBar();
      syncControlsFromSlot();
      renderOverviewPanels();
      showToast(`Slot S${slotId} reset to factory defaults`);
    });

    document.getElementById("btnExportProfiles")?.addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(driverState.profilesByPid, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `razer-onboard-slots-${selectedPid}.json`;
      a.click();
    });

    document.getElementById("inpImportProfiles")?.addEventListener("change", async (ev) => {
      const file = ev.target.files?.[0];
      if (!file) return;
      try {
        const imported = JSON.parse(await file.text());
        driverState.profilesByPid = { ...driverState.profilesByPid, ...imported };
        const devProf = getActiveDeviceProfileObj();
        await fetch("/api/profile-slot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "save",
            productId: selectedPid,
            slotId: devProf.activeSlot || 1,
            slotData: getActiveSlotData(),
          }),
        });
        renderProfileSlotBar();
        syncControlsFromSlot();
        renderOverviewPanels();
        showToast("Imported onboard profile slots");
      } catch (e) {
        showToast(`Import error: ${e.message}`, false);
      }
    });

    // Operating Mode (0x00 vs 0x03)
    document.querySelectorAll("#deviceModeGroup .mode-seg").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#deviceModeGroup .mode-seg").forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        const m = btn.dataset.mode;
        const pkt = Protocol25.Builders.setDeviceMode(m === "driver" ? 0x03 : 0x00, 0x00);
        sendPacket90(pkt, `Device Mode → ${m.toUpperCase()}`, null, { deviceMode: m });
      });
    });

    // Firmware Query
    document.getElementById("btnQueryFw")?.addEventListener("click", async () => {
      const res = await sendPacket90(Protocol25.Builders.getFirmwareVersion(), "Query Firmware (0x00/0x87)", null, null, true);
      if (res?.parsedRx?.args) {
        const [maj, min, rev] = res.parsedRx.args;
        const fw = `v${maj}.${String(min).padStart(2, "0")}.${String(rev || 0).padStart(2, "0")}`;
        document.getElementById("fwBadge").textContent = fw;
      }
    });

    // Hardware Test Suite Buttons
    document.getElementById("btnRunHardwareTest")?.addEventListener("click", runFullHardwareTestSuite);
    document.getElementById("btnSamplePollingOnly")?.addEventListener("click", () => void runLivePointerSample(5000));
    document.getElementById("btnDownloadTestReport")?.addEventListener("click", () => {
      if (!lastTestReport) return;
      const blob = new Blob([JSON.stringify(lastTestReport, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `razer-${selectedPid}-hardwaretest.json`;
      a.click();
    });

    // Settings Behaviour Switches & Profile Key
    document.getElementById("chkInstantFlash")?.addEventListener("change", (ev) => {
      savePreferences({ instantFlash: ev.target.checked });
      showToast(ev.target.checked ? "Instant hardware flash enabled" : "Staged Apply Bar mode enabled");
    });
    document.getElementById("chkUiSounds")?.addEventListener("change", (ev) => {
      savePreferences({ soundsEnabled: ev.target.checked });
      if (ev.target.checked) void playUiTone("success");
    });
    document.getElementById("chkReducedMotion")?.addEventListener("change", (ev) => {
      savePreferences({ reducedMotion: ev.target.checked });
    });

    document.getElementById("btnCopyProfileKey")?.addEventListener("click", () => {
      const val = document.getElementById("txtProfileKeyExport").value;
      navigator.clipboard?.writeText(val);
      showToast("Copied RZW1: profile key to clipboard");
    });

    document.getElementById("btnApplyProfileKey")?.addEventListener("click", async () => {
      const raw = (document.getElementById("txtProfileKeyImport").value || "").trim();
      if (!raw) return showToast("Paste a profile key first", false);
      try {
        const b64 = raw.startsWith("RZW1:") ? raw.slice(5) : raw;
        const decoded = JSON.parse(decodeURIComponent(escape(atob(b64))));
        if (!decoded?.slotData) throw new Error("Invalid RZW1 key payload");
        const devProf = getActiveDeviceProfileObj();
        const slotId = devProf.activeSlot || 1;
        devProf.slots[slotId] = { ...devProf.slots[slotId], ...decoded.slotData, slot: slotId };
        await fetch("/api/profile-slot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "save", productId: selectedPid, slotId, slotData: devProf.slots[slotId] }),
        });
        syncControlsFromSlot();
        renderOverviewPanels();
        updateProfileKeyBox();
        document.getElementById("txtProfileKeyImport").value = "";
        showToast(`Imported & flashed profile key to Slot S${slotId}`);
        void playUiTone("success");
      } catch (e) {
        showToast(`Invalid profile key: ${e.message}`, false);
      }
    });

    // Staged Apply Bar Actions
    document.getElementById("btnRevertStaged")?.addEventListener("click", async () => {
      stagedQueue = [];
      renderPendingApplyBar();
      const res = await fetch("/api/status");
      const data = await res.json();
      if (data.state) driverState = data.state;
      syncControlsFromSlot();
      renderOverviewPanels();
      showToast("Reverted staged changes");
    });

    document.getElementById("btnFlushStaged")?.addEventListener("click", async () => {
      const queue = [...stagedQueue];
      stagedQueue = [];
      renderPendingApplyBar();
      for (const item of queue) {
        await sendPacket90(item.packet90, item.label, item.slotPatch, item.statePatch, true);
      }
    });

    // Packet Inspector Drawer
    const drawer = document.getElementById("inspectorDrawer");
    document.getElementById("btnToggleDrawer")?.addEventListener("click", () => {
      drawer.hidden = !drawer.hidden;
    });
    document.getElementById("btnCloseDrawer")?.addEventListener("click", () => {
      drawer.hidden = true;
    });
    document.getElementById("btnClearPackets")?.addEventListener("click", async () => {
      await fetch("/api/clear-logs", { method: "POST" });
      document.getElementById("packetList").innerHTML = "";
      document.getElementById("packetCountBadge").textContent = "0";
    });

    window.addEventListener("resize", () => renderChromaBackdrop(false));
  }

  // ==========================================================================
  // 16. Bootstrap
  // ==========================================================================
  async function init() {
    renderChromaBackdrop(true);
    bindEvents();

    try {
      const res = await fetch("/api/status");
      const data = await res.json();
      devices = data.devices || [];
      if (data.state) {
        driverState = data.state;
        selectedPid = Number(driverState.selectedPid || 679);
        if (data.state.preferences) {
          uiPrefs = { ...uiPrefs, ...data.state.preferences };
        }
      }

      renderThemeGallery();
      applyThemeAndPrefs(false);

      const connText = document.getElementById("connText");
      if (connText) {
        connText.textContent = data.nativeStatus?.hidLoaded
          ? `HID.node Native (${devices.length} live)`
          : "WebHID / Local Mode";
      }

      if (Array.isArray(data.packetHistory)) {
        data.packetHistory.slice().reverse().forEach((p) => prependPacketLog(p));
      }

      renderDeviceTabs();
      renderProfileSlotBar();
      syncControlsFromSlot();
      renderOverviewPanels();
      updateProfileKeyBox();
    } catch (err) {
      showToast(`Connection error: ${err.message}`, false);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
