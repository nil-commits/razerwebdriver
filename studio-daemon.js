"use strict";

/**
 * Background Chroma Studio Effect Daemon for Razer Local Web Driver (server.js)
 *
 * Drives all 16 Extra Studio Effects (including OS-wide interactive Typing Heatmap,
 * Crosshair Laser, and Rainbow Splash) directly over the local USB HID LampArray bridge
 * whenever no browser tab is actively streaming frames (e.g. after closing localhost:5426).
 * Automatically yields immediately whenever a browser tab sends /lamparray frames.
 */

const HARDWARE_NATIVE_CHROMA_EFFECTS = new Set([
  "off",
  "static",
  "reactive",
  "breathing",
  "breathingDual",
  "spectrum",
  "wave",
  "ripple",
  "wheel",
  "starlight",
  "fire",
]);

const EXTRA_STUDIO_EFFECTS = new Set([
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

const REACTIVE_STUDIO_EFFECTS = new Set(["shockwave", "splash", "heatmap"]);

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

function buildLampLayoutMeta(lampCount = 87) {
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
  if (byLabel.has("SCR") && !byCode.has("Pause")) byCode.set("Pause", byLabel.get("SCR"));
  if (byLabel.has("ENTER") && !byCode.has("NumpadEnter")) byCode.set("NumpadEnter", byLabel.get("ENTER"));
  if (byLabel.has("\\") && !byCode.has("IntlHash")) byCode.set("IntlHash", byLabel.get("\\"));

  const sortedIdsByX = lamps
    .slice()
    .sort((a, b) => a.x - b.x || a.y - b.y || a.id - b.id)
    .map((l) => l.id);

  return { lamps, byCode, byLabel, sortedIdsByX };
}

function sanitizeHexColor(val, fallback) {
  const cleaned = String(val ?? "").trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{6}$/.test(cleaned)) return `#${cleaned.toLowerCase()}`;
  if (/^[0-9a-fA-F]{3}$/.test(cleaned)) {
    return `#${cleaned[0]}${cleaned[0]}${cleaned[1]}${cleaned[1]}${cleaned[2]}${cleaned[2]}`.toLowerCase();
  }
  return fallback;
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

function createStudioDaemon({ callNativeBridgeFast, getDriverState, saveDriverState, targetPid = 679 }) {
  const lampCount = 87;
  const layout = buildLampLayoutMeta(lampCount);

  let started = false;
  let watchdogTimer = null;
  let renderTimer = null;
  let keyPollTimer = null;
  let browserLeaseUntil = 0;
  let activeEffectName = null;
  let activeEffectGen = 0;
  let daemonClaimsHostControl = false;
  let lastKeySeq = -1;
  let keyHookFn = null;

  function getActiveKeyboardLighting() {
    const st = getDriverState();
    const devProf = st?.profilesByPid?.[targetPid];
    if (!devProf || !devProf.slots) return null;
    const slotObj = devProf.slots[devProf.activeSlot || 1];
    return slotObj?.lighting || null;
  }

  function parseLightingParams(lt) {
    const effect = lt?.effect || "static";
    const brScale = Math.max(0, Math.min(1, Number(lt?.brightness ?? 100) / 100));
    const h1 = sanitizeHexColor(lt?.color1, "#00e676").slice(1);
    const baseR = parseInt(h1.slice(0, 2), 16) || 0;
    const baseG = parseInt(h1.slice(2, 4), 16) || 0;
    const baseB = parseInt(h1.slice(4, 6), 16) || 0;
    const h2 = sanitizeHexColor(lt?.color2, "#00d2ff").slice(1);
    const secR = parseInt(h2.slice(0, 2), 16) || 0;
    const secG = parseInt(h2.slice(2, 4), 16) || 0;
    const secB = parseInt(h2.slice(4, 6), 16) || 0;
    const speedMult = Number(lt?.speed || 2);
    const dirSign = Number(lt?.waveDirection || 1) === 2 ? -1 : 1;
    return { effect, brScale, baseR, baseG, baseB, secR, secG, secB, speedMult, dirSign };
  }

  function stopRenderLoops() {
    activeEffectGen++;
    activeEffectName = null;
    keyHookFn = null;
    if (renderTimer) {
      clearInterval(renderTimer);
      renderTimer = null;
    }
    if (keyPollTimer) {
      clearInterval(keyPollTimer);
      keyPollTimer = null;
    }
  }

  async function releaseToAutonomous() {
    stopRenderLoops();
    if (!daemonClaimsHostControl || process.platform !== "win32") return;
    daemonClaimsHostControl = false;
    try {
      const finish4 = Buffer.alloc(51);
      finish4[0] = 4;
      finish4[1] = 1;
      finish4[2] = 1;
      const auto6 = Buffer.from([6, 1]);
      await callNativeBridgeFast(
        "POST",
        "/lamparray",
        { pid: targetPid, reportsB64: [finish4.toString("base64"), auto6.toString("base64")] },
        1200
      );
    } catch {
      // ignore if bridge already closed
    }
  }

  function ensureKeyPolling() {
    if (keyPollTimer) return;
    let pollBusy = false;
    keyPollTimer = setInterval(async () => {
      if (pollBusy || !keyHookFn || Date.now() < browserLeaseUntil) return;
      pollBusy = true;
      try {
        const res = await callNativeBridgeFast("GET", `/keyevents?since=${lastKeySeq}`, null, 700);
        if (res && res.ok) {
          const prevSeq = lastKeySeq;
          if (typeof res.seq === "number") lastKeySeq = res.seq;
          if (prevSeq >= 0 && Array.isArray(res.events) && res.events.length > 0 && keyHookFn) {
            for (let i = 0; i < res.events.length; i++) {
              const ev = res.events[i];
              if (ev && ev.d && ev.c) {
                keyHookFn(ev.c);
              }
            }
          }
        }
      } catch {
        // ignore transient bridge errors
      } finally {
        pollBusy = false;
      }
    }, 16);
    if (typeof keyPollTimer.unref === "function") keyPollTimer.unref();
  }

  async function startEffectRenderer(effect) {
    stopRenderLoops();
    const gen = activeEffectGen;
    activeEffectName = effect;

    const lastSentRgbi = new Int16Array(lampCount * 4).fill(-1);
    let claimedHost = false;
    let frameBusy = false;

    const flushChangedEntries = async (changed) => {
      if (changed.length === 0 && claimedHost) return;
      const reportsB64 = [];
      if (!claimedHost) {
        reportsB64.push(Buffer.from([6, 0]).toString("base64"));
        claimedHost = true;
        daemonClaimsHostControl = true;
      }
      for (let baseIdx = 0; baseIdx < changed.length; baseIdx += 8) {
        const count = Math.min(8, changed.length - baseIdx);
        const isLast = baseIdx + 8 >= changed.length;
        const raw51 = Buffer.alloc(51);
        raw51[0] = 4;
        raw51[1] = count;
        raw51[2] = isLast ? 1 : 0;
        for (let i = 0; i < count; i++) {
          const item = changed[baseIdx + i];
          const lampId = item.id;
          raw51[3 + i * 2] = lampId & 0xff;
          raw51[3 + i * 2 + 1] = (lampId >> 8) & 0xff;
          const colOff = 19 + i * 4;
          raw51[colOff] = item.sr;
          raw51[colOff + 1] = item.sg;
          raw51[colOff + 2] = item.sb;
          raw51[colOff + 3] = item.si;
        }
        reportsB64.push(raw51.toString("base64"));
      }
      if (reportsB64.length > 0) {
        await callNativeBridgeFast("POST", "/lamparray", { pid: targetPid, reportsB64 }, 1400);
        for (let i = 0; i < changed.length; i++) {
          const it = changed[i];
          const off = it.id * 4;
          lastSentRgbi[off] = it.sr;
          lastSentRgbi[off + 1] = it.sg;
          lastSentRgbi[off + 2] = it.sb;
          lastSentRgbi[off + 3] = it.si;
        }
      }
    };

    const sendComputedFrame = async (p, computeRgbFn, minChannelDelta = 2) => {
      if (activeEffectGen !== gen || Date.now() < browserLeaseUntil) return;
      const changed = [];
      for (let idx = 0; idx < layout.sortedIdsByX.length; idx++) {
        const lampId = layout.sortedIdsByX[idx];
        const lm = layout.lamps[lampId];
        const rawRgb = computeRgbFn(lm);
        const sr = Math.round(rawRgb[0] * p.brScale) & 0xff;
        const sg = Math.round(rawRgb[1] * p.brScale) & 0xff;
        const sb = Math.round(rawRgb[2] * p.brScale) & 0xff;
        const si = 255;
        const off = lampId * 4;
        if (lastSentRgbi[off] >= 0) {
          const isTargetBlack = sr === 0 && sg === 0 && sb === 0;
          const maxDiff = Math.max(
            Math.abs(lastSentRgbi[off] - sr),
            Math.abs(lastSentRgbi[off + 1] - sg),
            Math.abs(lastSentRgbi[off + 2] - sb),
            Math.abs(lastSentRgbi[off + 3] - si)
          );
          if (maxDiff === 0 || (!isTargetBlack && maxDiff < minChannelDelta)) {
            continue;
          }
        }
        changed.push({ id: lampId, sr, sg, sb, si });
      }
      await flushChangedEntries(changed);
    };

    const sendAllColor = async (p, r, g, b, intensity = 255) => {
      if (activeEffectGen !== gen || Date.now() < browserLeaseUntil) return;
      const sr = Math.round(r * p.brScale) & 0xff;
      const sg = Math.round(g * p.brScale) & 0xff;
      const sb = Math.round(b * p.brScale) & 0xff;
      const si = intensity & 0xff;
      const changed = [];
      for (let idx = 0; idx < layout.sortedIdsByX.length; idx++) {
        const lampId = layout.sortedIdsByX[idx];
        const off = lampId * 4;
        if (
          lastSentRgbi[off] === sr &&
          lastSentRgbi[off + 1] === sg &&
          lastSentRgbi[off + 2] === sb &&
          lastSentRgbi[off + 3] === si
        ) {
          continue;
        }
        changed.push({ id: lampId, sr, sg, sb, si });
      }
      await flushChangedEntries(changed);
    };

    // Per-effect state
    let lastTick = performance.now();
    let phase = 0;
    let tAcc = 0;
    let beatAcc = 0;

    // Matrix Rain state
    const drops = Array.from({ length: 14 }, (_, idx) => ({
      x: 16 + ((idx * 37) % 334),
      y: -Math.random() * 120,
      vJitter: 0.8 + Math.random() * 0.45,
    }));

    // Raindrops state
    const puddles = [
      { x: 95, y: 52, age: 0, maxAge: 950, sec: false },
      { x: 245, y: 78, age: 320, maxAge: 950, sec: true },
    ];
    let puddleSpawnAcc = 0;

    // Equalizer state
    const eqBandCount = 14;
    const eqLevels = new Float32Array(eqBandCount).fill(0.35);
    const eqPeaks = new Float32Array(eqBandCount).fill(0.5);

    // Shockwave (Crosshair Laser) state
    const crossPulses = [];
    let hadCrossLastFrame = true;

    // Rainbow Splash state
    const splashes = [];
    let hadSplashLastFrame = true;

    // Typing Heatmap state
    const heatCells = new Float32Array(lampCount);

    if (REACTIVE_STUDIO_EFFECTS.has(effect)) {
      try {
        const cur = await callNativeBridgeFast("GET", "/keyevents?since=-1", null, 700);
        if (cur && typeof cur.seq === "number") lastKeySeq = cur.seq;
      } catch {
        // ignore
      }

      if (effect === "shockwave") {
        keyHookFn = (code) => {
          const ids = layout.byCode.get(code);
          if (!ids || ids.length === 0) return;
          const lm = layout.lamps[ids[0]];
          if (!lm) return;
          if (crossPulses.length >= 8) crossPulses.shift();
          crossPulses.push({ x: lm.x, y: lm.y, bornAt: performance.now() });
        };
      } else if (effect === "splash") {
        keyHookFn = (code) => {
          const ids = layout.byCode.get(code);
          if (!ids || ids.length === 0) return;
          const lm = layout.lamps[ids[0]];
          if (!lm) return;
          if (splashes.length >= 8) splashes.shift();
          splashes.push({ x: lm.x, y: lm.y, bornAt: performance.now(), hue0: Math.random() * 360 });
        };
      } else if (effect === "heatmap") {
        keyHookFn = (code) => {
          const ids = layout.byCode.get(code);
          if (!ids || ids.length === 0) return;
          for (let i = 0; i < ids.length; i++) {
            const id = ids[i];
            if (id >= 0 && id < lampCount) {
              heatCells[id] = Math.min(1, heatCells[id] + 0.55);
            }
          }
        };
      }
      ensureKeyPolling();
    }

    const stepFrame = async () => {
      if (frameBusy || activeEffectGen !== gen) return;
      if (Date.now() < browserLeaseUntil) {
        stopRenderLoops();
        daemonClaimsHostControl = false;
        return;
      }
      const lt = getActiveKeyboardLighting();
      const p = parseLightingParams(lt);
      if (p.effect !== effect) {
        void syncFromState();
        return;
      }

      frameBusy = true;
      try {
        const now = performance.now();
        const dt = Math.min(100, Math.max(1, now - lastTick));
        lastTick = now;
        const { baseR, baseG, baseB, secR, secG, secB, speedMult, dirSign } = p;

        if (effect === "gradient") {
          await sendComputedFrame(
            p,
            (l) => {
              const t = dirSign === 1 ? l.nx : 1 - l.nx;
              return [
                Math.round(baseR * (1 - t) + secR * t),
                Math.round(baseG * (1 - t) + secG * t),
                Math.round(baseB * (1 - t) + secB * t),
              ];
            },
            0
          );
          return;
        }

        if (effect === "rain") {
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
          await sendComputedFrame(p, (l) => {
            let headEnv = 0;
            let tailEnv = 0;
            for (let i = 0; i < activeDropCount; i++) {
              const d = drops[i];
              if (Math.abs(l.x - d.x) < 14) {
                const dy = d.y - l.y;
                if (dy >= -6 && dy <= 10) headEnv = Math.max(headEnv, 1 - Math.abs(dy) / 10);
                else if (dy > 10 && dy <= 58) tailEnv = Math.max(tailEnv, Math.pow(1 - (dy - 10) / 48, 1.8));
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
            return [Math.round(baseR * tailEnv), Math.round(baseG * tailEnv), Math.round(baseB * tailEnv)];
          });
          return;
        }

        if (effect === "scanner") {
          const radPerMs = (speedMult === 1 ? 1.5 : speedMult === 3 ? 4.2 : 2.6) / 1000;
          phase += dt * radPerMs;
          const pos = 0.5 + 0.5 * dirSign * Math.sin(phase);
          await sendComputedFrame(p, (l) => {
            const dist = Math.abs(l.nx - pos);
            if (dist > 0.26) return [0, 0, 0];
            const env = Math.pow(1 - dist / 0.26, 2.2);
            return [
              Math.round((baseR * env + secR * (1 - env) * 0.35) * env),
              Math.round((baseG * env + secG * (1 - env) * 0.35) * env),
              Math.round((baseB * env + secB * (1 - env) * 0.35) * env),
            ];
          });
          return;
        }

        if (effect === "aurora") {
          const spd = (speedMult === 1 ? 1.4 : speedMult === 3 ? 3.8 : 2.4) / 1000;
          tAcc += dt * spd;
          await sendComputedFrame(p, (l) => {
            const w1 = 0.5 + 0.5 * Math.sin(l.nx * 4.2 - dirSign * tAcc * 1.6 + Math.sin(l.ny * 3.1 + tAcc));
            const w2 = 0.45 + 0.55 * Math.cos(l.ny * 3.4 - tAcc * 1.1 + l.nx * 2.0);
            return [
              Math.round((baseR * w1 + secR * (1 - w1)) * w2),
              Math.round((baseG * w1 + secG * (1 - w1)) * w2),
              Math.round((baseB * w1 + secB * (1 - w1)) * w2),
            ];
          });
          return;
        }

        if (effect === "disco") {
          const stepMs = speedMult === 1 ? 140 : speedMult === 3 ? 55 : 85;
          beatAcc += dt / stepMs;
          const seed = Math.floor(beatAcc);
          await sendComputedFrame(p, (l) => {
            const cluster = Math.floor(l.nx * 6) + Math.floor(l.ny * 3) * 6;
            const hash = (((cluster * 73 + seed * 131 + l.id * 17) % 360) + 360) % 360;
            const pop = (cluster + seed) % 3 === 0 ? 1 : 0.28;
            return hsvToRgb(hash, 0.95, pop);
          });
          return;
        }

        if (effect === "customWave") {
          const radPerMs = (speedMult === 1 ? 1.7 : speedMult === 3 ? 4.9 : 3.1) / 1000;
          phase += dt * radPerMs;
          await sendComputedFrame(p, (l) => {
            const raw = 0.5 + 0.5 * Math.sin(l.nx * Math.PI * 2.4 - dirSign * phase + l.ny * 0.45);
            const w = raw * raw * (3 - 2 * raw);
            return [
              Math.round(baseR * w + secR * (1 - w)),
              Math.round(baseG * w + secG * (1 - w)),
              Math.round(baseB * w + secB * (1 - w)),
            ];
          });
          return;
        }

        if (effect === "spiral") {
          const degPerMs = (speedMult === 1 ? 70 : speedMult === 3 ? 215 : 135) / 1000;
          phase = (phase + dt * degPerMs) % 360;
          await sendComputedFrame(p, (l) => {
            const dx = l.x - 175;
            const dy = l.y - 65;
            const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
            const dist = Math.hypot(dx, dy);
            const hue = (angleDeg + dist * 1.45 - dirSign * phase + 36000) % 360;
            return hsvToRgb(hue, 1, 1);
          });
          return;
        }

        if (effect === "sunset") {
          const spd = (speedMult === 1 ? 1.1 : speedMult === 3 ? 3.2 : 2.0) / 1000;
          tAcc += dt * spd;
          const sunX = 0.5 + 0.22 * Math.sin(tAcc * 0.55 * dirSign);
          const sunY = 0.26;
          await sendComputedFrame(p, (l) => {
            const horizon = Math.max(0, Math.min(1, l.ny + 0.1 * Math.sin(l.nx * 4.8 - dirSign * tAcc)));
            const sunDist = Math.hypot((l.nx - sunX) * 1.75, l.ny - sunY);
            const sunCore = Math.pow(Math.max(0, 1 - sunDist / 0.44), 2.1);
            const scan = 0.8 + 0.2 * Math.sin(l.ny * 18 - tAcc * 2.6);
            return [
              Math.max(0, Math.min(255, Math.round((baseR * (1 - horizon) + secR * horizon) * scan + (255 - baseR) * sunCore * 0.55))),
              Math.max(0, Math.min(255, Math.round((baseG * (1 - horizon) + secG * horizon) * scan + (245 - baseG) * sunCore * 0.48))),
              Math.max(0, Math.min(255, Math.round((baseB * (1 - horizon) + secB * horizon) * scan + (225 - baseB) * sunCore * 0.4))),
            ];
          });
          return;
        }

        if (effect === "comet") {
          const span = 1.55;
          const unitsPerMs = (speedMult === 1 ? 0.38 : speedMult === 3 ? 1.08 : 0.68) / 1000;
          phase = (phase + dt * unitsPerMs) % span;
          const c0 = phase;
          const c1 = (phase + span * 0.5) % span;
          await sendComputedFrame(p, (l) => {
            const axis = (dirSign === 1 ? l.nx : 1 - l.nx) + l.ny * 0.16;
            const bw0 = Math.max(0, 1 - Math.abs(l.ny - 0.25) / 0.52);
            const bw1 = Math.max(0, 1 - Math.abs(l.ny - 0.78) / 0.52);
            const evalC = (cPos, bw) => {
              if (bw <= 0) return [0, 0, 0];
              let d = cPos - axis;
              if (d < -0.2) d += span;
              if (d >= -0.045 && d <= 0.045) {
                const core = (1 - Math.abs(d) / 0.045) * bw;
                return [
                  Math.round((baseR * 0.45 + 255 * 0.55) * core),
                  Math.round((baseG * 0.45 + 255 * 0.55) * core),
                  Math.round((baseB * 0.45 + 255 * 0.55) * core),
                ];
              }
              if (d > 0.045 && d <= 0.56) {
                const t = (d - 0.045) / 0.515;
                const env = Math.pow(1 - t, 1.9) * bw;
                return [
                  Math.round((baseR * (1 - t) + secR * t) * env),
                  Math.round((baseG * (1 - t) + secG * t) * env),
                  Math.round((baseB * (1 - t) + secB * t) * env),
                ];
              }
              return [0, 0, 0];
            };
            const a = evalC(c0, bw0);
            const b = evalC(c1, bw1);
            return [Math.min(255, a[0] + b[0]), Math.min(255, a[1] + b[1]), Math.min(255, a[2] + b[2])];
          });
          return;
        }

        if (effect === "sonar") {
          const periodMm = 128;
          const mmPerMs = speedMult === 1 ? 0.09 : speedMult === 3 ? 0.25 : 0.16;
          phase = (phase + dt * mmPerMs) % periodMm;
          await sendComputedFrame(p, (l) => {
            const dist = Math.hypot(l.x - 175, l.y - 65);
            const q = (((dist - dirSign * phase) % periodMm) + periodMm) % periodMm;
            const edgeAtten = Math.max(0.32, 1 - dist / 280);
            if (q < 22) {
              const crest = Math.cos((q / 22) * (Math.PI / 2)) * edgeAtten;
              return [Math.round(baseR * crest), Math.round(baseG * crest), Math.round(baseB * crest)];
            }
            if (q >= 22 && q < 74) {
              const wake = Math.pow(1 - (q - 22) / 52, 1.7) * 0.65 * edgeAtten;
              return [Math.round(secR * wake), Math.round(secG * wake), Math.round(secB * wake)];
            }
            return [Math.round(secR * 0.05), Math.round(secG * 0.05), Math.round(secB * 0.05)];
          });
          return;
        }

        if (effect === "ember") {
          const spd = (speedMult === 1 ? 0.85 : speedMult === 3 ? 2.5 : 1.55) / 1000;
          tAcc += dt * spd;
          await sendComputedFrame(p, (l) => {
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
          return;
        }

        if (effect === "raindrops") {
          const spawnIntervalMs = speedMult === 1 ? 340 : speedMult === 3 ? 125 : 210;
          const maxAgeMs = speedMult === 1 ? 1350 : speedMult === 3 ? 720 : 980;
          puddleSpawnAcc += dt;
          while (puddleSpawnAcc >= spawnIntervalMs) {
            puddleSpawnAcc -= spawnIntervalMs;
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
          await sendComputedFrame(p, (l) => {
            let rAcc = secR * 0.05;
            let gAcc = secG * 0.05;
            let bAcc = secB * 0.05;
            for (let i = 0; i < puddles.length; i++) {
              const pd = puddles[i];
              const prog = pd.age / pd.maxAge;
              const radius = prog * 56;
              const delta = Math.abs(Math.hypot(l.x - pd.x, l.y - pd.y) - radius);
              if (delta < 16) {
                const env = Math.cos((delta / 16) * (Math.PI / 2)) * Math.pow(1 - prog, 1.35);
                rAcc += (pd.sec ? secR : baseR) * env;
                gAcc += (pd.sec ? secG : baseG) * env;
                bAcc += (pd.sec ? secB : baseB) * env;
              }
            }
            return [Math.min(255, Math.round(rAcc)), Math.min(255, Math.round(gAcc)), Math.min(255, Math.round(bAcc))];
          });
          return;
        }

        if (effect === "equalizer") {
          const spd = (speedMult === 1 ? 3.2 : speedMult === 3 ? 8.6 : 5.6) / 1000;
          tAcc += dt * spd;
          for (let b = 0; b < eqBandCount; b++) {
            const bassWeight = 1 - (b / eqBandCount) * 0.25;
            const wave =
              0.48 +
              0.28 * Math.sin(tAcc * 1.9 + b * 0.72 * dirSign) +
              0.18 * Math.cos(tAcc * 3.3 - b * 1.35) +
              0.14 * Math.sin(tAcc * 5.1 + b * 2.1);
            const target = Math.max(0.08, Math.min(1, wave * bassWeight));
            eqLevels[b] = eqLevels[b] + (target - eqLevels[b]) * Math.min(1, dt * 0.022);
            if (eqLevels[b] >= eqPeaks[b]) eqPeaks[b] = eqLevels[b];
            else eqPeaks[b] = Math.max(eqLevels[b], eqPeaks[b] - dt * 0.00048);
          }
          await sendComputedFrame(p, (l) => {
            const bIdx = Math.max(0, Math.min(eqBandCount - 1, Math.floor(l.nx * eqBandCount)));
            const barHeight = 1 - l.ny;
            const lvl = eqLevels[bIdx];
            const pk = eqPeaks[bIdx];
            if (Math.abs(barHeight - pk) < 0.095 && pk > 0.16) return [secR, secG, secB];
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
          return;
        }

        if (effect === "shockwave") {
          const mmPerMs = speedMult === 1 ? 0.36 : speedMult === 3 ? 0.92 : 0.6;
          const maxDistMm = 370;
          for (let i = crossPulses.length - 1; i >= 0; i--) {
            if ((now - crossPulses[i].bornAt) * mmPerMs > maxDistMm) crossPulses.splice(i, 1);
          }
          const ambR = Math.round(secR * 0.08);
          const ambG = Math.round(secG * 0.08);
          const ambB = Math.round(secB * 0.08);
          if (crossPulses.length === 0) {
            if (hadCrossLastFrame || !claimedHost) {
              hadCrossLastFrame = false;
              await sendAllColor(p, ambR, ambG, ambB, 255);
            }
          } else {
            hadCrossLastFrame = true;
            await sendComputedFrame(p, (l) => {
              let beamEnv = 0;
              for (let i = 0; i < crossPulses.length; i++) {
                const cp = crossPulses[i];
                const onRow = Math.abs(l.y - cp.y) < 10.5;
                const onCol = Math.abs(l.x - cp.x) < 11.5;
                if (!onRow && !onCol) continue;
                const axisDist = onRow && onCol ? 0 : onRow ? Math.abs(l.x - cp.x) : Math.abs(l.y - cp.y);
                const front = (now - cp.bornAt) * mmPerMs;
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
          return;
        }

        if (effect === "splash") {
          const mmPerMs = speedMult === 1 ? 0.3 : speedMult === 3 ? 0.72 : 0.48;
          const ringWidth = 52;
          const maxRadius = 420;
          for (let i = splashes.length - 1; i >= 0; i--) {
            if ((now - splashes[i].bornAt) * mmPerMs > maxRadius) splashes.splice(i, 1);
          }
          if (splashes.length === 0) {
            if (hadSplashLastFrame || !claimedHost) {
              hadSplashLastFrame = false;
              await sendAllColor(p, 0, 0, 0, 0);
            }
          } else {
            hadSplashLastFrame = true;
            await sendComputedFrame(p, (l) => {
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
          return;
        }

        if (effect === "heatmap") {
          const coolPerMs = (speedMult === 1 ? 0.085 : speedMult === 3 ? 0.32 : 0.17) / 1000;
          for (let i = 0; i < lampCount; i++) {
            if (heatCells[i] > 0) {
              heatCells[i] = Math.max(0, heatCells[i] - dt * coolPerMs);
            }
          }
          await sendComputedFrame(p, (l) => {
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
        }
      } catch {
        // ignore transient frame error
      } finally {
        frameBusy = false;
      }
    };

    await stepFrame();
    if (activeEffectGen !== gen) return;
    const intervalMs = effect === "gradient" ? 500 : 28;
    renderTimer = setInterval(stepFrame, intervalMs);
    if (typeof renderTimer.unref === "function") renderTimer.unref();
  }

  async function syncFromState() {
    if (!started || process.platform !== "win32") return;
    const lt = getActiveKeyboardLighting();
    const effect = lt?.effect || "static";

    if (!EXTRA_STUDIO_EFFECTS.has(effect) || HARDWARE_NATIVE_CHROMA_EFFECTS.has(effect)) {
      if (activeEffectName || daemonClaimsHostControl) {
        await releaseToAutonomous();
      }
      return;
    }

    if (Date.now() < browserLeaseUntil) {
      if (activeEffectName) {
        stopRenderLoops();
        daemonClaimsHostControl = false;
      }
      return;
    }

    if (activeEffectName !== effect || !renderTimer) {
      await startEffectRenderer(effect);
    }
  }

  function noteBrowserActivity(pid, leaseMs = 4500) {
    if (pid && Number(pid) !== targetPid) return;
    browserLeaseUntil = Date.now() + leaseMs;
    if (activeEffectName) {
      stopRenderLoops();
      daemonClaimsHostControl = false;
    }
  }

  function noteBrowserLampFrame(pid) {
    noteBrowserActivity(pid, 4500);
  }

  function handoffFromBrowser({ pid, slotId, lighting } = {}) {
    if (pid && Number(pid) !== targetPid) return;
    const st = getDriverState();
    const devProf = st?.profilesByPid?.[targetPid];
    if (devProf) {
      const targetSlot = Number(slotId || devProf.activeSlot || 1);
      devProf.activeSlot = targetSlot;
      if (lighting && typeof lighting === "object") {
        devProf.slots[targetSlot] = {
          ...(devProf.slots[targetSlot] || {}),
          lighting: {
            ...(devProf.slots[targetSlot]?.lighting || {}),
            ...lighting,
          },
        };
      }
      if (typeof saveDriverState === "function") saveDriverState();
    }
    browserLeaseUntil = 0;
    void syncFromState();
  }

  function start() {
    if (started || process.platform !== "win32") return;
    started = true;
    watchdogTimer = setInterval(() => {
      void syncFromState();
    }, 850);
    if (typeof watchdogTimer.unref === "function") watchdogTimer.unref();
    void syncFromState();
  }

  async function stop() {
    started = false;
    if (watchdogTimer) {
      clearInterval(watchdogTimer);
      watchdogTimer = null;
    }
    await releaseToAutonomous();
  }

  return {
    start,
    stop,
    syncFromState,
    noteBrowserActivity,
    noteBrowserLampFrame,
    handoffFromBrowser,
    releaseToAutonomous,
  };
}

module.exports = {
  createStudioDaemon,
  EXTRA_STUDIO_EFFECTS,
  HARDWARE_NATIVE_CHROMA_EFFECTS,
};
