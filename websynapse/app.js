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
    "customWave",
    "spiral",
    "sunset",
    "comet",
    "sonar",
    "ember",
    "raindrops",
    "equalizer",
    "shockwave",
    "splash",
    "heatmap",
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
  const ALL_TKL_KEY_LABELS = TKL_ROWS.flatMap((row) =>
    row.filter((k) => !k.spacer && !k.hidden && k.label).map((k) => k.label)
  );
  const ALL_TKL_KEY_SET = new Set(ALL_TKL_KEY_LABELS);

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
    if (rawSlot.perKeyOverrides && typeof rawSlot.perKeyOverrides === "object") {
      const cleanOverrides = {};
      for (const [kLabel, ov] of Object.entries(rawSlot.perKeyOverrides)) {
        if (!ALL_TKL_KEY_SET.has(kLabel) || !ov || typeof ov !== "object") continue;
        cleanOverrides[kLabel] = {
          act: Math.round(clampNum(ov.act, 0.1, 4.0, out.actuationMm ?? 1.2) * 10) / 10,
          rt: ov.rt !== undefined ? Boolean(ov.rt) : Boolean(out.rtEnabled),
          down: Math.round(clampNum(ov.down, 0.1, 4.0, out.rtDownMm ?? 0.3) * 100) / 100,
          up: Math.round(clampNum(ov.up, 0.1, 4.0, out.rtUpMm ?? 0.3) * 100) / 100,
        };
      }
      out.perKeyOverrides = cleanOverrides;
    }
    if (rawSlot.snapTapEnabled !== undefined) out.snapTapEnabled = Boolean(rawSlot.snapTapEnabled);
    if (rawSlot.snapKeyA !== undefined) out.snapKeyA = sanitizePlainText(rawSlot.snapKeyA, 8, "A");
    if (rawSlot.snapKeyB !== undefined) out.snapKeyB = sanitizePlainText(rawSlot.snapKeyB, 8, "D");
    if (rawSlot.gamingMode && typeof rawSlot.gamingMode === "object") {
      out.gamingMode = {
        enabled: Boolean(rawSlot.gamingMode.enabled),
        disableWin: rawSlot.gamingMode.disableWin !== false,
        disableAltTab: Boolean(rawSlot.gamingMode.disableAltTab),
        disableAltF4: Boolean(rawSlot.gamingMode.disableAltF4),
      };
    }
    if (rawSlot.keyBindings && typeof rawSlot.keyBindings === "object") {
      const cleanLayer = (layerObj) => {
        const res = {};
        if (layerObj && typeof layerObj === "object") {
          for (const [k, v] of Object.entries(layerObj)) {
            if (ALL_TKL_KEY_SET.has(k) && typeof v === "string") {
              res[k] = sanitizePlainText(v, 48, "Default");
            }
          }
        }
        return res;
      };
      out.keyBindings = {
        standard: cleanLayer(rawSlot.keyBindings.standard),
        hypershift: cleanLayer(rawSlot.keyBindings.hypershift),
      };
    }

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

  // WebHID + WebUSB + Local Bridge Runtime State
  const DEFAULT_LOCAL_BRIDGE_URL = "http://127.0.0.1:18925";
  let activeBridgeUrl =
    typeof window !== "undefined" && (window.location?.port === "18925" || window.location?.port === "5426")
      ? window.location.origin
      : DEFAULT_LOCAL_BRIDGE_URL;
  const webHidHandlesByPid = new Map(); // pid -> HIDDevice[] (sorted by control interface score)
  const webUsbDevicesByPid = new Map(); // pid -> USBDevice[] (Razer WebUSB handles for that PID)
  const bridgeDevicesByPid = new Map(); // pid -> { vendorId, productId, hexPid, productName, interfaceNumber, transport, firmware, tid }
  let localBridgeOnline = false;
  let localBridgeCspBlocked = false;
  let bridgeAutoPollTimer = null;
  const claimedUsbInterfaces = new WeakMap(); // USBDevice -> Set<interfaceNumber>
  const onboardChromaFlashedByPid = new Map(); // pid -> boolean (true when 0x0F/0x02 was written to mi_03 NVRAM)
  let initialHardwareSlotSynced = false;
  const webHidMutexByPid = new Map(); // pid -> Promise
  const lampArrayCountByPid = new Map(); // pid -> number of physical LEDs (e.g. 87)
  const lampArrayTimerByPid = new Map(); // pid -> intervalId for animated LampArray effects
  const lampArrayGenByPid = new Map(); // pid -> monotonic generation counter to cancel stale effect frames
  const lampArrayMutexByPid = new Map(); // pid -> Promise serializing Report ID 4/6 transfers
  const activeLampEffectByPid = new Map(); // pid -> currently running LampArray effect name

  if (typeof document !== "undefined") {
    document.addEventListener("securitypolicyviolation", (ev) => {
      const dir = String(ev?.violatedDirective || ev?.effectiveDirective || "");
      const uri = String(ev?.blockedURI || "");
      if (dir.startsWith("connect-src") && (uri.includes("18925") || uri.includes("127.0.0.1") || uri.includes("localhost"))) {
        localBridgeCspBlocked = true;
      }
    });
  }

  function isWindowsPlatform() {
    const plat = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || "";
    return /win/i.test(plat);
  }

  function hasAnyRazerDevice() {
    return bridgeDevicesByPid.size > 0 || webHidHandlesByPid.size > 0 || webUsbDevicesByPid.size > 0;
  }

  function hasCompatibleDevice() {
    if (!window.isSecureContext) return false;
    for (const pid of bridgeDevicesByPid.keys()) {
      if (Protocol25.KNOWN_DEVICES[pid]) return true;
    }
    if (!navigator.hid && !navigator.usb) return false;
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
    const bridgeBtn = document.getElementById("btnConnectBridge");
    const pairBtn = document.getElementById("btnWebHidPair");
    const bannerPairBtn = document.getElementById("btnBannerPair");
    const compatBridge = document.getElementById("btnCompatBridge");
    const compatDlBridge = document.getElementById("lnkCompatDownloadBridge");
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
    const onWin = isWindowsPlatform();
    const supportsUsb = hid || usb || localBridgeOnline;
    const preferBridge = onWin && !localBridgeOnline;

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

    if (bridgeBtn) {
      bridgeBtn.hidden = !secure || (!onWin && !localBridgeOnline);
      bridgeBtn.textContent = localBridgeOnline ? "✓ Bridge Connected" : "⚡ Connect Local Bridge";
      bridgeBtn.classList.toggle("is-primary", preferBridge);
    }
    if (pairBtn) {
      pairBtn.hidden = !hid || !secure;
      pairBtn.classList.toggle("is-primary", !preferBridge);
    }
    if (bannerPairBtn) bannerPairBtn.hidden = !secure || (!supportsUsb && !onWin);
    if (compatBridge) {
      compatBridge.hidden = !secure || (!onWin && !localBridgeOnline);
      compatBridge.classList.toggle("is-primary", onWin);
    }
    if (compatDlBridge) {
      compatDlBridge.hidden = !secure || !onWin;
    }
    if (compatPair) {
      compatPair.hidden = !hid || !secure;
      compatPair.classList.toggle("is-primary", !onWin);
    }
    if (compatCatalog) compatCatalog.hidden = false;

    if (!title || !text) return;
    if (!secure) {
      title.textContent = "HTTPS is required";
      text.textContent =
        "WebHID is only available in a secure context. Open https://websynap.se/ (or http://localhost:18925 via the Local Bridge) in a Chromium-based browser.";
    } else if (!supportsUsb && !onWin) {
      title.textContent = "Chromium-based browser required";
      text.textContent =
        "This site uses WebHID. Open it in Chrome, Edge, Brave, Opera, or Vivaldi. Firefox and Safari do not support WebHID.";
    } else if (!anyRazer) {
      title.textContent = "No compatible Razer device detected";
      text.textContent = onWin
        ? "Connect your Razer keyboard or mouse via USB and close Razer Synapse. On Windows with 1st-gen firmware, download & run websynapse-bridge.cmd (no admin, no Zadig, no install) and click “⚡ Connect Local Bridge” for full onboard memory saving, or click “Connect WebHID” for 2.xx firmware & live LampArray RGB."
        : "Connect a Razer keyboard or mouse with a data-capable USB cable, close Razer Synapse, then click “Connect WebHID” and grant USB access.";
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

  let studioStateSyncTimer = null;
  function persistDriverState() {
    try {
      localStorage.setItem(STORAGE_KEY_STATE, JSON.stringify(driverState));
    } catch {
      // ignore storage quota errors
    }
    if (typeof window !== "undefined" && window.location?.port === "5426") {
      if (studioStateSyncTimer) clearTimeout(studioStateSyncTimer);
      studioStateSyncTimer = setTimeout(() => {
        studioStateSyncTimer = null;
        void fetch("/api/studio-state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            selectedPid: driverState.selectedPid,
            profilesByPid: driverState.profilesByPid,
          }),
        }).catch(() => {});
      }, 100);
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

  function uint8ToBase64(bytes) {
    let bin = "";
    for (let i = 0; i < bytes.length; i++) {
      bin += String.fromCharCode(bytes[i] & 0xff);
    }
    return btoa(bin);
  }

  async function sendBridgeLampArrayReports(numPid, rawReportsWithId, { keepalive = false } = {}) {
    if (!rawReportsWithId || rawReportsWithId.length === 0) return false;
    const reportsB64 = rawReportsWithId.map((arr) => uint8ToBase64(arr));
    const resp = await fetch(`${activeBridgeUrl}/lamparray`, {
      method: "POST",
      keepalive: Boolean(keepalive),
      headers: {
        "Content-Type": "application/json",
        "X-WebSynapse-Bridge": "1",
      },
      body: JSON.stringify({
        pid: Number(numPid),
        reportsB64,
      }),
    });
    if (!resp.ok) throw new Error(`LampArray bridge HTTP ${resp.status}`);
    const data = await resp.json();
    if (!data?.ok) throw new Error(data?.error || "LampArray bridge transfer failed");
    return true;
  }

  const bridgeLampAdapterByPid = new Map();
  function getBridgeLampArrayAdapter(numPid) {
    const bDev = bridgeDevicesByPid.get(Number(numPid));
    if (!localBridgeOnline || !bDev || !bDev.hasLampArray) return null;
    let adapter = bridgeLampAdapterByPid.get(Number(numPid));
    if (!adapter) {
      adapter = {
        isBridgeLamp: true,
        opened: true,
        async open() {},
        async receiveFeatureReport(reportId) {
          const count = Number(bridgeDevicesByPid.get(Number(numPid))?.lampCount) || 87;
          if (reportId === 1) {
            const buf = new Uint8Array([1, count & 0xff, (count >> 8) & 0xff]);
            return new DataView(buf.buffer);
          }
          return new DataView(new Uint8Array(8).buffer);
        },
        async sendFeatureReport(reportId, payload) {
          const raw = new Uint8Array(1 + payload.length);
          raw[0] = reportId & 0xff;
          raw.set(payload, 1);
          await sendBridgeLampArrayReports(numPid, [raw]);
        },
        async sendFeatureReportBatch(rawReportsWithId) {
          await sendBridgeLampArrayReports(numPid, rawReportsWithId);
        },
      };
      bridgeLampAdapterByPid.set(Number(numPid), adapter);
    }
    return adapter;
  }

  function deviceHasLampArray(dev) {
    const cols = dev?.collections || [];
    return cols.some((c) => c.usagePage === 0x0059 && (c.featureReports || []).length > 0);
  }

  function findLampArrayDevice(pidKey) {
    const numPid = Number(pidKey);
    const list = webHidHandlesByPid.get(numPid) || [];
    const webHidLamp = list.find((d) => deviceHasLampArray(d)) || null;
    if (webHidLamp) return webHidLamp;
    return getBridgeLampArrayAdapter(numPid);
  }

  function scoreWebHidCollection(dev) {
    let score = 0;
    const cols = dev.collections || [];
    let hasReport0 = false;
    // Matches Razer Synapse Web (synapse.razer.com): Protocol 25 feature-report interface has
    // collections.length === 1 with usagePage 0x000C (Consumer) or 0x0001 (Generic Desktop).
    if (cols.length === 1 && (cols[0].usagePage === 0x000c || cols[0].usagePage === 0x0001)) {
      score += 600;
    }
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

  function parseFlexibleHex(raw) {
    const cleaned = String(raw ?? "").trim().replace(/^#/, "");
    if (/^[0-9a-fA-F]{6}$/.test(cleaned)) {
      return `#${cleaned.toLowerCase()}`;
    }
    if (/^[0-9a-fA-F]{3}$/.test(cleaned)) {
      return `#${cleaned[0]}${cleaned[0]}${cleaned[1]}${cleaned[1]}${cleaned[2]}${cleaned[2]}`.toLowerCase();
    }
    return null;
  }

  function hexToRgbTuple(hex, fallback = [0, 230, 118]) {
    const safe = parseFlexibleHex(hex);
    if (!safe) return fallback;
    return [
      parseInt(safe.slice(1, 3), 16),
      parseInt(safe.slice(3, 5), 16),
      parseInt(safe.slice(5, 7), 16),
    ];
  }

  function rgbToHsv(r, g, b, fallbackHue = 0) {
    const rn = clampNum(r, 0, 255, 0) / 255;
    const gn = clampNum(g, 0, 255, 0) / 255;
    const bn = clampNum(b, 0, 255, 0) / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const d = max - min;
    let h = fallbackHue;
    if (d > 1e-6) {
      if (max === rn) h = 60 * (((gn - bn) / d) % 6);
      else if (max === gn) h = 60 * ((bn - rn) / d + 2);
      else h = 60 * ((rn - gn) / d + 4);
      h = ((h % 360) + 360) % 360;
    }
    const s = max <= 1e-6 ? 0 : d / max;
    return { h, s, v: max };
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
  const hidLimitationDismissedPids = new Set();
  let hidLimitationModalPid = null;

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
    const targetMs = Math.max(16, Number(intervalMs) || 28);
    const heartbeatMs = Math.min(16, targetMs);
    const handle = { isWorker: false, id: 0, stopped: false };
    let running = false;
    let pending = false;
    let lastStart = 0;

    const pump = () => {
      if (handle.stopped) return;
      if (running) {
        pending = true;
        return;
      }
      const now = performance.now();
      if (lastStart > 0 && now - lastStart < targetMs - 4) return;
      running = true;
      pending = false;
      lastStart = now;
      Promise.resolve()
        .then(fn)
        .catch(() => {})
        .finally(() => {
          running = false;
          if (!handle.stopped && pending && performance.now() - lastStart >= targetMs - 4) {
            setTimeout(pump, 0);
          }
        });
    };

    const worker = getChromaTimerWorker();
    if (worker) {
      const id = nextLampTimerId++;
      handle.isWorker = true;
      handle.id = id;
      lampTimerCallbacks.set(id, pump);
      worker.postMessage({ cmd: "start", id, intervalMs: heartbeatMs });
      return handle;
    }
    handle.id = setInterval(pump, heartbeatMs);
    return handle;
  }

  function clearLampInterval(handle) {
    if (!handle) return;
    if (typeof handle === "object") {
      handle.stopped = true;
    }
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
    activeLampEffectByPid.delete(numPid);
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
    activeLampEffectByPid.clear();

    // 2. Hand the keyboard back exactly as Synapse 4 does on exit (A.jf.onunload -> setDeviceMode(0, 0)),
    // but ONLY for state this page actually changed. Everything configured through Protocol 25 already
    // lives in the keyboard's onboard memory, so nothing has to be re-sent here. In particular we no
    // longer push setActiveProfileSlot() on close: that switched the keyboard to whatever slot the
    // browser had cached and made it visibly re-initialise when the tab was closed.
    let dispatchedAny = false;
    const allKnownPids = new Set([...bridgeDevicesByPid.keys(), ...webHidHandlesByPid.keys(), ...webUsbDevicesByPid.keys()]);
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
          if (pHandle.mode === "bridge") {
            void fetch(`${activeBridgeUrl}/transfer`, {
              method: "POST",
              keepalive: true,
              headers: { "Content-Type": "application/json", "X-WebSynapse-Bridge": "1" },
              body: JSON.stringify({ pid, packet90: Array.from(modePkt), timeoutMs: 300 }),
            }).catch(() => {});
            driverModeActivePids.delete(pid);
            dispatchedAny = true;
          } else if (pHandle.mode === "webusb" && pHandle.dev?.opened) {
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
      if (typeof window !== "undefined" && window.location?.port === "5426") {
        const dp = driverState.profilesByPid?.[pid];
        const sl = dp?.slots?.[dp.activeSlot || 1];
        const activeEff = sl?.lighting?.effect || "static";
        if (!HARDWARE_NATIVE_CHROMA_EFFECTS.has(activeEff)) {
          void fetch("/api/studio-handoff", {
            method: "POST",
            keepalive: true,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              pid,
              slotId: dp?.activeSlot || 1,
              lighting: sl?.lighting || null,
            }),
          }).catch(() => {});
          lampHostControlPids.delete(pid);
          dispatchedAny = true;
          continue;
        }
      }
      const lampDev = findLampArrayDevice(pid);
      if (!lampDev || !lampDev.opened) continue;

      try {
        // Close any interrupted multi-packet Report ID 4 frame with LampUpdateComplete = 1
        // and switch hardware back to AutonomousMode = 1 (onboard effect engine)
        const finishRep4 = new Uint8Array(50);
        finishRep4[0] = 1;
        finishRep4[1] = 1;
        if (lampDev.isBridgeLamp) {
          const r4 = new Uint8Array(51);
          r4[0] = 4;
          r4.set(finishRep4, 1);
          const r6 = new Uint8Array([6, 1]);
          void sendBridgeLampArrayReports(pid, [r4, r6], { keepalive: true }).catch(() => {});
        } else {
          void lampDev.sendFeatureReport(4, finishRep4).catch(() => {});
          void lampDev.sendFeatureReport(6, new Uint8Array([1])).catch(() => {});
        }
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

  let globalKeyPollTimer = null;
  let lastBridgeKeySeq = -1;
  let lastFocusedWarmupAt = 0;

  function ensureReactiveKeyListeners() {
    if (!reactiveKeyListenersBound) {
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

    if (!globalKeyPollTimer) {
      globalKeyPollTimer = setLampInterval(async () => {
        if (isPageUnloading || reactiveTriggerByPid.size === 0) return;
        const isLocalPort =
          typeof window !== "undefined" && (window.location?.port === "5426" || window.location?.port === "18925");
        if (!localBridgeOnline && !isLocalPort) return;

        const pageFocused =
          typeof document !== "undefined" &&
          document.visibilityState === "visible" &&
          typeof document.hasFocus === "function" &&
          document.hasFocus();

        const now = performance.now();
        if (pageFocused) {
          if (now - lastFocusedWarmupAt < 450) return;
          lastFocusedWarmupAt = now;
        }

        const reqSince = pageFocused ? -1 : lastBridgeKeySeq;
        try {
          const resp = await fetch(`${activeBridgeUrl}/keyevents?since=${reqSince}`, {
            method: "GET",
            headers: { "X-WebSynapse-Bridge": "1" },
          });
          if (!resp.ok) return;
          const data = await resp.json();
          if (!data?.ok) return;
          const prevSeq = lastBridgeKeySeq;
          if (typeof data.seq === "number") {
            lastBridgeKeySeq = data.seq;
          }
          if (!pageFocused && prevSeq >= 0 && Array.isArray(data.events) && data.events.length > 0) {
            for (let i = 0; i < data.events.length; i++) {
              const ev = data.events[i];
              if (!ev || !ev.c) continue;
              for (const handler of reactiveTriggerByPid.values()) {
                if (ev.d) {
                  if (typeof handler.onKeyDown === "function") handler.onKeyDown(ev.c, "");
                } else if (typeof handler.onKeyUp === "function") {
                  handler.onKeyUp(ev.c, "");
                }
              }
            }
          }
        } catch {
          // ignore transient poll errors
        }
      }, 20);
    }
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
    activeLampEffectByPid.delete(numPid);
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

      let effect = "static";
      let brScale = 1;
      let baseR = 0, baseG = 230, baseB = 118;
      let secR = 0, secG = 210, secB = 255;
      let speedMult = 2;
      let dirSign = 1;

      const syncLiveLightingParams = () => {
        const dp = driverState.profilesByPid?.[numPid] || buildDefaultDeviceProfile(numPid);
        const sl = dp.slots?.[dp.activeSlot || 1] || {};
        const lt = sl.lighting || {};
        effect = lt.effect || "static";
        brScale = Math.max(0, Math.min(1, Number(lt.brightness ?? 100) / 100));
        const h1 = sanitizeHexColor(lt.color1, "#00e676").slice(1);
        baseR = parseInt(h1.slice(0, 2), 16) || 0;
        baseG = parseInt(h1.slice(2, 4), 16) || 0;
        baseB = parseInt(h1.slice(4, 6), 16) || 0;
        const h2 = sanitizeHexColor(lt.color2, "#00d2ff").slice(1);
        secR = parseInt(h2.slice(0, 2), 16) || 0;
        secG = parseInt(h2.slice(2, 4), 16) || 0;
        secB = parseInt(h2.slice(4, 6), 16) || 0;
        speedMult = Number(lt.speed || 2);
        dirSign = Number(lt.waveDirection || 1) === 2 ? -1 : 1;
      };
      syncLiveLightingParams();
      activeLampEffectByPid.set(numPid, effect);

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

      // Per-lamp RGBA state cache for lossless delta compression across frames:
      // Frame 1 sends all 87 lamps (11 packets); subsequent frames only pack lamps whose
      // 8-bit quantized [sr, sg, sb, si] actually changed, cutting Matrix Rain / Scanner /
      // Ripple / Starlight USB transfers from 11 packets (~32ms) down to 1-4 packets (~3-11ms).
      const lastSentRgbi = new Int16Array(lampCount * 4).fill(-1);

      const writeScaledLampEntriesLocked = async (scaledEntries) => {
        if (!scaledEntries || scaledEntries.length === 0) return;
        const batchedWithId = typeof lampDev.sendFeatureReportBatch === "function" ? [] : null;
        for (let baseIdx = 0; baseIdx < scaledEntries.length; baseIdx += 8) {
          if (isPageUnloading || lampArrayGenByPid.get(numPid) !== gen || !lampDev.opened) return;
          const count = Math.min(8, scaledEntries.length - baseIdx);
          const isLast = baseIdx + 8 >= scaledEntries.length;
          const rep4 = new Uint8Array(50);
          rep4[0] = count;
          rep4[1] = isLast ? 1 : 0;
          for (let i = 0; i < count; i++) {
            const item = scaledEntries[baseIdx + i];
            const lampId = item.id;
            rep4[2 + i * 2] = lampId & 0xff;
            rep4[2 + i * 2 + 1] = (lampId >> 8) & 0xff;
            const colOff = 18 + i * 4;
            rep4[colOff] = item.sr;
            rep4[colOff + 1] = item.sg;
            rep4[colOff + 2] = item.sb;
            rep4[colOff + 3] = item.si;
          }
          if (batchedWithId) {
            const raw51 = new Uint8Array(51);
            raw51[0] = 4;
            raw51.set(rep4, 1);
            batchedWithId.push(raw51);
          } else {
            await lampDev.sendFeatureReport(4, rep4);
          }
        }
        if (batchedWithId && batchedWithId.length > 0) {
          await lampDev.sendFeatureReportBatch(batchedWithId);
        }
        for (let i = 0; i < scaledEntries.length; i++) {
          const item = scaledEntries[i];
          if (item.id >= 0 && item.id < lampCount) {
            const stOff = item.id * 4;
            lastSentRgbi[stOff] = item.sr;
            lastSentRgbi[stOff + 1] = item.sg;
            lastSentRgbi[stOff + 2] = item.sb;
            lastSentRgbi[stOff + 3] = item.si;
          }
        }
      };

      // Send a subset of lamps via Report ID 4 (8 lamps per 50-byte packet, LampUpdateComplete=1 on final packet)
      const sendLampSubset = async (entries) => {
        if (!entries || entries.length === 0 || isPageUnloading) return;
        await runExclusiveLampBatch(async () => {
          syncLiveLightingParams();
          const changed = [];
          for (let i = 0; i < entries.length; i++) {
            const item = entries[i];
            const lampId = item.id;
            const sr = Math.round(item.r * brScale) & 0xff;
            const sg = Math.round(item.g * brScale) & 0xff;
            const sb = Math.round(item.b * brScale) & 0xff;
            const si = (item.i ?? 255) & 0xff;
            if (lampId >= 0 && lampId < lampCount) {
              const stOff = lampId * 4;
              if (
                lastSentRgbi[stOff] === sr &&
                lastSentRgbi[stOff + 1] === sg &&
                lastSentRgbi[stOff + 2] === sb &&
                lastSentRgbi[stOff + 3] === si
              ) {
                continue;
              }
            }
            changed.push({ id: lampId, sr, sg, sb, si });
          }
          if (changed.length > 0) {
            await writeScaledLampEntriesLocked(changed);
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

      // Send a computed 87-lamp frame using error-accumulating per-lamp delta compression
      const sendComputedFrame = async (computeRgbFn, minChannelDelta = 2) => {
        if (isPageUnloading) return;
        const ids = layout.sortedIdsByX;
        await runExclusiveLampBatch(async () => {
          syncLiveLightingParams();
          const changed = [];
          for (let idx = 0; idx < ids.length; idx++) {
            const lampId = ids[idx];
            const lampMeta = layout.lamps[lampId] || { id: lampId, x: 16, y: 14, nx: 0, ny: 0 };
            const rawRgb = computeRgbFn(lampMeta);
            const [r, g, b] = blendSlotIndicatorOverlay(lampMeta, rawRgb[0], rawRgb[1], rawRgb[2]);
            const sr = Math.round(r * brScale) & 0xff;
            const sg = Math.round(g * brScale) & 0xff;
            const sb = Math.round(b * brScale) & 0xff;
            const si = 255;
            if (lampId >= 0 && lampId < lampCount && lastSentRgbi[lampId * 4] >= 0) {
              const stOff = lampId * 4;
              const isTargetBlack = sr === 0 && sg === 0 && sb === 0;
              const maxDiff = Math.max(
                Math.abs(lastSentRgbi[stOff] - sr),
                Math.abs(lastSentRgbi[stOff + 1] - sg),
                Math.abs(lastSentRgbi[stOff + 2] - sb),
                Math.abs(lastSentRgbi[stOff + 3] - si)
              );
              if (maxDiff === 0 || (!isTargetBlack && maxDiff < minChannelDelta)) {
                continue;
              }
            }
            changed.push({ id: lampId, sr, sg, sb, si });
          }
          if (changed.length > 0) {
            await writeScaledLampEntriesLocked(changed);
          }
        });
      };

      // Send uniform color across all lamps (ordered Left-to-Right), respecting any active slot-switch indicator
      const sendAllLampsColor = async (r, g, b, intensity = 255) => {
        if (isPageUnloading) return;
        syncLiveLightingParams();
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
          const changed = [];
          for (let idx = 0; idx < ids.length; idx++) {
            const lampId = ids[idx];
            if (lampId >= 0 && lampId < lampCount) {
              const stOff = lampId * 4;
              if (
                lastSentRgbi[stOff] === sr &&
                lastSentRgbi[stOff + 1] === sg &&
                lastSentRgbi[stOff + 2] === sb &&
                lastSentRgbi[stOff + 3] === si
              ) {
                continue;
              }
            }
            changed.push({ id: lampId, sr, sg, sb, si });
          }
          if (changed.length > 0) {
            await writeScaledLampEntriesLocked(changed);
          }
        });
      };

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
          }, 0)
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
        }, 33);

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
        }, 33);
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
        }, 33);
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
        }, 33);
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
        }, 33);
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
        }, 33);
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
                  stars.set(randId, { bornAt: now, durationMs: dur, useSec: false });
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
        }, 33);
        lampArrayTimerByPid.set(numPid, timer);
        return true;
      }

      // MATRIX RAIN (Extra Studio Effect): Digital raindrops falling down keyboard columns (top y=14mm -> bottom y=115mm)
      if (effect === "rain") {
        await sendAllLampsColor(0, 0, 0, 0);
        const drops = Array.from({ length: 14 }, (_, idx) => ({
          x: 16 + ((idx * 37) % 334),
          y: -Math.random() * 120,
          vJitter: 0.8 + Math.random() * 0.45,
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
            syncLiveLightingParams();
            const now = performance.now();
            const dt = Math.min(100, now - lastTick);
            lastTick = now;
            const activeDropCount = speedMult === 1 ? 7 : speedMult === 3 ? 14 : 10;
            const speedScale = speedMult === 1 ? 0.08 : speedMult === 3 ? 0.22 : 0.14;
            for (let i = 0; i < activeDropCount; i++) {
              const d = drops[i];
              d.y += d.vJitter * speedScale * dt;
              if (d.y > 165) {
                d.y = -15 - Math.random() * 35;
                d.x = 16 + Math.random() * 334;
                d.vJitter = 0.8 + Math.random() * 0.45;
              }
            }

            await sendComputedFrame((l) => {
              let headEnv = 0;
              let tailEnv = 0;
              for (let i = 0; i < activeDropCount; i++) {
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
        }, 25);
        lampArrayTimerByPid.set(numPid, timer);
        return true;
      }

      // CYBER SCANNER (Extra Studio Effect): KITT / Cylon horizontal laser bar sweeping Left <-> Right with glowing tail
      if (effect === "scanner") {
        let phase = 0;
        let lastTick = performance.now();
        const timer = setLampInterval(async () => {
          if (isPageUnloading || lampArrayGenByPid.get(numPid) !== gen) {
            clearLampInterval(timer);
            return;
          }
          if (busy || !lampDev.opened) return;
          busy = true;
          try {
            syncLiveLightingParams();
            const now = performance.now();
            const dt = Math.min(100, now - lastTick);
            lastTick = now;
            const radPerMs = (speedMult === 1 ? 1.5 : speedMult === 3 ? 4.2 : 2.6) / 1000;
            phase += dt * radPerMs;
            const pos = 0.5 + 0.5 * dirSign * Math.sin(phase);
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
        }, 25);
        lampArrayTimerByPid.set(numPid, timer);
        return true;
      }

      // NORTHERN AURORA (Extra Studio Effect): Organic 2D plasma waves blending Primary (color1) and Secondary (color2)
      if (effect === "aurora") {
        let tAcc = 0;
        let lastTick = performance.now();
        const timer = setLampInterval(async () => {
          if (isPageUnloading || lampArrayGenByPid.get(numPid) !== gen) {
            clearLampInterval(timer);
            return;
          }
          if (busy || !lampDev.opened) return;
          busy = true;
          try {
            syncLiveLightingParams();
            const now = performance.now();
            const dt = Math.min(100, now - lastTick);
            lastTick = now;
            const spd = (speedMult === 1 ? 1.4 : speedMult === 3 ? 3.8 : 2.4) / 1000;
            tAcc += dt * spd;
            const t = tAcc;
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
        }, 28);
        lampArrayTimerByPid.set(numPid, timer);
        return true;
      }

      // PARTY STROBE / DISCO (Extra Studio Effect): Multi-zone energetic color bursts across key clusters
      if (effect === "disco") {
        let beatAcc = 0;
        let lastTick = performance.now();
        const timer = setLampInterval(async () => {
          if (isPageUnloading || lampArrayGenByPid.get(numPid) !== gen) {
            clearLampInterval(timer);
            return;
          }
          if (busy || !lampDev.opened) return;
          busy = true;
          try {
            syncLiveLightingParams();
            const now = performance.now();
            const dt = Math.min(100, now - lastTick);
            lastTick = now;
            const stepMs = speedMult === 1 ? 140 : speedMult === 3 ? 55 : 85;
            beatAcc += dt / stepMs;
            const seed = Math.floor(beatAcc);
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
        }, 33);
        lampArrayTimerByPid.set(numPid, timer);
        return true;
      }

      // DUAL COLOR WAVE (Wootility Custom Wave / Corsair Color Wave): Smooth traveling wave blending Primary & Secondary
      if (effect === "customWave") {
        let phase = 0;
        let lastTick = performance.now();
        const timer = setLampInterval(async () => {
          if (isPageUnloading || lampArrayGenByPid.get(numPid) !== gen) {
            clearLampInterval(timer);
            return;
          }
          if (busy || !lampDev.opened) return;
          busy = true;
          try {
            syncLiveLightingParams();
            const now = performance.now();
            const dt = Math.min(100, now - lastTick);
            lastTick = now;
            const radPerMs = (speedMult === 1 ? 1.7 : speedMult === 3 ? 4.9 : 3.1) / 1000;
            phase += dt * radPerMs;
            await sendComputedFrame((l) => {
              const raw = 0.5 + 0.5 * Math.sin(l.nx * Math.PI * 2.4 - dirSign * phase + l.ny * 0.45);
              const w = raw * raw * (3 - 2 * raw);
              return [
                Math.round(baseR * w + secR * (1 - w)),
                Math.round(baseG * w + secG * (1 - w)),
                Math.round(baseB * w + secB * (1 - w)),
              ];
            });
          } catch {
            clearLampInterval(timer);
          } finally {
            busy = false;
          }
        }, 28);
        lampArrayTimerByPid.set(numPid, timer);
        return true;
      }

      // RAINBOW PINWHEEL (QMK / Keychron CYCLE_SPIRAL_VAL): Swirling 2D polar spiral galaxy around keyboard center
      if (effect === "spiral") {
        let phaseDeg = 0;
        let lastTick = performance.now();
        const centerX = 175;
        const centerY = 65;
        const timer = setLampInterval(async () => {
          if (isPageUnloading || lampArrayGenByPid.get(numPid) !== gen) {
            clearLampInterval(timer);
            return;
          }
          if (busy || !lampDev.opened) return;
          busy = true;
          try {
            syncLiveLightingParams();
            const now = performance.now();
            const dt = Math.min(100, now - lastTick);
            lastTick = now;
            const degPerMs = (speedMult === 1 ? 70 : speedMult === 3 ? 215 : 135) / 1000;
            phaseDeg = (phaseDeg + dt * degPerMs) % 360;
            await sendComputedFrame((l) => {
              const dx = l.x - centerX;
              const dy = l.y - centerY;
              const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
              const dist = Math.hypot(dx, dy);
              const hue = (angleDeg + dist * 1.45 - dirSign * phaseDeg + 36000) % 360;
              return hsvToRgb(hue, 1, 1);
            });
          } catch {
            clearLampInterval(timer);
          } finally {
            busy = false;
          }
        }, 28);
        lampArrayTimerByPid.set(numPid, timer);
        return true;
      }

      // VAPORWAVE SUNSET (Outrun / Synthwave Horizon): Drifting solar core above Primary -> Secondary horizon scanlines
      if (effect === "sunset") {
        let tAcc = 0;
        let lastTick = performance.now();
        const timer = setLampInterval(async () => {
          if (isPageUnloading || lampArrayGenByPid.get(numPid) !== gen) {
            clearLampInterval(timer);
            return;
          }
          if (busy || !lampDev.opened) return;
          busy = true;
          try {
            syncLiveLightingParams();
            const now = performance.now();
            const dt = Math.min(100, now - lastTick);
            lastTick = now;
            const spd = (speedMult === 1 ? 1.1 : speedMult === 3 ? 3.2 : 2.0) / 1000;
            tAcc += dt * spd;
            const sunX = 0.5 + 0.22 * Math.sin(tAcc * 0.55 * dirSign);
            const sunY = 0.26;
            await sendComputedFrame((l) => {
              const horizon = Math.max(0, Math.min(1, l.ny + 0.1 * Math.sin(l.nx * 4.8 - dirSign * tAcc)));
              const sunDist = Math.hypot((l.nx - sunX) * 1.75, l.ny - sunY);
              const sunCore = Math.pow(Math.max(0, 1 - sunDist / 0.44), 2.1);
              const scan = 0.8 + 0.2 * Math.sin(l.ny * 18 - tAcc * 2.6);
              const r = (baseR * (1 - horizon) + secR * horizon) * scan + (255 - baseR) * sunCore * 0.55;
              const g = (baseG * (1 - horizon) + secG * horizon) * scan + (245 - baseG) * sunCore * 0.48;
              const b = (baseB * (1 - horizon) + secB * horizon) * scan + (225 - baseB) * sunCore * 0.4;
              return [
                Math.max(0, Math.min(255, Math.round(r))),
                Math.max(0, Math.min(255, Math.round(g))),
                Math.max(0, Math.min(255, Math.round(b))),
              ];
            });
          } catch {
            clearLampInterval(timer);
          } finally {
            busy = false;
          }
        }, 28);
        lampArrayTimerByPid.set(numPid, timer);
        return true;
      }

      // METEOR COMET (ASUS Aura Comet / MSI Meteor): White-hot comet heads streaking with Primary -> Secondary plasma tails
      if (effect === "comet") {
        let headPos = 0;
        let lastTick = performance.now();
        const span = 1.55;
        const timer = setLampInterval(async () => {
          if (isPageUnloading || lampArrayGenByPid.get(numPid) !== gen) {
            clearLampInterval(timer);
            return;
          }
          if (busy || !lampDev.opened) return;
          busy = true;
          try {
            syncLiveLightingParams();
            const now = performance.now();
            const dt = Math.min(100, now - lastTick);
            lastTick = now;
            const unitsPerMs = (speedMult === 1 ? 0.38 : speedMult === 3 ? 1.08 : 0.68) / 1000;
            headPos = (headPos + dt * unitsPerMs) % span;
            const c0 = headPos;
            const c1 = (headPos + span * 0.5) % span;
            await sendComputedFrame((l) => {
              const axis = (dirSign === 1 ? l.nx : 1 - l.nx) + l.ny * 0.16;
              const bandWeight0 = Math.max(0, 1 - Math.abs(l.ny - 0.25) / 0.52);
              const bandWeight1 = Math.max(0, 1 - Math.abs(l.ny - 0.78) / 0.52);

              const evalComet = (cPos, bandW) => {
                if (bandW <= 0) return [0, 0, 0];
                let d = cPos - axis;
                if (d < -0.2) d += span;
                if (d >= -0.045 && d <= 0.045) {
                  const core = (1 - Math.abs(d) / 0.045) * bandW;
                  return [
                    Math.round((baseR * 0.45 + 255 * 0.55) * core),
                    Math.round((baseG * 0.45 + 255 * 0.55) * core),
                    Math.round((baseB * 0.45 + 255 * 0.55) * core),
                  ];
                }
                if (d > 0.045 && d <= 0.56) {
                  const t = (d - 0.045) / 0.515;
                  const env = Math.pow(1 - t, 1.9) * bandW;
                  return [
                    Math.round((baseR * (1 - t) + secR * t) * env),
                    Math.round((baseG * (1 - t) + secG * t) * env),
                    Math.round((baseB * (1 - t) + secB * t) * env),
                  ];
                }
                return [0, 0, 0];
              };

              const a = evalComet(c0, bandWeight0);
              const b = evalComet(c1, bandWeight1);
              return [
                Math.min(255, a[0] + b[0]),
                Math.min(255, a[1] + b[1]),
                Math.min(255, a[2] + b[2]),
              ];
            });
          } catch {
            clearLampInterval(timer);
          } finally {
            busy = false;
          }
        }, 25);
        lampArrayTimerByPid.set(numPid, timer);
        return true;
      }

      // RADAR SONAR (Corsair iCUE Sonar / Pulse): Concentric sonar rings radiating from keyboard center
      if (effect === "sonar") {
        let phaseMm = 0;
        let lastTick = performance.now();
        const periodMm = 128;
        const centerX = 175;
        const centerY = 65;
        const timer = setLampInterval(async () => {
          if (isPageUnloading || lampArrayGenByPid.get(numPid) !== gen) {
            clearLampInterval(timer);
            return;
          }
          if (busy || !lampDev.opened) return;
          busy = true;
          try {
            syncLiveLightingParams();
            const now = performance.now();
            const dt = Math.min(100, now - lastTick);
            lastTick = now;
            const mmPerMs = speedMult === 1 ? 0.09 : speedMult === 3 ? 0.25 : 0.16;
            phaseMm = (phaseMm + dt * mmPerMs) % periodMm;
            await sendComputedFrame((l) => {
              const dist = Math.hypot(l.x - centerX, l.y - centerY);
              const p = (((dist - dirSign * phaseMm) % periodMm) + periodMm) % periodMm;
              const edgeAtten = Math.max(0.32, 1 - dist / 280);
              if (p < 22) {
                const crest = Math.cos((p / 22) * (Math.PI / 2)) * edgeAtten;
                return [
                  Math.round(baseR * crest),
                  Math.round(baseG * crest),
                  Math.round(baseB * crest),
                ];
              }
              if (p >= 22 && p < 74) {
                const wake = Math.pow(1 - (p - 22) / 52, 1.7) * 0.65 * edgeAtten;
                return [
                  Math.round(secR * wake),
                  Math.round(secG * wake),
                  Math.round(secB * wake),
                ];
              }
              return [Math.round(secR * 0.05), Math.round(secG * 0.05), Math.round(secB * 0.05)];
            });
          } catch {
            clearLampInterval(timer);
          } finally {
            busy = false;
          }
        }, 28);
        lampArrayTimerByPid.set(numPid, timer);
        return true;
      }

      // MOLTEN EMBER (Glorious Lava / QMK Plasma): Drifting molten cellular glow in Primary & Secondary colors
      if (effect === "ember") {
        let tAcc = 0;
        let lastTick = performance.now();
        const timer = setLampInterval(async () => {
          if (isPageUnloading || lampArrayGenByPid.get(numPid) !== gen) {
            clearLampInterval(timer);
            return;
          }
          if (busy || !lampDev.opened) return;
          busy = true;
          try {
            syncLiveLightingParams();
            const now = performance.now();
            const dt = Math.min(100, now - lastTick);
            lastTick = now;
            const spd = (speedMult === 1 ? 0.85 : speedMult === 3 ? 2.5 : 1.55) / 1000;
            tAcc += dt * spd;
            await sendComputedFrame((l) => {
              const n1 = Math.sin(l.nx * 5.4 + tAcc * 1.15 * dirSign) * Math.cos(l.ny * 3.9 - tAcc * 0.85);
              const n2 = Math.sin((l.nx - l.ny) * 4.6 - tAcc * 1.4);
              const heat = Math.max(0.06, Math.min(1, 0.52 + 0.34 * n1 + 0.22 * n2));
              if (heat < 0.5) {
                const k = heat / 0.5;
                return [
                  Math.round(secR * (0.12 + 0.88 * k)),
                  Math.round(secG * (0.12 + 0.88 * k)),
                  Math.round(secB * (0.12 + 0.88 * k)),
                ];
              }
              const k = (heat - 0.5) / 0.5;
              const core = Math.max(0, (heat - 0.84) / 0.16) * 0.45;
              return [
                Math.min(255, Math.round(secR * (1 - k) + baseR * k + (255 - baseR) * core)),
                Math.min(255, Math.round(secG * (1 - k) + baseG * k + (235 - baseG) * core)),
                Math.min(255, Math.round(secB * (1 - k) + baseB * k + (190 - baseB) * core)),
              ];
            });
          } catch {
            clearLampInterval(timer);
          } finally {
            busy = false;
          }
        }, 28);
        lampArrayTimerByPid.set(numPid, timer);
        return true;
      }

      // SPRING RAINDROPS (Ducky Raindrop / QMK RAINDROPS): Random droplets splashing into expanding puddles
      if (effect === "raindrops") {
        const puddles = [
          { x: 95, y: 52, age: 0, maxAge: 950, sec: false },
          { x: 245, y: 78, age: 320, maxAge: 950, sec: true },
        ];
        let spawnAcc = 0;
        let lastTick = performance.now();
        const timer = setLampInterval(async () => {
          if (isPageUnloading || lampArrayGenByPid.get(numPid) !== gen) {
            clearLampInterval(timer);
            return;
          }
          if (busy || !lampDev.opened) return;
          busy = true;
          try {
            syncLiveLightingParams();
            const now = performance.now();
            const dt = Math.min(100, now - lastTick);
            lastTick = now;
            const spawnIntervalMs = speedMult === 1 ? 340 : speedMult === 3 ? 125 : 210;
            const maxAgeMs = speedMult === 1 ? 1350 : speedMult === 3 ? 720 : 980;
            spawnAcc += dt;
            while (spawnAcc >= spawnIntervalMs) {
              spawnAcc -= spawnIntervalMs;
              if (puddles.length < 10) {
                puddles.push({
                  x: 20 + Math.random() * 320,
                  y: 16 + Math.random() * 98,
                  age: 0,
                  maxAge: maxAgeMs,
                  sec: Math.random() < 0.42,
                });
              }
            }
            for (let i = puddles.length - 1; i >= 0; i--) {
              puddles[i].age += dt;
              if (puddles[i].age >= puddles[i].maxAge) puddles.splice(i, 1);
            }
            await sendComputedFrame((l) => {
              let rAcc = secR * 0.05;
              let gAcc = secG * 0.05;
              let bAcc = secB * 0.05;
              for (let i = 0; i < puddles.length; i++) {
                const p = puddles[i];
                const prog = p.age / p.maxAge;
                const radius = prog * 56;
                const dist = Math.hypot(l.x - p.x, l.y - p.y);
                const delta = Math.abs(dist - radius);
                if (delta < 16) {
                  const env = Math.cos((delta / 16) * (Math.PI / 2)) * Math.pow(1 - prog, 1.35);
                  const cr = p.sec ? secR : baseR;
                  const cg = p.sec ? secG : baseG;
                  const cb = p.sec ? secB : baseB;
                  rAcc += cr * env;
                  gAcc += cg * env;
                  bAcc += cb * env;
                }
              }
              return [
                Math.min(255, Math.round(rAcc)),
                Math.min(255, Math.round(gAcc)),
                Math.min(255, Math.round(bAcc)),
              ];
            });
          } catch {
            clearLampInterval(timer);
          } finally {
            busy = false;
          }
        }, 28);
        lampArrayTimerByPid.set(numPid, timer);
        return true;
      }

      // AUDIO VU BARS (Logitech G HUB Equalizer / Prism Visualizer): 14 rhythmic spectrum columns + Secondary peak caps
      if (effect === "equalizer") {
        const bandCount = 14;
        const levels = new Float32Array(bandCount).fill(0.35);
        const peaks = new Float32Array(bandCount).fill(0.5);
        let tAcc = 0;
        let lastTick = performance.now();
        const timer = setLampInterval(async () => {
          if (isPageUnloading || lampArrayGenByPid.get(numPid) !== gen) {
            clearLampInterval(timer);
            return;
          }
          if (busy || !lampDev.opened) return;
          busy = true;
          try {
            syncLiveLightingParams();
            const now = performance.now();
            const dt = Math.min(100, now - lastTick);
            lastTick = now;
            const spd = (speedMult === 1 ? 3.2 : speedMult === 3 ? 8.6 : 5.6) / 1000;
            tAcc += dt * spd;
            for (let b = 0; b < bandCount; b++) {
              const bassWeight = 1 - (b / bandCount) * 0.25;
              const wave =
                0.48 +
                0.28 * Math.sin(tAcc * 1.9 + b * 0.72 * dirSign) +
                0.18 * Math.cos(tAcc * 3.3 - b * 1.35) +
                0.14 * Math.sin(tAcc * 5.1 + b * 2.1);
              const target = Math.max(0.08, Math.min(1, wave * bassWeight));
              levels[b] = levels[b] + (target - levels[b]) * Math.min(1, dt * 0.022);
              if (levels[b] >= peaks[b]) {
                peaks[b] = levels[b];
              } else {
                peaks[b] = Math.max(levels[b], peaks[b] - dt * 0.00048);
              }
            }
            await sendComputedFrame((l) => {
              const bIdx = Math.max(0, Math.min(bandCount - 1, Math.floor(l.nx * bandCount)));
              const barHeight = 1 - l.ny; // 0 = bottom SPACE row, 1 = top ESC/F row
              const lvl = levels[bIdx];
              const pk = peaks[bIdx];
              if (Math.abs(barHeight - pk) < 0.095 && pk > 0.16) {
                return [secR, secG, secB];
              }
              if (barHeight <= lvl) {
                const topMix = Math.max(0, (barHeight - 0.55) / 0.45);
                return [
                  Math.round(baseR * (1 - topMix) + secR * topMix),
                  Math.round(baseG * (1 - topMix) + secG * topMix),
                  Math.round(baseB * (1 - topMix) + secB * topMix),
                ];
              }
              return [0, 0, 0];
            });
          } catch {
            clearLampInterval(timer);
          } finally {
            busy = false;
          }
        }, 25);
        lampArrayTimerByPid.set(numPid, timer);
        return true;
      }

      // CROSSHAIR LASER (QMK SOLID_REACTIVE_CROSS / Ducky Laser): Keystrokes fire horizontal + vertical laser beams
      if (effect === "shockwave") {
        ensureReactiveKeyListeners();
        const pulses = [{ x: 145, y: 65, bornAt: performance.now() }];
        const spawnCross = (lampIds) => {
          if (isPageUnloading || !lampIds || lampIds.length === 0 || lampArrayGenByPid.get(numPid) !== gen) return;
          const lamp = layout.lamps[lampIds[0]];
          if (!lamp) return;
          if (pulses.length >= 8) pulses.shift();
          pulses.push({ x: lamp.x, y: lamp.y, bornAt: performance.now() });
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
            if (ids) spawnCross(ids);
          },
          onKeyUp() {},
          onLabelTrigger(label) {
            const ids = layout.byLabel.get(label);
            if (ids) spawnCross(ids);
          },
          onReleaseAll() {},
        });

        let hadPulsesLastFrame = true;
        await sendComputedFrame(() => [Math.round(secR * 0.08), Math.round(secG * 0.08), Math.round(secB * 0.08)]);

        const timer = setLampInterval(async () => {
          if (isPageUnloading || lampArrayGenByPid.get(numPid) !== gen) {
            clearLampInterval(timer);
            return;
          }
          if (busy || !lampDev.opened) return;
          if (pulses.length === 0 && !hadPulsesLastFrame) return;
          busy = true;
          try {
            syncLiveLightingParams();
            const now = performance.now();
            const mmPerMs = speedMult === 1 ? 0.36 : speedMult === 3 ? 0.92 : 0.6;
            const maxDistMm = 370;
            for (let i = pulses.length - 1; i >= 0; i--) {
              if ((now - pulses[i].bornAt) * mmPerMs > maxDistMm) pulses.splice(i, 1);
            }
            const ambR = Math.round(secR * 0.08);
            const ambG = Math.round(secG * 0.08);
            const ambB = Math.round(secB * 0.08);
            if (pulses.length === 0) {
              hadPulsesLastFrame = false;
              await sendAllLampsColor(ambR, ambG, ambB, 255);
            } else {
              hadPulsesLastFrame = true;
              await sendComputedFrame((l) => {
                let beamEnv = 0;
                for (let i = 0; i < pulses.length; i++) {
                  const p = pulses[i];
                  const onRow = Math.abs(l.y - p.y) < 10.5;
                  const onCol = Math.abs(l.x - p.x) < 11.5;
                  if (!onRow && !onCol) continue;
                  const axisDist = onRow && onCol ? 0 : onRow ? Math.abs(l.x - p.x) : Math.abs(l.y - p.y);
                  const front = (now - p.bornAt) * mmPerMs;
                  const delta = front - axisDist;
                  if (delta >= -16 && delta <= 75) {
                    const wave = delta < 0 ? 1 + delta / 16 : Math.pow(1 - delta / 75, 1.6);
                    const atten = Math.max(0, 1 - front / maxDistMm);
                    beamEnv = Math.max(beamEnv, wave * atten);
                  }
                }
                if (beamEnv <= 0.01) return [ambR, ambG, ambB];
                const tip = Math.max(0, (beamEnv - 0.75) * 2.2);
                return [
                  Math.min(255, Math.round(ambR * (1 - beamEnv) + baseR * beamEnv + (255 - baseR) * tip * 0.45)),
                  Math.min(255, Math.round(ambG * (1 - beamEnv) + baseG * beamEnv + (255 - baseG) * tip * 0.45)),
                  Math.min(255, Math.round(ambB * (1 - beamEnv) + baseB * beamEnv + (255 - baseB) * tip * 0.45)),
                ];
              });
            }
          } catch {
            clearLampInterval(timer);
          } finally {
            busy = false;
          }
        }, 25);
        lampArrayTimerByPid.set(numPid, timer);
        return true;
      }

      // RAINBOW SPLASH (QMK MULTISPLASH / SteelSeries Reactive Ripple): Multi-color shockwaves on every keystroke
      if (effect === "splash") {
        ensureReactiveKeyListeners();
        await sendAllLampsColor(0, 0, 0, 0);
        const splashes = [
          { x: 120, y: 62, bornAt: performance.now(), hue0: 145 },
          { x: 235, y: 68, bornAt: performance.now() - 120, hue0: 285 },
        ];
        const spawnSplash = (lampIds) => {
          if (isPageUnloading || !lampIds || lampIds.length === 0 || lampArrayGenByPid.get(numPid) !== gen) return;
          const lamp = layout.lamps[lampIds[0]];
          if (!lamp) return;
          if (splashes.length >= 8) splashes.shift();
          splashes.push({ x: lamp.x, y: lamp.y, bornAt: performance.now(), hue0: Math.random() * 360 });
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
            if (ids) spawnSplash(ids);
          },
          onKeyUp() {},
          onLabelTrigger(label) {
            const ids = layout.byLabel.get(label);
            if (ids) spawnSplash(ids);
          },
          onReleaseAll() {},
        });

        let hadSplashLastFrame = true;
        const timer = setLampInterval(async () => {
          if (isPageUnloading || lampArrayGenByPid.get(numPid) !== gen) {
            clearLampInterval(timer);
            return;
          }
          if (busy || !lampDev.opened) return;
          if (splashes.length === 0 && !hadSplashLastFrame) return;
          busy = true;
          try {
            syncLiveLightingParams();
            const now = performance.now();
            const mmPerMs = speedMult === 1 ? 0.3 : speedMult === 3 ? 0.72 : 0.48;
            const ringWidth = 52;
            const maxRadius = 420;
            for (let i = splashes.length - 1; i >= 0; i--) {
              if ((now - splashes[i].bornAt) * mmPerMs > maxRadius) splashes.splice(i, 1);
            }
            if (splashes.length === 0) {
              hadSplashLastFrame = false;
              await sendAllLampsColor(0, 0, 0, 0);
            } else {
              hadSplashLastFrame = true;
              await sendComputedFrame((l) => {
                let rSum = 0, gSum = 0, bSum = 0;
                for (let i = 0; i < splashes.length; i++) {
                  const sp = splashes[i];
                  const age = Math.max(0, now - sp.bornAt);
                  const radius = age * mmPerMs;
                  const dist = Math.hypot(l.x - sp.x, l.y - sp.y);
                  const delta = Math.abs(dist - radius);
                  if (delta < ringWidth) {
                    const env = Math.pow(Math.cos((delta / ringWidth) * (Math.PI / 2)), 1.8) * Math.max(0, 1 - radius / maxRadius);
                    const hue = (sp.hue0 + dist * 1.5 - age * 0.1 + 36000) % 360;
                    const [cr, cg, cb] = hsvToRgb(hue, 1, env);
                    rSum += cr;
                    gSum += cg;
                    bSum += cb;
                  }
                }
                return [Math.min(255, rSum), Math.min(255, gSum), Math.min(255, bSum)];
              });
            }
          } catch {
            clearLampInterval(timer);
          } finally {
            busy = false;
          }
        }, 25);
        lampArrayTimerByPid.set(numPid, timer);
        return true;
      }

      // TYPING HEATMAP (Wootility Heatmap / QMK TYPING_HEATMAP): Keys heat up Secondary -> Primary -> White-hot as you type
      if (effect === "heatmap") {
        ensureReactiveKeyListeners();
        const heatCells = new Float32Array(lampCount);
        for (const seedLbl of ["W", "A", "S", "D", "SPACE", "F", "J", "E", "R"]) {
          const ids = layout.byLabel.get(seedLbl);
          if (ids && ids.length > 0) {
            const origin = layout.lamps[ids[0]];
            for (let i = 0; i < lampCount; i++) {
              const lm = layout.lamps[i];
              if (!lm || !origin) continue;
              const d = Math.hypot(lm.x - origin.x, lm.y - origin.y);
              if (d < 44) {
                heatCells[i] = Math.min(1, heatCells[i] + 0.48 * Math.pow(1 - d / 44, 1.5));
              }
            }
          }
        }

        const injectHeat = (lampIds) => {
          if (isPageUnloading || !lampIds || lampIds.length === 0 || lampArrayGenByPid.get(numPid) !== gen) return;
          const origin = layout.lamps[lampIds[0]];
          if (!origin) return;
          for (let i = 0; i < lampCount; i++) {
            const lm = layout.lamps[i];
            if (!lm) continue;
            const d = Math.hypot(lm.x - origin.x, lm.y - origin.y);
            if (d < 1) {
              heatCells[i] = Math.min(1, heatCells[i] + 0.58);
            } else if (d < 44) {
              heatCells[i] = Math.min(1, heatCells[i] + 0.28 * (1 - d / 44));
            }
          }
          if (origin.label) {
            const keyEl = document.querySelector(`.keycap[data-key="${CSS.escape(origin.label)}"]`);
            if (keyEl) {
              keyEl.classList.add("is-reactive-lit");
              setTimeout(() => keyEl.classList.remove("is-reactive-lit"), 220);
            }
          }
        };

        reactiveTriggerByPid.set(numPid, {
          onKeyDown(code) {
            const ids = layout.byCode.get(code);
            if (ids) injectHeat(ids);
          },
          onKeyUp() {},
          onLabelTrigger(label) {
            const ids = layout.byLabel.get(label);
            if (ids) injectHeat(ids);
          },
          onReleaseAll() {},
        });

        let lastTick = performance.now();
        const timer = setLampInterval(async () => {
          if (isPageUnloading || lampArrayGenByPid.get(numPid) !== gen) {
            clearLampInterval(timer);
            return;
          }
          if (busy || !lampDev.opened) return;
          busy = true;
          try {
            syncLiveLightingParams();
            const now = performance.now();
            const dt = Math.min(100, now - lastTick);
            lastTick = now;
            const coolPerMs = (speedMult === 1 ? 0.085 : speedMult === 3 ? 0.32 : 0.17) / 1000;
            for (let i = 0; i < lampCount; i++) {
              if (heatCells[i] > 0) {
                heatCells[i] = Math.max(0, heatCells[i] - dt * coolPerMs);
              }
            }
            await sendComputedFrame((l) => {
              const h = heatCells[l.id] || 0;
              if (h <= 0.005) {
                return [Math.round(secR * 0.07), Math.round(secG * 0.07), Math.round(secB * 0.07)];
              }
              if (h < 0.45) {
                const k = h / 0.45;
                return [
                  Math.round(secR * (0.07 + 0.93 * k)),
                  Math.round(secG * (0.07 + 0.93 * k)),
                  Math.round(secB * (0.07 + 0.93 * k)),
                ];
              }
              if (h < 0.82) {
                const k = (h - 0.45) / 0.37;
                return [
                  Math.round(secR * (1 - k) + baseR * k),
                  Math.round(secG * (1 - k) + baseG * k),
                  Math.round(secB * (1 - k) + baseB * k),
                ];
              }
              const k = (h - 0.82) / 0.18;
              return [
                Math.min(255, Math.round(baseR + (255 - baseR) * k * 0.72)),
                Math.min(255, Math.round(baseG + (246 - baseG) * k * 0.72)),
                Math.min(255, Math.round(baseB + (224 - baseB) * k * 0.72)),
              ];
            });
          } catch {
            clearLampInterval(timer);
          } finally {
            busy = false;
          }
        }, 30);
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
    const ifNum = Number(
      meta.interface ?? (meta.category === "keyboard-analog" || meta.category === "keyboard" ? 3 : 0)
    );
    const prodName = sanitizePlainText(
      devEntry?.productName || meta.name || "Razer Huntsman V3 Pro Tenkeyless",
      64,
      "Razer Huntsman V3 Pro Tenkeyless"
    );
    const targetLabel = document.getElementById("winUsbTargetLabel");
    const ifaceName = document.getElementById("winUsbInterfaceName");
    const zadigEntry = document.getElementById("winUsbZadigEntry");
    const miCode = document.getElementById("winUsbMiCode");
    const modalZadigEntry = document.getElementById("modalZadigEntry");
    const modalMiCode = document.getElementById("modalMiCode");
    if (targetLabel) targetLabel.textContent = `Interface ${ifNum}`;
    if (ifaceName) ifaceName.textContent = `${prodName} (Interface ${ifNum})`;
    if (zadigEntry) zadigEntry.textContent = `${prodName} (Interface ${ifNum})`;
    if (miCode) miCode.textContent = `Interface ${ifNum}`;
    if (modalZadigEntry) modalZadigEntry.textContent = `${prodName} (Interface ${ifNum})`;
    if (modalMiCode) modalMiCode.textContent = `Interface ${ifNum}`;
  }

  function closeHidLimitationModal(markDismissed = true) {
    const modal = document.getElementById("hidLimitationModal");
    if (!modal) return;
    if (markDismissed && hidLimitationModalPid !== null) {
      hidLimitationDismissedPids.add(Number(hidLimitationModalPid));
    }
    modal.hidden = true;
    hidLimitationModalPid = null;
  }

  function openHidLimitationModal(pidKey, { force = false } = {}) {
    const modal = document.getElementById("hidLimitationModal");
    if (!modal) return;
    const numPid = Number(pidKey ?? selectedPid);
    if (!Number.isFinite(numPid) || numPid <= 0) return;

    const hidList = webHidHandlesByPid.get(numPid) || [];
    const usbList = webUsbDevicesByPid.get(numPid) || [];
    const isConnected = bridgeDevicesByPid.has(numPid) || hidList.length > 0 || usbList.length > 0;
    const meta = Protocol25.KNOWN_DEVICES[numPid];
    if (!isConnected || !meta) return;

    if (protocolDeviceByPid.has(numPid) || bridgeDevicesByPid.has(numPid)) {
      if (hidLimitationModalPid === numPid) closeHidLimitationModal(false);
      return;
    }
    if (!force && hidLimitationDismissedPids.has(numPid)) return;

    updateWinUsbGuideLabels(numPid);

    const devEntry = devices.find((d) => Number(d.productId) === numPid);
    const devName = devEntry?.productName || meta.name || `Razer Device (0x${numPid.toString(16).toUpperCase()})`;
    const hexPid = `0x${numPid.toString(16).toUpperCase().padStart(4, "0")}`;
    const preferredIf = Number(
      meta.interface ?? (meta.category === "keyboard-analog" || meta.category === "keyboard" ? 3 : 0)
    );
    const hasControlCandidate = hidList.some((d) => deviceHasProtocol25FeatureReport(d));
    const onWin = isWindowsPlatform();

    const tagEl = document.getElementById("hidModalDeviceTag");
    const titleEl = document.getElementById("hidModalTitle");
    const descEl = document.getElementById("hidModalDesc");
    const techEl = document.getElementById("hidModalTechNote");
    const bridgeBox = document.getElementById("hidModalBridgeBox");
    const modalBridgeBtn = document.getElementById("btnModalConnectBridge");
    const modalDismissBtn = document.getElementById("btnModalDismiss");

    if (tagEl) {
      tagEl.textContent = `${devName} · PID ${hexPid} · Interface MI_0${preferredIf}`;
    }
    if (bridgeBox) {
      bridgeBox.hidden = !onWin;
    }
    if (modalBridgeBtn) {
      modalBridgeBtn.hidden = !onWin;
      modalBridgeBtn.classList.toggle("is-primary", onWin);
    }
    if (modalDismissBtn) {
      modalDismissBtn.classList.toggle("is-primary", !onWin);
    }

    if (onWin && !hasControlCandidate) {
      if (titleEl) titleEl.textContent = "Enable Local USB Bridge for Onboard Memory Save";
      if (descEl) {
        descEl.textContent =
          `Your ${devName}'s current firmware hides USB Interface ${preferredIf} (MI_0${preferredIf}) from Windows WebHID and blocks WebUSB claimInterface on HID class 0x03. Download & run websynapse-bridge.cmd below (zero admin rights, zero Zadig, zero install) to unlock full onboard slot saving.`;
      }
      if (techEl) {
        techEl.textContent =
          `Technical detail: MI_0${preferredIf} declares HID Feature (Constant) and bInterfaceClass=0x03 (protected HID class in Chromium WebUSB). websynapse-bridge.cmd talks natively to HidUsb / WinUSB on 127.0.0.1:18925.`;
      }
    } else if (hasControlCandidate || usbList.length > 0) {
      if (titleEl) titleEl.textContent = "Onboard Control Interface Did Not Respond";
      if (descEl) {
        descEl.textContent = onWin
          ? `Your ${devName} exposed a USB interface, but browser WebHID/WebUSB could not reach its Protocol 25 controller. Close Razer Synapse, or run websynapse-bridge.cmd below for direct Windows USB access.`
          : `Your ${devName} exposed a USB interface, but its Protocol 25 onboard-memory controller did not reply. Close Razer Synapse or any background RGB utility holding exclusive access, unplug and replug the USB cable, then click Re-check Device.`;
      }
      if (techEl) {
        techEl.textContent =
          `Technical detail: ${protocolProbeErrorByPid.get(numPid) || "Protocol 25 probe (0x00/0x81) did not return a valid echo."}`;
      }
    } else {
      if (titleEl) titleEl.textContent = "Onboard Control Interface Not Yet Paired";
      if (descEl) {
        descEl.textContent = onWin
          ? `Your ${devName} is currently connected in LampArray preview-only mode. Run websynapse-bridge.cmd below and click “⚡ Connect Local Bridge” to read & save onboard memory slots.`
          : `Your ${devName} is currently connected in preview-only mode because USB Interface ${preferredIf} (Protocol 25 onboard memory) is not paired yet. Click Re-check Device or Connect WebHID.`;
      }
      if (techEl) {
        techEl.textContent =
          `Technical detail: ${protocolProbeErrorByPid.get(numPid) || `USB Interface ${preferredIf} is not yet authorized.`}`;
      }
    }

    hidLimitationModalPid = numPid;
    modal.hidden = false;
    setTimeout(() => {
      (onWin ? modalBridgeBtn : modalDismissBtn)?.focus();
    }, 0);
  }

  function updateWebHidStatusUI() {
    const connDot = document.getElementById("connDot");
    const connText = document.getElementById("connText");
    const fwBadge = document.getElementById("fwBadge");
    const banner = document.getElementById("webHidStatusBanner");
    const bannerDot = document.getElementById("bannerDot");
    const bannerText = document.getElementById("bannerStatusText");
    const bridgeBtn = document.getElementById("btnConnectBridge");
    const pairBtn = document.getElementById("btnWebHidPair");
    const bannerPairBtn = document.getElementById("btnBannerPair");
    const bannerRecheckBtn = document.getElementById("btnBannerRecheck");
    const bannerWarnDetailsBtn = document.getElementById("btnBannerWarnDetails");
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
          "<strong>HTTPS Secure Context Required</strong> — Hardware access is blocked on plain <code>http://</code> origins. Access <b>https://websynap.se</b> or <code>http://localhost:18925</code>.";
      }
      if (bridgeBtn) bridgeBtn.disabled = true;
      if (pairBtn) pairBtn.disabled = true;
      if (bannerPairBtn) bannerPairBtn.hidden = true;
      if (bannerRecheckBtn) bannerRecheckBtn.hidden = true;
      if (bannerWarnDetailsBtn) bannerWarnDetailsBtn.hidden = true;
      if (guideEl) guideEl.hidden = true;
      return;
    }

    if (!navigator.hid && !navigator.usb && !localBridgeOnline && !onWin) {
      if (connDot) connDot.className = "ws-dot is-warn";
      if (connText) connText.textContent = "WebHID Unsupported";
      if (fwBadge) fwBadge.textContent = "Use Chromium";
      if (banner) banner.style.borderColor = "rgba(255,171,64,0.5)";
      if (bannerDot) bannerDot.className = "ws-dot is-warn";
      if (bannerText) {
        bannerText.innerHTML =
          "<strong>Browser Does Not Support WebHID</strong> — Please open <b>websynap.se</b> in a Chromium-based browser (Chrome, Edge, Brave, Opera, or Vivaldi) to configure your Razer devices directly from the browser.";
      }
      if (bridgeBtn) bridgeBtn.disabled = true;
      if (pairBtn) pairBtn.disabled = true;
      if (bannerPairBtn) bannerPairBtn.hidden = true;
      if (bannerRecheckBtn) bannerRecheckBtn.hidden = true;
      if (bannerWarnDetailsBtn) bannerWarnDetailsBtn.hidden = true;
      if (guideEl) guideEl.hidden = true;
      return;
    }

    const livePids = new Set([
      ...bridgeDevicesByPid.keys(),
      ...webHidHandlesByPid.keys(),
      ...webUsbDevicesByPid.keys(),
    ]);
    const liveCount = livePids.size;
    if (liveCount > 0 && hasCompatibleDevice()) {
      const anyHasFeatureReport0 = Array.from(webHidHandlesByPid.values()).some((list) =>
        list.some((d) => deviceHasProtocol25FeatureReport(d))
      );
      const anyHasBridge = bridgeDevicesByPid.size > 0;
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
        if (hidLimitationModalPid === selPid) closeHidLimitationModal(false);
        if (connDot) connDot.className = "ws-dot is-ok";
        const modeTitle =
          pHandle.mode === "bridge" ? "Bridge" : pHandle.mode === "webusb" ? "WebUSB" : "WebHID";
        if (connText) {
          connText.textContent = `${modeTitle} Live (${liveCount} device${liveCount > 1 ? "s" : ""})`;
        }
        const bFw = bridgeDevicesByPid.get(selPid)?.firmware;
        if (fwBadge && (fwBadge.textContent === "Click to Pair" || fwBadge.textContent === "USB" || fwBadge.textContent === "WebHID")) {
          fwBadge.textContent = bFw || "0x02 READY";
        }
        if (banner) banner.style.borderColor = "rgba(93,222,137,0.45)";
        if (bannerDot) bannerDot.className = "ws-dot is-ok";
        if (bannerText) {
          const viaLabel = escapeHtml(pHandle.label || modeTitle);
          bannerText.innerHTML = `<strong>Onboard memory control verified via ${viaLabel} (${liveCount} device${liveCount > 1 ? "s" : ""})</strong> — Protocol 25 replies OK. Slot switching, actuation and lighting are written directly to the onboard flash of <b>${safeNames}</b> and persist after closing bridge &amp; browser.`;
        }
        if (bannerWarnDetailsBtn) bannerWarnDetailsBtn.hidden = true;
        if (bannerRecheckBtn) bannerRecheckBtn.hidden = false;
        if (bannerPairBtn) {
          bannerPairBtn.textContent = navigator.hid ? "+ Pair LampArray / WebHID" : "+ Rescan USB";
        }
        if (guideEl) guideEl.hidden = true;
      } else if (probeErr) {
        if (connDot) connDot.className = "ws-dot is-warn";
        if (connText) connText.textContent = `Preview Only (${liveCount} device${liveCount > 1 ? "s" : ""})`;
        if (banner) banner.style.borderColor = "rgba(255,171,64,0.55)";
        if (bannerDot) bannerDot.className = "ws-dot is-warn";
        if (bannerText) {
          bannerText.innerHTML = `<strong>Connected — onboard memory not yet writable</strong>: ${escapeHtml(probeErr)} Until then lighting is only a live preview and nothing is saved to <b>${safeNames}</b>.`;
        }
        if (bannerWarnDetailsBtn) bannerWarnDetailsBtn.hidden = false;
        if (bannerRecheckBtn) bannerRecheckBtn.hidden = false;
        if (bannerPairBtn) {
          bannerPairBtn.textContent = onWin ? "⚡ Connect Local Bridge" : "Connect Razer Device";
        }
        if (guideEl) {
          guideEl.hidden = !onWin;
          if (onWin) guideEl.open = true;
        }
      } else {
        if (connDot) connDot.className = "ws-dot is-ok";
        if (connText) {
          connText.textContent = `USB Live (${liveCount} device${liveCount > 1 ? "s" : ""})`;
        }
        if (banner) banner.style.borderColor = "rgba(93,222,137,0.35)";
        if (bannerDot) bannerDot.className = "ws-dot is-ok";
        if (bannerText) {
          if (anyHasBridge || anyHasFeatureReport0 || anyHasWebUsb) {
            bannerText.innerHTML = `<strong>USB Connected (${liveCount} device${liveCount > 1 ? "s" : ""})</strong> — checking the Protocol 25 control interface of <b>${safeNames}</b>…`;
          } else if (anyHasLampArray) {
            bannerText.innerHTML = `<strong>USB Connected (${liveCount} device${liveCount > 1 ? "s" : ""})</strong> — Direct USB LampArray Chroma RGB active for <b>${safeNames}</b>.`;
          } else {
            bannerText.innerHTML = `<strong>USB Connected (${liveCount} device${liveCount > 1 ? "s" : ""})</strong> — USB Telemetry active for <b>${safeNames}</b>.`;
          }
        }
        if (bannerWarnDetailsBtn) bannerWarnDetailsBtn.hidden = true;
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
      if (bannerWarnDetailsBtn) bannerWarnDetailsBtn.hidden = true;
      if (bannerRecheckBtn) bannerRecheckBtn.hidden = true;
      if (bannerPairBtn) bannerPairBtn.textContent = "+ Add Another Device";
      if (guideEl) guideEl.hidden = true;
    } else {
      closeHidLimitationModal(false);
      if (connDot) connDot.className = "ws-dot is-warn";
      if (connText) connText.textContent = "No device connected";
      if (fwBadge) fwBadge.textContent = "USB";
      if (banner) banner.style.borderColor = "rgba(255,171,64,0.45)";
      if (bannerDot) bannerDot.className = "ws-dot is-warn";
      if (bannerText) {
        bannerText.innerHTML = onWin
          ? "<strong>No Razer device connected yet</strong> — Close Razer Synapse, then run <code>websynapse-bridge.cmd</code> (see Windows 1.xx Firmware Setup below) and click <b>⚡ Connect Local Bridge</b> for full onboard slot saving, or click <b>Connect WebHID</b>."
          : "<strong>No compatible Razer device detected</strong> — Connect a Razer keyboard or mouse via USB, close Razer Synapse, then click <b>Connect WebHID</b>.";
      }
      if (bannerWarnDetailsBtn) bannerWarnDetailsBtn.hidden = true;
      if (bannerRecheckBtn) bannerRecheckBtn.hidden = true;
      if (bannerPairBtn) {
        bannerPairBtn.textContent = onWin ? "⚡ Connect Local Bridge" : "⚡ Connect Razer Device";
      }
      if (guideEl) guideEl.hidden = !onWin;
    }
  }

  function getCandidateBridgeUrls() {
    const urls = [];
    if (typeof window !== "undefined" && window.location) {
      const host = window.location.hostname || "";
      const port = window.location.port || "";
      if ((host === "localhost" || host === "127.0.0.1") && (port === "5426" || port === "18925")) {
        urls.push(window.location.origin);
      }
    }
    if (!urls.includes(DEFAULT_LOCAL_BRIDGE_URL)) {
      urls.push(DEFAULT_LOCAL_BRIDGE_URL);
    }
    return urls;
  }

  async function probeLocalBridge({ rescan = false, timeoutMs = 950 } = {}) {
    if (!window.isSecureContext) return false;
    const candidates = getCandidateBridgeUrls();
    for (const candidateUrl of candidates) {
      const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
      try {
        const resp = await fetch(`${candidateUrl}/${rescan ? "rescan" : "status"}`, {
          method: rescan ? "POST" : "GET",
          headers: { "X-WebSynapse-Bridge": "1" },
          signal: ctrl ? ctrl.signal : undefined,
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        if (!data || !data.ok) throw new Error(data?.error || "Bridge error");
        const rawList = Array.isArray(data.devices) ? data.devices : data.devices ? [data.devices] : [];
        bridgeDevicesByPid.clear();
        for (const item of rawList) {
          const pid = Number(item?.productId);
          if (Number.isFinite(pid) && pid > 0) {
            bridgeDevicesByPid.set(pid, item);
          }
        }
        activeBridgeUrl = candidateUrl;
        localBridgeOnline = true;
        localBridgeCspBlocked = false;
        return true;
      } catch {
        // try next candidate bridge URL
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
    bridgeDevicesByPid.clear();
    localBridgeOnline = false;
    return false;
  }

  async function refreshAuthorizedWebHidDevices({ rescanBridge = false } = {}) {
    try {
      await probeLocalBridge({ rescan: rescanBridge });
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

      const activeLivePids = new Set([
        ...bridgeDevicesByPid.keys(),
        ...webHidHandlesByPid.keys(),
        ...webUsbDevicesByPid.keys(),
      ]);

      for (const pid of activeLivePids) {
        const meta = Protocol25.KNOWN_DEVICES[pid] || {};
        const bridgeItem = bridgeDevicesByPid.get(pid);
        const webHidList = webHidHandlesByPid.get(pid) || [];
        const usbList = webUsbDevicesByPid.get(pid) || [];
        const sample = webHidList[0];
        const usbSample = usbList[0];
        const rawName = bridgeItem?.productName || sample?.productName || usbSample?.productName || "";
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

      const selBridgeFw = bridgeDevicesByPid.get(Number(selectedPid))?.firmware;
      if (selBridgeFw) {
        const fwBadge = document.getElementById("fwBadge");
        if (fwBadge) fwBadge.textContent = selBridgeFw;
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

  async function connectLocalBridge() {
    if (!window.isSecureContext) {
      showToast("HTTPS or localhost is required", false);
      return;
    }
    protocolDeviceByPid.clear();
    protocolProbeErrorByPid.clear();
    protocolProbeFailedSigByPid.clear();
    protocolUsbClaimBlockedByPid.clear();
    hidLimitationDismissedPids.clear();
    initialHardwareSlotSynced = false;

    const ok = await probeLocalBridge({ rescan: true, timeoutMs: 1600 });
    if (ok) {
      closeHidLimitationModal(false);
      await refreshAuthorizedWebHidDevices({ rescanBridge: false });
      if (hasCompatibleDevice()) {
        await syncActiveSlotFromHardware({ quiet: false });
        void playUiTone("success");
      } else {
        showToast("Local Bridge is running, but no compatible Razer USB device was found yet", false);
      }
      return;
    }

    if (localBridgeCspBlocked && window.location.port !== "18925" && window.location.port !== "5426") {
      showToast("Opening Local Bridge Workspace on http://localhost:18925…");
      window.location.href = "http://localhost:18925/";
      return;
    }

    const guideEl = document.getElementById("winUsbSetupGuide");
    if (guideEl) {
      guideEl.hidden = false;
      guideEl.open = true;
    }
    showToast("Local Bridge not running yet — download & double-click websynapse-bridge.cmd first", false);
  }

  function startBridgeAutoDiscovery() {
    if (bridgeAutoPollTimer || !isWindowsPlatform()) return;
    bridgeAutoPollTimer = setInterval(async () => {
      if (document.visibilityState === "hidden") return;
      if (localBridgeOnline || localBridgeCspBlocked) return;
      const selPid = Number(selectedPid);
      if (hasCompatibleDevice() && protocolDeviceByPid.has(selPid)) return;
      const found = await probeLocalBridge({ rescan: false, timeoutMs: 700 });
      if (found && bridgeDevicesByPid.size > 0) {
        protocolDeviceByPid.clear();
        protocolProbeErrorByPid.clear();
        protocolProbeFailedSigByPid.clear();
        closeHidLimitationModal(false);
        initialHardwareSlotSynced = false;
        await refreshAuthorizedWebHidDevices({ rescanBridge: false });
        showToast("Connected via Local USB Bridge");
        void playUiTone("success");
      }
    }, 3000);
  }

  async function finishDevicePairing(pickedFirst) {
    initialHardwareSlotSynced = true;
    protocolDeviceByPid.clear();
    protocolProbeErrorByPid.clear();
    protocolProbeFailedSigByPid.clear();
    protocolUsbClaimBlockedByPid.clear();
    hidLimitationDismissedPids.clear();
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

  async function pairWebHidDevices() {
    if (!window.isSecureContext) {
      showToast("HTTPS is required for WebHID hardware access", false);
      return;
    }
    if (!navigator.hid) {
      if (isWindowsPlatform()) return connectLocalBridge();
      showToast("WebHID requires Chrome, Edge, Brave, Opera, or Vivaldi", false);
      return;
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
    if (isWindowsPlatform() && !localBridgeOnline && !protocolDeviceByPid.has(selPid)) {
      return connectLocalBridge();
    }
    if (navigator.hid) {
      return pairWebHidDevices();
    }
    return connectLocalBridge();
  }

  async function recheckProtocol25() {
    protocolDeviceByPid.clear();
    protocolProbeErrorByPid.clear();
    protocolProbeFailedSigByPid.clear();
    protocolUsbClaimBlockedByPid.clear();
    hidLimitationDismissedPids.clear();
    await refreshAuthorizedWebHidDevices({ rescanBridge: true });
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

  async function transferProtocol25Bridge(pidNum, body90, { timeoutMs = 1200 } = {}) {
    const cmdClass = body90[6] & 0xff;
    const cmdId = body90[7] & 0xff;
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs + 900) : null;
    try {
      const resp = await fetch(`${activeBridgeUrl}/transfer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-WebSynapse-Bridge": "1",
        },
        body: JSON.stringify({
          pid: Number(pidNum),
          packet90: Array.from(body90),
          timeoutMs,
        }),
        signal: ctrl ? ctrl.signal : undefined,
      });
      if (!resp.ok) {
        throw new Error(`Local bridge HTTP ${resp.status}`);
      }
      const data = await resp.json();
      if (!data?.ok || !Array.isArray(data.rx91)) {
        throw new Error(data?.error || "Local bridge USB transfer failed");
      }
      const rx91 = data.rx91.map((b) => Number(b) & 0xff);
      const parsedRx = Protocol25.parsePacket(rx91);
      if (parsedRx) {
        parsedRx.statusName = P25_STATUS_NAMES[parsedRx.status] || parsedRx.statusName;
        if (parsedRx.commandClass !== cmdClass || parsedRx.commandId !== cmdId) {
          parsedRx.status = 0x04;
          parsedRx.statusName = "NO MATCHING REPLY";
        }
      }
      return { rx91, parsedRx };
    } catch (err) {
      localBridgeOnline = false;
      bridgeDevicesByPid.delete(Number(pidNum));
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function transferProtocol25(handle, body90, opts = {}) {
    if (handle?.mode === "bridge") {
      return transferProtocol25Bridge(handle.pid, body90, opts);
    }
    if (handle?.mode === "webusb") {
      return transferProtocol25Usb(handle.dev, handle.interfaceNumber, body90, opts);
    }
    const hidDev = handle?.mode === "webhid" ? handle.dev : handle;
    return transferProtocol25Hid(hidDev, body90, opts);
  }

  // Find (once) the Local Bridge, WebHID, or WebUSB interface that speaks Protocol 25 by sending a
  // harmless Get Firmware Version (0x00/0x81) and verifying the echoed reply.
  async function resolveProtocol25Device(pidKey) {
    const numPid = Number(pidKey);
    const hidList = webHidHandlesByPid.get(numPid) || [];
    const usbList = webUsbDevicesByPid.get(numPid) || [];
    const hasBridge = bridgeDevicesByPid.has(numPid);
    const cached = protocolDeviceByPid.get(numPid);
    if (cached) {
      if (cached.mode === "bridge" && hasBridge) return cached;
      if (cached.mode === "webhid" && hidList.includes(cached.dev)) return cached;
      if (cached.mode === "webusb" && usbList.includes(cached.dev)) return cached;
    }
    protocolDeviceByPid.delete(numPid);

    const probeSig = `${hasBridge ? 1 : 0}:${hidList.length}:${usbList.length}`;
    if (protocolProbeFailedSigByPid.get(numPid) === probeSig) {
      if (Number(selectedPid) === numPid && (hidList.length > 0 || usbList.length > 0)) {
        openHidLimitationModal(numPid);
      }
      return null;
    }
    if (protocolProbeByPid.has(numPid)) return protocolProbeByPid.get(numPid);

    const probe = (async () => {
      const meta = Protocol25.KNOWN_DEVICES[numPid] || {};
      const bDev = bridgeDevicesByPid.get(numPid);
      const tid = bDev?.tid || meta.defaultTransactionId || 0x1f;
      const preferredIf = Number(
        meta.interface ?? (meta.category === "keyboard-analog" || meta.category === "keyboard" ? 3 : 0)
      );
      const probePkt = Protocol25.Builders.getFirmwareVersion(tid);
      const body90 = validateOutgoingPacket90(probePkt.length === 91 ? probePkt.slice(1) : [...probePkt]);
      const tried = [];

      // 1. Probe Local USB Bridge first when active (supports both standard HidUsb & WinUSB on Windows)
      if (bDev) {
        try {
          const { parsedRx } = await transferProtocol25Bridge(numPid, body90, { timeoutMs: 800 });
          if (parsedRx?.status === 0x02 && parsedRx.commandClass === 0x00 && parsedRx.commandId === 0x81) {
            const handle = {
              mode: "bridge",
              pid: numPid,
              interfaceNumber: Number(bDev.interfaceNumber ?? preferredIf),
              transport: bDev.transport || "usb",
              label: `Local Bridge (${String(bDev.transport || "usb").toUpperCase()} IF#${bDev.interfaceNumber ?? preferredIf})`,
            };
            protocolDeviceByPid.set(numPid, handle);
            protocolProbeErrorByPid.delete(numPid);
            protocolProbeFailedSigByPid.delete(numPid);
            protocolUsbClaimBlockedByPid.delete(numPid);
            const [maj, min] = parsedRx.args || [];
            const fwBadge = document.getElementById("fwBadge");
            if (fwBadge) fwBadge.textContent = `v${Number(maj)}.${String(Number(min) || 0).padStart(2, "0")}`;
            console.info(
              `[websynap.se] Verified Protocol 25 via ${handle.label} for PID 0x${numPid.toString(16)} (FW v${maj}.${String(min ?? 0).padStart(2, "0")})`
            );
            return handle;
          }
          tried.push(`Bridge → ${parsedRx?.statusName || "no reply"}`);
        } catch (bErr) {
          tried.push(`Bridge → ${bErr?.message || bErr}`);
        }
      }

      // 2. Probe WebHID collections (zero-install path on macOS/Linux and 2.xx / 8KHz Windows firmware)
      const hidCandidates = hidList
        .filter((d) => d.vendorId === Protocol25.RAZER_VENDOR_ID)
        .filter((d) => (d.collections || []).some((c) => c.usagePage !== 0x0059 && c.usagePage < 0xff00))
        .sort((a, b) => scoreWebHidCollection(b) - scoreWebHidCollection(a));

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

      // 3. Probe WebUSB handles if any non-HID vendor-specific interface is exposed
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
                return handle;
              }
            } catch (ifErr) {
              tried.push(`WebUSB IF#${ifNum} → ${ifErr?.message || ifErr}`);
            }
          }
        } catch (uErr) {
          tried.push(`WebUSB open → ${uErr?.message || uErr}`);
        }
      }

      const devName = meta.name || `Razer Device (0x${numPid.toString(16).toUpperCase()})`;
      const hasControlCandidate = hidList.some((d) => deviceHasProtocol25FeatureReport(d));
      let msg;
      if (isWindowsPlatform() && !hasControlCandidate) {
        msg = `${devName}'s current firmware hides USB Interface ${preferredIf} (MI_0${preferredIf}) from Windows WebHID. Run websynapse-bridge.cmd (zero admin, zero Zadig, zero install) and click “⚡ Connect Local Bridge” to enable onboard slot saving.`;
      } else if (hasControlCandidate || usbList.length > 0) {
        msg = isWindowsPlatform()
          ? "the device's Protocol 25 control interface did not reply in browser mode. Close Razer Synapse, or run websynapse-bridge.cmd and click “⚡ Connect Local Bridge”."
          : "the device's Protocol 25 control interface did not respond. Close Razer Synapse or other RGB tools, unplug/replug the device, and click Re-check.";
      } else {
        msg = isWindowsPlatform()
          ? `Protocol 25 USB Interface ${preferredIf} requires websynapse-bridge.cmd on this firmware. Download & run websynapse-bridge.cmd below, then click “⚡ Connect Local Bridge”.`
          : `Protocol 25 USB Interface ${preferredIf} is not yet authorized. Click “Connect WebHID” and select your Razer device.`;
      }
      protocolProbeErrorByPid.set(numPid, msg);
      protocolProbeFailedSigByPid.set(numPid, probeSig);
      console.warn(
        `[websynap.se] PID 0x${numPid.toString(16)}: ${msg}\n  probe results: ${tried.join("; ") || "(no candidates)"}`
      );
      if (Number(selectedPid) === numPid && (hidList.length > 0 || usbList.length > 0) && Protocol25.KNOWN_DEVICES[numPid]) {
        updateWebHidStatusUI();
        openHidLimitationModal(numPid);
      }
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
            // Ensure ForceChromaCtrl (0x0F/0x10) is 0x00 so LampArray (MI_04) controls the physical LEDs
            if (Protocol25.Builders?.setForceChromaCtrl) {
              const unlockRaw = Protocol25.Builders.setForceChromaCtrl(false, body90[1] || 0x1f);
              const unlock90 = validateOutgoingPacket90(unlockRaw.length === 91 ? unlockRaw.slice(1) : unlockRaw);
              await transferProtocol25(handle, unlock90).catch(() => null);
            }
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

  function buildSlotActuationPackets(slotId, slot, onlyLabels = null) {
    const gAct = Math.round(clampNum(slot.actuationMm, 0.1, 4.0, 1.2) * 10) / 10;
    const gRt = Boolean(slot.rtEnabled);
    const gDown = Math.round(clampNum(slot.rtDownMm, 0.1, 4.0, 0.3) * 100) / 100;
    const gUp = Math.round(clampNum(slot.rtUpMm, 0.1, 4.0, 0.3) * 100) / 100;
    const gCont = slot.continuousRt !== false;
    const overrides = slot.perKeyOverrides && typeof slot.perKeyOverrides === "object" ? slot.perKeyOverrides : {};
    const packets = [];

    const appendGroupedPackets = (groupsMap) => {
      for (const grp of groupsMap.values()) {
        for (let i = 0; i < grp.keyIds.length; i += 15) {
          packets.push(
            Protocol25.Builders.setAnalogActuation({
              slotId,
              actuationMm: grp.act,
              keyIds: grp.keyIds.slice(i, i + 15),
            })
          );
        }
        for (let i = 0; i < grp.keyIds.length; i += 13) {
          packets.push(
            Protocol25.Builders.setAnalogRapidTrigger({
              slotId,
              rtEnabled: grp.rt,
              rtDownMm: grp.down,
              rtUpMm: grp.up,
              keyIds: grp.keyIds.slice(i, i + 13),
            })
          );
        }
      }
    };

    const addKeyToGroup = (groupsMap, keyId, act, rt, down, up) => {
      const sig = `${act.toFixed(1)}|${rt ? 1 : 0}|${down.toFixed(2)}|${up.toFixed(2)}`;
      let grp = groupsMap.get(sig);
      if (!grp) {
        grp = { act, rt, down, up, keyIds: [] };
        groupsMap.set(sig, grp);
      }
      grp.keyIds.push(keyId);
    };

    if (Array.isArray(onlyLabels) && onlyLabels.length > 0) {
      const seenIds = new Set();
      const groups = new Map();
      for (const kLabel of onlyLabels) {
        if (!ALL_TKL_KEY_SET.has(kLabel)) continue;
        const kId = Protocol25.keyLabelToMatrixId(kLabel);
        if (seenIds.has(kId)) continue;
        seenIds.add(kId);
        const ov = overrides[kLabel];
        const act = ov ? Math.round(clampNum(ov.act, 0.1, 4.0, gAct) * 10) / 10 : gAct;
        const rt = ov && ov.rt !== undefined ? Boolean(ov.rt) : gRt;
        const down = ov ? Math.round(clampNum(ov.down, 0.1, 4.0, gDown) * 100) / 100 : gDown;
        const up = ov ? Math.round(clampNum(ov.up, 0.1, 4.0, gUp) * 100) / 100 : gUp;
        addKeyToGroup(groups, kId, act, rt, down, up);
      }
      appendGroupedPackets(groups);
      return packets;
    }

    const overriddenIds = new Set();
    const overrideGroups = new Map();
    for (const [kLabel, ov] of Object.entries(overrides)) {
      if (!ALL_TKL_KEY_SET.has(kLabel) || !ov || typeof ov !== "object") continue;
      const kId = Protocol25.keyLabelToMatrixId(kLabel);
      overriddenIds.add(kId);
      const act = Math.round(clampNum(ov.act, 0.1, 4.0, gAct) * 10) / 10;
      const rt = ov.rt !== undefined ? Boolean(ov.rt) : gRt;
      const down = Math.round(clampNum(ov.down, 0.1, 4.0, gDown) * 100) / 100;
      const up = Math.round(clampNum(ov.up, 0.1, 4.0, gUp) * 100) / 100;
      addKeyToGroup(overrideGroups, kId, act, rt, down, up);
    }

    const globalKeyIds = ALL_TKL_ANALOG_KEY_IDS.filter((id) => !overriddenIds.has(id));
    for (let i = 0; i < globalKeyIds.length; i += 15) {
      packets.push(
        Protocol25.Builders.setAnalogActuation({
          slotId,
          actuationMm: gAct,
          keyIds: globalKeyIds.slice(i, i + 15),
        })
      );
    }
    for (let i = 0; i < globalKeyIds.length; i += 13) {
      packets.push(
        Protocol25.Builders.setAnalogRapidTrigger({
          slotId,
          rtEnabled: gRt,
          rtDownMm: gDown,
          rtUpMm: gUp,
          keyIds: globalKeyIds.slice(i, i + 13),
        })
      );
    }
    appendGroupedPackets(overrideGroups);
    packets.push(Protocol25.Builders.setContinuousRapidTrigger({ slotId, continuousRt: gCont }));
    return packets;
  }

  async function syncSlotActuationToHardware({
    slotId = getActiveDeviceProfileObj().activeSlot || 1,
    slot = getActiveSlotData(),
    onlyLabels = null,
    label = "Actuation",
    forceImmediate = false,
    quiet = false,
  } = {}) {
    if (!hasCompatibleDevice()) {
      if (!quiet) showToast("No compatible Razer device connected. Click Connect Razer Device first.", false);
      return { ok: false, error: "No compatible Razer device connected" };
    }
    persistDriverState();

    if (!uiPrefs.instantFlash && !forceImmediate) {
      if (stagedQueue.length >= 64) stagedQueue.shift();
      stagedQueue.push({
        type: "actuation-sync",
        productId: selectedPid,
        slotId,
        onlyLabels: Array.isArray(onlyLabels) ? [...onlyLabels] : null,
        label,
      });
      renderPendingApplyBar();
      renderOverviewPanels();
      updateProfileKeyBox();
      return { ok: true, staged: true };
    }

    renderProfileSlotBar();
    renderOverviewPanels();

    const packets = buildSlotActuationPackets(slotId, slot, onlyLabels);
    if (packets.length === 0) return { ok: true };

    try {
      let failed = 0;
      let lastRes = null;
      for (let i = 0; i < packets.length; i++) {
        const r = await sendRawWebHid90(Number(selectedPid), packets[i]);
        if (i === 0 && r?.logItem) prependPacketLog(r.logItem);
        if (!r?.ok) failed++;
        lastRes = r;
      }
      updateProfileKeyBox();
      if (failed > 0) {
        if (!quiet) {
          showToast(
            failed === packets.length
              ? `${label} → ${lastRes?.error || "failed"}`
              : `${label} → ${failed} of ${packets.length} actuation packets were rejected`,
            false
          );
          void playUiTone("error");
        }
        return { ok: false, failed, total: packets.length };
      }
      if (!quiet) {
        const status = lastRes?.parsedRx?.statusName || "OK";
        showToast(`${label} → ${status}`);
        void playUiTone("success");
      }
      return { ok: true, total: packets.length };
    } catch (err) {
      if (!quiet) {
        showToast(`Error: ${err.message}`, false);
        void playUiTone("error");
      }
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
    const isConnected = bridgeDevicesByPid.has(numPid) || webHidHandlesByPid.has(numPid) || webUsbDevicesByPid.has(numPid);
    if (!isConnected) {
      showToast("This device is supported. Connect it via USB and pair via Local Bridge or WebHID.", false);
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
        const ovCount = slotData.perKeyOverrides ? Object.keys(slotData.perKeyOverrides).length : 0;
        await syncSlotActuationToHardware({
          slotId,
          slot: slotData,
          onlyLabels: null,
          label: `Slot S${slotId} Actuation (${slotData.actuationMm ?? 1.2}mm${ovCount ? ` + ${ovCount} key overrides` : ""})`,
          forceImmediate: true,
        });
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
      for (const l of ALL_TKL_KEY_LABELS) {
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
    if (effectId !== 0x00 && prev?.effect && !HARDWARE_NATIVE_CHROMA_EFFECTS.has(prev.effect)) {
      return { ...prev };
    }
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
      case 0x04:
        out.effect = "wave";
        out.waveDirection = p1 === 2 ? 2 : 1;
        if (p2 > 0) out.speed = p2 <= 0x1c ? 3 : p2 >= 0x3c ? 1 : 2;
        break;
      case 0x05:
        out.effect = "reactive";
        out.speed = p2 === 1 ? 3 : p2 === 3 ? 1 : 2;
        out.color1 = c1;
        break;
      case 0x06:
        out.effect = "ripple";
        if (p2 > 0) out.speed = p2 <= 0x1c ? 3 : p2 >= 0x3c ? 1 : 2;
        out.color1 = c1;
        break;
      case 0x07:
        out.effect = "starlight";
        out.speed = p2 === 1 ? 3 : p2 === 3 ? 1 : 2;
        out.color1 = c1;
        break;
      case 0x09:
        out.effect = "fire";
        if (p2 > 0) out.speed = p2 <= 0x44 ? 3 : p2 >= 0x70 ? 1 : 2;
        break;
      case 0x0a:
        out.effect = "wheel";
        out.waveDirection = p1 === 2 ? 2 : 1;
        if (p2 > 0) out.speed = p2 <= 0x1c ? 3 : p2 >= 0x3c ? 1 : 2;
        break;
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
      const readLabels = ALL_TKL_KEY_LABELS;
      const readIds = readLabels.map((lbl) => Protocol25.keyLabelToMatrixId(lbl));
      const actByKeyId = new Map();
      const rtByKeyId = new Map();

      for (let i = 0; i < readIds.length; i += 15) {
        const chunk = readIds.slice(i, i + 15);
        const args = [0x00, n];
        for (const kId of chunk) args.push(kId, 0, 0, 0, 0);
        const act = await queryProtocol25(
          pid,
          Protocol25.buildPacket({ commandClass: 0x02, commandId: 0x99, dataSize: 2 + chunk.length * 5, args })
        );
        if (act?.args?.length >= 2 + chunk.length * 5) {
          for (let j = 0; j < chunk.length; j++) {
            const base = 2 + j * 5;
            const kId = act.args[base];
            const make = (act.args[base + 3] << 8) | act.args[base + 4];
            if (make > 0) {
              actByKeyId.set(kId, Math.round((make / P25_MM_UNITS) * 10) / 10);
            }
          }
          gotAny = true;
        }
      }

      for (let i = 0; i < readIds.length; i += 13) {
        const chunk = readIds.slice(i, i + 13);
        const args = [0x00, n];
        for (const kId of chunk) args.push(kId, 0, 0, 0, 0, 0);
        const rt = await queryProtocol25(
          pid,
          Protocol25.buildPacket({ commandClass: 0x02, commandId: 0x9a, dataSize: 2 + chunk.length * 6, args })
        );
        if (rt?.args?.length >= 2 + chunk.length * 6) {
          for (let j = 0; j < chunk.length; j++) {
            const base = 2 + j * 6;
            const kId = rt.args[base];
            const rtOn = rt.args[base + 1] === 0x01;
            const upRaw = (rt.args[base + 2] << 8) | rt.args[base + 3];
            const downRaw = (rt.args[base + 4] << 8) | rt.args[base + 5];
            rtByKeyId.set(kId, {
              rt: rtOn,
              up: upRaw > 0 ? Math.round((upRaw / P25_MM_UNITS) * 100) / 100 : (slot.rtUpMm ?? 0.3),
              down: downRaw > 0 ? Math.round((downRaw / P25_MM_UNITS) * 100) / 100 : (slot.rtDownMm ?? 0.3),
            });
          }
          gotAny = true;
        }
      }

      if (actByKeyId.size > 0) {
        const tupleCounts = new Map();
        const perKeyEntries = [];
        for (let idx = 0; idx < readLabels.length; idx++) {
          const lbl = readLabels[idx];
          const kId = readIds[idx];
          const actVal = actByKeyId.get(kId);
          if (actVal === undefined) continue;
          const rtInfo = rtByKeyId.get(kId) || {
            rt: Boolean(slot.rtEnabled),
            down: Math.round(clampNum(slot.rtDownMm, 0.1, 4.0, 0.3) * 100) / 100,
            up: Math.round(clampNum(slot.rtUpMm, 0.1, 4.0, 0.3) * 100) / 100,
          };
          const sig = `${actVal.toFixed(1)}|${rtInfo.rt ? 1 : 0}|${rtInfo.down.toFixed(2)}|${rtInfo.up.toFixed(2)}`;
          const entry = tupleCounts.get(sig) || { count: 0, act: actVal, rt: rtInfo.rt, down: rtInfo.down, up: rtInfo.up };
          entry.count++;
          tupleCounts.set(sig, entry);
          perKeyEntries.push({ lbl, sig, act: actVal, rt: rtInfo.rt, down: rtInfo.down, up: rtInfo.up });
        }

        let modeSig = null;
        let modeTuple = null;
        for (const [sig, info] of tupleCounts.entries()) {
          if (!modeTuple || info.count > modeTuple.count) {
            modeSig = sig;
            modeTuple = info;
          }
        }

        if (modeTuple) {
          slot.actuationMm = modeTuple.act;
          slot.rtEnabled = modeTuple.rt;
          slot.rtDownMm = modeTuple.down;
          slot.rtUpMm = modeTuple.up;
          const reconstructedOverrides = {};
          for (const item of perKeyEntries) {
            if (item.sig !== modeSig) {
              reconstructedOverrides[item.lbl] = {
                act: item.act,
                rt: item.rt,
                down: item.down,
                up: item.up,
              };
            }
          }
          slot.perKeyOverrides = reconstructedOverrides;
        }
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
    const activeEff = getActiveSlotData()?.lighting?.effect || "static";
    if (!HARDWARE_NATIVE_CHROMA_EFFECTS.has(activeEff) && findLampArrayDevice(pid)) {
      void applyLampArrayEffect(pid);
    }
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
        const curPid = Number(selectedPid);
        if (!protocolDeviceByPid.has(curPid) && (webHidHandlesByPid.has(curPid) || webUsbDevicesByPid.has(curPid))) {
          openHidLimitationModal(curPid, { force: true });
        }
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
      const switchedEff = sData?.lighting?.effect || "static";
      if (!HARDWARE_NATIVE_CHROMA_EFFECTS.has(switchedEff) && findLampArrayDevice(Number(selectedPid))) {
        void applyLampArrayEffect(Number(selectedPid));
      }
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
    const spdVal = Number(light.speed || 2);
    const durMult = spdVal <= 1 ? 1.65 : spdVal >= 3 ? 0.55 : 1;

    container.dataset.chromaEffect = eff;
    container.style.setProperty("--chroma-dur-mult", String(durMult));
    container.style.setProperty("--key-color-2", `rgba(${r2}, ${g2}, ${b2}, ${Math.max(0.35, scale).toFixed(2)})`);
    if (eff === "off" || scale <= 0.01) {
      container.style.setProperty("--key-color", "#6e7785");
      container.style.setProperty("--key-glow", "transparent");
      container.style.setProperty("--kbd-glow", "transparent");
    } else if (eff === "reactive" || eff === "ripple" || eff === "shockwave" || eff === "splash" || eff === "heatmap") {
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
            syncToolbarSelectionChips(selectedKeys.size === 0 ? "all" : "");
            focusedRemapKey = keyId;
            const remapIn = document.getElementById("txtRemapTargetKey");
            if (remapIn) remapIn.value = keyId;
            syncRemapControlsForFocusedKey();
            syncActuationControlsForSelection();
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

  function syncActuationControlsForSelection() {
    const slot = getActiveSlotData();
    const selList = Array.from(selectedKeys);
    let displayAct = slot.actuationMm ?? 1.2;
    let displayRt = Boolean(slot.rtEnabled);
    let displayDown = slot.rtDownMm ?? 0.3;
    let displayUp = slot.rtUpMm ?? 0.3;

    if (selList.length > 0) {
      const firstKey = selList[0];
      const ov = slot.perKeyOverrides?.[firstKey];
      if (ov) {
        displayAct = ov.act ?? displayAct;
        displayRt = ov.rt !== undefined ? Boolean(ov.rt) : displayRt;
        displayDown = ov.down ?? displayDown;
        displayUp = ov.up ?? displayUp;
      }
    }

    const rngAct = document.getElementById("rngActuation");
    if (rngAct) {
      rngAct.value = displayAct;
      updateRangeFill(rngAct);
      updateActuationVisuals(displayAct);
    }
    const chkRt = document.getElementById("chkRapidTrigger");
    if (chkRt) chkRt.checked = displayRt;
    syncSwitchTile("tileRtEnable", displayRt);

    const chkCont = document.getElementById("chkContinuousRt");
    const contVal = slot.continuousRt !== false;
    if (chkCont) chkCont.checked = contVal;
    syncSwitchTile("tileRtContinuous", contVal);

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

  const CUSTOM_SWATCHES_STORAGE_KEY = "websynapse.customSwatches.v1";
  const NON_COLOR_CHROMA_EFFECTS = new Set(["off", "wave", "spectrum", "wheel", "fire", "disco", "spiral", "splash"]);
  const DUAL_COLOR_CHROMA_EFFECTS = new Set([
    "breathingDual",
    "scanner",
    "aurora",
    "gradient",
    "customWave",
    "sunset",
    "comet",
    "sonar",
    "ember",
    "raindrops",
    "equalizer",
    "shockwave",
    "heatmap",
  ]);
  let activeChromaColorChannel = 1;
  const chromaPickerHsv = {
    1: { h: 151, s: 1, v: 0.902 },
    2: { h: 191, s: 1, v: 1 },
  };

  function loadCustomSwatches() {
    try {
      const raw = localStorage.getItem(CUSTOM_SWATCHES_STORAGE_KEY);
      if (!raw) return [];
      const arr = safeJsonParse(raw, 4096);
      if (!Array.isArray(arr)) return [];
      const seen = new Set();
      const out = [];
      for (const item of arr) {
        const safe = parseFlexibleHex(item);
        if (safe && !seen.has(safe) && out.length < 10) {
          seen.add(safe);
          out.push(safe);
        }
      }
      return out;
    } catch {
      return [];
    }
  }

  function saveCustomSwatches(swatches) {
    try {
      localStorage.setItem(CUSTOM_SWATCHES_STORAGE_KEY, JSON.stringify(swatches.slice(0, 10)));
    } catch {
      // ignore storage quota errors
    }
  }

  let customChromaSwatches = loadCustomSwatches();
  let onCustomSwatchSelected = null;

  function renderCustomSwatches(activeHex = "") {
    const wrap = document.getElementById("customSwatchesWrap");
    if (!wrap) return;
    wrap.innerHTML = "";
    const normActive = String(activeHex || "").toLowerCase();
    customChromaSwatches.forEach((hex, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `swatch custom-swatch${hex === normActive ? " active" : ""}`;
      btn.dataset.color = hex;
      btn.style.setProperty("--sw", hex);
      btn.title = `Saved color ${hex.toUpperCase()} — Click to apply, Right-click or Shift+Click to delete`;
      btn.addEventListener("click", (ev) => {
        if (ev.shiftKey) {
          ev.preventDefault();
          customChromaSwatches.splice(idx, 1);
          saveCustomSwatches(customChromaSwatches);
          renderCustomSwatches(normActive);
          return;
        }
        if (typeof onCustomSwatchSelected === "function") {
          onCustomSwatchSelected(hex);
        }
      });
      btn.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        customChromaSwatches.splice(idx, 1);
        saveCustomSwatches(customChromaSwatches);
        renderCustomSwatches(normActive);
      });
      wrap.appendChild(btn);
    });
  }

  function syncChromaColorStudioUi({ preserveActiveInputs = false, fromHsv = false } = {}) {
    const slot = getActiveSlotData();
    const light = slot?.lighting || {};
    const c1 = sanitizeHexColor(light.color1, "#00e676");
    const c2 = sanitizeHexColor(light.color2, "#00d2ff");
    const eff = light.effect || "static";

    const inpColor1 = document.getElementById("inpChromaColor");
    const inpColor2 = document.getElementById("inpChromaColor2");
    if (inpColor1) {
      inpColor1.value = c1;
      inpColor1.hidden = activeChromaColorChannel !== 1;
    }
    if (inpColor2) {
      inpColor2.value = c2;
      inpColor2.hidden = activeChromaColorChannel !== 2;
    }

    const chip1 = document.getElementById("chipChromaColor1");
    if (chip1) chip1.style.setProperty("--chip", c1);
    const chip2 = document.getElementById("chipChromaColor2");
    if (chip2) chip2.style.setProperty("--chip", c2);
    const lbl1 = document.getElementById("lblChromaHex1");
    if (lbl1) lbl1.textContent = c1.toUpperCase();
    const lbl2 = document.getElementById("lblChromaHex2");
    if (lbl2) lbl2.textContent = c2.toUpperCase();

    document.getElementById("btnColorChannel1")?.classList.toggle("active", activeChromaColorChannel === 1);
    document.getElementById("btnColorChannel2")?.classList.toggle("active", activeChromaColorChannel === 2);

    const activeHex = activeChromaColorChannel === 2 ? c2 : c1;
    const [r, g, b] = hexToRgbTuple(activeHex, activeChromaColorChannel === 2 ? [0, 210, 255] : [0, 230, 118]);

    if (!fromHsv) {
      const curHsv = chromaPickerHsv[activeChromaColorChannel] || { h: 151, s: 1, v: 1 };
      const [hr, hg, hb] = hsvToRgb(curHsv.h, curHsv.s, curHsv.v);
      if (rgbToHex(hr, hg, hb).toLowerCase() !== activeHex.toLowerCase()) {
        chromaPickerHsv[activeChromaColorChannel] = rgbToHsv(r, g, b, curHsv.h);
      }
    }

    const hsv = chromaPickerHsv[activeChromaColorChannel] || { h: 151, s: 1, v: 1 };
    const hueDeg = Math.round(((hsv.h % 360) + 360) % 360);
    const plane = document.getElementById("chromaSvPlane");
    if (plane) {
      plane.style.setProperty("--picker-hue", String(hueDeg));
    }
    const thumb = document.getElementById("chromaSvThumb");
    if (thumb) {
      thumb.style.left = `${(hsv.s * 100).toFixed(2)}%`;
      thumb.style.top = `${((1 - hsv.v) * 100).toFixed(2)}%`;
      thumb.style.setProperty("--thumb-color", activeHex);
    }
    const rngHue = document.getElementById("rngChromaHue");
    if (rngHue) {
      rngHue.value = String(hueDeg);
      rngHue.style.setProperty("--hue-thumb", `hsl(${hueDeg}, 100%, 50%)`);
    }

    const activeEl = document.activeElement;
    const inpHex = document.getElementById("inpExactHex");
    if (inpHex && (!preserveActiveInputs || activeEl !== inpHex)) {
      inpHex.value = activeHex.toUpperCase();
      inpHex.closest(".chroma-hex-field")?.classList.remove("is-invalid");
    }
    const inpR = document.getElementById("inpExactR");
    if (inpR && (!preserveActiveInputs || activeEl !== inpR)) inpR.value = String(r);
    const inpG = document.getElementById("inpExactG");
    if (inpG && (!preserveActiveInputs || activeEl !== inpG)) inpG.value = String(g);
    const inpB = document.getElementById("inpExactB");
    if (inpB && (!preserveActiveInputs || activeEl !== inpB)) inpB.value = String(b);

    document.querySelectorAll("#swatchRow > .swatch").forEach((s) => {
      s.classList.toggle("active", (s.dataset.color || "").toLowerCase() === activeHex.toLowerCase());
    });
    renderCustomSwatches(activeHex);

    const hintEl = document.getElementById("chromaColorModeHint");
    if (hintEl) {
      if (NON_COLOR_CHROMA_EFFECTS.has(eff)) {
        hintEl.textContent =
          activeChromaColorChannel === 2
            ? "Preset effect — pick a color to switch to Dual Gradient"
            : "Preset effect — pick a color to switch to Static";
      } else if (DUAL_COLOR_CHROMA_EFFECTS.has(eff)) {
        hintEl.textContent = "Uses Primary + Secondary colors";
      } else if (activeChromaColorChannel === 2) {
        hintEl.textContent = "Secondary applies to Dual / Aurora / Gradient / Scanner";
      } else {
        hintEl.textContent = `Editing Primary (${activeHex.toUpperCase()})`;
      }
    }

    // Also sync ARGB Accessory exact color fields
    const inpAccColor = document.getElementById("inpAccColor");
    if (inpAccColor) inpAccColor.value = c1;
    const chipAcc = document.getElementById("chipAccColor");
    if (chipAcc) chipAcc.style.setProperty("--chip", c1);
    const inpAccHex = document.getElementById("inpAccHex");
    if (inpAccHex && (!preserveActiveInputs || activeEl !== inpAccHex)) {
      inpAccHex.value = c1.toUpperCase();
    }
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
    document.querySelectorAll("#effectGrid .preset-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.effect === (light.effect || "static"));
    });
    syncChromaColorStudioUi();
    document.querySelectorAll("#chromaDirGroup [data-chroma-dir]").forEach((b) => {
      b.classList.toggle("active", Number(b.dataset.chromaDir) === Number(light.waveDirection || 1));
    });
    document.querySelectorAll("#chromaSpeedGroup [data-chroma-speed]").forEach((b) => {
      b.classList.toggle("active", Number(b.dataset.chromaSpeed) === Number(light.speed || 2));
    });

    if (isKbd) {
      syncActuationControlsForSelection();

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
      row.style.gridTemplateColumns = unlinked
        ? "28px 24px 42px 78px 28px 78px minmax(0, 1fr)"
        : "28px 24px 42px 86px minmax(0, 1fr)";

      const safeStageColor = sanitizeHexColor(st.color, "#00e676");
      const safeX = clampNum(st.x, 100, 45000, 1600);
      const safeY = clampNum(st.y, 100, 45000, safeX);
      const pct = Math.max(0, Math.min(100, ((safeX - 100) / (35000 - 100)) * 100)).toFixed(1);

      row.innerHTML = `
        <input type="checkbox" class="dpi-enable-chk" ${st.enabled !== false ? "checked" : ""} title="Enable Stage ${stageNum}" />
        <label class="dpi-stage-color-wrap" title="Pick exact indicator color for Stage ${stageNum} (${safeStageColor.toUpperCase()})">
          <span class="dpi-stage-swatch" style="background:${safeStageColor};color:${safeStageColor}"></span>
          <input type="color" class="dpi-stage-color-in" value="${safeStageColor}" aria-label="Stage ${stageNum} color" />
        </label>
        <button type="button" class="dpi-editor-index" title="Click to set Stage ${stageNum} active">
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

      const stageColorIn = row.querySelector(".dpi-stage-color-in");
      const stageSwatchEl = row.querySelector(".dpi-stage-swatch");
      const stageColorWrap = row.querySelector(".dpi-stage-color-wrap");
      stageColorIn?.addEventListener("input", (ev) => {
        const nextHex = sanitizeHexColor(ev.target.value, safeStageColor);
        st.color = nextHex;
        if (stageSwatchEl) {
          stageSwatchEl.style.background = nextHex;
          stageSwatchEl.style.color = nextHex;
        }
        if (stageColorWrap) {
          stageColorWrap.title = `Pick exact indicator color for Stage ${stageNum} (${nextHex.toUpperCase()})`;
        }
      });
      stageColorIn?.addEventListener("change", (ev) => {
        st.color = sanitizeHexColor(ev.target.value, safeStageColor);
        persistDriverState();
        renderOverviewPanels();
      });

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
        syncToolbarSelectionChips(mode === "clear" ? "all" : mode);
        selectedKeys.clear();
        if (mode === "wasd") ["W", "A", "S", "D"].forEach((k) => selectedKeys.add(k));
        else if (mode === "movement") ["W", "A", "S", "D", "↑", "←", "↓", "→", "SPACE", "LSHIFT"].forEach((k) => selectedKeys.add(k));
        else if (mode === "numbers") ["1", "2", "3", "4", "5", "6"].forEach((k) => selectedKeys.add(k));
        syncActuationControlsForSelection();
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
      const slotId = getActiveDeviceProfileObj().activeSlot || 1;
      const slot = getActiveSlotData();
      const actMm = Math.round(clampNum(rngAct.value, 0.1, 4.0, 1.2) * 10) / 10;
      const rtEnabled = chkRt.checked;
      const continuousRt = chkCont.checked;
      const rtDownMm = Math.round(clampNum(rngDown.value, 0.1, 4.0, 0.3) * 100) / 100;
      const rtUpMm = Math.round(clampNum(rngUp.value, 0.1, 4.0, 0.3) * 100) / 100;

      syncSwitchTile("tileRtEnable", rtEnabled);
      syncSwitchTile("tileRtContinuous", continuousRt);
      updateActuationPresetHighlight(actMm, rtEnabled);
      slot.continuousRt = continuousRt;

      const targetLabels = selectedKeys.size > 0 ? Array.from(selectedKeys) : null;
      if (targetLabels) {
        if (!slot.perKeyOverrides) slot.perKeyOverrides = {};
        targetLabels.forEach((k) => {
          slot.perKeyOverrides[k] = { act: actMm, rt: rtEnabled, down: rtDownMm, up: rtUpMm };
        });
      } else {
        slot.actuationMm = actMm;
        slot.rtEnabled = rtEnabled;
        slot.rtDownMm = rtDownMm;
        slot.rtUpMm = rtUpMm;
      }

      renderKeyboardMatrix();
      updateSelectionScopeBadge();
      const ovCount = slot.perKeyOverrides ? Object.keys(slot.perKeyOverrides).length : 0;
      void syncSlotActuationToHardware({
        slotId,
        slot,
        onlyLabels: targetLabels,
        label: targetLabels
          ? `Per-Key Actuation (${targetLabels.slice(0, 4).join(", ")}${targetLabels.length > 4 ? "…" : ""} → ${actMm.toFixed(1)}mm)`
          : `Global Actuation (${actMm.toFixed(1)}mm, RT: ${rtEnabled ? "ON" : "OFF"}${ovCount ? `, ${ovCount} key overrides kept` : ""})`,
      });
    };

    rngAct?.addEventListener("input", () => {
      updateRangeFill(rngAct);
      updateActuationVisuals(rngAct.value);
      updateActuationPresetHighlight(Number(rngAct.value), chkRt?.checked);
    });
    rngAct?.addEventListener("change", commitActuationChange);
    chkRt?.addEventListener("change", commitActuationChange);
    chkCont?.addEventListener("change", () => {
      const slotId = getActiveDeviceProfileObj().activeSlot || 1;
      const slot = getActiveSlotData();
      const continuousRt = Boolean(chkCont.checked);
      slot.continuousRt = continuousRt;
      syncSwitchTile("tileRtContinuous", continuousRt);
      void sendPacket90(
        Protocol25.Builders.setContinuousRapidTrigger({ slotId, continuousRt }),
        `Continuous Rapid Trigger → ${continuousRt ? "ON" : "OFF"}`,
        { continuousRt }
      );
    });

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
      const slotId = getActiveDeviceProfileObj().activeSlot || 1;
      const slot = getActiveSlotData();
      const keysToReset = Array.from(selectedKeys);
      if (slot.perKeyOverrides) {
        keysToReset.forEach((k) => delete slot.perKeyOverrides[k]);
      }
      syncActuationControlsForSelection();
      renderKeyboardMatrix();
      renderOverviewPanels();
      if (keysToReset.length > 0 && hasCompatibleDevice()) {
        void syncSlotActuationToHardware({
          slotId,
          slot,
          onlyLabels: keysToReset,
          label: `Reset ${keysToReset.length} key(s) to Global (${Number(slot.actuationMm ?? 1.2).toFixed(1)}mm)`,
        });
      } else {
        persistDriverState();
        showToast("Reset selected keys to global slot actuation");
      }
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
    const sendChroma = (effect, hexColor, hexColor2, { silentParamUpdate = false } = {}) => {
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
      syncChromaColorStudioUi({ preserveActiveInputs: true });
      if (!HARDWARE_NATIVE_CHROMA_EFFECTS.has(effect)) {
        persistDriverState();
        updateProfileKeyBox();
        const pid = Number(selectedPid);
        // If this animated Studio Effect is already running on the timer loop, it automatically
        // picks up live color / brightness / speed / direction changes on the next 33ms tick!
        if (lampHostControlPids.has(pid) && activeLampEffectByPid.get(pid) === effect && lampArrayTimerByPid.has(pid)) {
          return;
        }
        void (async () => {
          let lampDev = findLampArrayDevice(pid);
          if (!lampDev && navigator.hid && window.isSecureContext) {
            try {
              const picked = await navigator.hid.requestDevice({
                filters: [{ vendorId: Protocol25.RAZER_VENDOR_ID, productId: pid, usagePage: 0x0059 }],
              });
              if (picked && picked.length > 0) {
                await refreshAuthorizedWebHidDevices();
                lampDev = findLampArrayDevice(pid);
              }
            } catch {
              // ignore user cancel
            }
          }
          if (!lampDev) {
            showToast(`Studio Effect (${effect}) requires LampArray (MI_04) access`, false);
            return;
          }
          if (!lampHostControlPids.has(pid) && Protocol25.Builders?.setForceChromaCtrl) {
            await queryProtocol25(pid, Protocol25.Builders.setForceChromaCtrl(false));
          }
          const ok = await applyLampArrayEffect(pid);
          if (!silentParamUpdate) {
            if (ok) {
              showToast(`Studio Effect (${effect}) → LIVE`);
              void playUiTone("success");
            } else {
              showToast(`Studio Effect (${effect}) failed to start`, false);
            }
          }
        })();
        return;
      }
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
          document.getElementById("inpChromaColor2")?.value || slot.lighting.color2 || "#00d2ff",
          { silentParamUpdate: true }
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
          document.getElementById("inpChromaColor2")?.value || slot.lighting.color2 || "#00d2ff",
          { silentParamUpdate: true }
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

    // Precision Chroma Color Studio (2D HSV Plane + 360° Hue + Exact HEX/RGB + Eyedropper + Swatches)
    let chromaDispatchTimer = null;
    let lastChromaDispatchTs = 0;

    const resolveColorizableEffect = (currentEff, channel) => {
      if (!NON_COLOR_CHROMA_EFFECTS.has(currentEff)) return currentEff;
      const nextEff = channel === 2 ? "gradient" : "static";
      document.querySelectorAll("#effectGrid .preset-btn").forEach((b) => {
        b.classList.toggle("active", b.dataset.effect === nextEff);
      });
      return nextEff;
    };

    const commitChromaChannelColor = (rawHex, { channel = activeChromaColorChannel, immediate = false, preserveActiveInputs = false, fromHsv = false } = {}) => {
      const hex = sanitizeHexColor(rawHex, channel === 2 ? "#00d2ff" : "#00e676");
      const slot = getActiveSlotData();
      if (!slot.lighting) {
        slot.lighting = { effect: "static", color1: "#00e676", color2: "#00d2ff", brightness: 100, speed: 2, waveDirection: 1 };
      }
      if (channel === 2) {
        slot.lighting.color2 = hex;
      } else {
        slot.lighting.color1 = hex;
      }
      const curEff = document.querySelector("#effectGrid .preset-btn.active")?.dataset.effect || slot.lighting.effect || "static";
      const targetEff = resolveColorizableEffect(curEff, channel);
      slot.lighting.effect = targetEff;

      updateChromaVisuals();
      syncChromaColorStudioUi({ preserveActiveInputs, fromHsv });

      const c1 = slot.lighting.color1 || "#00e676";
      const c2 = slot.lighting.color2 || "#00d2ff";
      const dispatchNow = () => {
        clearTimeout(chromaDispatchTimer);
        chromaDispatchTimer = null;
        lastChromaDispatchTs = performance.now();
        sendChroma(targetEff, c1, c2, { silentParamUpdate: true });
      };

      if (immediate) {
        dispatchNow();
        return;
      }
      const elapsed = performance.now() - lastChromaDispatchTs;
      if (elapsed >= 42) {
        dispatchNow();
      } else {
        clearTimeout(chromaDispatchTimer);
        chromaDispatchTimer = setTimeout(dispatchNow, Math.max(12, 42 - elapsed));
      }
    };

    onCustomSwatchSelected = (hex) => {
      commitChromaChannelColor(hex, { immediate: true });
    };

    document.getElementById("btnColorChannel1")?.addEventListener("click", () => {
      activeChromaColorChannel = 1;
      syncChromaColorStudioUi();
    });
    document.getElementById("btnColorChannel2")?.addEventListener("click", () => {
      activeChromaColorChannel = 2;
      syncChromaColorStudioUi();
    });

    document.getElementById("btnSwapChromaColors")?.addEventListener("click", () => {
      const slot = getActiveSlotData();
      if (!slot.lighting) slot.lighting = {};
      const prev1 = sanitizeHexColor(slot.lighting.color1, "#00e676");
      const prev2 = sanitizeHexColor(slot.lighting.color2, "#00d2ff");
      slot.lighting.color1 = prev2;
      slot.lighting.color2 = prev1;
      const tmpHsv = { ...chromaPickerHsv[1] };
      chromaPickerHsv[1] = { ...chromaPickerHsv[2] };
      chromaPickerHsv[2] = tmpHsv;
      const curEff = document.querySelector("#effectGrid .preset-btn.active")?.dataset.effect || slot.lighting.effect || "static";
      const targetEff = resolveColorizableEffect(curEff, activeChromaColorChannel);
      sendChroma(targetEff, prev2, prev1, { silentParamUpdate: true });
    });

    // Interactive 2D Saturation/Value (Brightness) Spectrum Plane
    const svPlane = document.getElementById("chromaSvPlane");
    if (svPlane) {
      let draggingSv = false;
      const updateFromPointer = (ev, immediate = false) => {
        const rect = svPlane.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        const s = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
        const v = Math.max(0, Math.min(1, 1 - (ev.clientY - rect.top) / rect.height));
        const hsv = chromaPickerHsv[activeChromaColorChannel] || { h: 151, s: 1, v: 1 };
        hsv.s = s;
        hsv.v = v;
        chromaPickerHsv[activeChromaColorChannel] = hsv;
        const [r, g, b] = hsvToRgb(hsv.h, hsv.s, hsv.v);
        commitChromaChannelColor(rgbToHex(r, g, b), { immediate, fromHsv: true });
      };

      svPlane.addEventListener("pointerdown", (ev) => {
        if (ev.button !== 0 && ev.pointerType === "mouse") return;
        draggingSv = true;
        try {
          svPlane.setPointerCapture(ev.pointerId);
        } catch {
          // ignore pointer capture failure
        }
        svPlane.focus({ preventScroll: true });
        updateFromPointer(ev, false);
      });
      svPlane.addEventListener("pointermove", (ev) => {
        if (!draggingSv) return;
        updateFromPointer(ev, false);
      });
      const finishSvDrag = (ev) => {
        if (!draggingSv) return;
        draggingSv = false;
        try {
          svPlane.releasePointerCapture(ev.pointerId);
        } catch {
          // ignore
        }
        updateFromPointer(ev, true);
      };
      svPlane.addEventListener("pointerup", finishSvDrag);
      svPlane.addEventListener("pointercancel", finishSvDrag);

      svPlane.addEventListener("keydown", (ev) => {
        const step = ev.shiftKey ? 0.05 : 0.01;
        const hsv = chromaPickerHsv[activeChromaColorChannel] || { h: 151, s: 1, v: 1 };
        let handled = true;
        if (ev.key === "ArrowLeft") hsv.s = Math.max(0, hsv.s - step);
        else if (ev.key === "ArrowRight") hsv.s = Math.min(1, hsv.s + step);
        else if (ev.key === "ArrowUp") hsv.v = Math.min(1, hsv.v + step);
        else if (ev.key === "ArrowDown") hsv.v = Math.max(0, hsv.v - step);
        else handled = false;
        if (handled) {
          ev.preventDefault();
          chromaPickerHsv[activeChromaColorChannel] = hsv;
          const [r, g, b] = hsvToRgb(hsv.h, hsv.s, hsv.v);
          commitChromaChannelColor(rgbToHex(r, g, b), { immediate: true, fromHsv: true });
        }
      });
    }

    // 360-degree Hue Slider
    const rngHue = document.getElementById("rngChromaHue");
    const applyHueSlider = (immediate) => {
      if (!rngHue) return;
      const hue = clampNum(rngHue.value, 0, 360, 151);
      const hsv = chromaPickerHsv[activeChromaColorChannel] || { h: hue, s: 1, v: 1 };
      hsv.h = hue;
      // If user was on pure white/black/gray (s=0 or v=0) and drags Hue, give full saturation/value so hue change is immediately visible
      if (hsv.s < 0.02) hsv.s = 1;
      if (hsv.v < 0.05) hsv.v = 1;
      chromaPickerHsv[activeChromaColorChannel] = hsv;
      const [r, g, b] = hsvToRgb(hsv.h, hsv.s, hsv.v);
      commitChromaChannelColor(rgbToHex(r, g, b), { immediate, fromHsv: true });
    };
    rngHue?.addEventListener("input", () => applyHueSlider(false));
    rngHue?.addEventListener("change", () => applyHueSlider(true));

    // Exact #RRGGBB Hex Input
    const inpExactHex = document.getElementById("inpExactHex");
    inpExactHex?.addEventListener("input", () => {
      const raw = inpExactHex.value.trim();
      const cleaned = raw.replace(/^#/, "");
      const fieldWrap = inpExactHex.closest(".chroma-hex-field");
      if (/^[0-9a-fA-F]{6}$/.test(cleaned)) {
        fieldWrap?.classList.remove("is-invalid");
        commitChromaChannelColor(`#${cleaned.toLowerCase()}`, { immediate: false, preserveActiveInputs: true });
      } else {
        fieldWrap?.classList.toggle("is-invalid", cleaned.length > 0 && !/^[0-9a-fA-F]{1,6}$/.test(cleaned));
      }
    });
    const finalizeExactHex = () => {
      if (!inpExactHex) return;
      const parsed = parseFlexibleHex(inpExactHex.value);
      const fieldWrap = inpExactHex.closest(".chroma-hex-field");
      fieldWrap?.classList.remove("is-invalid");
      if (parsed) {
        inpExactHex.value = parsed.toUpperCase();
        commitChromaChannelColor(parsed, { immediate: true });
      } else {
        syncChromaColorStudioUi();
      }
    };
    inpExactHex?.addEventListener("change", finalizeExactHex);
    inpExactHex?.addEventListener("blur", finalizeExactHex);
    inpExactHex?.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        finalizeExactHex();
      }
    });

    // Exact R / G / B (0–255) Numeric Inputs
    const inpExactR = document.getElementById("inpExactR");
    const inpExactG = document.getElementById("inpExactG");
    const inpExactB = document.getElementById("inpExactB");
    const handleExactRgbInput = (immediate) => {
      const r = clampNum(inpExactR?.value, 0, 255, 0);
      const g = clampNum(inpExactG?.value, 0, 255, 0);
      const b = clampNum(inpExactB?.value, 0, 255, 0);
      if (immediate) {
        if (inpExactR) inpExactR.value = String(Math.round(r));
        if (inpExactG) inpExactG.value = String(Math.round(g));
        if (inpExactB) inpExactB.value = String(Math.round(b));
      }
      commitChromaChannelColor(rgbToHex(Math.round(r), Math.round(g), Math.round(b)), {
        immediate,
        preserveActiveInputs: !immediate,
      });
    };
    [inpExactR, inpExactG, inpExactB].forEach((el) => {
      el?.addEventListener("input", () => handleExactRgbInput(false));
      el?.addEventListener("change", () => handleExactRgbInput(true));
    });

    // Screen Eyedropper (Chromium EyeDropper API)
    const btnEyedropper = document.getElementById("btnChromaEyedropper");
    if (btnEyedropper) {
      if (typeof window.EyeDropper !== "function") {
        btnEyedropper.hidden = true;
      } else {
        btnEyedropper.addEventListener("click", async () => {
          try {
            const dropper = new window.EyeDropper();
            const res = await dropper.open();
            const picked = parseFlexibleHex(res?.sRGBHex);
            if (picked) {
              commitChromaChannelColor(picked, { immediate: true });
              showToast(`${activeChromaColorChannel === 2 ? "Secondary" : "Primary"} color → ${picked.toUpperCase()}`);
            }
          } catch {
            // user cancelled eyedropper
          }
        });
      }
    }

    // Preset Swatches & Custom Saved Swatches
    document.querySelectorAll("#swatchRow > .swatch").forEach((sw) => {
      sw.addEventListener("click", () => {
        const c = parseFlexibleHex(sw.dataset.color);
        if (c) {
          commitChromaChannelColor(c, { immediate: true });
        }
      });
    });

    document.getElementById("btnSaveCustomSwatch")?.addEventListener("click", () => {
      const slot = getActiveSlotData();
      const hex = sanitizeHexColor(
        activeChromaColorChannel === 2 ? slot.lighting?.color2 : slot.lighting?.color1,
        "#00e676"
      );
      if (!customChromaSwatches.includes(hex)) {
        if (customChromaSwatches.length >= 10) customChromaSwatches.shift();
        customChromaSwatches.push(hex);
        saveCustomSwatches(customChromaSwatches);
      }
      renderCustomSwatches(hex);
      showToast(`Saved custom swatch ${hex.toUpperCase()}`);
    });

    // Native OS Color Dialog inputs (#inpChromaColor & #inpChromaColor2)
    document.getElementById("inpChromaColor")?.addEventListener("input", (ev) => {
      commitChromaChannelColor(ev.target.value, { channel: 1, immediate: false });
    });
    document.getElementById("inpChromaColor")?.addEventListener("change", (ev) => {
      commitChromaChannelColor(ev.target.value, { channel: 1, immediate: true });
    });
    document.getElementById("inpChromaColor2")?.addEventListener("input", (ev) => {
      commitChromaChannelColor(ev.target.value, { channel: 2, immediate: false });
    });
    document.getElementById("inpChromaColor2")?.addEventListener("change", (ev) => {
      commitChromaChannelColor(ev.target.value, { channel: 2, immediate: true });
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
        const activeEff = document.querySelector("#effectGrid .preset-btn.active")?.dataset.effect || slot.lighting.effect || "static";
        if (!HARDWARE_NATIVE_CHROMA_EFFECTS.has(activeEff) && lampHostControlPids.has(Number(selectedPid))) {
          persistDriverState();
          if (!lampArrayTimerByPid.has(Number(selectedPid))) {
            void applyLampArrayEffect(selectedPid);
          }
          return;
        }
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
      sendChroma(activeEff, document.getElementById("inpChromaColor").value, undefined, { silentParamUpdate: true });
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

    // Local Bridge + WebHID Pair & Limitation Warning Modal Buttons
    document.getElementById("btnConnectBridge")?.addEventListener("click", connectLocalBridge);
    document.getElementById("btnWebHidPair")?.addEventListener("click", pairWebHidDevices);
    document.getElementById("btnBannerPair")?.addEventListener("click", pairBannerSmart);
    document.getElementById("btnBannerRecheck")?.addEventListener("click", recheckProtocol25);
    document.getElementById("btnBannerWarnDetails")?.addEventListener("click", () => {
      openHidLimitationModal(selectedPid, { force: true });
    });
    document.getElementById("btnCloseHidModal")?.addEventListener("click", () => closeHidLimitationModal(true));
    document.getElementById("btnModalDismiss")?.addEventListener("click", () => closeHidLimitationModal(true));
    document.getElementById("btnModalRecheck")?.addEventListener("click", () => {
      closeHidLimitationModal(false);
      void recheckProtocol25();
    });
    document.getElementById("btnModalConnectBridge")?.addEventListener("click", async () => {
      closeHidLimitationModal(false);
      await connectLocalBridge();
    });
    document.getElementById("hidLimitationModal")?.addEventListener("click", (ev) => {
      if (ev.target && ev.target.id === "hidLimitationModal") {
        closeHidLimitationModal(true);
      }
    });
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") {
        const modal = document.getElementById("hidLimitationModal");
        if (modal && !modal.hidden) closeHidLimitationModal(true);
      }
    });
    document.getElementById("btnCompatBridge")?.addEventListener("click", connectLocalBridge);
    document.getElementById("btnCompatPair")?.addEventListener("click", pairWebHidDevices);
    document.getElementById("btnCompatCatalog")?.addEventListener("click", () => switchMainView("shelf"));

    // Save / Reset / Export / Import Onboard Slots
    document.getElementById("btnSaveSlot")?.addEventListener("click", async () => {
      const devProf = getActiveDeviceProfileObj();
      const slotId = devProf.activeSlot || 1;
      const slotData = getActiveSlotData();
      persistDriverState();
      const curPid = Number(selectedPid);
      const pHandle = await resolveProtocol25Device(curPid);
      if (!pHandle) {
        if (webHidHandlesByPid.has(curPid) || webUsbDevicesByPid.has(curPid)) {
          showToast("Onboard memory unavailable on this firmware/OS — changes were not flashed", false);
          void playUiTone("error");
          openHidLimitationModal(curPid, { force: true });
        } else {
          showToast("Connect a Razer device first to flash onboard slots", false);
          void playUiTone("error");
        }
        return;
      }
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
      const curPid = Number(selectedPid);
      const pHandle = await resolveProtocol25Device(curPid);
      if (!pHandle) {
        if (webHidHandlesByPid.has(curPid) || webUsbDevicesByPid.has(curPid)) {
          showToast(`Reset local preview — onboard Slot S${slotId} was not modified`, false);
          openHidLimitationModal(curPid, { force: true });
        } else {
          showToast(`Slot S${slotId} reset locally`);
        }
        return;
      }
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
        if (item.type === "actuation-sync") continue; // Handled cleanly by flashFullSlotToHardware below
        if (item.packet90) {
          await sendPacket90(item.packet90, item.label, item.slotPatch, item.statePatch, true);
        }
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

    // Shelf Local Bridge / WebHID Pair + Complete Synapse 4 Catalog Search & Category Filter
    document.getElementById("btnShelfConnectBridge")?.addEventListener("click", connectLocalBridge);
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

    const applyAccExactColor = (rawHex, immediate = true) => {
      const parsed = parseFlexibleHex(rawHex);
      if (!parsed) return;
      const slot = getActiveSlotData();
      if (!slot.lighting) slot.lighting = {};
      slot.lighting.color1 = parsed;
      const curEff = slot.lighting.effect || "wave";
      if (NON_COLOR_CHROMA_EFFECTS.has(curEff)) {
        slot.lighting.effect = "static";
        document.querySelectorAll("#accEffectRow [data-acc-effect]").forEach((b) => {
          b.classList.toggle("active", b.dataset.accEffect === "static");
        });
      }
      const chipAcc = document.getElementById("chipAccColor");
      if (chipAcc) chipAcc.style.setProperty("--chip", parsed);
      const inpAccColor = document.getElementById("inpAccColor");
      if (inpAccColor) inpAccColor.value = parsed;
      const inpAccHex = document.getElementById("inpAccHex");
      if (inpAccHex && document.activeElement !== inpAccHex) inpAccHex.value = parsed.toUpperCase();
      renderAccessoryZoneStrip();
      if (immediate) {
        sendChroma(slot.lighting.effect || "static", parsed);
      }
    };

    document.getElementById("inpAccColor")?.addEventListener("input", (ev) => {
      applyAccExactColor(ev.target.value, false);
    });
    document.getElementById("inpAccColor")?.addEventListener("change", (ev) => {
      applyAccExactColor(ev.target.value, true);
    });
    document.getElementById("inpAccHex")?.addEventListener("input", (ev) => {
      const cleaned = ev.target.value.trim().replace(/^#/, "");
      if (/^[0-9a-fA-F]{6}$/.test(cleaned)) {
        applyAccExactColor(`#${cleaned.toLowerCase()}`, false);
      }
    });
    document.getElementById("inpAccHex")?.addEventListener("change", (ev) => {
      const parsed = parseFlexibleHex(ev.target.value);
      if (parsed) {
        ev.target.value = parsed.toUpperCase();
        applyAccExactColor(parsed, true);
      } else {
        syncChromaColorStudioUi();
      }
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
    if (typeof window !== "undefined" && window.location?.port === "5426") {
      try {
        const stResp = await fetch("/api/status", { cache: "no-store" });
        if (stResp.ok) {
          const stData = await stResp.json();
          const srvProfs = stData?.state?.profilesByPid;
          if (srvProfs && typeof srvProfs === "object") {
            for (const [pidStr, srvProf] of Object.entries(srvProfs)) {
              const numPid = Number(pidStr);
              const locSlots = driverState.profilesByPid?.[numPid]?.slots;
              const srvSlots = srvProf?.slots;
              if (!locSlots || !srvSlots) continue;
              for (const [sStr, srvSlot] of Object.entries(srvSlots)) {
                const sId = Number(sStr);
                const srvEff = srvSlot?.lighting?.effect;
                const locEff = locSlots[sId]?.lighting?.effect;
                if (
                  srvEff &&
                  !HARDWARE_NATIVE_CHROMA_EFFECTS.has(srvEff) &&
                  (!locEff || HARDWARE_NATIVE_CHROMA_EFFECTS.has(locEff))
                ) {
                  locSlots[sId].lighting = { ...locSlots[sId].lighting, ...srvSlot.lighting };
                }
              }
            }
          }
        }
      } catch {
        // ignore if offline
      }
    }
    // Don't trust a cached "driver" flag — the real mode is read from the keyboard on connect.
    driverState.deviceMode = "normal";
    ensureLifecycleExitListeners();
    renderChromaBackdrop(true);
    bindEvents();
    renderThemeGallery();
    applyThemeAndPrefs(false);

    updateCompatibilityUI();
    await refreshAuthorizedWebHidDevices();
    startBridgeAutoDiscovery();
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
