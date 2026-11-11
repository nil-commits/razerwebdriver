/**
 * websynap.se v3.0 — Zero-Install Razer WebHID Hardware Studio
 * 100% Client-Side Execution · Protocol 25 USB Feature Reports · MIT Licensed
 */
/* global Protocol25 */

(function () {
  "use strict";

  const Protocol25 = window.RazerProtocol25 || window.Protocol25;

  // ==========================================================================
  // 0. Public Deployment Security Hardening (XSS, Prototype Pollution & MCU Firewall)
  // ==========================================================================
  const MAX_IMPORT_BYTES = 262144; // 256 KB max JSON import payload
  const MAX_PROFILE_KEY_CHARS = 65536; // 64 KB max RZW1: key string
  const MAX_PACKET_LOG_ENTRIES = 200;
  const ALLOWED_POLLING_RATES = new Set([125, 250, 500, 1000, 2000, 4000, 8000]);
  const ALLOWED_CHROMA_EFFECTS = new Set([
    "off",
    "static",
    "breathing",
    "breathingDual",
    "spectrum",
    "wave",
    "reactive",
    "ripple",
    "starlight",
    "fire",
    "wheel",
    "rain",
    "scanner",
    "aurora",
    "gradient",
    "disco",
  ]);
  const ALLOWED_COMMAND_CLASSES = new Set([0x00, 0x02, 0x03, 0x04, 0x05, 0x07, 0x08, 0x0b, 0x0c, 0x0d, 0x0f, 0x17, 0x18]);
  const ALLOWED_CLASS_00_IDS = new Set([0x04, 0x05, 0x40, 0x81, 0x82, 0x84, 0x86, 0x87, 0xc0]);

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function sanitizeHexColor(value, fallback = "#00e676") {
    const str = String(value ?? "").trim();
    return /^#[0-9a-fA-F]{6}$/.test(str) ? str.toLowerCase() : fallback;
  }

  function clampNum(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function sanitizePlainText(value, maxLen = 48, fallback = "") {
    const cleaned = String(value ?? "")
      .replace(/[\u0000-\u001f\u007f<>]/g, "")
      .trim()
      .slice(0, maxLen);
    return cleaned || fallback;
  }

  function safeJsonParse(rawText, maxBytes = MAX_IMPORT_BYTES) {
    if (typeof rawText !== "string") throw new Error("Payload must be a string");
    if (rawText.length > maxBytes) {
      throw new Error(`Payload exceeds maximum allowed size (${Math.round(maxBytes / 1024)} KB)`);
    }
    return JSON.parse(rawText, (key, val) => {
      if (key === "__proto__" || key === "constructor" || key === "prototype") {
        return undefined;
      }
      return val;
    });
  }

  function validateOutgoingPacket90(body90) {
    if (!Array.isArray(body90) || body90.length !== 90) {
      throw new Error("Blocked invalid Protocol 25 frame length (must be 90 bytes)");
    }
    const dataSize = body90[5] & 0xff;
    const cmdClass = body90[6] & 0xff;
    const cmdId = body90[7] & 0xff;
    if (dataSize > 80) {
      throw new Error(`Blocked malformed Protocol 25 dataSize (${dataSize} > 80)`);
    }
    if (!ALLOWED_COMMAND_CLASSES.has(cmdClass)) {
      throw new Error(`Hardware firewall blocked restricted command class 0x${cmdClass.toString(16).toUpperCase().padStart(2, "0")}`);
    }
    if (cmdClass === 0x00 && !ALLOWED_CLASS_00_IDS.has(cmdId)) {
      throw new Error(`Hardware firewall blocked restricted system command 0x00/0x${cmdId.toString(16).toUpperCase().padStart(2, "0")}`);
    }
    body90[88] = Protocol25.computeCrc(body90);
    body90[89] = 0x00;
    return body90;
  }

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
  // 3. 8 websynap.se Chroma Studio Palettes
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

  const STORAGE_KEY_STATE = "websynapse_state_v1";
  const STORAGE_KEY_PREFS = "websynapse_prefs_v1";

  // Includes 255 ($.Ay.config.keyLedIndicatorId = 255 from Razer Synapse 4 module 17204 / 6737.js)
  // so setActuationPoint (0x02/0x19) and setRapidTrigger (0x02/0x1A) also update the physical LED indicator bar.
  const ALL_TKL_ANALOG_KEY_IDS = [
    255,
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30,
    31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45,
    46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 57, 58, 59, 60, 61,
    62, 64, 75, 76, 79, 80, 81, 83, 84, 85, 86, 89, 110, 112, 113,
    114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 129,
  ];

  function getDeviceMeta(pid) {
    const numPid = Number(pid || selectedPid || 679);
    const localDev = typeof devices !== "undefined" ? devices.find((d) => Number(d.productId) === numPid) : null;
    const p25Meta = Protocol25.getDeviceMetadata
      ? Protocol25.getDeviceMetadata(numPid, localDev?.productName || "")
      : Protocol25.KNOWN_DEVICES[numPid] || {};
    return {
      productId: numPid,
      hexPid: p25Meta.hexPid || localDev?.hexPid || `0x${numPid.toString(16).toUpperCase().padStart(4, "0")}`,
      name: localDev?.productName || p25Meta.name || `Razer Device (0x${numPid.toString(16).toUpperCase()})`,
      category: localDev?.category || p25Meta.category || "keyboard",
      maxSlots: localDev?.maxSlots || p25Meta.maxSlots || 5,
      defaultTransactionId: p25Meta.defaultTransactionId || 0x1f,
      isChroma: p25Meta.isChroma !== false,
      connection: p25Meta.connection || "wired",
      donglePid: p25Meta.donglePid || null,
      blePid: p25Meta.blePid || null,
      connectedLive: !!localDev?.connectedLive,
    };
  }

  function buildDefaultSlot(pid, slotId) {
    const meta = Protocol25.KNOWN_DEVICES[Number(pid)] || {};
    const cat = meta.category || "keyboard-analog";
    const slotColors = ["#ffffff", "#ff3b30", "#00e676", "#007aff", "#00d2ff", "#d946ef"];
    const ledColor = slotColors[(slotId - 1) % slotColors.length];

    if (cat === "mouse") {
      const names = ["Default 1600 DPI", "Low Sens 800 DPI", "Esports 4K Hz", "Speed 3200 DPI", "Custom Slot 5"];
      const mouseSlotLighting = {
        1: { effect: "wave", color1: "#00e676", color2: "#00d2ff", brightness: 100, speed: 2, waveDirection: 1 },
        2: { effect: "static", color1: "#ff3b30", color2: "#ffcc00", brightness: 100, speed: 2, waveDirection: 1 },
        3: { effect: "static", color1: "#00e676", color2: "#00d2ff", brightness: 100, speed: 2, waveDirection: 1 },
        4: { effect: "breathing", color1: "#007aff", color2: "#00d2ff", brightness: 100, speed: 2, waveDirection: 1 },
        5: { effect: "spectrum", color1: "#d946ef", color2: "#00d2ff", brightness: 100, speed: 2, waveDirection: 1 },
      };
      return {
        slot: slotId,
        name: names[slotId - 1] || `Slot ${slotId}`,
        ledColor,
        pollingHz: slotId === 3 ? 4000 : 1000,
        activeStageIndex: slotId === 2 ? 2 : slotId === 4 ? 4 : 3,
        independentXY: false,
        dpiStages: [
          { stage: 1, enabled: true, x: 400, y: 400, color: "#ff5252" },
          { stage: 2, enabled: true, x: 800, y: 800, color: "#40c4ff" },
          { stage: 3, enabled: true, x: 1600, y: 1600, color: "#00e676" },
          { stage: 4, enabled: true, x: 3200, y: 3200, color: "#ffd740" },
          { stage: 5, enabled: true, x: 6400, y: 6400, color: "#e040fb" },
        ],
        smartTracking: { asymmetric: false, symmetricLevel: 1, liftOffLevel: 14, landingLevel: 10 },
        sensorAngle: 0,
        dynamicSensitivity: 0,
        powerSaving: { idleMinutes: 5, lowPowerPercent: 15 },
        lighting: { ...(mouseSlotLighting[slotId] || mouseSlotLighting[1]) },
        buttonBindings: { standard: {}, hypershift: {} },
      };
    }

    if (cat === "audio") {
      const audioPresets = [
        { name: "Default Flat", eqPreset: 0, bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], haptics: 40, bass: 35 },
        { name: "Esports FPS Footsteps", eqPreset: 1, bands: [-3, -2, 0, 2, 4, 6, 7, 5, 3, 2], haptics: 20, bass: 15 },
        { name: "Cinema / Immersion", eqPreset: 2, bands: [6, 5, 3, 1, 0, 1, 3, 4, 5, 4], haptics: 75, bass: 70 },
        { name: "Music Studio", eqPreset: 3, bands: [3, 2, 1, 0, 0, 1, 2, 3, 4, 3], haptics: 30, bass: 45 },
      ];
      const ap = audioPresets[(slotId - 1) % audioPresets.length];
      return {
        slot: slotId,
        name: ap.name,
        ledColor,
        audio: {
          volume: 80,
          muted: false,
          micVolume: 80,
          micMuted: false,
          sidetone: 35,
          eqPreset: ap.eqPreset,
          eqBands: [...ap.bands],
          hapticsIntensity: ap.haptics,
          bassBoost: ap.bass,
          voiceClarity: 60,
        },
        lighting: { effect: "static", color1: "#00e676", brightness: 100, speed: 2, waveDirection: 1 },
      };
    }

    if (cat === "controller") {
      const ctrlPresets = [
        { name: "Default Competitive", lDz: 5, rDz: 5, hair: true, trig: 40, vib: 80, hz: 1000 },
        { name: "Zero-Deadzone FPS", lDz: 2, rDz: 2, hair: true, trig: 25, vib: 40, hz: 4000 },
        { name: "Fighting / Arcade", lDz: 4, rDz: 4, hair: true, trig: 20, vib: 0, hz: 8000 },
        { name: "Racing Analog Triggers", lDz: 6, rDz: 6, hair: false, trig: 100, vib: 100, hz: 1000 },
      ];
      const cp = ctrlPresets[(slotId - 1) % ctrlPresets.length];
      return {
        slot: slotId,
        name: cp.name,
        ledColor,
        pollingHz: cp.hz,
        controller: {
          leftDeadzone: cp.lDz,
          rightDeadzone: cp.rDz,
          clutchSensitivity: 50,
          circularityMode: 1,
          leftHairTrigger: cp.hair,
          rightHairTrigger: cp.hair,
          triggerRange: cp.trig,
          vibration: cp.vib,
        },
        lighting: { effect: "static", color1: "#00e676", brightness: 100, speed: 2, waveDirection: 1 },
      };
    }

    if (cat === "mat-accessory") {
      const accNames = ["Chroma Wave", "Cyberpunk Neon", "Razer Green Static", "Reactive Pulse"];
      return {
        slot: slotId,
        name: accNames[(slotId - 1) % accNames.length],
        ledColor,
        accessory: {
          ledCount: 15,
        },
        lighting: {
          effect: slotId === 1 ? "wave" : "static",
          color1: slotId === 2 ? "#00d2ff" : "#00e676",
          brightness: 100,
          speed: 2,
          waveDirection: 1,
        },
      };
    }

    const presets = {
      1: {
        name: "Default 1.2mm",
        act: 1.2,
        rt: false,
        down: 0.3,
        up: 0.3,
        snap: false,
        lighting: { effect: "wave", color1: "#00e676", color2: "#00d2ff", brightness: 100, speed: 2, waveDirection: 1 },
      },
      2: {
        name: "Esports 0.4mm RT",
        act: 0.4,
        rt: true,
        down: 0.15,
        up: 0.15,
        snap: true,
        lighting: { effect: "static", color1: "#ff3b30", color2: "#ffcc00", brightness: 100, speed: 2, waveDirection: 1 },
      },
      3: {
        name: "Tactical FPS 0.8mm",
        act: 0.8,
        rt: true,
        down: 0.25,
        up: 0.25,
        snap: true,
        lighting: { effect: "reactive", color1: "#00e676", color2: "#00d2ff", brightness: 100, speed: 2, waveDirection: 1 },
      },
      4: {
        name: "MOBA / RTS 1.0mm",
        act: 1.0,
        rt: true,
        down: 0.3,
        up: 0.3,
        snap: false,
        lighting: { effect: "breathing", color1: "#007aff", color2: "#00d2ff", brightness: 100, speed: 2, waveDirection: 1 },
      },
      5: {
        name: "Typing 2.0mm",
        act: 2.0,
        rt: false,
        down: 0.5,
        up: 0.5,
        snap: false,
        lighting: { effect: "starlight", color1: "#00d2ff", color2: "#a78bfa", brightness: 100, speed: 2, waveDirection: 1 },
      },
      6: {
        name: "Custom Analog",
        act: 1.2,
        rt: true,
        down: 0.3,
        up: 0.3,
        snap: false,
        lighting: { effect: "fire", color1: "#ff3b30", color2: "#ffcc00", brightness: 100, speed: 2, waveDirection: 1 },
      },
    };
    const p = presets[slotId] || presets[1];
    return {
      slot: slotId,
      name: p.name,
      ledColor,
      actuationMm: p.act,
      rtEnabled: p.rt,
      continuousRt: true,
      rtDownMm: p.down,
      rtUpMm: p.up,
      perKeyOverrides: {},
      snapTapEnabled: p.snap,
      snapKeyA: "A",
      snapKeyB: "D",
      gamingMode: { enabled: false, disableWin: true, disableAltTab: false, disableAltF4: false },
      pollingHz: 1000,
      lighting: { ...p.lighting },
      keyBindings: { standard: {}, hypershift: {} },
    };
  }

  function buildDefaultDeviceProfile(pid) {
    const meta = Protocol25.KNOWN_DEVICES[Number(pid)] || {};
    const maxSlots = meta.maxSlots || (meta.category === "keyboard-analog" ? 6 : 5);
    const slots = {};
    for (let s = 1; s <= maxSlots; s++) {
      slots[s] = buildDefaultSlot(pid, s);
    }
    return { activeSlot: 1, slots };
  }

  function sanitizeSlotData(rawSlot, pid, slotId = 1) {
    const base = buildDefaultSlot(pid, slotId);
    if (!rawSlot || typeof rawSlot !== "object") return base;
    const out = { ...base };
    out.slot = clampNum(slotId, 1, 6, 1);
    out.name = sanitizePlainText(rawSlot.name, 40, base.name);
    out.ledColor = sanitizeHexColor(rawSlot.ledColor, base.ledColor);
    if (rawSlot.pollingHz !== undefined) {
      const hz = Number(rawSlot.pollingHz);
      out.pollingHz = ALLOWED_POLLING_RATES.has(hz) ? hz : base.pollingHz || 1000;
    }
    if (rawSlot.lighting && typeof rawSlot.lighting === "object") {
      const eff = String(rawSlot.lighting.effect || "static");
      out.lighting = {
        effect: ALLOWED_CHROMA_EFFECTS.has(eff) ? eff : "static",
        color1: sanitizeHexColor(rawSlot.lighting.color1, "#00e676"),
        color2: sanitizeHexColor(rawSlot.lighting.color2, "#00b0ff"),
        brightness: clampNum(rawSlot.lighting.brightness, 0, 100, 100),
        speed: clampNum(rawSlot.lighting.speed, 1, 3, 2),
        waveDirection: clampNum(rawSlot.lighting.waveDirection, 1, 2, 1),
      };
    }
    if (rawSlot.actuationMm !== undefined) out.actuationMm = clampNum(rawSlot.actuationMm, 0.1, 4.0, 1.2);
    if (rawSlot.rtEnabled !== undefined) out.rtEnabled = Boolean(rawSlot.rtEnabled);
    if (rawSlot.continuousRt !== undefined) out.continuousRt = Boolean(rawSlot.continuousRt);
    if (rawSlot.rtDownMm !== undefined) out.rtDownMm = clampNum(rawSlot.rtDownMm, 0.1, 4.0, 0.3);
    if (rawSlot.rtUpMm !== undefined) out.rtUpMm = clampNum(rawSlot.rtUpMm, 0.1, 4.0, 0.3);
    if (rawSlot.snapTapEnabled !== undefined) out.snapTapEnabled = Boolean(rawSlot.snapTapEnabled);
    if (rawSlot.snapKeyA !== undefined) out.snapKeyA = sanitizePlainText(rawSlot.snapKeyA, 8, "A");
    if (rawSlot.snapKeyB !== undefined) out.snapKeyB = sanitizePlainText(rawSlot.snapKeyB, 8, "D");

    if (Array.isArray(rawSlot.dpiStages)) {
      out.dpiStages = rawSlot.dpiStages.slice(0, 5).map((st, idx) => ({
        stage: idx + 1,
        enabled: st?.enabled !== false,
        x: clampNum(st?.x, 100, 45000, 1600),
        y: clampNum(st?.y ?? st?.x, 100, 45000, 1600),
        color: sanitizeHexColor(st?.color, "#00e676"),
      }));
      out.activeStageIndex = clampNum(rawSlot.activeStageIndex, 1, Math.max(1, out.dpiStages.length), 3);
      out.independentXY = Boolean(rawSlot.independentXY);
    }

    if (rawSlot.audio && typeof rawSlot.audio === "object") {
      const bands = Array.isArray(rawSlot.audio.eqBands)
        ? rawSlot.audio.eqBands.slice(0, 10).map((b) => clampNum(b, -12, 12, 0))
        : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      while (bands.length < 10) bands.push(0);
      out.audio = {
        volume: clampNum(rawSlot.audio.volume, 0, 100, 82),
        muted: Boolean(rawSlot.audio.muted),
        micVolume: clampNum(rawSlot.audio.micVolume, 0, 100, 85),
        micMuted: Boolean(rawSlot.audio.micMuted),
        sidetoneEnabled: rawSlot.audio.sidetoneEnabled !== false,
        sidetoneVolume: clampNum(rawSlot.audio.sidetoneVolume, 0, 100, 35),
        eqPreset: clampNum(rawSlot.audio.eqPreset, 0, 5, 0),
        eqBands: bands,
        hapticsIntensity: clampNum(rawSlot.audio.hapticsIntensity, 0, 100, 0),
        bassBoost: clampNum(rawSlot.audio.bassBoost, 0, 100, 40),
        voiceClarity: clampNum(rawSlot.audio.voiceClarity, 0, 100, 60),
        normalization: Boolean(rawSlot.audio.normalization),
      };
    }

    if (rawSlot.controller && typeof rawSlot.controller === "object") {
      out.controller = {
        leftDeadzone: clampNum(rawSlot.controller.leftDeadzone, 0, 30, 5),
        rightDeadzone: clampNum(rawSlot.controller.rightDeadzone, 0, 30, 5),
        circularityMode: rawSlot.controller.circularityMode ? 1 : 0,
        clutchSensitivity: clampNum(rawSlot.controller.clutchSensitivity, 10, 100, 50),
        leftHairTrigger: rawSlot.controller.leftHairTrigger !== false,
        rightHairTrigger: rawSlot.controller.rightHairTrigger !== false,
        leftTriggerActuation: clampNum(rawSlot.controller.leftTriggerActuation, 10, 100, 35),
        rightTriggerActuation: clampNum(rawSlot.controller.rightTriggerActuation, 10, 100, 35),
        leftMotor: clampNum(rawSlot.controller.leftMotor, 0, 100, 80),
        rightMotor: clampNum(rawSlot.controller.rightMotor, 0, 100, 80),
      };
    }

    if (rawSlot.accessory && typeof rawSlot.accessory === "object") {
      out.accessory = {
        ledCount: clampNum(rawSlot.accessory.ledCount, 1, 60, 15),
        fanMode: clampNum(rawSlot.accessory.fanMode, 0, 2, 0),
        fanRpmPct: clampNum(rawSlot.accessory.fanRpmPct, 20, 100, 60),
      };
    }

    return out;
  }

  function sanitizeDeviceProfile(rawProf, pid) {
    const base = buildDefaultDeviceProfile(pid);
    if (!rawProf || typeof rawProf !== "object") return base;
    const meta = getDeviceMeta(pid);
    const maxSlots = meta.maxSlots || (meta.category === "keyboard-analog" ? 6 : 5);
    const activeSlot = clampNum(rawProf.activeSlot, 1, maxSlots, 1);
    const slots = {};
    for (let s = 1; s <= maxSlots; s++) {
      slots[s] = sanitizeSlotData(rawProf.slots?.[s], pid, s);
    }
    return { activeSlot, slots };
  }

  let devices = [];
  let selectedPid = 679;
  let driverState = {
    selectedPid: 679,
    deviceMode: "normal",
    profilesByPid: {
      679: buildDefaultDeviceProfile(679),
      193: buildDefaultDeviceProfile(193),
    },
  };

  // WebHID + WebUSB Runtime State (100% Zero-Install Browser Execution)
  const webHidHandlesByPid = new Map(); // pid -> HIDDevice[] (sorted by control interface score)
  const webUsbDevicesByPid = new Map(); // pid -> USBDevice[] (Razer WebUSB handles for that PID)
  const claimedUsbInterfaces = new WeakMap(); // USBDevice -> Set<interfaceNumber>
  const onboardChromaFlashedByPid = new Map(); // pid -> boolean (true when 0x0F/0x02 was written to mi_03 NVRAM)
  let initialHardwareSlotSynced = false;
  const webHidMutexByPid = new Map(); // pid -> Promise
  const lampArrayCountByPid = new Map(); // pid -> number of physical LEDs (e.g. 87)
  const lampArrayTimerByPid = new Map(); // pid -> intervalId for animated LampArray effects
  const lampArrayGenByPid = new Map(); // pid -> monotonic generation counter to cancel stale effect frames
  const lampArrayMutexByPid = new Map(); // pid -> Promise serializing Report ID 4/6 transfers

  function isWindowsPlatform() {
    const plat = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || "";
    return /win/i.test(plat);
  }

  function hasAnyRazerDevice() {
    return webHidHandlesByPid.size > 0 || webUsbDevicesByPid.size > 0;
  }

  function hasCompatibleDevice() {
    if (!window.isSecureContext || (!navigator.hid && !navigator.usb)) return false;
    for (const pid of webHidHandlesByPid.keys()) {
      if (Protocol25.KNOWN_DEVICES[pid]) return true;
    }
    for (const pid of webUsbDevicesByPid.keys()) {
      if (Protocol25.KNOWN_DEVICES[pid]) return true;
    }
    return false;
  }

  function updateCompatibilityUI() {
    const notice = document.getElementById("compatNotice");
    const title = document.getElementById("compatTitle");
    const text = document.getElementById("compatText");
    const workspace = document.getElementById("viewWorkspace");
    const hwtest = document.getElementById("viewHardwareTest");
    const navWorkspace = document.querySelector('[data-main-view="workspace"]');
    const navHwtest = document.querySelector('[data-main-view="hwtest"]');
    const usbPairBtn = document.getElementById("btnWebUsbPair");
    const pairBtn = document.getElementById("btnWebHidPair");
    const bannerPairBtn = document.getElementById("btnBannerPair");
    const compatUsbPair = document.getElementById("btnCompatWebUsb");
    const compatPair = document.getElementById("btnCompatPair");
    const compatCatalog = document.getElementById("btnCompatCatalog");
    const slotStrip = document.querySelector(".ws-slot-strip");
    const save = document.getElementById("btnSaveSlot");
    const reset = document.getElementById("btnResetSlot");
    const exportBtn = document.getElementById("btnExportProfiles");
    const importLabel = document.getElementById("lblImportProfiles");

    const connected = hasCompatibleDevice();
    const anyRazer = hasAnyRazerDevice();
    const secure = window.isSecureContext;
    const hid = !!navigator.hid;
    const usb = !!navigator.usb;
    const supportsUsb = hid || usb;
    const preferWebUsb = usb && isWindowsPlatform();

    if (notice) notice.hidden = connected;
    if (navWorkspace) navWorkspace.disabled = !connected;
    if (navHwtest) navHwtest.disabled = !connected;
    if (slotStrip) slotStrip.style.display = connected ? "" : "none";
    for (const el of [save, reset, exportBtn, importLabel]) {
      if (el) el.style.display = connected ? "" : "none";
    }

    if (!connected) {
      if (workspace) workspace.hidden = true;
      if (hwtest) hwtest.hidden = true;
    } else {
      const visible = document.querySelector(".ws-page:not([hidden])");
      if (!visible || visible.id === "viewWorkspace" || visible.id === "viewHardwareTest") {
        if (workspace) workspace.hidden = false;
        if (hwtest) hwtest.hidden = true;
      }
    }

    if (usbPairBtn) {
      usbPairBtn.hidden = !usb || !secure;
      usbPairBtn.classList.toggle("is-primary", preferWebUsb || !hid);
    }
    if (pairBtn) {
      pairBtn.hidden = !hid || !secure;
      pairBtn.classList.toggle("is-primary", !preferWebUsb);
    }
    if (bannerPairBtn) bannerPairBtn.hidden = !supportsUsb || !secure;
    if (compatUsbPair) {
      compatUsbPair.hidden = !usb || !secure;
      compatUsbPair.classList.toggle("is-primary", preferWebUsb || !hid);
    }
    if (compatPair) {
      compatPair.hidden = !hid || !secure;
      compatPair.classList.toggle("is-primary", !preferWebUsb);
    }
    if (compatCatalog) compatCatalog.hidden = false;

    if (!title || !text) return;
    if (!secure) {
      title.textContent = "HTTPS is required";
      text.textContent =
        "WebHID/WebUSB is only available in a secure context. Open https://websynap.se/ (or localhost for local testing) in a Chromium-based browser.";
    } else if (!supportsUsb) {
      title.textContent = "Chromium-based browser required";
      text.textContent =
        "This site uses WebHID or WebUSB. Open it in Chrome, Edge, Brave, Opera, or Vivaldi. Firefox and Safari do not support these APIs.";
    } else if (!anyRazer) {
      title.textContent = "No compatible Razer device detected";
      text.textContent = isWindowsPlatform()
        ? "Connect your Razer keyboard or mouse via USB and close Razer Synapse. To save profiles to onboard memory on Windows, bind WinUSB to Interface 3 (see the Windows Setup guide above) and click “⚡ Connect WebUSB (Onboard Save)”, or click “Connect WebHID” for live LampArray preview."
        : "Connect a Razer keyboard or mouse with a data-capable USB cable, close Razer Synapse, then click “Connect WebHID” or “Connect WebUSB” and grant USB access.";
    } else if (!connected) {
      title.textContent = "Connected Razer device is not supported";
      text.textContent =
        "A Razer device was detected, but it is not in the supported Protocol 25 catalog. Check the supported-devices list or try a different Razer model.";
    }
  }

  let selectedKeys = new Set();
  let focusedRemapKey = "W";
  let kbdActiveLayer = "standard";
  let mouseActiveLayer = "standard";
  let stagedQueue = []; // Used when uiPrefs.instantFlash === false
  let lastTestReport = null;

  function persistDriverState() {
    try {
      localStorage.setItem(STORAGE_KEY_STATE, JSON.stringify(driverState));
    } catch {
      // ignore storage quota errors
    }
  }

  function loadStoredState() {
    try {
      const rawState = localStorage.getItem(STORAGE_KEY_STATE);
      if (rawState) {
        const parsed = safeJsonParse(rawState, MAX_IMPORT_BYTES * 2);
        if (parsed && typeof parsed === "object") {
          const cleanProfiles = {};
          if (parsed.profilesByPid && typeof parsed.profilesByPid === "object") {
            for (const [k, v] of Object.entries(parsed.profilesByPid)) {
              const numPid = clampNum(k, 1, 65535, 0);
              if (numPid > 0) cleanProfiles[numPid] = sanitizeDeviceProfile(v, numPid);
            }
          }
          const migratedV2 = Boolean(parsed.slotLightingMigratedV2);
          if (!migratedV2) {
            for (const [pidStr, prof] of Object.entries(cleanProfiles)) {
              const numPid = Number(pidStr);
              const slots = prof?.slots || {};
              for (const [sStr, sObj] of Object.entries(slots)) {
                const sId = Number(sStr);
                if (
                  sId >= 2 &&
                  sObj?.lighting &&
                  sObj.lighting.effect === "static" &&
                  (sObj.lighting.color1 || "").toLowerCase() === "#00e676"
                ) {
                  const defSlot = buildDefaultSlot(numPid, sId);
                  sObj.lighting = { ...defSlot.lighting };
                }
              }
            }
          }
          driverState = {
            selectedPid: clampNum(parsed.selectedPid, 1, 65535, 679),
            deviceMode: parsed.deviceMode === "driver" ? "driver" : "normal",
            slotLightingMigratedV2: true,
            profilesByPid: { ...driverState.profilesByPid, ...cleanProfiles },
          };
          selectedPid = Number(driverState.selectedPid || 679);
          if (!migratedV2) persistDriverState();
        }
      }
      const rawPrefs = localStorage.getItem(STORAGE_KEY_PREFS);
      if (rawPrefs) {
        const parsedPrefs = safeJsonParse(rawPrefs, 16384);
        if (parsedPrefs && typeof parsedPrefs === "object") {
          const validThemes = new Set(THEME_LIST.map((t) => t.slug));
          uiPrefs = {
            theme: validThemes.has(parsedPrefs.theme) ? parsedPrefs.theme : "venom",
            instantFlash: parsedPrefs.instantFlash !== false,
            soundsEnabled: Boolean(parsedPrefs.soundsEnabled),
            reducedMotion: Boolean(parsedPrefs.reducedMotion),
            sidebarCollapsed: Boolean(parsedPrefs.sidebarCollapsed),
          };
        }
      }
    } catch {
      // ignore parse errors
    }
    if (!driverState.profilesByPid[679]) driverState.profilesByPid[679] = buildDefaultDeviceProfile(679);
    if (!driverState.profilesByPid[193]) driverState.profilesByPid[193] = buildDefaultDeviceProfile(193);
  }

  const HARDWARE_NATIVE_CHROMA_EFFECTS = new Set([
    "off",
    "static",
    "breathing",
    "breathingDual",
    "spectrum",
    "wave",
    "reactive",
    "ripple",
    "starlight",
    "fire",
    "wheel",
  ]);

  function deviceHasProtocol25FeatureReport(dev) {
    const cols = dev?.collections || [];
    return cols.some((c) => {
      if (c.usagePage === 0x0059 || c.usagePage >= 0xff00) return false;
      const fReports = c.featureReports || [];
      if (fReports.some((r) => r.reportId === 0)) return true;
      // On Windows, hidparse.sys generates a ReportItem with report_count=0 when the
      // 90-byte Feature Report 0 is declared as Feature (Constant) (0xB1, 0x01) without a Usage tag
      // (e.g. Huntsman V3 Pro TKL mi_03: UP=0x000C, U=0x0001). Chromium's HidPreparsedData::GetReportItems
      // skips report_count==0 items so c.featureReports is [], even though max_feature_report_size is 90
      // and dev.sendFeatureReport(0x00, ...) / dev.receiveFeatureReport(0x00) work natively.
      const inCount = (c.inputReports || []).length;
      const outCount = (c.outputReports || []).length;
      return inCount === 0 && outCount === 0 && fReports.length === 0;
    });
  }

  function deviceHasLampArray(dev) {
    const cols = dev?.collections || [];
    return cols.some((c) => c.usagePage === 0x0059 && (c.featureReports || []).length > 0);
  }

  function findLampArrayDevice(pidKey) {
    const list = webHidHandlesByPid.get(Number(pidKey)) || [];
    return list.find((d) => deviceHasLampArray(d)) || null;
  }

  function scoreWebHidCollection(dev) {
    let score = 0;
    const cols = dev.collections || [];
    let hasReport0 = false;
    for (const c of cols) {
      if (c.usagePage === 0x0059) {
        score += 50; // Keep LampArray accessible for findLampArrayDevice, sorted below Report 0
        continue;
      }
      if (c.usagePage >= 0xff00) {
        score -= 5000; // Strictly exclude vendor keystream interface (IF=5)
        continue;
      }
      const fReports = c.featureReports || [];
      const inCount = (c.inputReports || []).length;
      const outCount = (c.outputReports || []).length;
      const isWindowsConstantFeature0 =
        inCount === 0 && outCount === 0 && fReports.length === 0 && c.usagePage === 0x000c && c.usage === 0x0001;
      const isFeatureOnlyCollection = inCount === 0 && outCount === 0 && fReports.length === 0;
      if (fReports.length > 0) {
        score += 1000;
        if (fReports.some((r) => r.reportId === 0)) {
          score += 1500;
          hasReport0 = true;
        }
      } else if (isWindowsConstantFeature0) {
        score += 2600;
        hasReport0 = true;
      } else if (isFeatureOnlyCollection) {
        score += 2000;
        hasReport0 = true;
      }
      if (c.usagePage === 1 && c.usage === 2) score += 200;
      if (c.usagePage === 12 && c.usage === 1) score += 150;
      if (c.usagePage === 1 && c.usage === 6 && fReports.length === 0) score -= 500;
    }
    if (!hasReport0) score -= 800;
    return score;
  }

  function classifyDeviceCategory(pid, productName = "", collections = []) {
    const meta = Protocol25.getDeviceMetadata
      ? Protocol25.getDeviceMetadata(pid, productName)
      : Protocol25.KNOWN_DEVICES[pid];
    if (meta?.category) return meta.category;
    if (collections.some((c) => c.usagePage === 1 && c.usage === 6)) return "keyboard";
    return "mouse";
  }

  function hsvToRgb(hDeg, s, v) {
    const h = ((hDeg % 360) + 360) % 360;
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let r1 = 0, g1 = 0, b1 = 0;
    if (h < 60) [r1, g1, b1] = [c, x, 0];
    else if (h < 120) [r1, g1, b1] = [x, c, 0];
    else if (h < 180) [r1, g1, b1] = [0, c, x];
    else if (h < 240) [r1, g1, b1] = [0, x, c];
    else if (h < 300) [r1, g1, b1] = [x, 0, c];
    else [r1, g1, b1] = [c, 0, x];
    return [
      Math.round((r1 + m) * 255),
      Math.round((g1 + m) * 255),
      Math.round((b1 + m) * 255),
    ];
  }

  // Hardware-verified 87-Lamp Coordinate & Input-Binding Table for Razer Huntsman V3 Pro TKL (PID 0x02A7)
  // Extracted from USB HID LampArray Report IDs 1..3 (x/y in mm, usage = USB HID Keyboard Usage Page 0x07)
  const TKL_87_LAMPS = [
    { id: 0, x: 16, y: 14, usage: 0x29, code: "Escape", label: "ESC" },
    { id: 1, x: 54, y: 14, usage: 0x3a, code: "F1", label: "F1" },
    { id: 2, x: 73, y: 14, usage: 0x3b, code: "F2", label: "F2" },
    { id: 3, x: 92, y: 14, usage: 0x3c, code: "F3", label: "F3" },
    { id: 4, x: 111, y: 14, usage: 0x3d, code: "F4", label: "F4" },
    { id: 5, x: 139, y: 14, usage: 0x3e, code: "F5", label: "F5" },
    { id: 6, x: 158, y: 14, usage: 0x3f, code: "F6", label: "F6" },
    { id: 7, x: 177, y: 14, usage: 0x40, code: "F7", label: "F7" },
    { id: 8, x: 196, y: 14, usage: 0x41, code: "F8", label: "F8" },
    { id: 9, x: 225, y: 14, usage: 0x42, code: "F9", label: "F9" },
    { id: 10, x: 244, y: 14, usage: 0x43, code: "F10", label: "F10" },
    { id: 11, x: 263, y: 14, usage: 0x44, code: "F11", label: "F11" },
    { id: 12, x: 282, y: 14, usage: 0x45, code: "F12", label: "F12" },
    { id: 13, x: 318, y: 14, usage: 0x46, code: "PrintScreen", label: "PRT" },
    { id: 14, x: 350, y: 14, usage: 0x47, code: "ScrollLock", label: "SCR" },
    { id: 15, x: 16, y: 39, usage: 0x35, code: "Backquote", label: "`" },
    { id: 16, x: 35, y: 39, usage: 0x1e, code: "Digit1", label: "1" },
    { id: 17, x: 54, y: 39, usage: 0x1f, code: "Digit2", label: "2" },
    { id: 18, x: 73, y: 39, usage: 0x20, code: "Digit3", label: "3" },
    { id: 19, x: 92, y: 39, usage: 0x21, code: "Digit4", label: "4" },
    { id: 20, x: 111, y: 39, usage: 0x22, code: "Digit5", label: "5" },
    { id: 21, x: 130, y: 39, usage: 0x23, code: "Digit6", label: "6" },
    { id: 22, x: 149, y: 39, usage: 0x24, code: "Digit7", label: "7" },
    { id: 23, x: 168, y: 39, usage: 0x25, code: "Digit8", label: "8" },
    { id: 24, x: 187, y: 39, usage: 0x26, code: "Digit9", label: "9" },
    { id: 25, x: 206, y: 39, usage: 0x27, code: "Digit0", label: "0" },
    { id: 26, x: 225, y: 39, usage: 0x2d, code: "Minus", label: "-" },
    { id: 27, x: 244, y: 39, usage: 0x2e, code: "Equal", label: "=" },
    { id: 28, x: 272, y: 39, usage: 0x2a, code: "Backspace", label: "BKSP" },
    { id: 29, x: 308, y: 39, usage: 0x49, code: "Insert", label: "INS" },
    { id: 30, x: 327, y: 39, usage: 0x4a, code: "Home", label: "HOME" },
    { id: 31, x: 346, y: 39, usage: 0x4b, code: "PageUp", label: "PGUP" },
    { id: 32, x: 21, y: 58, usage: 0x2b, code: "Tab", label: "TAB" },
    { id: 33, x: 44, y: 58, usage: 0x14, code: "KeyQ", label: "Q" },
    { id: 34, x: 63, y: 58, usage: 0x1a, code: "KeyW", label: "W" },
    { id: 35, x: 82, y: 58, usage: 0x08, code: "KeyE", label: "E" },
    { id: 36, x: 101, y: 58, usage: 0x15, code: "KeyR", label: "R" },
    { id: 37, x: 120, y: 58, usage: 0x17, code: "KeyT", label: "T" },
    { id: 38, x: 139, y: 58, usage: 0x1c, code: "KeyY", label: "Y" },
    { id: 39, x: 158, y: 58, usage: 0x18, code: "KeyU", label: "U" },
    { id: 40, x: 177, y: 58, usage: 0x0c, code: "KeyI", label: "I" },
    { id: 41, x: 196, y: 58, usage: 0x12, code: "KeyO", label: "O" },
    { id: 42, x: 215, y: 58, usage: 0x13, code: "KeyP", label: "P" },
    { id: 43, x: 234, y: 58, usage: 0x2f, code: "BracketLeft", label: "[" },
    { id: 44, x: 253, y: 58, usage: 0x30, code: "BracketRight", label: "]" },
    { id: 45, x: 279, y: 68, usage: 0x28, code: "Enter", label: "ENTER" },
    { id: 46, x: 308, y: 58, usage: 0x4c, code: "Delete", label: "DEL" },
    { id: 47, x: 327, y: 58, usage: 0x4d, code: "End", label: "END" },
    { id: 48, x: 346, y: 58, usage: 0x4e, code: "PageDown", label: "PGDN" },
    { id: 49, x: 23, y: 77, usage: 0x39, code: "CapsLock", label: "CAPS" },
    { id: 50, x: 49, y: 77, usage: 0x04, code: "KeyA", label: "A" },
    { id: 51, x: 68, y: 77, usage: 0x16, code: "KeyS", label: "S" },
    { id: 52, x: 87, y: 77, usage: 0x07, code: "KeyD", label: "D" },
    { id: 53, x: 106, y: 77, usage: 0x09, code: "KeyF", label: "F" },
    { id: 54, x: 125, y: 77, usage: 0x0a, code: "KeyG", label: "G" },
    { id: 55, x: 144, y: 77, usage: 0x0b, code: "KeyH", label: "H" },
    { id: 56, x: 163, y: 77, usage: 0x0d, code: "KeyJ", label: "J" },
    { id: 57, x: 182, y: 77, usage: 0x0e, code: "KeyK", label: "K" },
    { id: 58, x: 201, y: 77, usage: 0x0f, code: "KeyL", label: "L" },
    { id: 59, x: 220, y: 77, usage: 0x33, code: "Semicolon", label: ";" },
    { id: 60, x: 239, y: 77, usage: 0x34, code: "Quote", label: "'" },
    { id: 61, x: 258, y: 77, usage: 0x32, code: "Backslash", label: "\\" },
    { id: 62, x: 18, y: 96, usage: 0xe1, code: "ShiftLeft", label: "LSHIFT" },
    { id: 63, x: 40, y: 96, usage: 0x64, code: "IntlBackslash", label: "LSHIFT" },
    { id: 64, x: 59, y: 96, usage: 0x1d, code: "KeyZ", label: "Z" },
    { id: 65, x: 78, y: 96, usage: 0x1b, code: "KeyX", label: "X" },
    { id: 66, x: 97, y: 96, usage: 0x06, code: "KeyC", label: "C" },
    { id: 67, x: 116, y: 96, usage: 0x19, code: "KeyV", label: "V" },
    { id: 68, x: 135, y: 96, usage: 0x05, code: "KeyB", label: "B" },
    { id: 69, x: 154, y: 96, usage: 0x11, code: "KeyN", label: "N" },
    { id: 70, x: 173, y: 96, usage: 0x10, code: "KeyM", label: "M" },
    { id: 71, x: 192, y: 96, usage: 0x36, code: "Comma", label: "," },
    { id: 72, x: 211, y: 96, usage: 0x37, code: "Period", label: "." },
    { id: 73, x: 230, y: 96, usage: 0x38, code: "Slash", label: "/" },
    { id: 74, x: 265, y: 96, usage: 0xe5, code: "ShiftRight", label: "RSHIFT" },
    { id: 75, x: 327, y: 96, usage: 0x52, code: "ArrowUp", label: "↑" },
    { id: 76, x: 18, y: 115, usage: 0xe0, code: "ControlLeft", label: "LCTRL" },
    { id: 77, x: 42, y: 115, usage: 0xe3, code: "MetaLeft", label: "WIN" },
    { id: 78, x: 66, y: 115, usage: 0xe2, code: "AltLeft", label: "LALT" },
    { id: 79, x: 137, y: 115, usage: 0x2c, code: "Space", label: "SPACE" },
    { id: 80, x: 208, y: 115, usage: 0xe6, code: "AltRight", label: "RALT" },
    { id: 81, x: 232, y: 115, usage: 0x00, code: "Fn", label: "FN" },
    { id: 82, x: 256, y: 115, usage: 0x65, code: "ContextMenu", label: "MENU" },
    { id: 83, x: 279, y: 115, usage: 0xe4, code: "ControlRight", label: "RCTRL" },
    { id: 84, x: 308, y: 115, usage: 0x50, code: "ArrowLeft", label: "←" },
    { id: 85, x: 327, y: 115, usage: 0x51, code: "ArrowDown", label: "↓" },
    { id: 86, x: 346, y: 115, usage: 0x4f, code: "ArrowRight", label: "→" },
  ];

  const lampLayoutCacheByPid = new Map();
  const reactiveTriggerByPid = new Map();
  const slotIndicatorOverlayByPid = new Map();
  const SLOT_NAV_KEY_LABELS = { 1: "INS", 2: "HOME", 3: "PGUP", 4: "DEL", 5: "END", 6: "PGDN" };
  const SLOT_NAV_LABEL_SET = new Set(["INS", "HOME", "PGUP", "DEL", "END", "PGDN"]);
  const SLOT_RGB_BY_ID = {
    1: [255, 255, 255],
    2: [255, 59, 48],
    3: [0, 230, 118],
    4: [0, 122, 255],
    5: [0, 210, 255],
    6: [217, 70, 239],
  };
  let reactiveKeyListenersBound = false;
  let isPageUnloading = false;
  // PIDs whose LampArray (usage page 0x59) this page switched to host control (AutonomousMode = 0)
  const lampHostControlPids = new Set();
  // PIDs this page explicitly put into Driver Mode (0x00/0x04 mode 0x03)
  const driverModeActivePids = new Set();
  // Verified Protocol 25 transport per PID:
  //   { mode: "webhid", dev: HIDDevice, label: string }
  //   { mode: "webusb", dev: USBDevice, interfaceNumber: number, label: string }
  const protocolDeviceByPid = new Map();
  const protocolProbeByPid = new Map();
  const protocolProbeErrorByPid = new Map();
  const protocolProbeFailedSigByPid = new Map();
  const protocolUsbClaimBlockedByPid = new Map();

  // ==========================================================================
  // Unthrottled Background Chroma Timer Worker + Web Lock Keep-Alive
  // Prevents Chromium from throttling RGB animations to 1 FPS when websynap.se
  // is minimized or in a background tab while gaming.
  // ==========================================================================
  let chromaTimerWorker = null;
  let nextLampTimerId = 1;
  const lampTimerCallbacks = new Map();
  let chromaWakeLockRelease = null;

  function ensureChromaWakeLock() {
    if (chromaWakeLockRelease || !navigator.locks || typeof navigator.locks.request !== "function") return;
    try {
      navigator.locks
        .request("websynapse_chroma_engine_active", () => new Promise((resolve) => {
          chromaWakeLockRelease = resolve;
        }))
        .catch(() => {
          chromaWakeLockRelease = null;
        });
    } catch {
      // ignore if Web Locks API is unavailable
    }
  }

  function releaseChromaWakeLockIfIdle() {
    if (lampTimerCallbacks.size === 0 && typeof chromaWakeLockRelease === "function") {
      const rel = chromaWakeLockRelease;
      chromaWakeLockRelease = null;
      try {
        rel();
      } catch {
        // ignore
      }
    }
  }

  function getChromaTimerWorker() {
    if (chromaTimerWorker !== null) return chromaTimerWorker;
    try {
      const w = new Worker("./timer-worker.js");
      w.addEventListener("message", (ev) => {
        const id = ev.data?.id;
        const cb = lampTimerCallbacks.get(id);
        if (typeof cb === "function") cb();
      });
      w.addEventListener("error", () => {
        chromaTimerWorker = false;
      });
      chromaTimerWorker = w;
    } catch {
      chromaTimerWorker = false;
    }
    return chromaTimerWorker;
  }

  function setLampInterval(fn, intervalMs) {
    ensureChromaWakeLock();
    const worker = getChromaTimerWorker();
    if (worker) {
      const id = nextLampTimerId++;
      lampTimerCallbacks.set(id, fn);
      worker.postMessage({ cmd: "start", id, intervalMs });
      return { isWorker: true, id };
    }
    const nativeId = setInterval(fn, intervalMs);
    return { isWorker: false, id: nativeId };
  }

  function clearLampInterval(handle) {
    if (!handle) return;
    if (typeof handle === "object" && handle.isWorker) {
      lampTimerCallbacks.delete(handle.id);
      if (chromaTimerWorker) {
        try {
          chromaTimerWorker.postMessage({ cmd: "stop", id: handle.id });
        } catch {
          // ignore
        }
      }
      releaseChromaWakeLockIfIdle();
    } else {
      clearInterval(typeof handle === "object" ? handle.id : handle);
    }
  }

  // ==========================================================================
  // Hardware Autonomous Handoff on Tab Close / Unload / Freeze
  // Matches Electron Razer Synapse's setDeviceToDefaultOnExit():
  // When websynap.se is closed while an animated or interactive effect is active,
  // immediately switch USB HID LampArray Report ID 6 back to AutonomousMode = 1
  // ([0x01]) and drain the USB control pipe so the keyboard's onboard MCU
  // continues animating autonomously instead of freezing on the last frame.
  // ==========================================================================
  let lifecycleExitListenersBound = false;

  async function releaseLampArrayToHardwareAutonomous(pidKey) {
    const numPid = Number(pidKey);
    const gen = (lampArrayGenByPid.get(numPid) || 0) + 1;
    lampArrayGenByPid.set(numPid, gen);
    const prevTimer = lampArrayTimerByPid.get(numPid);
    if (prevTimer) {
      clearLampInterval(prevTimer);
      lampArrayTimerByPid.delete(numPid);
    }
    reactiveTriggerByPid.delete(numPid);
    // Only hand LampArray back if this page actually took host control, so we never
    // poke the lighting engine of a keyboard that is already running autonomously.
    if (!lampHostControlPids.has(numPid)) return;
    const lampDev = findLampArrayDevice(numPid);
    if (!lampDev) return;
    try {
      if (!lampDev.opened) {
        await lampDev.open();
      }
      await lampDev.sendFeatureReport(6, new Uint8Array([1]));
      lampHostControlPids.delete(numPid);
    } catch {
      // ignore if LampArray is unavailable
    }
  }

  function releaseAllLampArraysToAutonomous(shouldSpinDrain = true, includeDeviceMode = true) {
    isPageUnloading = true;

    // 1. Stop all active software frame timers and invalidate in-flight frame loops
    for (const [pid, timer] of lampArrayTimerByPid.entries()) {
      clearLampInterval(timer);
      lampArrayGenByPid.set(pid, (lampArrayGenByPid.get(pid) || 0) + 1);
    }
    lampArrayTimerByPid.clear();

    // 2. Hand the keyboard back exactly as Synapse 4 does on exit (A.jf.onunload -> setDeviceMode(0, 0)),
    // but ONLY for state this page actually changed. Everything configured through Protocol 25 already
    // lives in the keyboard's onboard memory, so nothing has to be re-sent here. In particular we no
    // longer push setActiveProfileSlot() on close: that switched the keyboard to whatever slot the
    // browser had cached and made it visibly re-initialise when the tab was closed.
    let dispatchedAny = false;
    const allKnownPids = new Set([...webHidHandlesByPid.keys(), ...webUsbDevicesByPid.keys()]);
    for (const rawPid of allKnownPids) {
      const pid = Number(rawPid);
      const pHandle = protocolDeviceByPid.get(pid);
      if (includeDeviceMode && pHandle && driverModeActivePids.has(pid)) {
        try {
          const meta = Protocol25.KNOWN_DEVICES[pid] || {};
          const rawMode = Protocol25.Builders.setDeviceMode(0x00, 0x00);
          const body90 = rawMode.length === 91 ? rawMode.slice(1) : [...rawMode];
          if (meta.defaultTransactionId && body90[1] === 0x1f && meta.defaultTransactionId !== 0x1f) {
            body90[1] = meta.defaultTransactionId;
          }
          const modePkt = Uint8Array.from(validateOutgoingPacket90(body90));
          if (pHandle.mode === "webusb" && pHandle.dev?.opened) {
            void pHandle.dev
              .controlTransferOut(
                { requestType: "class", recipient: "interface", request: 0x09, value: 0x0300, index: pHandle.interfaceNumber },
                modePkt
              )
              .catch(() => {});
            driverModeActivePids.delete(pid);
            dispatchedAny = true;
          } else if (pHandle.mode === "webhid" && pHandle.dev?.opened) {
            void pHandle.dev.sendFeatureReport(0x00, modePkt).catch(() => {});
            driverModeActivePids.delete(pid);
            dispatchedAny = true;
          }
        } catch {
          // ignore
        }
      }

      if (!lampHostControlPids.has(pid)) continue;
      const list = webHidHandlesByPid.get(pid) || [];
      const lampDev = list.find((d) => deviceHasLampArray(d));
      if (!lampDev || !lampDev.opened) continue;

      try {
        // Close any interrupted multi-packet Report ID 4 frame with LampUpdateComplete = 1
        const finishRep4 = new Uint8Array(50);
        finishRep4[0] = 1;
        finishRep4[1] = 1;
        void lampDev.sendFeatureReport(4, finishRep4).catch(() => {});
        // Switch hardware back to AutonomousMode = 1 (onboard effect engine)
        void lampDev.sendFeatureReport(6, new Uint8Array([1])).catch(() => {});
        lampHostControlPids.delete(pid);
        dispatchedAny = true;
      } catch {
        // ignore unload errors
      }
    }

    // 3. Hold the synchronous unload handler for 42ms so Chromium's browser process IO thread
    // completes the IOCTL_HID_SET_FEATURE (Report ID 6 = [1]) USB control transfer before
    // RenderFrameHost teardown closes HidConnectionWin.
    if (shouldSpinDrain && dispatchedAny) {
      const drainUntil = performance.now() + 42;
      while (performance.now() < drainUntil) {
        // synchronous USB control pipe drain
      }
    }
  }

  function ensureLifecycleExitListeners() {
    if (lifecycleExitListenersBound) return;
    lifecycleExitListenersBound = true;

    window.addEventListener("beforeunload", () => {
      releaseAllLampArraysToAutonomous(true);
    });
    window.addEventListener("pagehide", () => {
      releaseAllLampArraysToAutonomous(true);
    });
    window.addEventListener("unload", () => {
      releaseAllLampArraysToAutonomous(true);
    });
    document.addEventListener("freeze", () => {
      releaseAllLampArraysToAutonomous(false, false);
    });
    // On resume / back-forward-cache restore only a *software* effect (rain, aurora, …) needs the
    // browser again; hardware effects are already running from the keyboard's onboard memory.
    const resumeSoftwareEffect = () => {
      isPageUnloading = false;
      if (!findLampArrayDevice(selectedPid)) return;
      const eff = getActiveSlotData()?.lighting?.effect || "static";
      if (!HARDWARE_NATIVE_CHROMA_EFFECTS.has(eff)) {
        void applyLampArrayEffect(selectedPid);
      }
    };
    document.addEventListener("resume", resumeSoftwareEffect);
    window.addEventListener("pageshow", (ev) => {
      if (ev.persisted || isPageUnloading) resumeSoftwareEffect();
    });
  }

  function ensureReactiveKeyListeners() {
    if (reactiveKeyListenersBound) return;
    reactiveKeyListenersBound = true;

    window.addEventListener(
      "keydown",
      (ev) => {
        for (const handler of reactiveTriggerByPid.values()) {
          if (typeof handler.onKeyDown === "function") {
            handler.onKeyDown(ev.code, ev.key);
          }
        }
      },
      { passive: true }
    );

    window.addEventListener(
      "keyup",
      (ev) => {
        for (const handler of reactiveTriggerByPid.values()) {
          if (typeof handler.onKeyUp === "function") {
            handler.onKeyUp(ev.code, ev.key);
          }
        }
      },
      { passive: true }
    );

    window.addEventListener(
      "blur",
      () => {
        for (const handler of reactiveTriggerByPid.values()) {
          if (typeof handler.onReleaseAll === "function") {
            handler.onReleaseAll();
          }
        }
      },
      { passive: true }
    );
  }

  function buildLampLayoutMeta(lampCount) {
    const lamps = [];
    const byCode = new Map();
    const byLabel = new Map();

    for (let id = 0; id < lampCount; id++) {
      const ref = TKL_87_LAMPS[id];
      const x = ref ? ref.x : 16 + ((id % 16) / 15) * 334;
      const y = ref ? ref.y : 14 + Math.floor(id / 16) * 20;
      const nx = Math.max(0, Math.min(1, (x - 16) / 334));
      const ny = Math.max(0, Math.min(1, (y - 14) / 101));
      const item = {
        id,
        x,
        y,
        nx,
        ny,
        code: ref?.code || "",
        label: ref?.label || "",
      };
      lamps.push(item);
      if (item.code) {
        if (!byCode.has(item.code)) byCode.set(item.code, []);
        byCode.get(item.code).push(id);
      }
      if (item.label) {
        if (!byLabel.has(item.label)) byLabel.set(item.label, []);
        byLabel.get(item.label).push(id);
      }
    }

    // Alias Pause/Break and IntlHash / NumpadEnter to nearest TKL keys
    if (byLabel.has("SCR") && !byCode.has("Pause")) byCode.set("Pause", byLabel.get("SCR"));
    if (byLabel.has("ENTER") && !byCode.has("NumpadEnter")) byCode.set("NumpadEnter", byLabel.get("ENTER"));
    if (byLabel.has("\\") && !byCode.has("IntlHash")) byCode.set("IntlHash", byLabel.get("\\"));

    // Sort lamp IDs horizontally from Left to Right (by X coordinate, then Y)
    // so multi-packet Report ID 4 updates scan horizontally instead of top-to-bottom.
    const sortedIdsByX = lamps
      .slice()
      .sort((a, b) => a.x - b.x || a.y - b.y || a.id - b.id)
      .map((l) => l.id);

    return { lamps, byCode, byLabel, sortedIdsByX };
  }

  async function applyLampArrayEffect(pidKey) {
    ensureLifecycleExitListeners();
    isPageUnloading = false;

    const numPid = Number(pidKey);
    const gen = (lampArrayGenByPid.get(numPid) || 0) + 1;
    lampArrayGenByPid.set(numPid, gen);

    const prevTimer = lampArrayTimerByPid.get(numPid);
    if (prevTimer) {
      clearLampInterval(prevTimer);
      lampArrayTimerByPid.delete(numPid);
    }
    reactiveTriggerByPid.delete(numPid);
    document.querySelectorAll(".keycap.is-reactive-lit").forEach((el) => el.classList.remove("is-reactive-lit"));

    const lampDev = findLampArrayDevice(numPid);
    if (!lampDev) return false;

    try {
      if (!lampDev.opened) {
        await lampDev.open();
      }
      if (lampArrayGenByPid.get(numPid) !== gen || isPageUnloading) return false;

      let lampCount = lampArrayCountByPid.get(numPid) || 0;
      if (!lampCount) {
        try {
          const attrView = await lampDev.receiveFeatureReport(1);
          if (attrView && attrView.byteLength >= 3) {
            const offset = attrView.getUint8(0) === 1 ? 1 : 0;
            lampCount = attrView.getUint16(offset, true);
          }
        } catch {
          // Fallback to 87 lamps (TKL matrix)
        }
        if (!lampCount || lampCount > 256) lampCount = 87;
        lampArrayCountByPid.set(numPid, lampCount);
      }

      let layout = lampLayoutCacheByPid.get(numPid);
      if (!layout || layout.lamps.length !== lampCount) {
        layout = buildLampLayoutMeta(lampCount);
        lampLayoutCacheByPid.set(numPid, layout);
      }

      const devProf = driverState.profilesByPid?.[numPid] || buildDefaultDeviceProfile(numPid);
      const slot = devProf.slots?.[devProf.activeSlot || 1] || {};
      const light = slot.lighting || {
        effect: "static",
        color1: "#00e676",
        color2: "#00d2ff",
        brightness: 100,
        speed: 2,
        waveDirection: 1,
      };
      const effect = light.effect || "static";
      const brScale = Math.max(0, Math.min(1, Number(light.brightness ?? 100) / 100));
      const hex = sanitizeHexColor(light.color1, "#00e676").slice(1);
      const baseR = parseInt(hex.slice(0, 2), 16) || 0;
      const baseG = parseInt(hex.slice(2, 4), 16) || 230;
      const baseB = parseInt(hex.slice(4, 6), 16) || 118;

      const hex2 = sanitizeHexColor(light.color2, "#00d2ff").slice(1);
      const secR = parseInt(hex2.slice(0, 2), 16) || 0;
      const secG = parseInt(hex2.slice(2, 4), 16) || 210;
      const secB = parseInt(hex2.slice(4, 6), 16) || 255;

      // Serialize LampArray feature report batches per device so profile switches never collide on MI_04
      const runExclusiveLampBatch = async (fn) => {
        if (isPageUnloading || lampArrayGenByPid.get(numPid) !== gen || !lampDev.opened) return;
        const prev = lampArrayMutexByPid.get(numPid) || Promise.resolve();
        let release;
        const next = new Promise((r) => {
          release = r;
        });
        lampArrayMutexByPid.set(numPid, prev.then(() => next));
        await prev;
        try {
          if (isPageUnloading || lampArrayGenByPid.get(numPid) !== gen || !lampDev.opened) return;
          await fn();
        } finally {
          release();
        }
      };

      // Report ID 6: LampArrayControlReport -> AutonomousMode = 0 (Host control)
      await runExclusiveLampBatch(async () => {
        await lampDev.sendFeatureReport(6, new Uint8Array([0]));
        lampHostControlPids.add(numPid);
      });
      if (isPageUnloading || lampArrayGenByPid.get(numPid) !== gen) return false;

      // Send a subset of lamps via Report ID 4 (8 lamps per 50-byte packet, LampUpdateComplete=1 on final packet)
      const sendLampSubset = async (entries) => {
        if (!entries || entries.length === 0 || isPageUnloading) return;
        await runExclusiveLampBatch(async () => {
          for (let baseIdx = 0; baseIdx < entries.length; baseIdx += 8) {
            if (isPageUnloading || lampArrayGenByPid.get(numPid) !== gen || !lampDev.opened) return;
            const count = Math.min(8, entries.length - baseIdx);
            const isLast = baseIdx + 8 >= entries.length;
            const rep4 = new Uint8Array(50);
            rep4[0] = count;
            rep4[1] = isLast ? 1 : 0;
            for (let i = 0; i < count; i++) {
              const item = entries[baseIdx + i];
              const lampId = item.id;
              rep4[2 + i * 2] = lampId & 0xff;
              rep4[2 + i * 2 + 1] = (lampId >> 8) & 0xff;
              const colOff = 18 + i * 4;
              rep4[colOff] = Math.round(item.r * brScale) & 0xff;
              rep4[colOff + 1] = Math.round(item.g * brScale) & 0xff;
              rep4[colOff + 2] = Math.round(item.b * brScale) & 0xff;
              rep4[colOff + 3] = (item.i ?? 255) & 0xff;
            }
            await lampDev.sendFeatureReport(4, rep4);
          }
        });
      };

      // Helper: overlays Razer Synapse 4's Preset Profile Slot Indicator (main.js profileNavigationGroup
      // & 6737.js setTriggerFirmwareEffects) onto LampArray LEDs during a slot switch (S1..S6).
      const blendSlotIndicatorOverlay = (lampMeta, r, g, b) => {
        const ov = slotIndicatorOverlayByPid.get(numPid);
        if (!ov) return [r, g, b];
        const now = performance.now();
        if (now >= ov.until) {
          slotIndicatorOverlayByPid.delete(numPid);
          return [r, g, b];
        }
        const slotNum = clampNum(ov.slotId, 1, 6, 1);
        const navLabel = SLOT_NAV_KEY_LABELS[slotNum] || "INS";
        const [sr, sg, sb] = SLOT_RGB_BY_ID[slotNum] || [255, 255, 255];
        const lbl = lampMeta?.label || "";

        // Active slot navigation key (INS/HOME/PGUP/DEL/END/PGDN), number key (1..6), and function key (F1..F6)
        if (lbl === navLabel || lbl === String(slotNum) || lbl === `F${slotNum}`) {
          return [sr, sg, sb];
        }
        // Dim inactive slot navigation keys so the active slot key stands out clearly
        if (SLOT_NAV_LABEL_SET.has(lbl)) {
          return [Math.round(r * 0.12), Math.round(g * 0.12), Math.round(b * 0.12)];
        }
        // Expanding radial preset ripple from the active slot key (matching setTriggerFirmwareEffects)
        const navIds = layout.byLabel.get(navLabel);
        const origin = navIds && navIds.length > 0 ? layout.lamps[navIds[0]] : { x: 327, y: 38 };
        const elapsed = Math.max(0, now - ov.startedAt);
        const radius = elapsed * 0.42;
        const dist = Math.hypot((lampMeta?.x ?? 165) - (origin?.x ?? 327), (lampMeta?.y ?? 65) - (origin?.y ?? 38));
        const delta = Math.abs(dist - radius);
        if (delta < 38 && radius < 420) {
          const wave = Math.cos((delta / 38) * (Math.PI / 2));
          const atten = Math.max(0, 1 - radius / 420);
          const mix = Math.min(1, wave * wave * atten * 0.9);
          return [
            Math.round(r * (1 - mix) + sr * mix),
            Math.round(g * (1 - mix) + sg * mix),
            Math.round(b * (1 - mix) + sb * mix),
          ];
        }
        return [r, g, b];
      };

      // Send a full 87-lamp frame computed by a per-lamp callback (lampMeta => [r, g, b])
      const sendComputedFrame = async (computeRgbFn) => {
        if (isPageUnloading) return;
        const ids = layout.sortedIdsByX;
        await runExclusiveLampBatch(async () => {
          for (let baseIdx = 0; baseIdx < ids.length; baseIdx += 8) {
            if (isPageUnloading || lampArrayGenByPid.get(numPid) !== gen || !lampDev.opened) return;
            const count = Math.min(8, ids.length - baseIdx);
            const isLast = baseIdx + 8 >= ids.length;
            const rep4 = new Uint8Array(50);
            rep4[0] = count;
            rep4[1] = isLast ? 1 : 0;
            for (let i = 0; i < count; i++) {
              const lampId = ids[baseIdx + i];
              const lampMeta = layout.lamps[lampId] || { id: lampId, x: 16, y: 14, nx: 0, ny: 0 };
              const rawRgb = computeRgbFn(lampMeta);
              const [r, g, b] = blendSlotIndicatorOverlay(lampMeta, rawRgb[0], rawRgb[1], rawRgb[2]);
              rep4[2 + i * 2] = lampId & 0xff;
              rep4[2 + i * 2 + 1] = (lampId >> 8) & 0xff;
              const colOff = 18 + i * 4;
              rep4[colOff] = Math.round(r * brScale) & 0xff;
              rep4[colOff + 1] = Math.round(g * brScale) & 0xff;
              rep4[colOff + 2] = Math.round(b * brScale) & 0xff;
              rep4[colOff + 3] = 255;
            }
            await lampDev.sendFeatureReport(4, rep4);
          }
        });
      };

      // Send uniform color across all lamps (ordered Left-to-Right), respecting any active slot-switch indicator
      const sendAllLampsColor = async (r, g, b, intensity = 255) => {
        if (isPageUnloading) return;
        const ov = slotIndicatorOverlayByPid.get(numPid);
        if (ov && performance.now() < ov.until) {
          await sendComputedFrame(() => [r, g, b]);
          return;
        }
        const sr = Math.round(r * brScale) & 0xff;
        const sg = Math.round(g * brScale) & 0xff;
        const sb = Math.round(b * brScale) & 0xff;
        const si = intensity & 0xff;
        const ids = layout.sortedIdsByX;
        await runExclusiveLampBatch(async () => {
          for (let baseIdx = 0; baseIdx < ids.length; baseIdx += 8) {
            if (isPageUnloading || lampArrayGenByPid.get(numPid) !== gen || !lampDev.opened) return;
            const count = Math.min(8, ids.length - baseIdx);
            const isLast = baseIdx + 8 >= ids.length;
            const rep4 = new Uint8Array(50);
            rep4[0] = count;
            rep4[1] = isLast ? 1 : 0;
            for (let i = 0; i < count; i++) {
              const lampId = ids[baseIdx + i];
              rep4[2 + i * 2] = lampId & 0xff;
              rep4[2 + i * 2 + 1] = (lampId >> 8) & 0xff;
              const colOff = 18 + i * 4;
              rep4[colOff] = sr;
              rep4[colOff + 1] = sg;
              rep4[colOff + 2] = sb;
              rep4[colOff + 3] = si;
            }
            await lampDev.sendFeatureReport(4, rep4);
          }
        });
      };

      const speedMult = Number(light.speed || 2);
      const dirSign = Number(light.waveDirection || 1) === 2 ? -1 : 1;
      const t0 = performance.now();
      let busy = false;

      // Helper for static-frame effects (off, static, gradient) so slot-switch indicator ripple animates smoothly
      // and then settles onto the static frame.
      const runStaticFrameWithOptionalSlotIndicator = async (frameFn) => {
        await frameFn();
        const ov = slotIndicatorOverlayByPid.get(numPid);
        if (ov && performance.now() < ov.until) {
          const timer = setLampInterval(async () => {
            if (isPageUnloading || lampArrayGenByPid.get(numPid) !== gen) {
              clearLampInterval(timer);
              return;
            }
            if (busy || !lampDev.opened) return;
            busy = true;
            try {
              const curOv = slotIndicatorOverlayByPid.get(numPid);
              if (!curOv || performance.now() >= curOv.until) {
                slotIndicatorOverlayByPid.delete(numPid);
                clearLampInterval(timer);
                await frameFn();
                return;
              }
              await frameFn();
            } catch {
              clearLampInterval(timer);
            } finally {
              busy = false;
            }
          }, 38);
          lampArrayTimerByPid.set(numPid, timer);
        }
        return true;
      };

      if (effect === "off" || brScale <= 0) {
        return await runStaticFrameWithOptionalSlotIndicator(() => sendAllLampsColor(0, 0, 0, 0));
      }

      if (effect === "static") {
        return await runStaticFrameWithOptionalSlotIndicator(() => sendAllLampsColor(baseR, baseG, baseB, 255));
      }

      // GRADIENT (Extra Studio Effect): Dual-color horizontal linear gradient (color1 <-> color2)
      if (effect === "gradient") {
        return await runStaticFrameWithOptionalSlotIndicator(() =>
          sendComputedFrame((l) => {
            const t = dirSign === 1 ? l.nx : 1 - l.nx;
            return [
              Math.round(baseR * (1 - t) + secR * t),
              Math.round(baseG * (1 - t) + secG * t),
              Math.round(baseB * (1 - t) + secB * t),
            ];
          })
        );
      }

      // REACTIVE (Razer Synapse Quick Effect): All keys start dark (0,0,0); pressing any physical key
      // or clicking a UI keycap immediately lights up that key and smoothly fades it back to black upon release.
      if (effect === "reactive") {
        ensureReactiveKeyListeners();
        await sendAllLampsColor(0, 0, 0, 0);

        const fadeDurationMs = speedMult === 1 ? 1350 : speedMult === 3 ? 420 : 800;
        const activeLamps = new Map(); // lampId -> { held: boolean, releasedAt: number, lastLevel: number }

        const triggerLampsDown = (lampIds) => {
          if (isPageUnloading || !lampIds || lampIds.length === 0 || lampArrayGenByPid.get(numPid) !== gen) return;
          const immediateBatch = [];
          for (const id of lampIds) {
            const prev = activeLamps.get(id);
            activeLamps.set(id, { held: true, releasedAt: 0, lastLevel: 255 });
            if (!prev || prev.lastLevel !== 255) {
              immediateBatch.push({ id, r: baseR, g: baseG, b: baseB, i: 255 });
            }
            const lbl = layout.lamps[id]?.label;
            if (lbl) {
              const keyEl = document.querySelector(`.keycap[data-key="${CSS.escape(lbl)}"]`);
              if (keyEl) keyEl.classList.add("is-reactive-lit");
            }
          }
          if (immediateBatch.length > 0 && lampDev.opened && !busy && !isPageUnloading) {
            busy = true;
            sendLampSubset(immediateBatch)
              .catch(() => {})
              .finally(() => {
                busy = false;
              });
          }
        };

        const triggerLampsUp = (lampIds) => {
          if (isPageUnloading || !lampIds || lampIds.length === 0 || lampArrayGenByPid.get(numPid) !== gen) return;
          const now = performance.now();
          for (const id of lampIds) {
            const entry = activeLamps.get(id);
            if (entry) {
              entry.held = false;
              entry.releasedAt = now;
            } else {
              activeLamps.set(id, { held: false, releasedAt: now, lastLevel: 255 });
            }
            const lbl = layout.lamps[id]?.label;
            if (lbl) {
              const keyEl = document.querySelector(`.keycap[data-key="${CSS.escape(lbl)}"]`);
              if (keyEl) keyEl.classList.remove("is-reactive-lit");
            }
          }
        };

        reactiveTriggerByPid.set(numPid, {
          onKeyDown(code) {
            const ids = layout.byCode.get(code);
            if (ids) triggerLampsDown(ids);
          },
          onKeyUp(code) {
            const ids = layout.byCode.get(code);
            if (ids) triggerLampsUp(ids);
          },
          onLabelTrigger(label) {
            const ids = layout.byLabel.get(label);
            if (ids) {
              triggerLampsDown(ids);
              setTimeout(() => triggerLampsUp(ids), 140);
            }
          },
          onReleaseAll() {
            const now = performance.now();
            for (const entry of activeLamps.values()) {
              if (entry.held) {
                entry.held = false;
                entry.releasedAt = now;
              }
            }
            document.querySelectorAll(".keycap.is-reactive-lit").forEach((el) => el.classList.remove("is-reactive-lit"));
          },
        });

        const timer = setLampInterval(async () => {
          if (isPageUnloading || lampArrayGenByPid.get(numPid) !== gen) {
            clearLampInterval(timer);
            return;
          }
          if (busy || !lampDev.opened || activeLamps.size === 0) return;
          busy = true;
          try {
            const now = performance.now();
            const updates = [];
            for (const [id, state] of activeLamps.entries()) {
              if (state.held) {
                if (state.lastLevel !== 255) {
                  state.lastLevel = 255;
                  updates.push({ id, r: baseR, g: baseG, b: baseB, i: 255 });
                }
                continue;
              }
              const elapsed = now - state.releasedAt;
              if (elapsed >= fadeDurationMs) {
                activeLamps.delete(id);
                updates.push({ id, r: 0, g: 0, b: 0, i: 0 });
              } else {
                const progress = Math.max(0, 1 - elapsed / fadeDurationMs);
                const gammaScale = progress * progress; // Gamma-2.0 smooth LED decay
                const level = Math.round(gammaScale * 255);
                if (Math.abs(level - state.lastLevel) >= 4) {
                  state.lastLevel = level;
                  updates.push({
                    id,
                    r: Math.round(baseR * gammaScale),
                    g: Math.round(baseG * gammaScale),
                    b: Math.round(baseB * gammaScale),
                    i: 255,
                  });
                }
              }
            }
            if (updates.length > 0) {
              await sendLampSubset(updates);
            }
          } catch {
            clearLampInterval(timer);
          } finally {
            busy = false;
          }
        }, 33);

        lampArrayTimerByPid.set(numPid, timer);
        return true;
      }

      // RIPPLE (Razer Synapse Quick Effect): Pressing any key emits an expanding circular ring of light
      // radiating outward across the 2D (x, y) millimeter coordinates of the keyboard.
      if (effect === "ripple") {
        ensureReactiveKeyListeners();
        await sendAllLampsColor(0, 0, 0, 0);

        const mmPerMs = speedMult === 1 ? 0.3 : speedMult === 3 ? 0.68 : 0.46;
        const ringWidthMm = 40;
        const maxRadiusMm = 410;
        const ripples = [{ x: 165, y: 65, bornAt: performance.now() }]; // Initial preview ripple from keyboard center
        let hadActiveRippleLastFrame = true;

        const spawnRippleFromIds = (lampIds) => {
          if (isPageUnloading || !lampIds || lampIds.length === 0 || lampArrayGenByPid.get(numPid) !== gen) return;
          const lamp = layout.lamps[lampIds[0]];
          if (!lamp) return;
          const now = performance.now();
          if (ripples.length >= 8) ripples.shift();
          ripples.push({ x: lamp.x, y: lamp.y, bornAt: now });
          if (lamp.label) {
            const keyEl = document.querySelector(`.keycap[data-key="${CSS.escape(lamp.label)}"]`);
            if (keyEl) {
              keyEl.classList.add("is-reactive-lit");
              setTimeout(() => keyEl.classList.remove("is-reactive-lit"), 220);
            }
          }
        };

        reactiveTriggerByPid.set(numPid, {
          onKeyDown(code) {
            const ids = layout.byCode.get(code);
            if (ids) spawnRippleFromIds(ids);
          },
          onKeyUp() {},
          onLabelTrigger(label) {
            const ids = layout.byLabel.get(label);
            if (ids) spawnRippleFromIds(ids);
          },
          onReleaseAll() {},
        });

        const timer = setLampInterval(async () => {
          if (isPageUnloading || lampArrayGenByPid.get(numPid) !== gen) {
            clearLampInterval(timer);
            return;
          }
          if (busy || !lampDev.opened) return;
          if (ripples.length === 0 && !hadActiveRippleLastFrame) return;
          busy = true;
          try {
            const now = performance.now();
            for (let i = ripples.length - 1; i >= 0; i--) {
              if ((now - ripples[i].bornAt) * mmPerMs > maxRadiusMm) {
                ripples.splice(i, 1);
              }
            }
            if (ripples.length === 0) {
              hadActiveRippleLastFrame = false;
              await sendAllLampsColor(0, 0, 0, 0);
            } else {
              hadActiveRippleLastFrame = true;
              await sendComputedFrame((l) => {
                let env = 0;
                for (let i = 0; i < ripples.length; i++) {
                  const rip = ripples[i];
                  const radius = (now - rip.bornAt) * mmPerMs;
                  const dist = Math.hypot(l.x - rip.x, l.y - rip.y);
                  const delta = Math.abs(dist - radius);
                  if (delta < ringWidthMm) {
                    const wave = Math.cos((delta / ringWidthMm) * (Math.PI / 2));
                    const atten = Math.max(0, 1 - radius / maxRadiusMm);
                    env += wave * wave * atten;
                  }
                }
                const c = Math.min(1, env);
                return [Math.round(baseR * c), Math.round(baseG * c), Math.round(baseB * c)];
              });
            }
          } catch {
            clearLampInterval(timer);
          } finally {
            busy = false;
          }
        }, 36);

        lampArrayTimerByPid.set(numPid, timer);
        return true;
      }

      // SPECTRUM CYCLING (Razer Synapse Quick Effect): Smooth 360-degree rainbow color cycle across all keys simultaneously
      if (effect === "spectrum") {
        await sendAllLampsColor(baseR, baseG, baseB, 255);
        const degPerMs = (speedMult === 1 ? 18 : speedMult === 3 ? 52 : 32) / 1000;
        const timer = setLampInterval(async () => {
          if (isPageUnloading || lampArrayGenByPid.get(numPid) !== gen) {
            clearLampInterval(timer);
            return;
          }
          if (busy || !lampDev.opened) return;
          busy = true;
          try {
            const hue = ((performance.now() - t0) * degPerMs) % 360;
            const [r, g, b] = hsvToRgb(hue, 1, 1);
            await sendAllLampsColor(r, g, b, 255);
          } catch {
            clearLampInterval(timer);
          } finally {
            busy = false;
          }
        }, 42);
        lampArrayTimerByPid.set(numPid, timer);
        return true;
      }

      // BREATHING & BREATHING DUAL (Razer Synapse Quick Effect): Smooth gamma-corrected inhale/exhale with dark pause
      if (effect === "breathing" || effect === "breathingDual") {
        const cycleDurationMs = speedMult === 1 ? 4200 : speedMult === 3 ? 1800 : 2800;
        const timer = setLampInterval(async () => {
          if (isPageUnloading || lampArrayGenByPid.get(numPid) !== gen) {
            clearLampInterval(timer);
            return;
          }
          if (busy || !lampDev.opened) return;
          busy = true;
          try {
            const elapsed = performance.now() - t0;
            const cycleCount = Math.floor(elapsed / cycleDurationMs);
            const cyclePos = (elapsed % cycleDurationMs) / cycleDurationMs;
            let env = 0;
            if (cyclePos < 0.8) {
              const s = Math.sin((cyclePos / 0.8) * Math.PI);
              env = Math.pow(Math.max(0, s), 2.2);
            }
            const useSecondColor = effect === "breathingDual" && cycleCount % 2 === 1;
            const r = useSecondColor ? secR : baseR;
            const g = useSecondColor ? secG : baseG;
            const b = useSecondColor ? secB : baseB;
            await sendAllLampsColor(
              Math.round(r * env),
              Math.round(g * env),
              Math.round(b * env),
              255
            );
          } catch {
            clearLampInterval(timer);
          } finally {
            busy = false;
          }
        }, 42);
        lampArrayTimerByPid.set(numPid, timer);
        return true;
      }

      // WAVE (Razer Synapse Quick Effect): Horizontal rainbow wave moving Left-to-Right (dir=1) or Right-to-Left (dir=2)
      if (effect === "wave") {
        const degPerMs = (speedMult === 1 ? 65 : speedMult === 3 ? 190 : 120) / 1000;
        await sendComputedFrame((l) => {
          const hue = (l.nx * 360 + 36000) % 360;
          return hsvToRgb(hue, 1, 1);
        });
        const timer = setLampInterval(async () => {
          if (isPageUnloading || lampArrayGenByPid.get(numPid) !== gen) {
            clearLampInterval(timer);
            return;
          }
          if (busy || !lampDev.opened) return;
          busy = true;
          try {
            const phaseDeg = (performance.now() - t0) * degPerMs;
            await sendComputedFrame((l) => {
              const hue = (l.nx * 360 - dirSign * phaseDeg + 36000) % 360;
              return hsvToRgb(hue, 1, 1);
            });
          } catch {
            clearLampInterval(timer);
          } finally {
            busy = false;
          }
        }, 42);
        lampArrayTimerByPid.set(numPid, timer);
        return true;
      }

      // WHEEL (Razer Synapse Quick Effect): 360-degree rainbow color wheel rotating around keyboard center (175mm, 65mm)
      if (effect === "wheel") {
        const degPerMs = (speedMult === 1 ? 55 : speedMult === 3 ? 165 : 105) / 1000;
        const centerX = 175;
        const centerY = 65;
        await sendComputedFrame((l) => {
          const angleDeg = (Math.atan2(l.y - centerY, l.x - centerX) * 180) / Math.PI;
          const hue = (angleDeg + 36000) % 360;
          return hsvToRgb(hue, 1, 1);
        });
        const timer = setLampInterval(async () => {
          if (isPageUnloading || lampArrayGenByPid.get(numPid) !== gen) {
            clearLampInterval(timer);
            return;
          }
          if (busy || !lampDev.opened) return;
          busy = true;
          try {
            const phaseDeg = (performance.now() - t0) * degPerMs;
            await sendComputedFrame((l) => {
              const angleDeg = (Math.atan2(l.y - centerY, l.x - centerX) * 180) / Math.PI;
              const hue = (angleDeg - dirSign * phaseDeg + 36000) % 360;
              return hsvToRgb(hue, 1, 1);
            });
          } catch {
            clearLampInterval(timer);
          } finally {
            busy = false;
          }
        }, 42);
        lampArrayTimerByPid.set(numPid, timer);
        return true;
      }

      // FIRE (Razer Synapse Quick Effect): Warm rising flames (deep crimson at bottom row -> orange -> bright yellow tips at top)
      if (effect === "fire") {
        const spd = (speedMult === 1 ? 2.4 : speedMult === 3 ? 6.2 : 4.0) / 1000;
        const timer = setLampInterval(async () => {
          if (isPageUnloading || lampArrayGenByPid.get(numPid) !== gen) {
            clearLampInterval(timer);
            return;
          }
          if (busy || !lampDev.opened) return;
          busy = true;
          try {
            const t = (performance.now() - t0) * spd;
            await sendComputedFrame((l) => {
              const turb =
                0.5 +
                0.28 * Math.sin(t * 2.1 + l.x * 0.085 + l.y * 0.03) +
                0.22 * Math.cos(t * 3.4 - l.x * 0.14 + l.id * 0.37);
              const heat = Math.max(0, Math.min(1, l.ny * 0.68 + turb * 0.58 - 0.12));
              const r = Math.min(255, Math.round(heat * 360));
              const g = Math.max(0, Math.min(255, Math.round((heat - 0.28) * 290)));
              const b = Math.max(0, Math.min(255, Math.round((heat - 0.82) * 380)));
              return [r, g, b];
            });
          } catch {
            clearLampInterval(timer);
          } finally {
            busy = false;
          }
        }, 42);
        lampArrayTimerByPid.set(numPid, timer);
        return true;
      }

      // STARLIGHT (Razer Synapse Quick Effect): Dark matrix where random individual keys twinkle in and out
      if (effect === "starlight") {
        await sendAllLampsColor(0, 0, 0, 0);
        const stars = new Map(); // lampId -> { bornAt, durationMs, useSec }
        const maxActiveStars = speedMult === 1 ? 8 : speedMult === 3 ? 22 : 14;
        const spawnProb = speedMult === 1 ? 0.35 : speedMult === 3 ? 0.85 : 0.6;

        const timer = setLampInterval(async () => {
          if (isPageUnloading || lampArrayGenByPid.get(numPid) !== gen) {
            clearLampInterval(timer);
            return;
          }
          if (busy || !lampDev.opened) return;
          busy = true;
          try {
            const now = performance.now();
            if (stars.size < maxActiveStars && Math.random() < spawnProb) {
              const bursts = speedMult === 3 ? 2 : 1;
              for (let b = 0; b < bursts; b++) {
                const randId = Math.floor(Math.random() * lampCount);
                if (!stars.has(randId)) {
                  const dur = (speedMult === 1 ? 1500 : speedMult === 3 ? 650 : 1050) * (0.75 + Math.random() * 0.5);
                  stars.set(randId, { bornAt: now, durationMs: dur, useSec: Math.random() < 0.35 });
                }
              }
            }

            const updates = [];
            for (const [id, st] of stars.entries()) {
              const age = now - st.bornAt;
              if (age >= st.durationMs) {
                stars.delete(id);
                updates.push({ id, r: 0, g: 0, b: 0, i: 0 });
              } else {
                const s = Math.sin((age / st.durationMs) * Math.PI);
                const env = Math.pow(Math.max(0, s), 1.8);
                const cr = st.useSec ? secR : baseR;
                const cg = st.useSec ? secG : baseG;
                const cb = st.useSec ? secB : baseB;
                updates.push({
                  id,
                  r: Math.round(cr * env),
                  g: Math.round(cg * env),
                  b: Math.round(cb * env),
                  i: 255,
                });
              }
            }

            if (updates.length > 0) {
              await sendLampSubset(updates);
            }
          } catch {
            clearLampInterval(timer);
          } finally {
            busy = false;
          }
        }, 42);
        lampArrayTimerByPid.set(numPid, timer);
        return true;
      }

      // MATRIX RAIN (Extra Studio Effect): Digital raindrops falling down keyboard columns (top y=14mm -> bottom y=115mm)
      if (effect === "rain") {
        await sendAllLampsColor(0, 0, 0, 0);
        const dropCount = speedMult === 1 ? 7 : speedMult === 3 ? 14 : 10;
        const speedScale = speedMult === 1 ? 0.08 : speedMult === 3 ? 0.22 : 0.14;
        const drops = Array.from({ length: dropCount }, (_, idx) => ({
          x: 16 + ((idx * 37) % 334),
          y: -Math.random() * 120,
          v: speedScale * (0.8 + Math.random() * 0.45),
        }));
        let lastTick = performance.now();

        const timer = setLampInterval(async () => {
          if (isPageUnloading || lampArrayGenByPid.get(numPid) !== gen) {
            clearLampInterval(timer);
            return;
          }
          if (busy || !lampDev.opened) return;
          busy = true;
          try {
            const now = performance.now();
            const dt = Math.min(100, now - lastTick);
            lastTick = now;
            for (const d of drops) {
              d.y += d.v * dt;
              if (d.y > 165) {
                d.y = -15 - Math.random() * 35;
                d.x = 16 + Math.random() * 334;
                d.v = speedScale * (0.8 + Math.random() * 0.45);
              }
            }

            await sendComputedFrame((l) => {
              let headEnv = 0;
              let tailEnv = 0;
              for (let i = 0; i < drops.length; i++) {
                const d = drops[i];
                const dx = Math.abs(l.x - d.x);
                if (dx < 14) {
                  const dy = d.y - l.y;
                  if (dy >= -6 && dy <= 10) {
                    headEnv = Math.max(headEnv, 1 - Math.abs(dy) / 10);
                  } else if (dy > 10 && dy <= 58) {
                    tailEnv = Math.max(tailEnv, Math.pow(1 - (dy - 10) / 48, 1.8));
                  }
                }
              }
              if (headEnv > 0.25) {
                const w = headEnv * 0.55;
                return [
                  Math.min(255, Math.round(baseR + (255 - baseR) * w)),
                  Math.min(255, Math.round(baseG + (255 - baseG) * w)),
                  Math.min(255, Math.round(baseB + (255 - baseB) * w)),
                ];
              }
              return [
                Math.round(baseR * tailEnv),
                Math.round(baseG * tailEnv),
                Math.round(baseB * tailEnv),
              ];
            });
          } catch {
            clearLampInterval(timer);
          } finally {
            busy = false;
          }
        }, 42);
        lampArrayTimerByPid.set(numPid, timer);
        return true;
      }

      // CYBER SCANNER (Extra Studio Effect): KITT / Cylon horizontal laser bar sweeping Left <-> Right with glowing tail
      if (effect === "scanner") {
        const radPerMs = (speedMult === 1 ? 1.5 : speedMult === 3 ? 4.2 : 2.6) / 1000;
        const timer = setLampInterval(async () => {
          if (isPageUnloading || lampArrayGenByPid.get(numPid) !== gen) {
            clearLampInterval(timer);
            return;
          }
          if (busy || !lampDev.opened) return;
          busy = true;
          try {
            const phase = (performance.now() - t0) * radPerMs;
            const pos = 0.5 + 0.5 * Math.sin(phase);
            await sendComputedFrame((l) => {
              const dist = Math.abs(l.nx - pos);
              if (dist > 0.26) return [0, 0, 0];
              const env = Math.pow(1 - dist / 0.26, 2.2);
              return [
                Math.round((baseR * env + secR * (1 - env) * 0.35) * env),
                Math.round((baseG * env + secG * (1 - env) * 0.35) * env),
                Math.round((baseB * env + secB * (1 - env) * 0.35) * env),
              ];
            });
          } catch {
            clearLampInterval(timer);
          } finally {
            busy = false;
          }
        }, 38);
        lampArrayTimerByPid.set(numPid, timer);
        return true;
      }

      // NORTHERN AURORA (Extra Studio Effect): Organic 2D plasma waves blending Primary (color1) and Secondary (color2)
      if (effect === "aurora") {
        const spd = (speedMult === 1 ? 1.4 : speedMult === 3 ? 3.8 : 2.4) / 1000;
        const timer = setLampInterval(async () => {
          if (isPageUnloading || lampArrayGenByPid.get(numPid) !== gen) {
            clearLampInterval(timer);
            return;
          }
          if (busy || !lampDev.opened) return;
          busy = true;
          try {
            const t = (performance.now() - t0) * spd;
            await sendComputedFrame((l) => {
              const w1 = 0.5 + 0.5 * Math.sin(l.nx * 4.2 - dirSign * t * 1.6 + Math.sin(l.ny * 3.1 + t));
              const w2 = 0.45 + 0.55 * Math.cos(l.ny * 3.4 - t * 1.1 + l.nx * 2.0);
              return [
                Math.round((baseR * w1 + secR * (1 - w1)) * w2),
                Math.round((baseG * w1 + secG * (1 - w1)) * w2),
                Math.round((baseB * w1 + secB * (1 - w1)) * w2),
              ];
            });
          } catch {
            clearLampInterval(timer);
          } finally {
            busy = false;
          }
        }, 42);
        lampArrayTimerByPid.set(numPid, timer);
        return true;
      }

      // PARTY STROBE / DISCO (Extra Studio Effect): Multi-zone energetic color bursts across key clusters
      if (effect === "disco") {
        const intervalMs = speedMult === 1 ? 140 : speedMult === 3 ? 55 : 85;
        const timer = setLampInterval(async () => {
          if (isPageUnloading || lampArrayGenByPid.get(numPid) !== gen) {
            clearLampInterval(timer);
            return;
          }
          if (busy || !lampDev.opened) return;
          busy = true;
          try {
            const seed = Math.floor((performance.now() - t0) / intervalMs);
            await sendComputedFrame((l) => {
              const cluster = Math.floor(l.nx * 6) + Math.floor(l.ny * 3) * 6;
              const hash = ((cluster * 73 + seed * 131 + l.id * 17) % 360 + 360) % 360;
              const pop = ((cluster + seed) % 3 === 0) ? 1 : 0.28;
              return hsvToRgb(hash, 0.95, pop);
            });
          } catch {
            clearLampInterval(timer);
          } finally {
            busy = false;
          }
        }, intervalMs);
        lampArrayTimerByPid.set(numPid, timer);
        return true;
      }

      await sendAllLampsColor(baseR, baseG, baseB, 255);
      return true;
    } catch {
      return false;
    }
  }

  function updateWinUsbGuideLabels(pidKey) {
    const numPid = Number(pidKey) || 679;
    const meta = Protocol25.KNOWN_DEVICES[numPid] || Protocol25.KNOWN_DEVICES[679] || {};
    const devEntry = devices.find((d) => Number(d.productId) === numPid);
    const ifNum = Number(meta.interface ?? (meta.category === "mouse" ? 0 : 3));
    const prodName = sanitizePlainText(
      devEntry?.productName || meta.name || "Razer Huntsman V3 Pro TKL",
      64,
      "Razer Huntsman V3 Pro TKL"
    );
    const targetLabel = document.getElementById("winUsbTargetLabel");
    const ifaceName = document.getElementById("winUsbInterfaceName");
    const zadigEntry = document.getElementById("winUsbZadigEntry");
    const miCode = document.getElementById("winUsbMiCode");
    if (targetLabel) targetLabel.textContent = `Interface ${ifNum}`;
    if (ifaceName) ifaceName.textContent = `${prodName} (Interface ${ifNum})`;
    if (zadigEntry) zadigEntry.textContent = `${prodName} (Interface ${ifNum})`;
    if (miCode) miCode.textContent = `Interface ${ifNum}`;
  }

  function updateWebHidStatusUI() {
    const connDot = document.getElementById("connDot");
    const connText = document.getElementById("connText");
    const fwBadge = document.getElementById("fwBadge");
    const banner = document.getElementById("webHidStatusBanner");
    const bannerDot = document.getElementById("bannerDot");
    const bannerText = document.getElementById("bannerStatusText");
    const usbPairBtn = document.getElementById("btnWebUsbPair");
    const pairBtn = document.getElementById("btnWebHidPair");
    const bannerPairBtn = document.getElementById("btnBannerPair");
    const bannerRecheckBtn = document.getElementById("btnBannerRecheck");
    const guideEl = document.getElementById("winUsbSetupGuide");
    const onWin = isWindowsPlatform();

    updateWinUsbGuideLabels(selectedPid);

    if (!window.isSecureContext) {
      if (connDot) connDot.className = "ws-dot is-warn";
      if (connText) connText.textContent = "HTTPS Required";
      if (fwBadge) fwBadge.textContent = "Insecure HTTP";
      if (banner) banner.style.borderColor = "rgba(255,82,82,0.55)";
      if (bannerDot) bannerDot.className = "ws-dot is-warn";
      if (bannerText) {
        bannerText.innerHTML =
          "<strong>HTTPS Secure Context Required</strong> — WebHID/WebUSB hardware access is blocked on plain <code>http://</code> origins. Access this server over <b>https://</b> (or <code>localhost</code>) to enable USB communication.";
      }
      if (usbPairBtn) usbPairBtn.disabled = true;
      if (pairBtn) pairBtn.disabled = true;
      if (bannerPairBtn) bannerPairBtn.hidden = true;
      if (bannerRecheckBtn) bannerRecheckBtn.hidden = true;
      if (guideEl) guideEl.hidden = true;
      return;
    }

    if (!navigator.hid && !navigator.usb) {
      if (connDot) connDot.className = "ws-dot is-warn";
      if (connText) connText.textContent = "WebHID/WebUSB Unsupported";
      if (fwBadge) fwBadge.textContent = "Use Chromium";
      if (banner) banner.style.borderColor = "rgba(255,171,64,0.5)";
      if (bannerDot) bannerDot.className = "ws-dot is-warn";
      if (bannerText) {
        bannerText.innerHTML =
          "<strong>Browser Does Not Support WebHID/WebUSB</strong> — Please open <b>websynap.se</b> in a Chromium-based browser (Chrome, Edge, Brave, Opera, or Vivaldi) to configure your Razer devices directly from the cloud.";
      }
      if (usbPairBtn) usbPairBtn.disabled = true;
      if (pairBtn) pairBtn.disabled = true;
      if (bannerPairBtn) bannerPairBtn.hidden = true;
      if (bannerRecheckBtn) bannerRecheckBtn.hidden = true;
      if (guideEl) guideEl.hidden = true;
      return;
    }

    const livePids = new Set([...webHidHandlesByPid.keys(), ...webUsbDevicesByPid.keys()]);
    const liveCount = livePids.size;
    if (liveCount > 0 && hasCompatibleDevice()) {
      const anyHasFeatureReport0 = Array.from(webHidHandlesByPid.values()).some((list) =>
        list.some((d) => deviceHasProtocol25FeatureReport(d))
      );
      const anyHasWebUsb = webUsbDevicesByPid.size > 0;
      const anyHasLampArray = Array.from(webHidHandlesByPid.values()).some((list) =>
        list.some((d) => deviceHasLampArray(d))
      );

      const selPid = Number(selectedPid);
      const pHandle = protocolDeviceByPid.get(selPid);
      const verified = Boolean(pHandle);
      const probeErr = protocolProbeErrorByPid.get(selPid);
      const safeNames = devices
        .filter((d) => d.connectedLive)
        .map((d) => escapeHtml(d.productName))
        .join(" + ");

      if (verified) {
        if (connDot) connDot.className = "ws-dot is-ok";
        if (connText) {
          connText.textContent = `${pHandle.mode === "webusb" ? "WebUSB" : "WebHID"} Live (${liveCount} device${liveCount > 1 ? "s" : ""})`;
        }
        if (fwBadge && (fwBadge.textContent === "Click to Pair" || fwBadge.textContent === "USB" || fwBadge.textContent === "WebHID")) {
          fwBadge.textContent = "0x02 READY";
        }
        if (banner) banner.style.borderColor = "rgba(93,222,137,0.45)";
        if (bannerDot) bannerDot.className = "ws-dot is-ok";
        if (bannerText) {
          const viaLabel = escapeHtml(pHandle.label || (pHandle.mode === "webusb" ? "WebUSB" : "WebHID"));
          bannerText.innerHTML = `<strong>Onboard memory control verified via ${viaLabel} (${liveCount} device${liveCount > 1 ? "s" : ""})</strong> — Protocol 25 replies OK. Slot switching, actuation and lighting are written directly to the onboard flash of <b>${safeNames}</b> and persist after you close this tab.`;
        }
        if (bannerRecheckBtn) bannerRecheckBtn.hidden = true;
        if (bannerPairBtn) bannerPairBtn.textContent = "+ Add Another Device";
        if (guideEl) guideEl.hidden = true;
      } else if (probeErr) {
        if (connDot) connDot.className = "ws-dot is-warn";
        if (connText) connText.textContent = `Preview Only (${liveCount} device${liveCount > 1 ? "s" : ""})`;
        if (banner) banner.style.borderColor = "rgba(255,171,64,0.55)";
        if (bannerDot) bannerDot.className = "ws-dot is-warn";
        if (bannerText) {
          bannerText.innerHTML = `<strong>Connected — onboard memory not yet writable</strong>: ${escapeHtml(probeErr)} Until then lighting is only a live preview and nothing is saved to <b>${safeNames}</b>.`;
        }
        if (bannerRecheckBtn) bannerRecheckBtn.hidden = false;
        if (bannerPairBtn) {
          bannerPairBtn.textContent = navigator.usb
            ? webUsbDevicesByPid.has(selPid)
              ? "⚡ Pair / Retry WebUSB"
              : "⚡ Connect WebUSB (Onboard Save)"
            : "Connect Razer Device";
        }
        if (guideEl) {
          guideEl.hidden = !onWin || !navigator.usb;
          if (protocolUsbClaimBlockedByPid.get(selPid)) {
            guideEl.open = true;
          }
        }
      } else {
        if (connDot) connDot.className = "ws-dot is-ok";
        if (connText) {
          connText.textContent = `USB Live (${liveCount} device${liveCount > 1 ? "s" : ""})`;
        }
        if (banner) banner.style.borderColor = "rgba(93,222,137,0.35)";
        if (bannerDot) bannerDot.className = "ws-dot is-ok";
        if (bannerText) {
          if (anyHasFeatureReport0 || anyHasWebUsb) {
            bannerText.innerHTML = `<strong>USB Connected (${liveCount} device${liveCount > 1 ? "s" : ""})</strong> — checking the Protocol 25 control interface of <b>${safeNames}</b>…`;
          } else if (anyHasLampArray) {
            bannerText.innerHTML = `<strong>USB Connected (${liveCount} device${liveCount > 1 ? "s" : ""})</strong> — Direct USB LampArray Chroma RGB active for <b>${safeNames}</b>.`;
          } else {
            bannerText.innerHTML = `<strong>USB Connected (${liveCount} device${liveCount > 1 ? "s" : ""})</strong> — USB Telemetry active for <b>${safeNames}</b>.`;
          }
        }
        if (bannerRecheckBtn) bannerRecheckBtn.hidden = true;
        if (bannerPairBtn) bannerPairBtn.textContent = "+ Add Another Device";
        if (guideEl) guideEl.hidden = true;
      }
    } else if (liveCount > 0) {
      if (connDot) connDot.className = "ws-dot is-warn";
      if (connText) connText.textContent = "Razer device not supported";
      if (fwBadge) fwBadge.textContent = "Unsupported PID";
      if (banner) banner.style.borderColor = "rgba(255,171,64,0.5)";
      if (bannerDot) bannerDot.className = "ws-dot is-warn";
      if (bannerText) {
        bannerText.innerHTML =
          "<strong>Connected Razer device is not supported</strong> — It is not in the Protocol 25 catalog. Check the supported-devices list or try another model.";
      }
      if (bannerRecheckBtn) bannerRecheckBtn.hidden = true;
      if (bannerPairBtn) bannerPairBtn.textContent = "+ Add Another Device";
      if (guideEl) guideEl.hidden = true;
    } else {
      if (connDot) connDot.className = "ws-dot is-warn";
      if (connText) connText.textContent = "No device connected";
      if (fwBadge) fwBadge.textContent = "USB";
      if (banner) banner.style.borderColor = "rgba(255,171,64,0.45)";
      if (bannerDot) bannerDot.className = "ws-dot is-warn";
      if (bannerText) {
        bannerText.innerHTML =
          onWin && navigator.usb
            ? "<strong>No Razer device connected</strong> — Connect via USB, close Razer Synapse, then click <b>⚡ Connect WebUSB (Onboard Save)</b> to read &amp; save onboard memory slots (see Windows Setup below if pairing for the first time)."
            : "<strong>No compatible Razer device detected</strong> — Connect a Razer keyboard or mouse via USB, close Razer Synapse, then click <b>⚡ Connect WebUSB</b> or <b>Connect WebHID</b>.";
      }
      if (bannerRecheckBtn) bannerRecheckBtn.hidden = true;
      if (bannerPairBtn) {
        bannerPairBtn.textContent = onWin && navigator.usb ? "⚡ Connect WebUSB" : "⚡ Connect Razer Device";
      }
      if (guideEl) guideEl.hidden = !(onWin && navigator.usb);
    }
  }

  async function refreshAuthorizedWebHidDevices() {
    try {
      webHidHandlesByPid.clear();
      webUsbDevicesByPid.clear();
      if (window.isSecureContext && navigator.hid) {
        const rawDevs = (await navigator.hid.getDevices()).filter((d) => d.vendorId === Protocol25.RAZER_VENDOR_ID);
        const grouped = new Map();
        for (const d of rawDevs) {
          if (!grouped.has(d.productId)) grouped.set(d.productId, []);
          grouped.get(d.productId).push(d);
        }
        for (const [pid, list] of grouped.entries()) {
          list.sort((a, b) => scoreWebHidCollection(b) - scoreWebHidCollection(a));
          webHidHandlesByPid.set(pid, list);
        }
      }
      if (window.isSecureContext && navigator.usb && typeof navigator.usb.getDevices === "function") {
        try {
          const usbDevs = (await navigator.usb.getDevices()).filter((d) => d.vendorId === Protocol25.RAZER_VENDOR_ID);
          for (const uDev of usbDevs) {
            const pid = Number(uDev.productId);
            if (!webUsbDevicesByPid.has(pid)) webUsbDevicesByPid.set(pid, []);
            webUsbDevicesByPid.get(pid).push(uDev);
          }
        } catch {
          // ignore if WebUSB is blocked by permissions policy
        }
      }

      const activeLivePids = new Set([...webHidHandlesByPid.keys(), ...webUsbDevicesByPid.keys()]);

      for (const pid of activeLivePids) {
        const meta = Protocol25.KNOWN_DEVICES[pid] || {};
        const webHidList = webHidHandlesByPid.get(pid) || [];
        const usbList = webUsbDevicesByPid.get(pid) || [];
        const sample = webHidList[0];
        const usbSample = usbList[0];
        const rawName = sample?.productName || usbSample?.productName || "";
        const category = classifyDeviceCategory(pid, rawName, sample?.collections || []);
        const isMouse = category === "mouse";
        const safeSampleName = sanitizePlainText(rawName, 64, "");

        let entry = devices.find((x) => Number(x.productId) === Number(pid));
        if (!entry) {
          entry = {
            vendorId: 0x1532,
            productId: pid,
            hexPid: `0x${pid.toString(16).toUpperCase().padStart(4, "0")}`,
            productName: meta.name || safeSampleName || `Razer USB Device (0x${pid.toString(16).toUpperCase()})`,
            category,
            maxSlots: meta.maxSlots || (isMouse ? 5 : 6),
            connectedLive: true,
          };
          devices.push(entry);
        } else {
          entry.connectedLive = true;
          entry.category = category;
          if (safeSampleName && !meta.name) entry.productName = safeSampleName;
        }
        if (!driverState.profilesByPid[pid]) {
          driverState.profilesByPid[pid] = buildDefaultDeviceProfile(pid);
        }
      }

      for (const d of devices) {
        d.connectedLive = activeLivePids.has(Number(d.productId));
      }
      devices = devices.filter((d) => activeLivePids.has(Number(d.productId)));

      if (!activeLivePids.has(Number(selectedPid)) && activeLivePids.size > 0) {
        selectedPid = Number(activeLivePids.values().next().value);
        driverState.selectedPid = selectedPid;
      }

      updateWebHidStatusUI();
      updateCompatibilityUI();
      renderDeviceTabs();
      if (hasCompatibleDevice()) {
        renderProfileSlotBar();
        syncControlsFromSlot();
        renderOverviewPanels();
        if (!initialHardwareSlotSynced) {
          // Read the keyboard's real active slot + settings instead of overwriting the
          // keyboard with whatever this browser happened to have cached.
          initialHardwareSlotSynced = true;
          void syncActiveSlotFromHardware({ quiet: true });
        }
      } else {
        initialHardwareSlotSynced = false;
        protocolDeviceByPid.clear();
        const bar = document.getElementById("profileSlotBar");
        if (bar) bar.innerHTML = "";
      }
    } catch (err) {
      console.warn("Device enumeration warning:", err);
    }
  }

  async function finishDevicePairing(pickedFirst) {
    initialHardwareSlotSynced = true;
    protocolDeviceByPid.clear();
    protocolProbeErrorByPid.clear();
    protocolProbeFailedSigByPid.clear();
    protocolUsbClaimBlockedByPid.clear();
    await refreshAuthorizedWebHidDevices();
    if (pickedFirst) {
      const pid = Number(pickedFirst.productId);
      selectedPid = pid;
      driverState.selectedPid = pid;
      persistDriverState();
      renderDeviceTabs();
      renderProfileSlotBar();
      syncControlsFromSlot();
      renderOverviewPanels();
      const safeName = sanitizePlainText(pickedFirst.productName, 64, `PID 0x${pid.toString(16).toUpperCase()}`);
      showToast(`Paired ${safeName}`);
      void playUiTone("success");
      await syncActiveSlotFromHardware();
      const fw = await queryProtocol25(pid, Protocol25.Builders.getFirmwareVersion());
      if (fw?.args) {
        const [maj, min] = fw.args;
        const fwBadge = document.getElementById("fwBadge");
        if (fwBadge) fwBadge.textContent = `v${Number(maj)}.${String(Number(min) || 0).padStart(2, "0")}`;
      }
      updateWebHidStatusUI();
    } else {
      initialHardwareSlotSynced = false;
    }
  }

  async function pairWebUsbDevices() {
    if (!window.isSecureContext) {
      showToast("HTTPS is required for WebUSB hardware access", false);
      return;
    }
    if (!navigator.usb || typeof navigator.usb.requestDevice !== "function") {
      if (navigator.hid) return pairWebHidDevices();
      showToast("WebUSB requires Chrome, Edge, Brave, Opera, or Vivaldi", false);
      return;
    }
    try {
      const uDev = await navigator.usb.requestDevice({
        filters: [{ vendorId: Protocol25.RAZER_VENDOR_ID }],
      });
      await finishDevicePairing(uDev || null);
    } catch (err) {
      if (err?.name !== "NotAllowedError" && err?.name !== "NotFoundError") {
        showToast(`WebUSB pairing error: ${err.message}`, false);
      } else if (err?.name === "NotFoundError") {
        // User cancelled the WebUSB chooser, or no WinUSB-backed Razer device was listed
        const guideEl = document.getElementById("winUsbSetupGuide");
        if (guideEl && isWindowsPlatform()) {
          guideEl.hidden = false;
          guideEl.open = true;
        }
      }
    }
  }

  async function pairWebHidDevices() {
    if (!window.isSecureContext) {
      showToast("HTTPS is required for WebHID/WebUSB hardware access", false);
      return;
    }
    if (!navigator.hid && !navigator.usb) {
      showToast("WebHID/WebUSB requires Chrome, Edge, Brave, Opera, or Vivaldi", false);
      return;
    }
    if (!navigator.hid && navigator.usb) {
      return pairWebUsbDevices();
    }
    try {
      const picked = await navigator.hid.requestDevice({
        filters: [{ vendorId: Protocol25.RAZER_VENDOR_ID }],
      });
      await finishDevicePairing(picked && picked.length > 0 ? picked[0] : null);
    } catch (err) {
      if (err?.name !== "NotAllowedError") {
        showToast(`WebHID pairing error: ${err.message}`, false);
      }
    }
  }

  function pairBannerSmart() {
    const selPid = Number(selectedPid);
    const needWebUsb =
      navigator.usb &&
      (isWindowsPlatform() || (webHidHandlesByPid.has(selPid) && !protocolDeviceByPid.has(selPid)));
    if (needWebUsb) {
      return pairWebUsbDevices();
    }
    return pairWebHidDevices();
  }

  async function recheckProtocol25() {
    protocolDeviceByPid.clear();
    protocolProbeErrorByPid.clear();
    protocolProbeFailedSigByPid.clear();
    protocolUsbClaimBlockedByPid.clear();
    await refreshAuthorizedWebHidDevices();
    if (hasCompatibleDevice()) {
      await syncActiveSlotFromHardware({ quiet: false });
    }
  }

  function toHex(bytes) {
    return Array.from(bytes || [])
      .map((b) => (b & 0xff).toString(16).padStart(2, "0"))
      .join(" ");
  }

  // ==========================================================================
  // Protocol 25 transport (WebHID + WebUSB Class Control Transfer 0x09 / 0x01)
  // Verified against Huntsman V3 Pro TKL (PID 0x02A7, FW 1.04, Interface 3)
  // ==========================================================================
  const P25_STATUS_NAMES = { 0x00: "NEW", 0x01: "BUSY", 0x02: "OK", 0x03: "FAIL", 0x04: "TIMEOUT", 0x05: "NOT SUPPORTED" };
  const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

  function describeCollections(dev) {
    return (dev?.collections || [])
      .map((c) => `0x${(c.usagePage || 0).toString(16).padStart(4, "0")}:0x${(c.usage || 0).toString(16).padStart(4, "0")}`)
      .join("+");
  }

  async function readFeatureReport91(dev) {
    const view = await dev.receiveFeatureReport(0x00);
    const raw = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    if (raw.length === 91) return Array.from(raw);
    if (raw.length === 90) return [0x00, ...Array.from(raw)];
    const padded = new Array(91).fill(0);
    for (let i = 0; i < Math.min(91, raw.length); i++) padded[i] = raw[i];
    return padded;
  }

  async function ensureUsbInterfaceClaimed(usbDev, interfaceNumber) {
    if (!usbDev.opened) {
      await usbDev.open();
      claimedUsbInterfaces.delete(usbDev);
    }
    if (!usbDev.configuration) {
      await usbDev.selectConfiguration(1);
    }
    let claimedSet = claimedUsbInterfaces.get(usbDev);
    if (!claimedSet) {
      claimedSet = new Set();
      claimedUsbInterfaces.set(usbDev, claimedSet);
    }
    const ifaceObj = usbDev.configuration?.interfaces?.find((i) => i.interfaceNumber === interfaceNumber);
    if (!claimedSet.has(interfaceNumber) && !ifaceObj?.claimed) {
      await usbDev.claimInterface(interfaceNumber);
    }
    claimedSet.add(interfaceNumber);
  }

  async function readUsbFeatureReport91(usbDev, interfaceNumber) {
    const inRes = await usbDev.controlTransferIn(
      { requestType: "class", recipient: "interface", request: 0x01, value: 0x0300, index: interfaceNumber },
      90
    );
    if (!inRes || inRes.status !== "ok" || !inRes.data) {
      throw new Error(`WebUSB GET_REPORT failed (${inRes?.status || "no data"})`);
    }
    const raw = new Uint8Array(inRes.data.buffer, inRes.data.byteOffset, inRes.data.byteLength);
    if (raw.length === 91) return Array.from(raw);
    if (raw.length === 90) return [0x00, ...Array.from(raw)];
    const padded = new Array(91).fill(0);
    for (let i = 0; i < Math.min(90, raw.length); i++) padded[1 + i] = raw[i];
    return padded;
  }

  async function transferProtocol25Hid(dev, body90, { timeoutMs = 1200 } = {}) {
    if (!dev.opened) await dev.open();
    const cmdClass = body90[6] & 0xff;
    const cmdId = body90[7] & 0xff;
    await dev.sendFeatureReport(0x00, Uint8Array.from(body90));
    const started = performance.now();
    let rx91 = null;
    let parsedRx = null;
    let waitMs = 4;
    while (performance.now() - started < timeoutMs) {
      await sleepMs(waitMs);
      waitMs = Math.min(25, waitMs * 2);
      rx91 = await readFeatureReport91(dev);
      parsedRx = Protocol25.parsePacket(rx91);
      const echoes = parsedRx.valid && parsedRx.commandClass === cmdClass && parsedRx.commandId === cmdId;
      // 0x00 = reply not ready yet, 0x01 = busy writing onboard flash
      if (echoes && parsedRx.status !== 0x00 && parsedRx.status !== 0x01) break;
    }
    if (parsedRx) {
      parsedRx.statusName = P25_STATUS_NAMES[parsedRx.status] || parsedRx.statusName;
      if (parsedRx.commandClass !== cmdClass || parsedRx.commandId !== cmdId) {
        parsedRx.status = 0x04;
        parsedRx.statusName = "NO MATCHING REPLY";
      }
    }
    return { rx91, parsedRx };
  }

  // WebUSB Class Control Transfer (HID SET_REPORT 0x09 / GET_REPORT 0x01, wValue=0x0300, wIndex=interfaceNumber)
  // Matches Razer's rzDevice25.js browser transport; never re-sends SET_REPORT while status is 0x00/0x01.
  async function transferProtocol25Usb(usbDev, interfaceNumber, body90, { timeoutMs = 1200 } = {}) {
    await ensureUsbInterfaceClaimed(usbDev, interfaceNumber);
    const cmdClass = body90[6] & 0xff;
    const cmdId = body90[7] & 0xff;
    const outRes = await usbDev.controlTransferOut(
      { requestType: "class", recipient: "interface", request: 0x09, value: 0x0300, index: interfaceNumber },
      Uint8Array.from(body90)
    );
    if (!outRes || outRes.status !== "ok") {
      throw new Error(`WebUSB SET_REPORT failed (${outRes?.status || "unknown"})`);
    }
    const started = performance.now();
    let rx91 = null;
    let parsedRx = null;
    let waitMs = 6;
    while (performance.now() - started < timeoutMs) {
      await sleepMs(waitMs);
      waitMs = Math.min(25, Math.round(waitMs * 1.8));
      rx91 = await readUsbFeatureReport91(usbDev, interfaceNumber);
      parsedRx = Protocol25.parsePacket(rx91);
      const echoes = parsedRx.valid && parsedRx.commandClass === cmdClass && parsedRx.commandId === cmdId;
      if (echoes && parsedRx.status !== 0x00 && parsedRx.status !== 0x01) break;
    }
    if (parsedRx) {
      parsedRx.statusName = P25_STATUS_NAMES[parsedRx.status] || parsedRx.statusName;
      if (parsedRx.commandClass !== cmdClass || parsedRx.commandId !== cmdId) {
        parsedRx.status = 0x04;
        parsedRx.statusName = "NO MATCHING REPLY";
      }
    }
    return { rx91, parsedRx };
  }

  async function transferProtocol25(handle, body90, opts = {}) {
    if (handle?.mode === "webusb") {
      return transferProtocol25Usb(handle.dev, handle.interfaceNumber, body90, opts);
    }
    const hidDev = handle?.mode === "webhid" ? handle.dev : handle;
    return transferProtocol25Hid(hidDev, body90, opts);
  }

  // Find (once) the WebUSB or WebHID interface that speaks Protocol 25 by sending a harmless
  // Get Firmware Version (0x00/0x81) and verifying the echoed reply.
  async function resolveProtocol25Device(pidKey) {
    const numPid = Number(pidKey);
    const hidList = webHidHandlesByPid.get(numPid) || [];
    const usbList = webUsbDevicesByPid.get(numPid) || [];
    const cached = protocolDeviceByPid.get(numPid);
    if (cached) {
      if (cached.mode === "webhid" && hidList.includes(cached.dev)) return cached;
      if (cached.mode === "webusb" && usbList.includes(cached.dev)) return cached;
    }
    protocolDeviceByPid.delete(numPid);

    const probeSig = `${hidList.length}:${usbList.length}`;
    if (protocolProbeFailedSigByPid.get(numPid) === probeSig) return null;
    if (protocolProbeByPid.has(numPid)) return protocolProbeByPid.get(numPid);

    const probe = (async () => {
      const meta = Protocol25.KNOWN_DEVICES[numPid] || {};
      const tid = meta.defaultTransactionId || 0x1f;
      const preferredIf = Number(
        meta.interface ?? (meta.category === "keyboard-analog" || meta.category === "keyboard" ? 3 : 0)
      );
      const probePkt = Protocol25.Builders.getFirmwareVersion(tid);
      const body90 = validateOutgoingPacket90(probePkt.length === 91 ? probePkt.slice(1) : [...probePkt]);
      const tried = [];
      let usbClaimBlocked = false;

      // 1. Probe WebUSB handles first when available (required on Windows where Chromium WebHID strips MI_03)
      for (const uDev of usbList) {
        try {
          if (!uDev.opened) {
            await uDev.open();
            claimedUsbInterfaces.delete(uDev);
          }
          if (!uDev.configuration) {
            await uDev.selectConfiguration(1);
          }
          const exposedIfs = (uDev.configuration?.interfaces || []).map((i) => i.interfaceNumber);
          const candidateIfs = [];
          for (const candidate of [preferredIf, 3, 2, 0, 1, ...exposedIfs]) {
            if (!Number.isInteger(candidate) || candidate < 0) continue;
            if (exposedIfs.length > 0 && !exposedIfs.includes(candidate)) continue;
            if (!candidateIfs.includes(candidate)) candidateIfs.push(candidate);
          }

          for (const ifNum of candidateIfs) {
            try {
              const { parsedRx } = await transferProtocol25Usb(uDev, ifNum, body90, { timeoutMs: 700 });
              if (parsedRx?.status === 0x02 && parsedRx.commandClass === 0x00 && parsedRx.commandId === 0x81) {
                const handle = {
                  mode: "webusb",
                  dev: uDev,
                  interfaceNumber: ifNum,
                  label: `WebUSB (Interface ${ifNum})`,
                };
                protocolDeviceByPid.set(numPid, handle);
                protocolProbeErrorByPid.delete(numPid);
                protocolProbeFailedSigByPid.delete(numPid);
                protocolUsbClaimBlockedByPid.delete(numPid);
                const [maj, min] = parsedRx.args || [];
                const fwBadge = document.getElementById("fwBadge");
                if (fwBadge) fwBadge.textContent = `v${Number(maj)}.${String(Number(min) || 0).padStart(2, "0")}`;
                console.info(
                  `[websynap.se] Verified Protocol 25 via WebUSB IF#${ifNum} for PID 0x${numPid.toString(16)} (FW v${maj}.${String(min ?? 0).padStart(2, "0")})`
                );
                return handle;
              }
              tried.push(`WebUSB IF#${ifNum} → ${parsedRx?.statusName || "no reply"}`);
            } catch (ifErr) {
              const errMsg = String(ifErr?.message || ifErr || "");
              if (ifNum === preferredIf && /claim|security|access|denied|networkerror|notfound/i.test(errMsg + " " + (ifErr?.name || ""))) {
                usbClaimBlocked = true;
              }
              tried.push(`WebUSB IF#${ifNum} → ${errMsg}`);
            }
          }
        } catch (uErr) {
          const errMsg = String(uErr?.message || uErr || "");
          if (/security|access|denied|open|claim/i.test(errMsg + " " + (uErr?.name || ""))) {
            usbClaimBlocked = true;
          }
          tried.push(`WebUSB open → ${errMsg}`);
        }
      }

      // 2. Probe WebHID collections (works out-of-the-box on macOS / Linux / ChromeOS)
      const hidCandidates = hidList
        .filter((d) => d.vendorId === Protocol25.RAZER_VENDOR_ID)
        .filter((d) => (d.collections || []).some((c) => c.usagePage !== 0x0059 && c.usagePage < 0xff00))
        .sort((a, b) => Number(deviceHasProtocol25FeatureReport(b)) - Number(deviceHasProtocol25FeatureReport(a)));

      for (const d of hidCandidates) {
        try {
          const { parsedRx } = await transferProtocol25Hid(d, body90, { timeoutMs: 600 });
          if (parsedRx?.status === 0x02 && parsedRx.commandClass === 0x00 && parsedRx.commandId === 0x81) {
            const handle = {
              mode: "webhid",
              dev: d,
              label: `WebHID (${describeCollections(d)})`,
            };
            protocolDeviceByPid.set(numPid, handle);
            protocolProbeErrorByPid.delete(numPid);
            protocolProbeFailedSigByPid.delete(numPid);
            protocolUsbClaimBlockedByPid.delete(numPid);
            const [maj, min] = parsedRx.args || [];
            const fwBadge = document.getElementById("fwBadge");
            if (fwBadge) fwBadge.textContent = `v${Number(maj)}.${String(Number(min) || 0).padStart(2, "0")}`;
            console.info(
              `[websynap.se] Verified Protocol 25 via WebHID ${describeCollections(d)} for PID 0x${numPid.toString(16)} (FW v${maj}.${String(min ?? 0).padStart(2, "0")})`
            );
            return handle;
          }
          tried.push(`WebHID ${describeCollections(d)} → ${parsedRx?.statusName || "no reply"}`);
        } catch (err) {
          tried.push(`WebHID ${describeCollections(d)} → ${err?.message || err}`);
        }
      }

      const devName = meta.name || `Razer Device (0x${numPid.toString(16).toUpperCase()})`;
      const hasControlCandidate = hidList.some((d) => deviceHasProtocol25FeatureReport(d));
      let msg;
      if (isWindowsPlatform() && usbClaimBlocked) {
        protocolUsbClaimBlockedByPid.set(numPid, true);
        msg = `Windows still has HidUsb bound to ${devName} (Interface ${preferredIf}), which blocks WebUSB access to onboard memory. Bind WinUSB to “${devName} (Interface ${preferredIf})” in Zadig (see Windows Setup below), then click “⚡ Pair / Retry WebUSB”.`;
      } else if (isWindowsPlatform() && usbList.length === 0) {
        msg = `Windows Chromium blocks WebHID Feature Reports on Interface ${preferredIf} (MI_0${preferredIf}). To read & save onboard memory slots, bind WinUSB to “${devName} (Interface ${preferredIf})” (see Windows Setup below) and click “⚡ Connect WebUSB (Onboard Save)”.`;
      } else if (hasControlCandidate || usbList.length > 0) {
        msg = "the device's Protocol 25 control interface did not respond. Close Razer Synapse or other RGB tools, unplug/replug the device, and click Re-check.";
      } else {
        msg = `Protocol 25 USB Interface ${preferredIf} is not yet authorized. Click “⚡ Connect WebUSB (Onboard Save)” and select your Razer device.`;
      }
      protocolProbeErrorByPid.set(numPid, msg);
      protocolProbeFailedSigByPid.set(numPid, probeSig);
      console.warn(
        `[websynap.se] PID 0x${numPid.toString(16)}: ${msg}\n  probe results: ${tried.join("; ") || "(no candidates)"}`
      );
      return null;
    })();
    protocolProbeByPid.set(numPid, probe);
    try {
      return await probe;
    } finally {
      protocolProbeByPid.delete(numPid);
    }
  }

  // Direct query helper used for read-back (bypasses the UI/log pipeline)
  async function queryProtocol25(pidKey, packet) {
    const handle = await resolveProtocol25Device(pidKey);
    if (!handle) return null;
    const meta = Protocol25.KNOWN_DEVICES[Number(pidKey)] || {};
    const raw90 = packet.length === 91 ? [...packet.slice(1)] : [...packet];
    if (meta.defaultTransactionId && raw90[1] === 0x1f && meta.defaultTransactionId !== 0x1f) {
      raw90[1] = meta.defaultTransactionId;
    }
    const body90 = validateOutgoingPacket90(raw90);
    const prevLock = webHidMutexByPid.get(Number(pidKey)) || Promise.resolve();
    let releaseLock;
    const nextLock = new Promise((r) => {
      releaseLock = r;
    });
    webHidMutexByPid.set(Number(pidKey), prevLock.then(() => nextLock));
    await prevLock;
    try {
      const { parsedRx } = await transferProtocol25(handle, body90);
      return parsedRx?.status === 0x02 ? parsedRx : null;
    } catch {
      return null;
    } finally {
      releaseLock();
    }
  }

  async function sendRawWebHid90(pidKey, packet90, options = {}) {
    const prevLock = webHidMutexByPid.get(pidKey) || Promise.resolve();
    let releaseLock;
    const nextLock = new Promise((r) => {
      releaseLock = r;
    });
    webHidMutexByPid.set(pidKey, prevLock.then(() => nextLock));
    await prevLock;

    try {
      const meta = Protocol25.KNOWN_DEVICES[pidKey] || {};
      const raw90 = packet90.length === 91 ? [...packet90.slice(1)] : [...packet90];
      if (meta.defaultTransactionId && raw90[1] === 0x1f && meta.defaultTransactionId !== 0x1f) {
        raw90[1] = meta.defaultTransactionId;
      }
      // Enforce Protocol 25 Hardware Command Firewall & CRC verification
      const body90 = validateOutgoingPacket90(raw90);
      const report91 = [0x00, ...body90];
      const parsedTx = Protocol25.parsePacket(report91);
      const cmdClass = body90[6] & 0xff;
      const cmdId = body90[7] & 0xff;
      const isLightingCmd =
        cmdClass === 0x0f || (cmdClass === 0x03 && (cmdId === 0x01 || cmdId === 0x02 || cmdId === 0x03 || cmdId === 0x0a));

      // 1. Protocol 25 over verified WebUSB (Interface 3 / meta.interface) or WebHID handle
      const handle = await resolveProtocol25Device(pidKey);
      if (handle) {
        let rx91;
        let parsedRx;
        try {
          ({ rx91, parsedRx } = await transferProtocol25(handle, body90));
        } catch (err) {
          protocolDeviceByPid.delete(Number(pidKey));
          protocolProbeFailedSigByPid.delete(Number(pidKey));
          throw new Error(`USB transfer failed: ${err?.message || err}`);
        }
        const okStatus = parsedRx.status === 0x02;

        if (okStatus && cmdClass === 0x0f && (cmdId === 0x02 || cmdId === 0x04)) {
          onboardChromaFlashedByPid.set(Number(pidKey), true);
        }
        if (okStatus && isLightingCmd && !options.skipLampArray && findLampArrayDevice(pidKey)) {
          const activeEffect = getActiveSlotData()?.lighting?.effect || "static";
          if (HARDWARE_NATIVE_CHROMA_EFFECTS.has(activeEffect)) {
            // Make sure the onboard effect we just stored is what the keyboard shows
            await releaseLampArrayToHardwareAutonomous(pidKey);
          } else {
            // Software-only animation (rain, aurora, ...) — live while the tab is open
            await applyLampArrayEffect(pidKey);
          }
        }

        const logItem = {
          productId: pidKey,
          txHex: toHex(report91),
          rxHex: toHex(rx91),
          parsedTx: {
            ...parsedTx,
            commandClassHex: `0x${parsedTx.commandClass.toString(16).padStart(2, "0").toUpperCase()}`,
            commandIdHex: `0x${parsedTx.commandId.toString(16).padStart(2, "0").toUpperCase()}`,
          },
          parsedRx,
        };
        if (!okStatus) {
          return {
            ok: false,
            mode: handle.mode,
            tx: report91,
            rx: rx91,
            parsedRx,
            logItem,
            error: `Device rejected command (${parsedRx.statusName || "status 0x" + (parsedRx.status ?? 0).toString(16)})`,
          };
        }
        return { ok: true, mode: handle.mode, tx: report91, rx: rx91, parsedRx, logItem };
      }

      // 2. No Protocol 25 control interface answered. Do NOT pretend the command succeeded.
      // Lighting can still be previewed live through LampArray, but it is not stored on the keyboard.
      let lampApplied = false;
      if (isLightingCmd && !options.skipLampArray && findLampArrayDevice(pidKey)) {
        lampApplied = await applyLampArrayEffect(pidKey);
      }
      updateWebHidStatusUI();
      const reason =
        protocolProbeErrorByPid.get(Number(pidKey)) ||
        "the device's Protocol 25 control interface is not accessible from this browser";
      return {
        ok: lampApplied,
        liveOnly: lampApplied,
        mode: lampApplied ? "webhid-lamparray" : "unavailable",
        tx: report91,
        rx: null,
        parsedRx: null,
        logItem: {
          productId: pidKey,
          txHex: toHex(report91),
          rxHex: "(no reply — not sent to onboard memory)",
          parsedTx: {
            ...parsedTx,
            commandClassHex: `0x${parsedTx.commandClass.toString(16).padStart(2, "0").toUpperCase()}`,
            commandIdHex: `0x${parsedTx.commandId.toString(16).padStart(2, "0").toUpperCase()}`,
          },
          parsedRx: { statusName: lampApplied ? "LIVE PREVIEW ONLY" : "NOT SENT" },
        },
        error: lampApplied ? `Live preview only — not saved: ${reason}` : `Not applied: ${reason}`,
      };
    } finally {
      releaseLock();
    }
  }

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
    while (container.children.length >= 5) {
      container.firstElementChild?.remove();
    }
    const el = document.createElement("div");
    el.className = `toast ${isOk ? "is-ok" : ""}`;
    const msgSpan = document.createElement("span");
    msgSpan.textContent = String(message ?? "").slice(0, 180);
    const statusSpan = document.createElement("span");
    statusSpan.style.cssText = "color:var(--accent);font-family:var(--font-mono);font-size:11px;";
    statusSpan.textContent = isOk ? "0x02 OK" : "INFO";
    el.append(msgSpan, statusSpan);
    container.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  function getActiveDeviceProfileObj() {
    if (!driverState.profilesByPid) driverState.profilesByPid = {};
    if (!driverState.profilesByPid[selectedPid]) {
      driverState.profilesByPid[selectedPid] = buildDefaultDeviceProfile(selectedPid);
    }
    return driverState.profilesByPid[selectedPid];
  }

  function getActiveSlotData() {
    const devProf = getActiveDeviceProfileObj();
    const slotId = devProf.activeSlot || 1;
    if (!devProf.slots[slotId]) devProf.slots[slotId] = buildDefaultSlot(selectedPid, slotId);
    return devProf.slots[slotId];
  }

  async function sendPacket90(packet90, label = "Command", slotPatch = null, statePatch = null, forceImmediate = false) {
    if (!hasCompatibleDevice()) {
      showToast("No compatible Razer device connected. Click Connect Razer Device first.", false);
      return { ok: false, error: "No compatible Razer device connected" };
    }
    if (slotPatch) Object.assign(getActiveSlotData(), slotPatch);
    if (statePatch) Object.assign(driverState, statePatch);
    persistDriverState();

    if (!uiPrefs.instantFlash && !forceImmediate) {
      if (stagedQueue.length >= 64) stagedQueue.shift();
      stagedQueue.push({ productId: selectedPid, packet90, label, slotPatch, statePatch });
      renderPendingApplyBar();
      renderOverviewPanels();
      updateProfileKeyBox();
      return;
    }

    renderProfileSlotBar();
    renderOverviewPanels();

    try {
      const data = await sendRawWebHid90(Number(selectedPid), packet90, { slotPatch, statePatch });
      if (data.logItem) prependPacketLog(data.logItem);
      if (!data.ok) {
        showToast(`${label} → ${data.error || "failed"}`, false);
        void playUiTone("error");
        return data;
      }
      if (data.liveOnly) {
        showToast(`${label} → ${data.error}`, false);
        return data;
      }

      // If this was a Huntsman V3 Pro TKL Actuation command (0x02/0x19),
      // also dispatch the remaining key chunks + Rapid Trigger (0x02/0x1A) + Continuous RT (0x02/0x20)
      const body90 = packet90.length === 91 ? packet90.slice(1) : packet90;
      if (body90[6] === 0x02 && body90[7] === 0x19 && slotPatch) {
        const slotId = getActiveDeviceProfileObj().activeSlot || 1;
        const slot = getActiveSlotData();
        const actMm = slotPatch.chunkActMm ?? slotPatch.actuationMm ?? slot.actuationMm ?? 1.2;
        const rtEnabled = slotPatch.chunkRtEnabled ?? slotPatch.rtEnabled ?? slot.rtEnabled ?? false;
        const rtDownMm = slotPatch.chunkRtDownMm ?? slotPatch.rtDownMm ?? slot.rtDownMm ?? 0.3;
        const rtUpMm = slotPatch.chunkRtUpMm ?? slotPatch.rtUpMm ?? slot.rtUpMm ?? 0.3;
        const continuousRt = slotPatch.continuousRt ?? slot.continuousRt ?? true;

        const targetKeys =
          selectedKeys.size > 0
            ? Array.from(selectedKeys).map((k) => Protocol25.keyLabelToMatrixId(k))
            : ALL_TKL_ANALOG_KEY_IDS;

        const followUps = [];
        for (let i = 15; i < targetKeys.length; i += 15) {
          followUps.push(Protocol25.Builders.setAnalogActuation({ slotId, actuationMm: actMm, keyIds: targetKeys.slice(i, i + 15) }));
        }
        for (let i = 0; i < targetKeys.length; i += 13) {
          followUps.push(
            Protocol25.Builders.setAnalogRapidTrigger({ slotId, rtEnabled, rtDownMm, rtUpMm, keyIds: targetKeys.slice(i, i + 13) })
          );
        }
        followUps.push(Protocol25.Builders.setContinuousRapidTrigger({ slotId, continuousRt }));
        let failed = 0;
        for (const pkt of followUps) {
          const r = await sendRawWebHid90(Number(selectedPid), pkt).catch(() => null);
          if (!r?.ok) failed++;
        }
        if (failed) {
          showToast(`${label} → ${failed} of ${followUps.length + 1} actuation packets were rejected`, false);
          return data;
        }
      }

      const status = data.parsedRx?.statusName || "OK";
      showToast(`${label} → ${status}`);
      void playUiTone("success");
      updateProfileKeyBox();
      return data;
    } catch (err) {
      showToast(`Error: ${err.message}`, false);
      void playUiTone("error");
      return { ok: false, error: err.message };
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
      localStorage.setItem(STORAGE_KEY_PREFS, JSON.stringify(uiPrefs));
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
  function getCategoryIcon(category) {
    switch (category) {
      case "keyboard-analog":
      case "keyboard":
        return "⌨️";
      case "mouse":
        return "🖱️";
      case "audio":
        return "🎧";
      case "controller":
        return "🎮";
      case "mat-accessory":
        return "🌈";
      default:
        return "⚡";
    }
  }

  function getCategoryLabel(category) {
    switch (category) {
      case "keyboard-analog":
        return "Analog Optical Keyboard";
      case "keyboard":
        return "Gaming Keyboard / Keypad";
      case "mouse":
        return "Gaming Mouse";
      case "audio":
        return "Audio / Headset / Broadcaster";
      case "controller":
        return "Controller / Arcade Fightstick";
      case "mat-accessory":
        return "Chroma Mat / Dock / Accessory";
      default:
        return "Razer Synapse 4 Device";
    }
  }

  function renderOverviewPanels() {
    const meta = getDeviceMeta(selectedPid);
    const cat = meta.category || "keyboard";
    const slot = getActiveSlotData();
    const devProf = getActiveDeviceProfileObj();
    const slotId = devProf.activeSlot || 1;
    const devEntry = devices.find((d) => Number(d.productId) === Number(selectedPid));
    const displayName = devEntry?.productName || meta.name || `Razer Device (${meta.hexPid})`;
    const connBadge = devEntry?.connectedLive ? "USB Live" : "Offline";
    const txHex = `0x${(meta.defaultTransactionId ?? 0x1f).toString(16).toUpperCase().padStart(2, "0")}`;

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

    titleEl.textContent = displayName;
    metaEl.textContent = `${connBadge} · ${getCategoryLabel(cat)} · VID 0x1532 · PID ${meta.hexPid} (TxID ${txHex})`;

    if (cat === "keyboard-analog" || cat === "keyboard") {
      if (cat === "keyboard-analog") {
        figLabel1.textContent = "Actuation point";
        figVal1.textContent = Number(slot.actuationMm ?? 1.2).toFixed(1);
        figUnit1.textContent = "mm";
        const overrideCount = Object.keys(slot.perKeyOverrides || {}).length;
        figSub1.textContent = overrideCount > 0 ? `${overrideCount} per-key overrides active` : "Global optical analog trigger";
      } else {
        figLabel1.textContent = "Switch Matrix";
        figVal1.textContent = "NKRO";
        figUnit1.textContent = "USB";
        const remapCount = Object.keys(slot.keyBindings?.standard || {}).length + Object.keys(slot.keyBindings?.hypershift || {}).length;
        figSub1.textContent = remapCount > 0 ? `${remapCount} custom key bindings` : "100% Anti-Ghosting Matrix";
      }

      const hz = Number(slot.pollingHz || 1000);
      figVal2.textContent = hz.toLocaleString();
      figSub2.textContent = `${(1000 / hz).toFixed(2)} ms USB interval`;

      figLabel3.textContent = cat === "keyboard-analog" ? "Rapid Trigger" : "Snap Tap SOCD";
      figVal3.textContent =
        cat === "keyboard-analog"
          ? slot.rtEnabled
            ? `${Number(slot.rtDownMm ?? 0.3).toFixed(2)} mm`
            : "Off"
          : slot.snapTapEnabled
          ? `${slot.snapKeyA || "A"}+${slot.snapKeyB || "D"}`
          : "Off";
      figSub3.textContent =
        cat === "keyboard-analog"
          ? slot.rtEnabled
            ? `Upstroke ${Number(slot.rtUpMm ?? 0.3).toFixed(2)} mm`
            : "Fixed reset point"
          : "Last-input directional priority";

      figVal4.textContent = `S${slotId}`;
      figSub4.textContent = slot.name || `Slot ${slotId}`;

      chipsLabel.textContent = "Active features";
      const safeKeyA = escapeHtml(slot.snapKeyA || "A");
      const safeKeyB = escapeHtml(slot.snapKeyB || "D");
      const safeEffect = escapeHtml((slot.lighting?.effect || "static").toUpperCase());
      chipsList.innerHTML = [
        cat === "keyboard-analog"
          ? `<span class="ws-chip ${slot.rtEnabled ? "is-on" : ""}">Rapid Trigger ${slot.rtEnabled ? "On" : "Off"}</span>`
          : `<span class="ws-chip is-on">Hypershift Dual-Layer</span>`,
        `<span class="ws-chip ${slot.snapTapEnabled ? "is-on" : ""}">Snap Tap (${safeKeyA}+${safeKeyB})</span>`,
        `<span class="ws-chip ${slot.gamingMode?.enabled ? "is-on" : ""}">Gaming Mode ${slot.gamingMode?.enabled ? "On" : "Off"}</span>`,
        `<span class="ws-chip is-on">Chroma: ${safeEffect}</span>`,
      ].join("");

      document.getElementById("sparkPanelTitle").textContent =
        cat === "keyboard-analog" ? "Analog switch actuation curve" : "Key matrix scan & debounce curve";
      document.getElementById("sparkPanelMeta").textContent =
        cat === "keyboard-analog"
          ? `Trigger at ${Number(slot.actuationMm ?? 1.2).toFixed(1)} mm · RT ${slot.rtEnabled ? "Active" : "Off"}`
          : `Polling at ${hz} Hz (${(1000 / hz).toFixed(2)} ms) · Snap Tap ${slot.snapTapEnabled ? "Active" : "Off"}`;
      document.getElementById("sparkAxisStart").textContent = "0.1 mm top of keystroke";
      document.getElementById("sparkAxisEnd").textContent = "4.0 mm bottws-out";
      const actRatio = Math.min(1, Math.max(0.05, (slot.actuationMm ?? 1.2) / 4.0));
      const xTrig = Math.round(actRatio * 600);
      const yTrig = Math.round(80 - actRatio * 62);
      const linePath = `M0,78 L${xTrig},${yTrig} L600,12`;
      const areaPath = `${linePath} L600,86 L0,86 Z`;
      document.getElementById("telemetrySparkLine").setAttribute("d", linePath);
      document.getElementById("telemetrySparkArea").setAttribute("d", areaPath);
    } else if (cat === "mouse") {
      const stages = slot.dpiStages || [];
      const activeIdx = (slot.activeStageIndex || 3) - 1;
      const activeStage = stages[activeIdx] || stages[0] || { x: 1600, y: 1600 };

      const mouseTitleEl = document.getElementById("mouseStageTitle");
      const mouseSubEl = document.getElementById("mouseStageSubtitle");
      if (mouseTitleEl) mouseTitleEl.textContent = `${displayName} · Optical Sensor & Button Map`;
      if (mouseSubEl) {
        mouseSubEl.textContent = `PID ${meta.hexPid} · Connection: ${(meta.connection || "wired").toUpperCase()} · Click any callout to configure button assignment`;
      }

      figLabel1.textContent = "Sensitivity";
      figVal1.textContent = activeStage.x === activeStage.y ? activeStage.x.toLocaleString() : `${activeStage.x}/${activeStage.y}`;
      figUnit1.textContent = "DPI";
      figSub1.textContent = `Stage ${activeIdx + 1} of ${stages.filter((s) => s.enabled !== false).length}`;

      const hz = Number(slot.pollingHz || 1000);
      figVal2.textContent = hz.toLocaleString();
      figSub2.textContent = `${(1000 / hz).toFixed(3)} ms interval`;

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
    } else if (cat === "audio") {
      const a = slot.audio || { volume: 82, micVolume: 85, eqPreset: 0, eqBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], hapticsIntensity: 0 };
      const eqNames = ["Default / Flat", "Game", "Movie", "Music", "Esports FPS", "Custom 10-Band"];
      figLabel1.textContent = "Master Volume";
      figVal1.textContent = a.muted ? "MUTE" : String(a.volume ?? 82);
      figUnit1.textContent = a.muted ? "" : "%";
      figSub1.textContent = `EQ: ${eqNames[a.eqPreset || 0] || "Custom"}`;

      figVal2.textContent = a.micMuted ? "OFF" : `${a.micVolume ?? 85}%`;
      figSub2.textContent = `Mic Level · Sidetone ${a.sidetoneEnabled ? `${a.sidetoneVolume}%` : "Off"}`;

      figLabel3.textContent = "Sensa HD Haptics";
      figVal3.textContent = a.hapticsIntensity > 0 ? `${a.hapticsIntensity}%` : "Off";
      figSub3.textContent = `Bass Boost ${a.bassBoost ?? 40}% · Clarity ${a.voiceClarity ?? 60}%`;

      figVal4.textContent = `S${slotId}`;
      figSub4.textContent = slot.name || `Slot ${slotId}`;

      chipsLabel.textContent = "Audio DSP Pipeline";
      chipsList.innerHTML = [
        `<span class="ws-chip is-on">EQ: ${eqNames[a.eqPreset || 0]}</span>`,
        `<span class="ws-chip ${!a.micMuted ? "is-on" : ""}">Mic ${a.micMuted ? "Muted" : `${a.micVolume ?? 85}%`}</span>`,
        `<span class="ws-chip ${a.sidetoneEnabled ? "is-on" : ""}">Sidetone ${a.sidetoneEnabled ? `${a.sidetoneVolume}%` : "Off"}</span>`,
        `<span class="ws-chip ${a.normalization ? "is-on" : ""}">Volume Normalization</span>`,
      ].join("");

      const bands = a.eqBands || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      const pts = bands.map((db, idx) => {
        const x = Math.round((idx / 9) * 600);
        const y = Math.round(48 - (Number(db || 0) / 12) * 34);
        return `${idx === 0 ? "M" : "L"}${x},${y}`;
      });
      const linePath = pts.join(" ");
      const areaPath = `${linePath} L600,86 L0,86 Z`;
      document.getElementById("sparkPanelTitle").textContent = "10-Band Parametric Equalizer Frequency Curve";
      document.getElementById("sparkPanelMeta").textContent = `31 Hz – 16 kHz DSP Response (${eqNames[a.eqPreset || 0]})`;
      document.getElementById("sparkAxisStart").textContent = "31 Hz Sub-Bass";
      document.getElementById("sparkAxisEnd").textContent = "16 kHz Brilliance";
      document.getElementById("telemetrySparkLine").setAttribute("d", linePath);
      document.getElementById("telemetrySparkArea").setAttribute("d", areaPath);
    } else if (cat === "controller") {
      const c = slot.controller || { leftDeadzone: 5, rightDeadzone: 5, leftHairTrigger: true, rightHairTrigger: true, leftTriggerActuation: 35, rightTriggerActuation: 35, clutchSensitivity: 50 };
      figLabel1.textContent = "Stick Deadzones";
      figVal1.textContent = `${c.leftDeadzone ?? 5}/${c.rightDeadzone ?? 5}`;
      figUnit1.textContent = "%";
      figSub1.textContent = c.circularityMode ? "Circularity Mode Active" : "Raw Square Gate";

      const hz = Number(slot.pollingHz || 1000);
      figVal2.textContent = hz.toLocaleString();
      figSub2.textContent = `HyperPolling Controller Rate`;

      figLabel3.textContent = "Hair Triggers";
      figVal3.textContent = `${c.leftTriggerActuation ?? 35}/${c.rightTriggerActuation ?? 35}%`;
      figSub3.textContent = `L2 ${c.leftHairTrigger ? "Instant" : "Full"} · R2 ${c.rightHairTrigger ? "Instant" : "Full"}`;

      figVal4.textContent = `S${slotId}`;
      figSub4.textContent = slot.name || `Slot ${slotId}`;

      chipsLabel.textContent = "Controller Configuration";
      chipsList.innerHTML = [
        `<span class="ws-chip ${c.leftHairTrigger ? "is-on" : ""}">L2 Hair Trigger ${c.leftHairTrigger ? "On" : "Off"}</span>`,
        `<span class="ws-chip ${c.rightHairTrigger ? "is-on" : ""}">R2 Hair Trigger ${c.rightHairTrigger ? "On" : "Off"}</span>`,
        `<span class="ws-chip is-on">Focus Clutch ${c.clutchSensitivity ?? 50}%</span>`,
        `<span class="ws-chip is-on">Rumble ${c.leftMotor ?? 80}% / ${c.rightMotor ?? 80}%</span>`,
      ].join("");

      document.getElementById("sparkPanelTitle").textContent = "Hall-Effect Thumbstick & Trigger Response Curve";
      document.getElementById("sparkPanelMeta").textContent = `Deadzone ${c.leftDeadzone}% · Trigger Actuation ${c.leftTriggerActuation}%`;
      document.getElementById("sparkAxisStart").textContent = `${c.leftDeadzone}% inner deadzone`;
      document.getElementById("sparkAxisEnd").textContent = "100% full deflection";
      const dzX = Math.round(((c.leftDeadzone || 5) / 30) * 180);
      const linePath = `M0,82 L${dzX},82 L600,12`;
      const areaPath = `${linePath} L600,86 L0,86 Z`;
      document.getElementById("telemetrySparkLine").setAttribute("d", linePath);
      document.getElementById("telemetrySparkArea").setAttribute("d", areaPath);
    } else {
      // mat-accessory
      const light = slot.lighting || { effect: "wave", color1: "#00e676", brightness: 100 };
      const acc = slot.accessory || { ledCount: 15, fanMode: 0, fanRpmPct: 60 };
      figLabel1.textContent = "Chroma Effect";
      figVal1.textContent = (light.effect || "wave").toUpperCase();
      figUnit1.textContent = "";
      figSub1.textContent = `Primary Color ${light.color1 || "#00e676"}`;

      figVal2.textContent = `${light.brightness ?? 100}%`;
      figSub2.textContent = `Matrix Luminance (${Math.round(((light.brightness ?? 100) / 100) * 255)}/255)`;

      figLabel3.textContent = "Addressable Zones";
      figVal3.textContent = `${acc.ledCount ?? 15}`;
      figSub3.textContent = "ARGB LEDs (Class 0x0F / 0x08)";

      figVal4.textContent = `S${slotId}`;
      figSub4.textContent = slot.name || `Slot ${slotId}`;

      chipsLabel.textContent = "Chroma & Accessory Status";
      const safeAccEffect = escapeHtml((light.effect || "wave").toUpperCase());
      const safeAccBr = clampNum(light.brightness, 0, 100, 100);
      const safeLedCount = clampNum(acc.ledCount, 1, 60, 15);
      chipsList.innerHTML = [
        `<span class="ws-chip is-on">Effect: ${safeAccEffect}</span>`,
        `<span class="ws-chip is-on">Brightness: ${safeAccBr}%</span>`,
        `<span class="ws-chip is-on">${safeLedCount} ARGB LEDs</span>`,
      ].join("");

      document.getElementById("sparkPanelTitle").textContent = "Chroma ARGB Zone Luminance Distribution";
      document.getElementById("sparkPanelMeta").textContent = `${safeLedCount} Zones · ${safeAccBr}% Brightness`;
      document.getElementById("sparkAxisStart").textContent = "Zone 1";
      document.getElementById("sparkAxisEnd").textContent = `Zone ${safeLedCount}`;
      const yLvl = Math.round(82 - (safeAccBr / 100) * 68);
      const linePath = `M0,${yLvl} L200,${Math.max(10, yLvl - 8)} L400,${Math.min(82, yLvl + 6)} L600,${yLvl}`;
      const areaPath = `${linePath} L600,86 L0,86 Z`;
      document.getElementById("telemetrySparkLine").setAttribute("d", linePath);
      document.getElementById("telemetrySparkArea").setAttribute("d", areaPath);
    }
  }

  // ==========================================================================
  // 9. Sidebar Devices List, Active Shelf & Complete Synapse 4 Catalog
  // ==========================================================================
  let catalogCategoryFilter = "all";
  let catalogSearchQuery = "";

  function renderDeviceTabs() {
    const container = document.getElementById("deviceTabs");
    if (!container) return;
    container.innerHTML = "";

    devices.forEach((dev) => {
      const meta = getDeviceMeta(dev.productId);
      const cat = dev.category || meta.category || "keyboard";
      const active = Number(dev.productId) === Number(selectedPid);
      const devProf = driverState.profilesByPid?.[dev.productId];
      const slotNum = clampNum(devProf?.activeSlot, 1, 6, 1);
      const shortName = escapeHtml((dev.productName || meta.name || `PID ${dev.productId}`).replace(/^Razer\s+/i, ""));

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `ws-side-device ${active ? "is-active" : ""}`;
      btn.innerHTML = `
        <span class="ws-side-device-art">
          <span>${getCategoryIcon(cat)}</span>
          <span class="ws-side-device-live" style="${dev.connectedLive ? "" : "opacity:0.45"}"></span>
        </span>
        <span class="ws-side-device-text">
          <span class="ws-side-device-name">${shortName}</span>
          <span class="ws-side-device-sub">
            <span>Slot S${slotNum}</span>
            <span>·</span>
            <span>${escapeHtml(meta.hexPid)}</span>
          </span>
        </span>
      `;
      btn.addEventListener("click", () => {
        selectedPid = Number(dev.productId);
        driverState.selectedPid = selectedPid;
        persistDriverState();
        switchMainView("workspace");
        renderDeviceTabs();
        renderProfileSlotBar();
        syncControlsFromSlot();
        renderOverviewPanels();
        updateWebHidStatusUI();
        void syncActiveSlotFromHardware({ quiet: true });
      });
      container.appendChild(btn);
    });

    const countBadge = document.getElementById("navDeviceCount");
    if (countBadge) countBadge.textContent = String(devices.length);
    renderDevicesShelf();
  }

  function loadCatalogDeviceIntoWorkspace(pid) {
    const numPid = Number(pid);
    const isConnected = webHidHandlesByPid.has(numPid) || webUsbDevicesByPid.has(numPid);
    if (!isConnected) {
      showToast("This device is supported. Connect it via USB and pair via WebUSB or WebHID.", false);
      void pairBannerSmart();
      return;
    }
    const meta = getDeviceMeta(numPid);
    let existing = devices.find((d) => Number(d.productId) === numPid);
    if (!existing) {
      existing = {
        vendorId: 0x1532,
        productId: numPid,
        hexPid: meta.hexPid,
        productName: meta.name,
        category: meta.category,
        maxSlots: meta.maxSlots || 5,
        connectedLive: isConnected,
      };
      devices.push(existing);
    }
    if (!driverState.profilesByPid[numPid]) {
      driverState.profilesByPid[numPid] = buildDefaultDeviceProfile(numPid);
    }
    selectedPid = numPid;
    driverState.selectedPid = numPid;
    persistDriverState();
    switchMainView("workspace");
    renderDeviceTabs();
    renderProfileSlotBar();
    syncControlsFromSlot();
    renderOverviewPanels();
    showToast(`Loaded ${meta.name} (${meta.hexPid}) into workspace`);
    void playUiTone("info");
  }

  function renderSynapseCatalog() {
    const grid = document.getElementById("synapseCatalogGrid");
    const statsBadge = document.getElementById("catalogStatsBadge");
    if (!grid || typeof Protocol25.getCatalogDevices !== "function") return;

    const allCatalog = Protocol25.getCatalogDevices();
    const totalPidsCount = Object.keys(Protocol25.KNOWN_DEVICES || {}).length;
    const q = (catalogSearchQuery || "").trim().toLowerCase();

    const filtered = allCatalog.filter((item) => {
      if (catalogCategoryFilter !== "all" && item.category !== catalogCategoryFilter) {
        return false;
      }
      if (!q) return true;
      const pidDec = String(item.productId);
      const pidHex = (item.hexPid || "").toLowerCase();
      const nameLow = (item.name || "").toLowerCase();
      const catLow = (item.category || "").toLowerCase();
      return nameLow.includes(q) || pidHex.includes(q) || pidDec.includes(q) || catLow.includes(q);
    });

    if (statsBadge) {
      statsBadge.textContent = `Showing ${filtered.length} of ${allCatalog.length} models (${totalPidsCount} PIDs)`;
    }

    const activePids = new Set(devices.map((d) => Number(d.productId)));

    grid.innerHTML = filtered
      .map((item) => {
        const inWorkspace = activePids.has(Number(item.productId));
        const icon = getCategoryIcon(item.category);
        const catTitle = escapeHtml(getCategoryLabel(item.category));
        const connLabel = escapeHtml((item.connection || "wired").toUpperCase());
        const txHex = `0x${(item.defaultTransactionId ?? 0x1f).toString(16).toUpperCase().padStart(2, "0")}`;
        return `
        <article class="ws-device-block" style="padding:14px;display:flex;flex-direction:column;justify-content:space-between;gap:10px;">
          <div>
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
              <strong style="font-size:14px;font-weight:650;line-height:1.3;">${icon} ${escapeHtml(item.name)}</strong>
              <span class="ws-badge ${inWorkspace ? "is-ok" : ""}" style="font-family:var(--font-mono);font-size:11px;flex-shrink:0;">${escapeHtml(item.hexPid)}</span>
            </div>
            <div class="ws-meta" style="margin-top:4px;">${catTitle}</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">
              <span class="ws-chip" style="font-size:10px;padding:2px 7px;">${connLabel}</span>
              <span class="ws-chip" style="font-size:10px;padding:2px 7px;">TxID ${txHex}</span>
              <span class="ws-chip" style="font-size:10px;padding:2px 7px;">${clampNum(item.maxSlots, 1, 6, 5)} Slots</span>
              ${item.isChroma ? '<span class="ws-chip is-on" style="font-size:10px;padding:2px 7px;">Chroma RGB</span>' : ""}
            </div>
          </div>
          <button type="button" class="ws-btn ${inWorkspace ? "is-ghost" : "is-primary"}" data-catalog-open-pid="${Number(item.productId)}" style="width:100%;padding:7px 10px;font-size:12px;">
            ${inWorkspace ? "✓ Open in Workspace" : "Connect via USB"}
          </button>
        </article>
      `;
      })
      .join("");

    grid.querySelectorAll("[data-catalog-open-pid]").forEach((btn) => {
      btn.addEventListener("click", () => {
        loadCatalogDeviceIntoWorkspace(Number(btn.dataset.catalogOpenPid));
      });
    });
  }

  function renderDevicesShelf() {
    const grid = document.getElementById("devicesShelfGrid");
    if (!grid) return;
    if (devices.length === 0) {
      grid.innerHTML =
        '<p class="ws-meta" style="grid-column:1/-1;">No Razer device connected. Use the catalog below to check supported models, then connect your device via USB.</p>';
      return;
    }
    grid.innerHTML = devices
      .map((dev) => {
        const meta = getDeviceMeta(dev.productId);
        const cat = dev.category || meta.category || "keyboard";
        const devProf = driverState.profilesByPid?.[dev.productId];
        const slotNum = clampNum(devProf?.activeSlot, 1, 6, 1);
        const slot = devProf?.slots?.[slotNum] || {};
        let thirdMetric = `${clampNum(slot.pollingHz, 125, 8000, 1000)} Hz`;
        if (cat === "keyboard-analog") thirdMetric = `${clampNum(slot.actuationMm, 0.1, 4.0, 1.2).toFixed(1)} mm`;
        else if (cat === "mouse") thirdMetric = `${clampNum(slot.dpiStages?.[(slot.activeStageIndex || 3) - 1]?.x, 100, 45000, 1600)} DPI`;
        else if (cat === "audio") thirdMetric = `Vol ${clampNum(slot.audio?.volume, 0, 100, 82)}%`;
        else if (cat === "controller") thirdMetric = `DZ ${clampNum(slot.controller?.leftDeadzone, 0, 30, 5)}%`;
        else if (cat === "mat-accessory") thirdMetric = `${clampNum(slot.accessory?.ledCount, 1, 60, 15)} LEDs`;

        const canRemove = devices.length > 1 && !dev.connectedLive;
        const safeProdName = escapeHtml(dev.productName);
        const safeSlotName = escapeHtml(slot.name || "Default");
        return `
        <article class="ws-device-block">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
            <strong style="font-size:16px;font-weight:650;">${safeProdName}</strong>
            <span class="ws-badge ${dev.connectedLive ? "is-ok" : ""}"><span class="ws-dot ${dev.connectedLive ? "is-ok" : ""}"></span>${dev.connectedLive ? "USB Live" : "Offline"}</span>
          </div>
          <span class="ws-meta">Razer · ${escapeHtml(getCategoryLabel(cat))} · PID ${escapeHtml(meta.hexPid)}</span>
          <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:12px;color:var(--text-2);font-variant-numeric:tabular-nums;">
            <span><b>Slot S${slotNum}</b> (${safeSlotName})</span>
            <span>·</span>
            <span><b>${escapeHtml(thirdMetric)}</b></span>
          </div>
          <div class="ws-device-block-art">
            <div style="font-size:52px;">${getCategoryIcon(cat)}</div>
          </div>
          <div style="display:flex;gap:8px;">
            <button type="button" class="ws-btn is-primary" data-shelf-open-pid="${Number(dev.productId)}" style="flex:1;">
              Configure Device
            </button>
            ${
              canRemove
                ? `<button type="button" class="ws-btn is-ghost" data-shelf-remove-pid="${Number(dev.productId)}" title="Remove from active sidebar">✕</button>`
                : ""
            }
          </div>
        </article>
      `;
      })
      .join("");

    grid.querySelectorAll("[data-shelf-open-pid]").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedPid = Number(btn.dataset.shelfOpenPid);
        driverState.selectedPid = selectedPid;
        persistDriverState();
        switchMainView("workspace");
        renderDeviceTabs();
        renderProfileSlotBar();
        syncControlsFromSlot();
        renderOverviewPanels();
      });
    });

    grid.querySelectorAll("[data-shelf-remove-pid]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const rmPid = Number(btn.dataset.shelfRemovePid);
        devices = devices.filter((d) => Number(d.productId) !== rmPid);
        if (Number(selectedPid) === rmPid && devices.length > 0) {
          selectedPid = Number(devices[0].productId);
          driverState.selectedPid = selectedPid;
        }
        persistDriverState();
        renderDeviceTabs();
        renderProfileSlotBar();
        syncControlsFromSlot();
        renderOverviewPanels();
      });
    });

    renderSynapseCatalog();
  }

  function switchMainView(viewName) {
    if ((viewName === "workspace" || viewName === "hwtest") && !hasCompatibleDevice()) {
      showToast("Connect a compatible Razer device first.", false);
      updateCompatibilityUI();
      return;
    }
    document.querySelectorAll("[data-main-view]").forEach((b) => {
      b.classList.toggle("is-active", b.dataset.mainView === viewName);
    });
    document.getElementById("viewWorkspace").hidden = viewName !== "workspace";
    document.getElementById("viewShelf").hidden = viewName !== "shelf";
    document.getElementById("viewHardwareTest").hidden = viewName !== "hwtest";
    document.getElementById("viewSettings").hidden = viewName !== "settings";
    if (viewName === "shelf") renderSynapseCatalog();
    if (viewName === "settings") updateProfileKeyBox();
  }

  // ==========================================================================
  // 10. Onboard Profile Slots Bar (S1..S6) & Preset Highlight Sync
  // ==========================================================================
  function renderProfileSlotBar() {
    const bar = document.getElementById("profileSlotBar");
    const nameTag = document.getElementById("activeProfileNameTag");
    if (!bar) return;

    const meta = getDeviceMeta(selectedPid);
    const maxSlots = meta.maxSlots || (meta.category === "keyboard-analog" ? 6 : 5);
    const devProf = getActiveDeviceProfileObj();
    const activeSlot = Number(devProf.activeSlot || 1);

    bar.innerHTML = "";
    for (let i = 1; i <= maxSlots; i++) {
      const sData = devProf.slots?.[i] || { name: `Slot ${i}`, ledColor: "#5dde89" };
      const safeLed = sanitizeHexColor(sData.ledColor, "#5dde89");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `slot-pill ${i === activeSlot ? "active" : ""}`;
      btn.title = `Onboard Slot ${i}: ${sanitizePlainText(sData.name, 40, `Slot ${i}`)}`;
      btn.innerHTML = `
        <span class="slot-led" style="--slot-color: ${safeLed}"></span>
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

  async function flashFullSlotToHardware(slotId, slotData) {
    const meta = getDeviceMeta(selectedPid);
    const cat = meta.category || "keyboard";
    const numSlot = clampNum(slotId, 1, 6, 1);

    // Release LampArray (mi_04) back to AutonomousMode = 1 (only if this page took host control) so the
    // onboard Chroma engine shows what we are about to store.
    const slotEff = slotData?.lighting?.effect || "static";
    if (HARDWARE_NATIVE_CHROMA_EFFECTS.has(slotEff)) {
      await releaseLampArrayToHardwareAutonomous(selectedPid);
    }

    // NOTE: no setDeviceMode / setActiveProfileSlot / setTriggerFirmwareEffects here any more.
    // Every packet below already carries the target slot (profile id), so the data lands in that
    // slot's onboard memory without re-switching the keyboard. (0x0F/0x17 is Synapse's
    // "preset profile effect", not a slot indicator, and polling-rate writes can make the
    // keyboard re-enumerate — both were removed from the bulk flash.)

    // Apply Chroma lighting to the slot's onboard storage (profile id = numSlot)
    if (slotData.lighting && meta.isChroma !== false) {
      const hex = (slotData.lighting.color1 || "#00e676").replace("#", "");
      const num = parseInt(hex, 16) || 0x00e676;
      const hex2 = (slotData.lighting.color2 || "#00d2ff").replace("#", "");
      const num2 = parseInt(hex2, 16) || 0x00d2ff;
      const rawBr = Math.round(((slotData.lighting.brightness ?? 100) / 100) * 255);
      await sendPacket90(
        Protocol25.Builders.setBrightness(rawBr, 0x00, numSlot),
        `Slot S${numSlot} Brightness`,
        null,
        null,
        true
      );
      await sendPacket90(
        Protocol25.Builders.setChromaEffect({
          varStore: numSlot,
          effect: slotData.lighting.effect || "static",
          r: (num >> 16) & 0xff,
          g: (num >> 8) & 0xff,
          b: num & 0xff,
          r2: (num2 >> 16) & 0xff,
          g2: (num2 >> 8) & 0xff,
          b2: num2 & 0xff,
          speed: slotData.lighting.speed || 2,
          direction: slotData.lighting.waveDirection || 1,
        }),
        `Slot S${numSlot} Chroma (${slotData.lighting.effect || "static"})`,
        null,
        null,
        true
      );
    }

    if (cat === "keyboard-analog" || cat === "keyboard") {
      if (cat === "keyboard-analog") {
        await sendPacket90(
          Protocol25.Builders.setAnalogActuation({
            slotId,
            actuationMm: slotData.actuationMm ?? 1.2,
            rtEnabled: !!slotData.rtEnabled,
            rtDownMm: slotData.rtDownMm ?? 0.3,
            rtUpMm: slotData.rtUpMm ?? 0.3,
            continuousRt: slotData.continuousRt !== false,
            keyIds: ALL_TKL_ANALOG_KEY_IDS.slice(0, 15),
          }),
          `Slot S${slotId} Actuation (${slotData.actuationMm ?? 1.2}mm)`,
          slotData,
          null,
          true
        );
        // Also flash any per-key actuation overrides for this slot
        if (slotData.perKeyOverrides && typeof slotData.perKeyOverrides === "object") {
          for (const [kLabel, ov] of Object.entries(slotData.perKeyOverrides)) {
            if (!ov) continue;
            const kId = Protocol25.keyLabelToMatrixId(kLabel);
            await sendRawWebHid90(
              Number(selectedPid),
              Protocol25.Builders.setAnalogActuation({
                slotId,
                actuationMm: ov.act ?? slotData.actuationMm ?? 1.2,
                keyIds: [kId],
              })
            );
            await sendRawWebHid90(
              Number(selectedPid),
              Protocol25.Builders.setAnalogRapidTrigger({
                slotId,
                rtEnabled: ov.rt !== undefined ? !!ov.rt : !!slotData.rtEnabled,
                rtDownMm: ov.down ?? slotData.rtDownMm ?? 0.3,
                rtUpMm: ov.up ?? slotData.rtUpMm ?? 0.3,
                keyIds: [kId],
              })
            );
          }
        }
      }
      await sendPacket90(
        Protocol25.Builders.setSnapTap({
          slotId,
          enabled: !!slotData.snapTapEnabled,
          keyA: slotData.snapKeyA || "A",
          keyB: slotData.snapKeyB || "D",
        }),
        `Slot S${slotId} Snap Tap`,
        null,
        null,
        true
      );
      if (slotData.gamingMode) {
        await sendPacket90(Protocol25.Builders.setGamingMode(slotData.gamingMode), `Slot S${slotId} Gaming Mode`, null, null, true);
      }
      // Keyboard polling rate is only written when the user changes it (Performance tab):
      // re-writing it on every flash can make the keyboard drop off the USB bus and reconnect.
    } else if (cat === "mouse") {
      if (slotData.dpiStages) {
        await sendPacket90(
          Protocol25.Builders.setDpiStages(slotData.dpiStages, slotData.activeStageIndex || 3),
          `Slot S${slotId} DPI Stages`,
          null,
          null,
          true
        );
      }
      if (slotData.pollingHz) {
        await sendPacket90(Protocol25.Builders.setPollingRate(slotData.pollingHz), `Slot S${slotId} Polling Rate`, null, null, true);
      }
      if (slotData.smartTracking) {
        await sendPacket90(
          Protocol25.Builders.setSmartTracking({
            asymmetric: slotData.smartTracking.asymmetric,
            liftOff: slotData.smartTracking.asymmetric ? slotData.smartTracking.liftOffLevel : slotData.smartTracking.symmetricLevel,
            landing: slotData.smartTracking.landingLevel,
          }),
          `Slot S${slotId} Smart Tracking`,
          null,
          null,
          true
        );
      }
    } else if (cat === "audio" && slotData.audio) {
      const a = slotData.audio;
      await sendPacket90(Protocol25.Builders.setAudioVolume({ volume: a.volume ?? 82 }), `Slot S${slotId} Audio Volume`, null, null, true);
      await sendPacket90(Protocol25.Builders.setMicVolume({ volume: a.micVolume ?? 85 }), `Slot S${slotId} Mic Volume`, null, null, true);
      await sendPacket90(Protocol25.Builders.setAudioEQPreset({ presetIndex: a.eqPreset ?? 0 }), `Slot S${slotId} EQ Preset`, null, null, true);
      if (Array.isArray(a.eqBands)) {
        await sendPacket90(Protocol25.Builders.setAudioEQBands({ bands: a.eqBands }), `Slot S${slotId} 10-Band EQ`, null, null, true);
      }
    } else if (cat === "controller" && slotData.controller) {
      const c = slotData.controller;
      await sendPacket90(
        Protocol25.Builders.setControllerDeadzones({ leftDeadzone: c.leftDeadzone ?? 5, rightDeadzone: c.rightDeadzone ?? 5 }),
        `Slot S${slotId} Stick Deadzones`,
        null,
        null,
        true
      );
      await sendPacket90(
        Protocol25.Builders.setControllerTriggerMode({ leftHairTrigger: !!c.leftHairTrigger, rightHairTrigger: !!c.rightHairTrigger }),
        `Slot S${slotId} Hair Triggers`,
        null,
        null,
        true
      );
      await sendPacket90(
        Protocol25.Builders.setControllerVibration({ leftMotor: c.leftMotor ?? 80, rightMotor: c.rightMotor ?? 80 }),
        `Slot S${slotId} Rumble Motors`,
        null,
        null,
        true
      );
    } else if (cat === "mat-accessory" && slotData.accessory) {
      await sendPacket90(
        Protocol25.Builders.setChromaStripeLedCount({ ledCount: slotData.accessory.ledCount ?? 15 }),
        `Slot S${slotId} ARGB LED Count`,
        null,
        null,
        true
      );
    }
  }

  // --------------------------------------------------------------------------
  // Hardware read-back: make the UI reflect what is really stored in an onboard slot
  // (formats verified on Huntsman V3 Pro TKL: 0x0F/0x82, 0x0F/0x84, 0x02/0x99, 0x02/0x9A, 0x02/0xA1, 0x02/0xA0)
  // --------------------------------------------------------------------------
  const P25_MM_UNITS = 16380;
  let razerKeyIdToLabelCache = null;
  function razerKeyIdToLabel(id) {
    if (!razerKeyIdToLabelCache) {
      razerKeyIdToLabelCache = new Map();
      const labels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").concat(["SPACE", "LSHIFT", "LCTRL", "LALT", "TAB", "CAPS"]);
      for (const l of labels) {
        const k = Protocol25.keyLabelToMatrixId(l);
        if (!razerKeyIdToLabelCache.has(k)) razerKeyIdToLabelCache.set(k, l);
      }
    }
    return razerKeyIdToLabelCache.get(Number(id)) || null;
  }

  const rgbToHex = (r, g, b) => `#${[r, g, b].map((v) => (Number(v) & 0xff).toString(16).padStart(2, "0")).join("")}`;

  function decodeHardwareLighting(args, prev = {}) {
    if (!args || args.length < 3) return null;
    const [, , effectId, p1, p2, nColors] = args;
    const c1 = nColors >= 1 ? rgbToHex(args[6], args[7], args[8]) : prev.color1;
    const c2 = nColors >= 2 ? rgbToHex(args[9], args[10], args[11]) : prev.color2;
    const out = { ...prev };
    switch (effectId) {
      case 0x00: out.effect = "off"; break;
      case 0x01: out.effect = "static"; out.color1 = c1; break;
      case 0x02:
        out.effect = p1 === 0x02 && nColors >= 2 ? "breathingDual" : "breathing";
        out.color1 = c1;
        if (c2) out.color2 = c2;
        break;
      case 0x03: out.effect = "spectrum"; break;
      case 0x04: out.effect = "wave"; out.waveDirection = p1 === 2 ? 2 : 1; break;
      case 0x05: out.effect = "reactive"; out.speed = p2 || out.speed || 2; out.color1 = c1; break;
      case 0x06: out.effect = "ripple"; out.color1 = c1; break;
      case 0x07: out.effect = "starlight"; out.speed = p2 || out.speed || 2; out.color1 = c1; break;
      case 0x09: out.effect = "fire"; break;
      case 0x0a: out.effect = "wheel"; out.waveDirection = p1 === 2 ? 2 : 1; break;
      default: return null;
    }
    return out;
  }

  async function pullSlotFromHardware(slotId) {
    const pid = Number(selectedPid);
    const cat = getDeviceMeta(pid).category || "keyboard";
    const n = clampNum(slotId, 1, 6, 1);
    const devProf = getActiveDeviceProfileObj();
    if (!devProf.slots[n]) devProf.slots[n] = buildDefaultSlot(pid, n);
    const slot = devProf.slots[n];
    let gotAny = false;

    const fx = await queryProtocol25(
      pid,
      Protocol25.buildPacket({ commandClass: 0x0f, commandId: 0x82, dataSize: 0x50, args: [n, 0x00] })
    );
    const decoded = decodeHardwareLighting(fx?.args, slot.lighting || {});
    if (decoded) {
      slot.lighting = decoded;
      gotAny = true;
    }
    const br = await queryProtocol25(pid, Protocol25.Builders.getBrightness(0x00, n));
    if (br?.args?.length >= 3) {
      slot.lighting = { ...(slot.lighting || {}), brightness: Math.round((br.args[2] / 255) * 100) };
      gotAny = true;
    }

    if (cat === "keyboard-analog") {
      const keyA = Protocol25.keyLabelToMatrixId("A");
      const act = await queryProtocol25(
        pid,
        Protocol25.buildPacket({ commandClass: 0x02, commandId: 0x99, dataSize: 0x07, args: [0x00, n, keyA] })
      );
      if (act?.args?.length >= 7) {
        const make = (act.args[5] << 8) | act.args[6];
        if (make > 0) slot.actuationMm = Math.round((make / P25_MM_UNITS) * 10) / 10;
        gotAny = true;
      }
      const rt = await queryProtocol25(
        pid,
        Protocol25.buildPacket({ commandClass: 0x02, commandId: 0x9a, dataSize: 0x08, args: [0x00, n, keyA] })
      );
      if (rt?.args?.length >= 8) {
        slot.rtEnabled = rt.args[3] === 0x01;
        const up = (rt.args[4] << 8) | rt.args[5];
        const down = (rt.args[6] << 8) | rt.args[7];
        if (up > 0) slot.rtUpMm = Math.round((up / P25_MM_UNITS) * 100) / 100;
        if (down > 0) slot.rtDownMm = Math.round((down / P25_MM_UNITS) * 100) / 100;
      }
      const crt = await queryProtocol25(pid, Protocol25.Builders.getContinuousRapidTrigger({ varStore: n }));
      if (crt?.args?.length >= 2) slot.continuousRt = crt.args[1] === 0x01;
      const snap = await queryProtocol25(pid, Protocol25.Builders.getSnapTap({ varStore: n }));
      if (snap?.args?.length >= 4) {
        slot.snapTapEnabled = snap.args[1] === 0x01;
        slot.snapKeyA = razerKeyIdToLabel(snap.args[2]) || slot.snapKeyA || "A";
        slot.snapKeyB = razerKeyIdToLabel(snap.args[3]) || slot.snapKeyB || "D";
      }
    }
    if (gotAny) persistDriverState();
    return gotAny;
  }

  // Adopt the slot the keyboard is actually on (instead of pushing the browser's cached slot onto it)
  async function syncActiveSlotFromHardware({ quiet = false } = {}) {
    const pid = Number(selectedPid);
    const dev = await resolveProtocol25Device(pid);
    if (!dev) {
      if (!quiet) {
        showToast(`Keyboard control interface unavailable: ${protocolProbeErrorByPid.get(pid) || "unknown error"}`, false);
      }
      updateWebHidStatusUI();
      return false;
    }
    const res = await queryProtocol25(pid, Protocol25.Builders.getActiveProfileSlot());
    const hwSlot = res?.args?.[0];
    const modeRes = await queryProtocol25(pid, Protocol25.Builders.getDeviceMode());
    if (modeRes?.args) {
      driverState.deviceMode = modeRes.args[0] === 0x03 ? "driver" : "normal";
      document.querySelectorAll("#deviceModeGroup .mode-seg").forEach((b) => {
        b.classList.toggle("selected", b.dataset.mode === driverState.deviceMode);
      });
    }
    const devProf = getActiveDeviceProfileObj();
    const maxSlots = getDeviceMeta(pid).maxSlots || 6;
    if (hwSlot >= 1 && hwSlot <= maxSlots) {
      devProf.activeSlot = hwSlot;
    }
    await pullSlotFromHardware(devProf.activeSlot || 1);
    persistDriverState();
    renderProfileSlotBar();
    syncControlsFromSlot();
    renderOverviewPanels();
    updateProfileKeyBox();
    updateWebHidStatusUI();
    if (!quiet) showToast(`Connected · keyboard is on onboard slot S${devProf.activeSlot || 1}`);
    return true;
  }

  async function switchProfileSlot(slotId) {
    selectedKeys.clear();
    syncToolbarSelectionChips("all");

    const numSlot = clampNum(slotId, 1, 6, 1);
    const devProf = getActiveDeviceProfileObj();
    const prevSlot = devProf.activeSlot || 1;
    try {
      // 1. Switch the keyboard's onboard profile (Synapse 4: setActiveProfileID -> 0x05/0x04 [slot])
      const res = await sendRawWebHid90(Number(selectedPid), Protocol25.Builders.setActiveProfileSlot(numSlot), {
        skipLampArray: true,
      });
      if (res?.logItem) prependPacketLog(res.logItem);
      if (!res?.ok) {
        showToast(`Slot switch failed → ${res?.error || "no reply"}`, false);
        void playUiTone("error");
        return;
      }
      // 2. Verify (0x05/0x84) — the keyboard must report the new slot
      const check = await queryProtocol25(Number(selectedPid), Protocol25.Builders.getActiveProfileSlot());
      if (check && check.args?.[0] !== numSlot) {
        showToast(`Keyboard stayed on slot S${check.args?.[0]} (requested S${numSlot})`, false);
        devProf.activeSlot = check.args?.[0] || prevSlot;
        renderProfileSlotBar();
        return;
      }

      devProf.activeSlot = numSlot;
      if (!devProf.slots[numSlot]) devProf.slots[numSlot] = buildDefaultSlot(selectedPid, numSlot);

      // 3. If a live software effect had LampArray host control, give the LEDs back so the
      //    new slot's onboard lighting is visible.
      await releaseLampArrayToHardwareAutonomous(selectedPid);

      // 4. Read the slot's stored settings back so the UI shows what the keyboard really has.
      //    (Nothing is written — switching a slot must not overwrite it.)
      await pullSlotFromHardware(numSlot);
      persistDriverState();

      renderDeviceTabs();
      renderProfileSlotBar();
      syncControlsFromSlot();
      renderOverviewPanels();
      updateProfileKeyBox();

      const sData = getActiveSlotData();
      const now = performance.now();
      slotIndicatorOverlayByPid.set(Number(selectedPid), { slotId: numSlot, startedAt: now, until: now + 1650 });
      showToast(`Keyboard switched to onboard slot S${numSlot} (${sData.name})`);
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
            reactiveTriggerByPid.get(Number(selectedPid))?.onLabelTrigger?.(keyId);
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

  const AUDIO_EQ_FREQS = ["31 Hz", "63 Hz", "125 Hz", "250 Hz", "500 Hz", "1 kHz", "2 kHz", "4 kHz", "8 kHz", "16 kHz"];
  const AUDIO_EQ_PRESETS = {
    0: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // Flat
    1: [3, 2, 0, -1, 1, 3, 4, 3, 2, 1], // Game
    2: [5, 4, 2, 0, -1, 0, 2, 3, 4, 3], // Movie
    3: [4, 3, 1, 0, 0, 1, 2, 3, 4, 4], // Music
    4: [-3, -2, -1, 1, 3, 5, 6, 5, 3, 1], // Esports FPS Footsteps
  };

  function renderAudioEqBands() {
    const grid = document.getElementById("audioEqBandsGrid");
    if (!grid) return;
    const slot = getActiveSlotData();
    if (!slot.audio) slot.audio = {};
    if (!Array.isArray(slot.audio.eqBands) || slot.audio.eqBands.length < 10) {
      slot.audio.eqBands = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    }

    grid.innerHTML = AUDIO_EQ_FREQS.map((freq, idx) => {
      const db = Number(slot.audio.eqBands[idx] || 0);
      const pct = (((db + 12) / 24) * 100).toFixed(1);
      return `
        <div class="setting-card" style="padding:8px 6px;display:flex;flex-direction:column;align-items:center;gap:6px;">
          <span style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--accent);" data-eq-val="${idx}">${db > 0 ? `+${db}` : db} dB</span>
          <input type="range" class="audio-eq-band-rng" data-eq-idx="${idx}" min="-12" max="12" step="1" value="${db}" style="width:100%;--fill:${pct}%" />
          <span style="font-size:10px;color:var(--text-3);font-family:var(--font-mono);">${freq}</span>
        </div>
      `;
    }).join("");

    grid.querySelectorAll(".audio-eq-band-rng").forEach((rng) => {
      rng.addEventListener("input", () => {
        const idx = Number(rng.dataset.eqIdx);
        const val = Number(rng.value);
        slot.audio.eqBands[idx] = val;
        slot.audio.eqPreset = 5; // Custom
        updateRangeFill(rng);
        const label = grid.querySelector(`[data-eq-val="${idx}"]`);
        if (label) label.textContent = `${val > 0 ? `+${val}` : val} dB`;
        document.querySelectorAll("#audioEqPresetRow [data-eq-preset]").forEach((b) => {
          b.classList.toggle("active", Number(b.dataset.eqPreset) === 5);
        });
        renderOverviewPanels();
      });
      rng.addEventListener("change", () => {
        const pkt = Protocol25.Builders.setAudioEQBands({ bands: slot.audio.eqBands });
        sendPacket90(pkt, `10-Band EQ (${slot.audio.eqBands.map((v) => (v > 0 ? `+${v}` : v)).join(",")})`, {
          audio: slot.audio,
        });
      });
    });
  }

  function renderAccessoryZoneStrip() {
    const strip = document.getElementById("accZonePreviewStrip");
    if (!strip) return;
    const slot = getActiveSlotData();
    const count = clampNum(slot.accessory?.ledCount, 1, 60, 15);
    const color = sanitizeHexColor(slot.lighting?.color1, "#00e676");
    const eff = slot.lighting?.effect || "wave";
    const br = clampNum(slot.lighting?.brightness, 0, 100, 100) / 100;

    const cells = [];
    for (let i = 0; i < count; i++) {
      let bg = color;
      if (eff === "off" || br <= 0.01) {
        bg = "rgba(255,255,255,0.08)";
      } else if (eff === "wave" || eff === "spectrum") {
        const hue = Math.round((i / count) * 360);
        bg = `hsla(${hue}, 92%, 56%, ${Math.max(0.25, br).toFixed(2)})`;
      }
      cells.push(
        `<div title="Zone ${i + 1}" style="flex:1;min-width:12px;height:28px;border-radius:6px;background:${bg};box-shadow:0 0 10px ${bg};border:1px solid rgba(255,255,255,0.16);"></div>`
      );
    }
    strip.innerHTML = cells.join("");
  }

  function syncControlsFromSlot() {
    const meta = getDeviceMeta(selectedPid);
    const cat = meta.category || "keyboard";
    const isKbd = cat === "keyboard-analog" || cat === "keyboard";
    const isMouse = cat === "mouse";
    const isAudio = cat === "audio";
    const isController = cat === "controller";
    const isAccessory = cat === "mat-accessory";

    document.getElementById("keyboardStageWrap").hidden = !isKbd;
    document.getElementById("kbdTabNav").hidden = !isKbd;
    document.getElementById("kbdPanelsWrap").hidden = !isKbd;

    document.getElementById("mouseStageWrap").hidden = !isMouse;
    document.getElementById("mouseTabNav").hidden = !isMouse;
    document.getElementById("mousePanelsWrap").hidden = !isMouse;

    const audioWrap = document.getElementById("audioPanelsWrap");
    if (audioWrap) audioWrap.hidden = !isAudio;
    const ctrlWrap = document.getElementById("controllerPanelsWrap");
    if (ctrlWrap) ctrlWrap.hidden = !isController;
    const accWrap = document.getElementById("accessoryPanelsWrap");
    if (accWrap) accWrap.hidden = !isAccessory;

    // For non-keyboard Chroma devices (Accessories/Controllers/Audio/Mice), sync Chroma controls too
    const slot = getActiveSlotData();
    const light = slot.lighting || { effect: "static", color1: "#00e676", brightness: 100, speed: 2, waveDirection: 1 };
    const rngBr = document.getElementById("rngBrightness");
    if (rngBr) {
      rngBr.value = light.brightness ?? 100;
      updateRangeFill(rngBr);
      document.getElementById("valBrightness").textContent = `${rngBr.value}%`;
      document.getElementById("valBrightnessOut").textContent = `${rngBr.value}%`;
    }
    const inpColor = document.getElementById("inpChromaColor");
    if (inpColor) inpColor.value = light.color1 || "#00e676";
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

    if (isKbd) {
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
    } else if (isMouse) {
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
    } else if (isAudio) {
      if (!slot.audio) {
        slot.audio = {
          volume: 82,
          muted: false,
          micVolume: 85,
          micMuted: false,
          sidetoneEnabled: true,
          sidetoneVolume: 35,
          eqPreset: 0,
          eqBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          hapticsIntensity: 0,
          bassBoost: 40,
          voiceClarity: 60,
          normalization: false,
        };
      }
      const a = slot.audio;
      const setRng = (id, valId, v, suffix = "%") => {
        const el = document.getElementById(id);
        const vEl = document.getElementById(valId);
        if (el) {
          el.value = v;
          updateRangeFill(el);
        }
        if (vEl) vEl.textContent = `${v}${suffix}`;
      };
      setRng("rngAudioVolume", "valAudioVolume", a.volume ?? 82);
      setRng("rngMicVolume", "valMicVolume", a.micVolume ?? 85);
      setRng("rngSidetone", "valSidetone", a.sidetoneVolume ?? 35);
      setRng("rngHaptics", "valHaptics", a.hapticsIntensity ?? 0);
      setRng("rngBassBoost", "valBassBoost", a.bassBoost ?? 40);
      setRng("rngVoiceClarity", "valVoiceClarity", a.voiceClarity ?? 60);

      const chkMute = document.getElementById("chkAudioMute");
      if (chkMute) chkMute.checked = !!a.muted;
      syncSwitchTile("tileAudioMute", !!a.muted);

      const chkMicMute = document.getElementById("chkMicMute");
      if (chkMicMute) chkMicMute.checked = !!a.micMuted;
      syncSwitchTile("tileMicMute", !!a.micMuted);

      const chkSt = document.getElementById("chkSidetone");
      if (chkSt) chkSt.checked = a.sidetoneEnabled !== false;
      syncSwitchTile("tileSidetone", a.sidetoneEnabled !== false);

      const chkNorm = document.getElementById("chkAudioNorm");
      if (chkNorm) chkNorm.checked = !!a.normalization;
      syncSwitchTile("tileAudioNorm", !!a.normalization);

      document.querySelectorAll("#audioEqPresetRow [data-eq-preset]").forEach((b) => {
        b.classList.toggle("active", Number(b.dataset.eqPreset) === Number(a.eqPreset || 0));
      });
      renderAudioEqBands();
    } else if (isController) {
      if (!slot.controller) {
        slot.controller = {
          leftDeadzone: 5,
          rightDeadzone: 5,
          circularityMode: 1,
          clutchSensitivity: 50,
          leftHairTrigger: true,
          rightHairTrigger: true,
          leftTriggerActuation: 35,
          rightTriggerActuation: 35,
          leftMotor: 80,
          rightMotor: 80,
        };
      }
      const c = slot.controller;
      const setRng = (id, valId, v, suffix = "%") => {
        const el = document.getElementById(id);
        const vEl = document.getElementById(valId);
        if (el) {
          el.value = v;
          updateRangeFill(el);
        }
        if (vEl) vEl.textContent = `${v}${suffix}`;
      };
      setRng("rngLeftDeadzone", "valLeftDeadzone", c.leftDeadzone ?? 5);
      setRng("rngRightDeadzone", "valRightDeadzone", c.rightDeadzone ?? 5);
      setRng("rngClutchSens", "valClutchSens", c.clutchSensitivity ?? 50);
      setRng("rngLeftTriggerAct", "valLeftTriggerAct", c.leftTriggerActuation ?? 35);
      setRng("rngRightTriggerAct", "valRightTriggerAct", c.rightTriggerActuation ?? 35);
      setRng("rngLeftRumble", "valLeftRumble", c.leftMotor ?? 80);
      setRng("rngRightRumble", "valRightRumble", c.rightMotor ?? 80);

      const chkCirc = document.getElementById("chkControllerCircularity");
      if (chkCirc) chkCirc.checked = !!c.circularityMode;
      syncSwitchTile("tileControllerCircularity", !!c.circularityMode);

      const chkLH = document.getElementById("chkLeftHairTrigger");
      if (chkLH) chkLH.checked = c.leftHairTrigger !== false;
      syncSwitchTile("tileLeftHairTrigger", c.leftHairTrigger !== false);

      const chkRH = document.getElementById("chkRightHairTrigger");
      if (chkRH) chkRH.checked = c.rightHairTrigger !== false;
      syncSwitchTile("tileRightHairTrigger", c.rightHairTrigger !== false);
    } else if (isAccessory) {
      if (!slot.accessory) slot.accessory = { ledCount: 15, fanMode: 0, fanRpmPct: 60 };
      const rngLed = document.getElementById("rngAccLedCount");
      if (rngLed) {
        rngLed.value = slot.accessory.ledCount ?? 15;
        updateRangeFill(rngLed);
        document.getElementById("valAccLedCount").textContent = `${rngLed.value} LEDs`;
      }
      const rngBrAcc = document.getElementById("rngAccBrightness");
      if (rngBrAcc) {
        rngBrAcc.value = light.brightness ?? 100;
        updateRangeFill(rngBrAcc);
        document.getElementById("valAccBrightness").textContent = `${rngBrAcc.value}%`;
      }
      const inpAccColor = document.getElementById("inpAccColor");
      if (inpAccColor) inpAccColor.value = light.color1 || "#00e676";
      document.querySelectorAll("#accEffectRow [data-acc-effect]").forEach((b) => {
        b.classList.toggle("active", b.dataset.accEffect === (light.effect || "wave"));
      });
      renderAccessoryZoneStrip();
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

      const safeStageColor = sanitizeHexColor(st.color, "#00e676");
      const safeX = clampNum(st.x, 100, 45000, 1600);
      const safeY = clampNum(st.y, 100, 45000, safeX);
      const pct = Math.max(0, Math.min(100, ((safeX - 100) / (35000 - 100)) * 100)).toFixed(1);

      row.innerHTML = `
        <input type="checkbox" class="dpi-enable-chk" ${st.enabled !== false ? "checked" : ""} title="Enable Stage ${stageNum}" />
        <button type="button" class="dpi-editor-index" title="Click to set Stage ${stageNum} active">
          <span class="dpi-stage-swatch" style="background:${safeStageColor}"></span>
          <span>0${stageNum}</span>
        </button>
        <input type="number" class="dpi-axis-input dpi-x-in" min="100" max="35000" step="50" value="${safeX}" title="X Axis DPI" />
        ${
          unlinked
            ? `<button type="button" class="dpi-axis-lock is-unlinked" title="Link X & Y axes">⛓</button>
               <input type="number" class="dpi-axis-input dpi-y-in" min="100" max="35000" step="50" value="${safeY}" title="Y Axis DPI" />`
            : ""
        }
        <input type="range" class="dpi-row-rng" min="100" max="35000" step="50" value="${safeX}" style="--fill:${pct}%" />
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
      const pid = Number(selectedPid);
      const meta = getDeviceMeta(pid);
      const isMouse = meta.category === "mouse";
      const stages = [];

      const fwRes = await sendPacket90(Protocol25.Builders.getFirmwareVersion(), "Diag: Firmware (0x00/0x81)", null, null, true);
      const fwArgs = fwRes?.parsedRx?.args || [1, 4];
      const fwStr = `v${fwArgs[0] || 1}.${String(fwArgs[1] ?? 4).padStart(2, "0")}`;
      stages.push({
        key: "fw",
        label: "Protocol 25 Firmware Handshake (0x00 / 0x81)",
        status: fwRes?.parsedRx?.status === 0x02 ? "pass" : "fail",
        detail: `Status ${fwRes?.parsedRx?.statusName || "OK"} · Firmware ${fwStr} · CRC Verified`,
      });

      const modeRes = await sendPacket90(Protocol25.Builders.getDeviceMode(), "Diag: Device Mode (0x00/0x84)", null, null, true);
      stages.push({
        key: "mode",
        label: "Operating Mode Readback (0x00 / 0x84)",
        status: modeRes?.parsedRx?.status === 0x02 ? "pass" : "fail",
        detail: `Status ${modeRes?.parsedRx?.statusName || "OK"} · Mode 0x0${modeRes?.parsedRx?.args?.[0] ?? 0}`,
      });

      const slotRes = await sendPacket90(Protocol25.Builders.getActiveProfileSlot(), "Diag: Active Slot (0x05/0x84)", null, null, true);
      stages.push({
        key: "slot",
        label: "Onboard Profile Slot Readback (0x05 / 0x84)",
        status: slotRes?.parsedRx?.status === 0x02 ? "pass" : "fail",
        detail: `Status ${slotRes?.parsedRx?.statusName || "OK"} · Active Slot S${slotRes?.parsedRx?.args?.[0] || 1}`,
      });

      if (!isMouse) {
        const brRes = await sendPacket90(Protocol25.Builders.getBrightness(), "Diag: Brightness (0x0F/0x84)", null, null, true);
        stages.push({
          key: "brightness",
          label: "Chroma Matrix Brightness Telemetry (0x0F / 0x84)",
          status: brRes?.parsedRx?.status === 0x02 ? "pass" : "fail",
          detail: `Status ${brRes?.parsedRx?.statusName || "OK"} · Level ${brRes?.parsedRx?.args?.[2] ?? 255}/255`,
        });
      } else {
        const batRes = await sendPacket90(Protocol25.Builders.getBatteryLevel(), "Diag: Battery (0x07/0x80)", null, null, true);
        stages.push({
          key: "battery",
          label: "Wireless Battery Telemetry (0x07 / 0x80)",
          status: batRes?.parsedRx?.status === 0x02 ? "pass" : "skip",
          detail: `Status ${batRes?.parsedRx?.statusName || "OK"}`,
        });
      }

      listEl.innerHTML = stages.map((c, i) => renderStageRow(i + 1, c.label, c.detail, c.status)).join("");

      // Run 5s interactive pointer polling sample
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

      const devEntry = devices.find((d) => Number(d.productId) === pid);
      lastTestReport = {
        runAt: new Date().toISOString(),
        driver: "websynap.se v3.0 (Zero-Install WebHID/WebUSB Edition)",
        productId: selectedPid,
        deviceName: devEntry?.productName || `Razer PID ${pid}`,
        firmware: fwStr,
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

    while (list.children.length >= MAX_PACKET_LOG_ENTRIES) {
      list.lastElementChild?.remove();
    }

    const div = document.createElement("div");
    div.className = "packet-item";
    const safePid = Number(item.productId) || 0;
    const safeCls = escapeHtml(item.parsedTx?.commandClassHex || "--");
    const safeCmd = escapeHtml(item.parsedTx?.commandIdHex || "--");
    const safeStatus = escapeHtml(item.parsedRx?.statusName || "OK");
    const safeCrc = (Number(item.parsedRx?.crc) || 0).toString(16).toUpperCase();
    const safeTx = escapeHtml((item.txHex || "").slice(0, 78));
    const safeRx = escapeHtml((item.rxHex || "").slice(0, 78));
    div.innerHTML = `
      <div style="display:flex;justify-content:space-between;color:var(--accent);font-weight:600;">
        <span>PID ${safePid} · Class ${safeCls} / Cmd ${safeCmd}</span>
        <span>${safeStatus} (CRC 0x${safeCrc})</span>
      </div>
      <div class="packet-hex">TX: ${safeTx}…</div>
      <div class="packet-hex">RX: ${safeRx}…</div>
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

    // Footer Legal / Privacy / Disclaimer / License Quick-Jump Buttons
    document.querySelectorAll("[data-open-legal]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const targetId = btn.dataset.openLegal;
        switchMainView("settings");
        const card = document.getElementById(targetId) || document.getElementById("legalSection");
        if (card) {
          card.scrollIntoView({ behavior: "smooth", block: "center" });
          card.style.outline = "2px solid var(--accent)";
          setTimeout(() => {
            card.style.outline = "";
          }, 1800);
        }
      });
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
      const targetKeys =
        selectedKeys.size > 0
          ? Array.from(selectedKeys).map((k) => Protocol25.keyLabelToMatrixId(k))
          : ALL_TKL_ANALOG_KEY_IDS;
      const pkt = Protocol25.Builders.setAnalogActuation({
        slotId: getActiveDeviceProfileObj().activeSlot || 1,
        actuationMm: actMm,
        rtEnabled,
        rtDownMm,
        rtUpMm,
        continuousRt,
        keyIds: targetKeys.slice(0, 15),
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
          chunkActMm: actMm,
          chunkRtEnabled: rtEnabled,
          chunkRtDownMm: rtDownMm,
          chunkRtUpMm: rtUpMm,
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

    // WebUSB + WebHID Pair Buttons
    document.getElementById("btnWebUsbPair")?.addEventListener("click", pairWebUsbDevices);
    document.getElementById("btnWebHidPair")?.addEventListener("click", pairWebHidDevices);
    document.getElementById("btnBannerPair")?.addEventListener("click", pairBannerSmart);
    document.getElementById("btnBannerRecheck")?.addEventListener("click", recheckProtocol25);
    document.getElementById("btnCompatWebUsb")?.addEventListener("click", pairWebUsbDevices);
    document.getElementById("btnCompatPair")?.addEventListener("click", pairWebHidDevices);
    document.getElementById("btnCompatCatalog")?.addEventListener("click", () => switchMainView("shelf"));

    // Save / Reset / Export / Import Onboard Slots
    document.getElementById("btnSaveSlot")?.addEventListener("click", async () => {
      const devProf = getActiveDeviceProfileObj();
      const slotId = devProf.activeSlot || 1;
      const slotData = getActiveSlotData();
      persistDriverState();
      await flashFullSlotToHardware(slotId, slotData);
      showToast(`Flashed configuration to Onboard Slot S${slotId}`);
      void playUiTone("success");
    });

    document.getElementById("btnResetSlot")?.addEventListener("click", async () => {
      const devProf = getActiveDeviceProfileObj();
      const slotId = devProf.activeSlot || 1;
      devProf.slots[slotId] = buildDefaultSlot(selectedPid, slotId);
      persistDriverState();
      renderProfileSlotBar();
      syncControlsFromSlot();
      renderOverviewPanels();
      await flashFullSlotToHardware(slotId, devProf.slots[slotId]);
      showToast(`Slot S${slotId} reset to factory defaults`);
    });

    document.getElementById("btnExportProfiles")?.addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(driverState.profilesByPid, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `websynapse-slots-${selectedPid}.json`;
      a.click();
    });

    document.getElementById("inpImportProfiles")?.addEventListener("change", async (ev) => {
      const file = ev.target.files?.[0];
      if (!file) return;
      try {
        if (file.size > MAX_IMPORT_BYTES) {
          throw new Error(`Profile JSON exceeds ${Math.round(MAX_IMPORT_BYTES / 1024)} KB limit`);
        }
        const imported = safeJsonParse(await file.text(), MAX_IMPORT_BYTES);
        if (!imported || typeof imported !== "object") {
          throw new Error("Invalid profile JSON object");
        }
        const sanitizedMap = {};
        for (const [k, v] of Object.entries(imported)) {
          const numPid = clampNum(k, 1, 65535, 0);
          if (numPid > 0) sanitizedMap[numPid] = sanitizeDeviceProfile(v, numPid);
        }
        driverState.profilesByPid = { ...driverState.profilesByPid, ...sanitizedMap };
        persistDriverState();
        const devProf = getActiveDeviceProfileObj();
        const slotId = devProf.activeSlot || 1;
        renderProfileSlotBar();
        syncControlsFromSlot();
        renderOverviewPanels();
        await flashFullSlotToHardware(slotId, getActiveSlotData());
        showToast("Imported & verified onboard profile slots");
      } catch (e) {
        showToast(`Import error: ${e.message}`, false);
      } finally {
        ev.target.value = "";
      }
    });

    // Operating Mode (0x00 vs 0x03)
    document.querySelectorAll("#deviceModeGroup .mode-seg").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#deviceModeGroup .mode-seg").forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        const m = btn.dataset.mode;
        const pkt = Protocol25.Builders.setDeviceMode(m === "driver" ? 0x03 : 0x00, 0x00);
        const pidAtClick = Number(selectedPid);
        void sendPacket90(pkt, `Device Mode → ${m.toUpperCase()}`, null, { deviceMode: m }).then((res) => {
          if (!res?.ok) return;
          // Remember that we changed it so we can hand the keyboard back in Normal mode on tab close
          if (m === "driver") driverModeActivePids.add(pidAtClick);
          else driverModeActivePids.delete(pidAtClick);
        });
      });
    });

    // Firmware Query
    document.getElementById("btnQueryFw")?.addEventListener("click", async () => {
      if (!hasAnyRazerDevice()) {
        await pairBannerSmart();
        return;
      }
      const res = await sendPacket90(Protocol25.Builders.getFirmwareVersion(), "Query Firmware (0x00/0x81)", null, null, true);
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
      a.download = `websynapse-${selectedPid}-hardwaretest.json`;
      a.click();
    });

    // Settings Behaviour Switches & Profile Key
    document.getElementById("chkInstantFlash")?.addEventListener("change", async (ev) => {
      savePreferences({ instantFlash: ev.target.checked });
      if (ev.target.checked && hasCompatibleDevice()) {
        if (stagedQueue.length > 0) {
          document.getElementById("btnFlushStaged")?.click();
        } else {
          const devProf = getActiveDeviceProfileObj();
          const slotId = devProf.activeSlot || 1;
          await flashFullSlotToHardware(slotId, getActiveSlotData());
        }
      }
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
        if (raw.length > MAX_PROFILE_KEY_CHARS) {
          throw new Error("Profile key exceeds maximum allowed length");
        }
        const b64 = raw.startsWith("RZW1:") ? raw.slice(5) : raw;
        const jsonStr = decodeURIComponent(escape(atob(b64)));
        const decoded = safeJsonParse(jsonStr, MAX_PROFILE_KEY_CHARS);
        if (!decoded?.slotData || typeof decoded.slotData !== "object") {
          throw new Error("Invalid RZW1 key payload");
        }
        const devProf = getActiveDeviceProfileObj();
        const slotId = devProf.activeSlot || 1;
        devProf.slots[slotId] = sanitizeSlotData(decoded.slotData, selectedPid, slotId);
        persistDriverState();
        renderProfileSlotBar();
        syncControlsFromSlot();
        renderOverviewPanels();
        updateProfileKeyBox();
        document.getElementById("txtProfileKeyImport").value = "";
        await flashFullSlotToHardware(slotId, devProf.slots[slotId]);
        showToast(`Imported & flashed verified profile key to Slot S${slotId}`);
        void playUiTone("success");
      } catch (e) {
        showToast(`Invalid profile key: ${e.message}`, false);
      }
    });

    // Staged Apply Bar Actions
    document.getElementById("btnRevertStaged")?.addEventListener("click", () => {
      stagedQueue = [];
      renderPendingApplyBar();
      loadStoredState();
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
      const devProf = getActiveDeviceProfileObj();
      const slotId = devProf.activeSlot || 1;
      await flashFullSlotToHardware(slotId, getActiveSlotData());
    });

    // Packet Inspector Drawer
    const drawer = document.getElementById("inspectorDrawer");
    document.getElementById("btnToggleDrawer")?.addEventListener("click", () => {
      drawer.hidden = !drawer.hidden;
    });
    document.getElementById("btnCloseDrawer")?.addEventListener("click", () => {
      drawer.hidden = true;
    });
    document.getElementById("btnClearPackets")?.addEventListener("click", () => {
      document.getElementById("packetList").innerHTML = "";
      document.getElementById("packetCountBadge").textContent = "0";
    });

    // Shelf WebUSB / WebHID Pair + Complete Synapse 4 Catalog Search & Category Filter
    document.getElementById("btnShelfPairWebUsb")?.addEventListener("click", pairWebUsbDevices);
    document.getElementById("btnShelfPairWebHid")?.addEventListener("click", pairWebHidDevices);
    document.getElementById("inpCatalogSearch")?.addEventListener("input", (ev) => {
      catalogSearchQuery = ev.target.value || "";
      renderSynapseCatalog();
    });
    document.querySelectorAll("#catalogCategoryFilters [data-cat-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#catalogCategoryFilters [data-cat-filter]").forEach((b) => {
          b.classList.remove("active", "is-on");
        });
        btn.classList.add("active", "is-on");
        catalogCategoryFilter = btn.dataset.catFilter || "all";
        renderSynapseCatalog();
      });
    });

    // Audio / Headset / Broadcaster Controls (Protocol 25 Class 0x08 & 0x18)
    const rngAudioVol = document.getElementById("rngAudioVolume");
    rngAudioVol?.addEventListener("input", () => {
      updateRangeFill(rngAudioVol);
      document.getElementById("valAudioVolume").textContent = `${rngAudioVol.value}%`;
    });
    rngAudioVol?.addEventListener("change", () => {
      const slot = getActiveSlotData();
      if (!slot.audio) slot.audio = {};
      slot.audio.volume = Number(rngAudioVol.value);
      sendPacket90(
        Protocol25.Builders.setAudioVolume({ volume: slot.audio.volume }),
        `Audio Master Volume → ${slot.audio.volume}%`,
        { audio: slot.audio }
      );
    });

    document.getElementById("chkAudioMute")?.addEventListener("change", (ev) => {
      const slot = getActiveSlotData();
      if (!slot.audio) slot.audio = {};
      slot.audio.muted = ev.target.checked;
      syncSwitchTile("tileAudioMute", slot.audio.muted);
      sendPacket90(
        Protocol25.Builders.setAudioMute({ muted: slot.audio.muted }),
        `Audio Output ${slot.audio.muted ? "Muted" : "Unmuted"}`,
        { audio: slot.audio }
      );
    });

    const rngMicVol = document.getElementById("rngMicVolume");
    rngMicVol?.addEventListener("input", () => {
      updateRangeFill(rngMicVol);
      document.getElementById("valMicVolume").textContent = `${rngMicVol.value}%`;
    });
    rngMicVol?.addEventListener("change", () => {
      const slot = getActiveSlotData();
      if (!slot.audio) slot.audio = {};
      slot.audio.micVolume = Number(rngMicVol.value);
      sendPacket90(
        Protocol25.Builders.setMicVolume({ volume: slot.audio.micVolume }),
        `Microphone Level → ${slot.audio.micVolume}%`,
        { audio: slot.audio }
      );
    });

    document.getElementById("chkMicMute")?.addEventListener("change", (ev) => {
      const slot = getActiveSlotData();
      if (!slot.audio) slot.audio = {};
      slot.audio.micMuted = ev.target.checked;
      syncSwitchTile("tileMicMute", slot.audio.micMuted);
      sendPacket90(
        Protocol25.Builders.setMicMute({ muted: slot.audio.micMuted }),
        `Microphone ${slot.audio.micMuted ? "Muted" : "Live"}`,
        { audio: slot.audio }
      );
    });

    const commitSidetone = () => {
      const slot = getActiveSlotData();
      if (!slot.audio) slot.audio = {};
      slot.audio.sidetoneEnabled = document.getElementById("chkSidetone")?.checked ?? true;
      slot.audio.sidetoneVolume = Number(document.getElementById("rngSidetone")?.value ?? 35);
      syncSwitchTile("tileSidetone", slot.audio.sidetoneEnabled);
      sendPacket90(
        Protocol25.Builders.setSidetone({
          enabled: slot.audio.sidetoneEnabled,
          volume: slot.audio.sidetoneVolume,
        }),
        `Mic Sidetone (${slot.audio.sidetoneEnabled ? `${slot.audio.sidetoneVolume}%` : "OFF"})`,
        { audio: slot.audio }
      );
    };
    document.getElementById("chkSidetone")?.addEventListener("change", commitSidetone);
    document.getElementById("rngSidetone")?.addEventListener("input", (ev) => {
      updateRangeFill(ev.target);
      document.getElementById("valSidetone").textContent = `${ev.target.value}%`;
    });
    document.getElementById("rngSidetone")?.addEventListener("change", commitSidetone);

    const rngHap = document.getElementById("rngHaptics");
    rngHap?.addEventListener("input", () => {
      updateRangeFill(rngHap);
      document.getElementById("valHaptics").textContent = `${rngHap.value}%`;
    });
    rngHap?.addEventListener("change", () => {
      const slot = getActiveSlotData();
      if (!slot.audio) slot.audio = {};
      slot.audio.hapticsIntensity = Number(rngHap.value);
      sendPacket90(
        Protocol25.Builders.setHapticsIntensity({ intensity: slot.audio.hapticsIntensity }),
        `Sensa HD Haptics → ${slot.audio.hapticsIntensity}%`,
        { audio: slot.audio }
      );
    });

    const commitSoundEnhancement = () => {
      const slot = getActiveSlotData();
      if (!slot.audio) slot.audio = {};
      slot.audio.bassBoost = Number(document.getElementById("rngBassBoost")?.value ?? 40);
      slot.audio.voiceClarity = Number(document.getElementById("rngVoiceClarity")?.value ?? 60);
      slot.audio.normalization = document.getElementById("chkAudioNorm")?.checked ?? false;
      syncSwitchTile("tileAudioNorm", slot.audio.normalization);
      sendPacket90(
        Protocol25.Builders.setSoundEnhancement({
          bassBoost: slot.audio.bassBoost,
          voiceClarity: slot.audio.voiceClarity,
          normalization: slot.audio.normalization,
        }),
        `Audio DSP (Bass ${slot.audio.bassBoost}%, Clarity ${slot.audio.voiceClarity}%)`,
        { audio: slot.audio }
      );
    };
    document.getElementById("rngBassBoost")?.addEventListener("input", (ev) => {
      updateRangeFill(ev.target);
      document.getElementById("valBassBoost").textContent = `${ev.target.value}%`;
    });
    document.getElementById("rngBassBoost")?.addEventListener("change", commitSoundEnhancement);
    document.getElementById("rngVoiceClarity")?.addEventListener("input", (ev) => {
      updateRangeFill(ev.target);
      document.getElementById("valVoiceClarity").textContent = `${ev.target.value}%`;
    });
    document.getElementById("rngVoiceClarity")?.addEventListener("change", commitSoundEnhancement);
    document.getElementById("chkAudioNorm")?.addEventListener("change", commitSoundEnhancement);

    document.querySelectorAll("#audioEqPresetRow [data-eq-preset]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        document.querySelectorAll("#audioEqPresetRow [data-eq-preset]").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const pIdx = Number(btn.dataset.eqPreset);
        const slot = getActiveSlotData();
        if (!slot.audio) slot.audio = {};
        slot.audio.eqPreset = pIdx;
        if (AUDIO_EQ_PRESETS[pIdx]) {
          slot.audio.eqBands = [...AUDIO_EQ_PRESETS[pIdx]];
        }
        renderAudioEqBands();
        await sendPacket90(
          Protocol25.Builders.setAudioEQPreset({ presetIndex: pIdx }),
          `Audio EQ Preset → ${btn.textContent}`,
          { audio: slot.audio }
        );
        if (AUDIO_EQ_PRESETS[pIdx]) {
          await sendPacket90(
            Protocol25.Builders.setAudioEQBands({ bands: slot.audio.eqBands }),
            `Audio 10-Band EQ Curve`,
            { audio: slot.audio }
          );
        }
      });
    });

    // Controller / Arcade Fightstick Controls (Protocol 25 Class 0x0C)
    const commitControllerDeadzones = () => {
      const slot = getActiveSlotData();
      if (!slot.controller) slot.controller = {};
      slot.controller.leftDeadzone = Number(document.getElementById("rngLeftDeadzone")?.value ?? 5);
      slot.controller.rightDeadzone = Number(document.getElementById("rngRightDeadzone")?.value ?? 5);
      sendPacket90(
        Protocol25.Builders.setControllerDeadzones({
          leftDeadzone: slot.controller.leftDeadzone,
          rightDeadzone: slot.controller.rightDeadzone,
        }),
        `Stick Deadzones (L: ${slot.controller.leftDeadzone}%, R: ${slot.controller.rightDeadzone}%)`,
        { controller: slot.controller }
      );
    };
    document.getElementById("rngLeftDeadzone")?.addEventListener("input", (ev) => {
      updateRangeFill(ev.target);
      document.getElementById("valLeftDeadzone").textContent = `${ev.target.value}%`;
    });
    document.getElementById("rngLeftDeadzone")?.addEventListener("change", commitControllerDeadzones);
    document.getElementById("rngRightDeadzone")?.addEventListener("input", (ev) => {
      updateRangeFill(ev.target);
      document.getElementById("valRightDeadzone").textContent = `${ev.target.value}%`;
    });
    document.getElementById("rngRightDeadzone")?.addEventListener("change", commitControllerDeadzones);

    document.getElementById("chkControllerCircularity")?.addEventListener("change", (ev) => {
      const slot = getActiveSlotData();
      if (!slot.controller) slot.controller = {};
      slot.controller.circularityMode = ev.target.checked ? 1 : 0;
      syncSwitchTile("tileControllerCircularity", ev.target.checked);
      sendPacket90(
        Protocol25.Builders.setControllerCircularity({ circularityMode: slot.controller.circularityMode }),
        `Thumbstick Gate → ${ev.target.checked ? "Circular" : "Raw"}`,
        { controller: slot.controller }
      );
    });

    const rngClutch = document.getElementById("rngClutchSens");
    rngClutch?.addEventListener("input", () => {
      updateRangeFill(rngClutch);
      document.getElementById("valClutchSens").textContent = `${rngClutch.value}%`;
    });
    rngClutch?.addEventListener("change", () => {
      const slot = getActiveSlotData();
      if (!slot.controller) slot.controller = {};
      slot.controller.clutchSensitivity = Number(rngClutch.value);
      sendPacket90(
        Protocol25.Builders.setControllerSensitivityClutch({ sensitivity: slot.controller.clutchSensitivity }),
        `Sensitivity Clutch → ${slot.controller.clutchSensitivity}%`,
        { controller: slot.controller }
      );
    });

    const commitHairTriggers = () => {
      const slot = getActiveSlotData();
      if (!slot.controller) slot.controller = {};
      slot.controller.leftHairTrigger = document.getElementById("chkLeftHairTrigger")?.checked ?? true;
      slot.controller.rightHairTrigger = document.getElementById("chkRightHairTrigger")?.checked ?? true;
      syncSwitchTile("tileLeftHairTrigger", slot.controller.leftHairTrigger);
      syncSwitchTile("tileRightHairTrigger", slot.controller.rightHairTrigger);
      sendPacket90(
        Protocol25.Builders.setControllerTriggerMode({
          leftHairTrigger: slot.controller.leftHairTrigger,
          rightHairTrigger: slot.controller.rightHairTrigger,
        }),
        `Hair Triggers (L2: ${slot.controller.leftHairTrigger ? "ON" : "OFF"}, R2: ${slot.controller.rightHairTrigger ? "ON" : "OFF"})`,
        { controller: slot.controller }
      );
    };
    document.getElementById("chkLeftHairTrigger")?.addEventListener("change", commitHairTriggers);
    document.getElementById("chkRightHairTrigger")?.addEventListener("change", commitHairTriggers);

    const commitTriggerRange = () => {
      const slot = getActiveSlotData();
      if (!slot.controller) slot.controller = {};
      slot.controller.leftTriggerActuation = Number(document.getElementById("rngLeftTriggerAct")?.value ?? 35);
      slot.controller.rightTriggerActuation = Number(document.getElementById("rngRightTriggerAct")?.value ?? 35);
      sendPacket90(
        Protocol25.Builders.setControllerTriggerRange({
          leftActuation: slot.controller.leftTriggerActuation,
          rightActuation: slot.controller.rightTriggerActuation,
        }),
        `Trigger Range (${slot.controller.leftTriggerActuation}% / ${slot.controller.rightTriggerActuation}%)`,
        { controller: slot.controller }
      );
    };
    document.getElementById("rngLeftTriggerAct")?.addEventListener("input", (ev) => {
      updateRangeFill(ev.target);
      document.getElementById("valLeftTriggerAct").textContent = `${ev.target.value}%`;
    });
    document.getElementById("rngLeftTriggerAct")?.addEventListener("change", commitTriggerRange);
    document.getElementById("rngRightTriggerAct")?.addEventListener("input", (ev) => {
      updateRangeFill(ev.target);
      document.getElementById("valRightTriggerAct").textContent = `${ev.target.value}%`;
    });
    document.getElementById("rngRightTriggerAct")?.addEventListener("change", commitTriggerRange);

    const commitControllerRumble = () => {
      const slot = getActiveSlotData();
      if (!slot.controller) slot.controller = {};
      slot.controller.leftMotor = Number(document.getElementById("rngLeftRumble")?.value ?? 80);
      slot.controller.rightMotor = Number(document.getElementById("rngRightRumble")?.value ?? 80);
      sendPacket90(
        Protocol25.Builders.setControllerVibration({
          leftMotor: slot.controller.leftMotor,
          rightMotor: slot.controller.rightMotor,
        }),
        `Rumble Motors (${slot.controller.leftMotor}% / ${slot.controller.rightMotor}%)`,
        { controller: slot.controller }
      );
    };
    document.getElementById("rngLeftRumble")?.addEventListener("input", (ev) => {
      updateRangeFill(ev.target);
      document.getElementById("valLeftRumble").textContent = `${ev.target.value}%`;
    });
    document.getElementById("rngLeftRumble")?.addEventListener("change", commitControllerRumble);
    document.getElementById("rngRightRumble")?.addEventListener("input", (ev) => {
      updateRangeFill(ev.target);
      document.getElementById("valRightRumble").textContent = `${ev.target.value}%`;
    });
    document.getElementById("rngRightRumble")?.addEventListener("change", commitControllerRumble);

    // Mats, Docks & Chroma ARGB Accessories (Protocol 25 Class 0x0F)
    const rngLedCount = document.getElementById("rngAccLedCount");
    rngLedCount?.addEventListener("input", () => {
      updateRangeFill(rngLedCount);
      document.getElementById("valAccLedCount").textContent = `${rngLedCount.value} LEDs`;
      const slot = getActiveSlotData();
      if (!slot.accessory) slot.accessory = {};
      slot.accessory.ledCount = Number(rngLedCount.value);
      renderAccessoryZoneStrip();
    });
    rngLedCount?.addEventListener("change", () => {
      const slot = getActiveSlotData();
      if (!slot.accessory) slot.accessory = {};
      slot.accessory.ledCount = Number(rngLedCount.value);
      renderAccessoryZoneStrip();
      sendPacket90(
        Protocol25.Builders.setChromaStripeLedCount({ ledCount: slot.accessory.ledCount }),
        `ARGB Zone Count → ${slot.accessory.ledCount} LEDs`,
        { accessory: slot.accessory }
      );
    });

    const rngAccBr = document.getElementById("rngAccBrightness");
    rngAccBr?.addEventListener("input", () => {
      updateRangeFill(rngAccBr);
      document.getElementById("valAccBrightness").textContent = `${rngAccBr.value}%`;
      const slot = getActiveSlotData();
      if (!slot.lighting) slot.lighting = {};
      slot.lighting.brightness = Number(rngAccBr.value);
      renderAccessoryZoneStrip();
    });
    rngAccBr?.addEventListener("change", () => {
      const slot = getActiveSlotData();
      if (!slot.lighting) slot.lighting = {};
      slot.lighting.brightness = Number(rngAccBr.value);
      renderAccessoryZoneStrip();
      sendPacket90(
        Protocol25.Builders.setBrightness(Math.round((slot.lighting.brightness / 100) * 255)),
        `Accessory Brightness → ${slot.lighting.brightness}%`,
        { lighting: slot.lighting }
      );
    });

    document.querySelectorAll("#accEffectRow [data-acc-effect]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#accEffectRow [data-acc-effect]").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const eff = btn.dataset.accEffect || "wave";
        const c = document.getElementById("inpAccColor")?.value || "#00e676";
        const slot = getActiveSlotData();
        if (!slot.lighting) slot.lighting = {};
        slot.lighting.effect = eff;
        slot.lighting.color1 = c;
        renderAccessoryZoneStrip();
        sendChroma(eff, c);
      });
    });

    document.getElementById("inpAccColor")?.addEventListener("change", (ev) => {
      const c = ev.target.value;
      const slot = getActiveSlotData();
      if (!slot.lighting) slot.lighting = {};
      slot.lighting.color1 = c;
      renderAccessoryZoneStrip();
      sendChroma(slot.lighting.effect || "wave", c);
    });

    window.addEventListener("resize", () => renderChromaBackdrop(false));

    if (navigator.hid) {
      navigator.hid.addEventListener("connect", () => {
        protocolProbeFailedSigByPid.clear();
        void refreshAuthorizedWebHidDevices();
        showToast("Razer HID interface connected");
      });
      navigator.hid.addEventListener("disconnect", () => {
        protocolDeviceByPid.clear();
        protocolProbeFailedSigByPid.clear();
        void refreshAuthorizedWebHidDevices();
        showToast("Razer HID interface disconnected", false);
      });
    }
    if (navigator.usb && typeof navigator.usb.addEventListener === "function") {
      navigator.usb.addEventListener("connect", () => {
        protocolDeviceByPid.clear();
        protocolProbeErrorByPid.clear();
        protocolProbeFailedSigByPid.clear();
        protocolUsbClaimBlockedByPid.clear();
        initialHardwareSlotSynced = false;
        void refreshAuthorizedWebHidDevices();
        showToast("Razer WebUSB interface connected");
      });
      navigator.usb.addEventListener("disconnect", () => {
        protocolDeviceByPid.clear();
        protocolProbeFailedSigByPid.clear();
        void refreshAuthorizedWebHidDevices();
        showToast("Razer WebUSB interface disconnected", false);
      });
    }
  }

  // ==========================================================================
  // 16. Bootstrap (100% Client-Side WebHID + localStorage)
  // ==========================================================================
  async function init() {
    loadStoredState();
    // Don't trust a cached "driver" flag — the real mode is read from the keyboard on connect.
    driverState.deviceMode = "normal";
    ensureLifecycleExitListeners();
    renderChromaBackdrop(true);
    bindEvents();
    renderThemeGallery();
    applyThemeAndPrefs(false);

    updateCompatibilityUI();
    await refreshAuthorizedWebHidDevices();
    renderDeviceTabs();
    updateCompatibilityUI();
    if (hasCompatibleDevice()) {
      renderProfileSlotBar();
      syncControlsFromSlot();
      renderOverviewPanels();
      updateProfileKeyBox();
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
