/**
 * Razer Protocol 25 Packet Builder & Parser (Isomorphic: Node.js + Browser)
 * Reverse-engineered from RazerAppEngine v4.0.827:
 *   - electron/Protocol/protocol25.js
 *   - electron/Protocol/protocol25Const.js
 *   - electron/UsbRzDeviceAction.js
 *   - Devices/Restore/5426_679.json (Razer Huntsman V3 Pro TKL)
 *
 * Frame Layout (90-byte Protocol 25 body, prefixed with 1-byte HID Report ID = 91 bytes):
 *   [0]      status             (0x00=New, 0x01=Busy, 0x02=Success, 0x03=Fail, 0x04=Timeout, 0x05=NotSupported)
 *   [1]      transactionId      (0x1F for wired/Huntsman, 0xFF / 0x3F for Viper V3 Pro wireless)
 *   [2..3]   remainingPackets   (uint16 BE, default 0x0000)
 *   [4]      protocolType       (0x00)
 *   [5]      dataSize           (number of valid payload bytes in arguments[0..dataSize-1])
 *   [6]      commandClass       (0x00=Device, 0x02=Key/Button, 0x03=LED, 0x04=Sensor/DPI, 0x05=Profile, 0x07=Power, 0x0B=Analog/SnapTap, 0x0F=Chroma Matrix)
 *   [7]      commandId
 *   [8..87]  args               (80 bytes of command arguments)
 *   [88]     crc                (XOR checksum of bytes [2..87] inclusive)
 *   [89]     reserved           (0x00)
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.RazerProtocol25 = api;
    root.Protocol25 = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const RAZER_VENDOR_ID = 0x1532; // 5426

  const STATUS = {
    NEW_COMMAND: 0x00,
    BUSY: 0x01,
    SUCCESS: 0x02,
    FAILED: 0x03,
    TIMEOUT: 0x04,
    NOT_SUPPORTED: 0x05,
    CUSTOM_COMMAND_MISMATCH: 0xe1,
  };

  const STATUS_NAMES = {
    0x00: "NEW_COMMAND",
    0x01: "BUSY",
    0x02: "SUCCESS",
    0x03: "FAILED",
    0x04: "TIMEOUT",
    0x05: "NOT_SUPPORTED",
    0xe1: "CUSTOM_COMMAND_MISMATCH",
  };

  // Official Razer Onboard Profile Slot LED Colors (Slots 1..6)
  const PROFILE_SLOT_COLORS = [
    { slot: 1, name: "Slot 1 (White)", color: "#ffffff", rgb: [255, 255, 255] },
    { slot: 2, name: "Slot 2 (Red)", color: "#ff3b30", rgb: [255, 59, 48] },
    { slot: 3, name: "Slot 3 (Green)", color: "#00e676", rgb: [0, 230, 118] },
    { slot: 4, name: "Slot 4 (Blue)", color: "#007aff", rgb: [0, 122, 255] },
    { slot: 5, name: "Slot 5 (Cyan)", color: "#00d2ff", rgb: [0, 210, 255] },
    { slot: 6, name: "Slot 6 (Magenta)", color: "#d946ef", rgb: [217, 70, 239] },
  ];

  const KNOWN_DEVICES = {
    679: {
      productId: 679,
      hexPid: "0x02A7",
      name: "Razer Huntsman V3 Pro Tenkeyless",
      category: "keyboard-analog",
      protocol: "25",
      interface: 3,
      usagePage: 12,
      usage: 1,
      defaultTransactionId: 0x1f,
      reportId: 0,
      maxSlots: 6,
      features: [
        "onboard-slots",
        "per-key-actuation",
        "rapid-trigger",
        "snaptap",
        "key-remapping",
        "hypershift",
        "gaming-mode",
        "chroma",
        "polling-8k",
        "device-mode",
      ],
    },
    193: {
      productId: 193,
      hexPid: "0x00C1",
      name: "Razer Viper V3 Pro (HyperPolling Wireless)",
      category: "mouse",
      protocol: "25",
      interface: 0,
      usagePage: 1,
      usage: 2,
      defaultTransactionId: 0xff,
      reportId: 0,
      maxSlots: 5,
      features: [
        "onboard-slots",
        "dpi-stages",
        "independent-xy",
        "polling-8k",
        "sensor-angle",
        "smart-tracking",
        "dynamic-sensitivity",
        "button-remapping",
        "hypershift",
        "power-saving",
        "battery",
      ],
    },
    678: {
      productId: 678,
      hexPid: "0x02A6",
      name: "Razer Huntsman V3 Pro",
      category: "keyboard-analog",
      protocol: "25",
      interface: 3,
      usagePage: 12,
      usage: 1,
      defaultTransactionId: 0x1f,
      reportId: 0,
      maxSlots: 6,
      features: ["onboard-slots", "per-key-actuation", "rapid-trigger", "snaptap", "key-remapping", "chroma"],
    },
    680: {
      productId: 680,
      hexPid: "0x02A8",
      name: "Razer Huntsman V3 Pro Mini",
      category: "keyboard-analog",
      protocol: "25",
      interface: 3,
      usagePage: 12,
      usage: 1,
      defaultTransactionId: 0x1f,
      reportId: 0,
      maxSlots: 6,
      features: ["onboard-slots", "per-key-actuation", "rapid-trigger", "snaptap", "key-remapping", "chroma"],
    },
    192: {
      productId: 192,
      hexPid: "0x00C0",
      name: "Razer Viper V3 Pro (Wired)",
      category: "mouse",
      protocol: "25",
      interface: 0,
      usagePage: 1,
      usage: 2,
      defaultTransactionId: 0x1f,
      reportId: 0,
      maxSlots: 5,
      features: ["onboard-slots", "dpi-stages", "independent-xy", "polling-8k", "sensor-angle", "smart-tracking"],
    },
  };

  function computeCrc(packet90) {
    let crc = 0;
    for (let i = 2; i < 88; i++) {
      crc ^= packet90[i] & 0xff;
    }
    return crc & 0xff;
  }

  function buildPacket({
    commandClass,
    commandId,
    args = [],
    dataSize = null,
    transactionId = 0x1f,
    remainingPackets = 0,
    protocolType = 0x00,
    reportId = null,
  }) {
    const pkt = new Array(90).fill(0);
    const actualDataSize = dataSize !== null ? dataSize : args.length;

    pkt[0] = STATUS.NEW_COMMAND;
    pkt[1] = transactionId & 0xff;
    pkt[2] = (remainingPackets >> 8) & 0xff;
    pkt[3] = remainingPackets & 0xff;
    pkt[4] = protocolType & 0xff;
    pkt[5] = Math.min(80, Math.max(0, actualDataSize)) & 0xff;
    pkt[6] = commandClass & 0xff;
    pkt[7] = commandId & 0xff;

    for (let i = 0; i < Math.min(80, args.length); i++) {
      pkt[8 + i] = args[i] & 0xff;
    }

    pkt[88] = computeCrc(pkt);
    pkt[89] = 0x00;

    if (reportId !== null && reportId !== undefined) {
      return [reportId & 0xff, ...pkt];
    }
    return pkt;
  }

  function parsePacket(rawBytes) {
    if (!rawBytes || !rawBytes.length) {
      return { valid: false, error: "Empty packet" };
    }
    const arr = Array.from(rawBytes);
    let reportId = null;
    let body = arr;

    if (arr.length === 91) {
      reportId = arr[0];
      body = arr.slice(1);
    } else if (arr.length !== 90) {
      return { valid: false, error: `Unexpected length ${arr.length} (expected 90 or 91)`, raw: arr };
    }

    const status = body[0];
    const transactionId = body[1];
    const remainingPackets = (body[2] << 8) | body[3];
    const protocolType = body[4];
    const dataSize = body[5];
    const commandClass = body[6];
    const commandId = body[7];
    const args = body.slice(8, 8 + Math.min(80, dataSize || 80));
    const crc = body[88];
    const expectedCrc = computeCrc(body);

    return {
      valid: true,
      reportId,
      status,
      statusName: STATUS_NAMES[status] || `UNKNOWN(0x${status.toString(16)})`,
      transactionId,
      remainingPackets,
      protocolType,
      dataSize,
      commandClass,
      commandId,
      args,
      allArgs: body.slice(8, 88),
      crc,
      expectedCrc,
      crcValid: crc === expectedCrc,
      body90: body,
      report91: [reportId ?? 0, ...body],
    };
  }

  // USB HID Keycode, ASCII charCode ('A'=65..'Z'=90), or String label -> Razer Matrix Key ID lookup for Huntsman V3 Pro TKL (PID 679)
  const HID_TO_RAZER_KEY_ID = {
    0x04: 31, // A
    0x05: 50, // B
    0x06: 48, // C
    0x07: 33, // D
    0x08: 19, // E
    0x09: 34, // F
    0x0a: 35, // G
    0x0b: 36, // H
    0x0c: 24, // I
    0x0d: 37, // J
    0x0e: 38, // K
    0x0f: 39, // L
    0x10: 52, // M
    0x11: 51, // N
    0x12: 25, // O
    0x13: 26, // P
    0x14: 17, // Q
    0x15: 20, // R
    0x16: 32, // S
    0x17: 21, // T
    0x18: 23, // U
    0x19: 49, // V
    0x1a: 18, // W
    0x1b: 47, // X
    0x1c: 22, // Y
    0x1d: 46, // Z
    0x2c: 61, // Space
    0x4f: 79, // Right Arrow
    0x50: 75, // Left Arrow
    0x51: 80, // Down Arrow
    0x52: 72, // Up Arrow
  };

  const STRING_TO_RAZER_KEY_ID = {
    A: 31, B: 50, C: 48, D: 33, E: 19, F: 34, G: 35, H: 36, I: 24,
    J: 37, K: 38, L: 39, M: 52, N: 51, O: 25, P: 26, Q: 17, R: 20,
    S: 32, T: 21, U: 23, V: 49, W: 18, X: 47, Y: 22, Z: 46,
    SPACE: 61, LEFT: 75, RIGHT: 79, UP: 72, DOWN: 80,
    SHIFT: 44, LSHIFT: 44, CTRL: 58, LCTRL: 58, ALT: 60, LALT: 60, TAB: 16, ESC: 110,
  };

  const KEY_LABEL_TO_USB_HID = {
    A: 0x04, B: 0x05, C: 0x06, D: 0x07, E: 0x08, F: 0x09, G: 0x0a, H: 0x0b, I: 0x0c,
    J: 0x0d, K: 0x0e, L: 0x0f, M: 0x10, N: 0x11, O: 0x12, P: 0x13, Q: 0x14, R: 0x15,
    S: 0x16, T: 0x17, U: 0x18, V: 0x19, W: 0x1a, X: 0x1b, Y: 0x1c, Z: 0x1d,
    1: 0x1e, 2: 0x1f, 3: 0x20, 4: 0x21, 5: 0x22, 6: 0x23, 7: 0x24, 8: 0x25, 9: 0x26, 0: 0x27,
    ENTER: 0x28, ESC: 0x29, BACKSPACE: 0x2a, TAB: 0x2b, SPACE: 0x2c,
    CAPS: 0x39, F1: 0x3a, F2: 0x3b, F3: 0x3c, F4: 0x3d, F5: 0x3e, F6: 0x3f,
    F7: 0x40, F8: 0x41, F9: 0x42, F10: 0x43, F11: 0x44, F12: 0x45,
    RIGHT: 0x4f, LEFT: 0x50, DOWN: 0x51, UP: 0x52,
    LCTRL: 0xe0, CTRL: 0xe0, LSHIFT: 0xe1, SHIFT: 0xe1, LALT: 0xe2, ALT: 0xe2, WIN: 0xe3,
  };

  function resolveDefaultUsbHid(keyIdOrLabel) {
    if (typeof keyIdOrLabel === "string") {
      const up = keyIdOrLabel.trim().toUpperCase();
      if (KEY_LABEL_TO_USB_HID[up] !== undefined) return KEY_LABEL_TO_USB_HID[up];
    }
    const n = Number(keyIdOrLabel) & 0xff;
    if (n >= 65 && n <= 90) return 0x04 + (n - 65);
    if (n >= 97 && n <= 122) return 0x04 + (n - 97);
    return n || 0x04;
  }

  function resolveRazerKeyId(keyCodeOrId) {
    if (typeof keyCodeOrId === "string") {
      const up = keyCodeOrId.trim().toUpperCase();
      if (STRING_TO_RAZER_KEY_ID[up] !== undefined) return STRING_TO_RAZER_KEY_ID[up];
      if (up.length === 1 && up >= "A" && up <= "Z") {
        return STRING_TO_RAZER_KEY_ID[up];
      }
    }
    const n = Number(keyCodeOrId) & 0xff;
    // ASCII 'A' (65) .. 'Z' (90)
    if (n >= 65 && n <= 90) {
      const ch = String.fromCharCode(n);
      if (STRING_TO_RAZER_KEY_ID[ch] !== undefined) return STRING_TO_RAZER_KEY_ID[ch];
    }
    // ASCII 'a' (97) .. 'z' (122)
    if (n >= 97 && n <= 122) {
      const ch = String.fromCharCode(n - 32);
      if (STRING_TO_RAZER_KEY_ID[ch] !== undefined) return STRING_TO_RAZER_KEY_ID[ch];
    }
    return HID_TO_RAZER_KEY_ID[n] !== undefined ? HID_TO_RAZER_KEY_ID[n] : n;
  }

  const Builders = {
    getFirmwareVersion(transactionId = 0x1f) {
      return buildPacket({
        commandClass: 0x00,
        commandId: 0x81,
        dataSize: 0x02,
        args: [0x00, 0x00],
        transactionId,
      });
    },

    setDeviceMode(mode = 0x00, param = 0x00, transactionId = 0x1f) {
      return buildPacket({
        commandClass: 0x00,
        commandId: 0x04,
        dataSize: 0x02,
        args: [mode & 0xff, param & 0xff],
        transactionId,
      });
    },

    getDeviceMode(transactionId = 0x1f) {
      return buildPacket({
        commandClass: 0x00,
        commandId: 0x84,
        dataSize: 0x02,
        args: [0x00, 0x00],
        transactionId,
      });
    },

    /**
     * Onboard Memory Profile Slot Selection & Persistence (Class 0x05, Cmd 0x04 / 0x84)
     * slotId: 1..6
     */
    setActiveProfileSlot(slotId = 1, transactionId = 0x1f) {
      return buildPacket({
        commandClass: 0x05,
        commandId: 0x04,
        dataSize: 0x01,
        args: [Math.max(1, Math.min(6, Number(slotId) || 1)) & 0xff],
        transactionId,
      });
    },

    getActiveProfileSlot(transactionId = 0x1f) {
      return buildPacket({
        commandClass: 0x05,
        commandId: 0x84,
        dataSize: 0x01,
        args: [0x00],
        transactionId,
      });
    },

    /**
     * Gaming Mode / Win-Key Lock (Class 0x03, Cmd 0x00, LED ID 0x08 = Gaming Mode Indicator)
     * Accepts either boolean `enabled` or object `{ enabled, disableWin, disableAltTab, disableAltF4 }`
     */
    setGamingMode(arg = false, disableAltTab = false, disableAltF4 = false, transactionId = 0x1f) {
      const enabled =
        typeof arg === "object" && arg !== null ? Boolean(arg.enabled) : Boolean(arg);
      return buildPacket({
        commandClass: 0x03,
        commandId: 0x00,
        dataSize: 0x03,
        args: [0x01, 0x08, enabled ? 0x01 : 0x00],
        transactionId,
      });
    },

    /**
     * Snap Tap / Keyboard Kill Switch Control (Class 0x02, Cmd 0x21)
     * Verified on Huntsman V3 Pro TKL (PID 679): args = [slotId, enabled, matrixKeyA, matrixKeyB]
     */
    setSnapTap({
      slotId = 1,
      enabled = false,
      keyA = 0x04,
      keyB = 0x07,
      transactionId = 0x1f,
    } = {}) {
      const k1 = resolveRazerKeyId(keyA);
      const k2 = resolveRazerKeyId(keyB);
      return buildPacket({
        commandClass: 0x02,
        commandId: 0x21,
        dataSize: 0x04,
        args: [
          Math.max(1, Math.min(6, Number(slotId) || 1)) & 0xff,
          enabled ? 0x01 : 0x00,
          k1 & 0xff,
          k2 & 0xff,
        ],
        transactionId,
      });
    },

    /**
     * Keyboard Single Key Remapping (Class 0x02, Cmd 0x0D)
     * Accepts either `{ slotId, keyId, keyLabel, isHypershift, functionName, functionCode }` or `{ slotId, keyId, layer, fnType, fnCode, modifier }`
     */
    setKeyBinding(opts = {}) {
      const slotId = Math.max(1, Math.min(6, Number(opts.slotId) || 1)) & 0xff;
      const matrixKeyId = resolveRazerKeyId(opts.keyLabel ?? opts.keyId ?? 0x04);
      const layer =
        opts.isHypershift !== undefined
          ? opts.isHypershift
            ? 0x01
            : 0x00
          : (Number(opts.layer) || 0) & 0xff;

      let fnType = Number(opts.fnType ?? 0x02) & 0xff;
      let fnCode =
        opts.functionCode !== undefined || opts.fnCode !== undefined
          ? Number(opts.functionCode ?? opts.fnCode) & 0xff
          : resolveDefaultUsbHid(opts.keyLabel ?? opts.keyId ?? 0x04);

      if (typeof opts.functionName === "string") {
        const fnUp = opts.functionName.trim().toUpperCase();
        if (fnUp === "DEFAULT" || fnUp === "RESET") {
          fnType = 0x02;
          fnCode = resolveDefaultUsbHid(opts.keyLabel ?? opts.keyId ?? 0x04);
        } else if (fnUp.includes("DISABLE")) {
          fnType = 0x00;
          fnCode = 0x00;
        } else if (fnUp.includes("VOLUME UP")) {
          fnType = 0x0a;
          fnCode = 0xe9;
        } else if (fnUp.includes("VOLUME DOWN")) {
          fnType = 0x0a;
          fnCode = 0xea;
        } else if (fnUp.includes("MUTE")) {
          fnType = 0x0a;
          fnCode = 0xe2;
        } else if (fnUp.includes("PLAY") || fnUp.includes("PAUSE")) {
          fnType = 0x0a;
          fnCode = 0xcd;
        }
      } else if (fnCode === 0 && opts.fnType === undefined) {
        fnType = 0x02;
        fnCode = resolveDefaultUsbHid(opts.keyLabel ?? opts.keyId ?? 0x04);
      }

      const modifier = Number(opts.modifier ?? 0x00) & 0xff;
      const transactionId = opts.transactionId ?? 0x1f;

      return buildPacket({
        commandClass: 0x02,
        commandId: 0x0d,
        dataSize: 0x07,
        args: [slotId, matrixKeyId & 0xff, layer, fnType, 0x02, modifier, fnCode & 0xff],
        transactionId,
      });
    },

    /**
     * Mouse Single Button Assignment (Class 0x02, Cmd 0x0C)
     */
    setMouseButtonBinding({
      slotId = 1,
      buttonIndex = 1,
      isHypershift = false,
      functionId = 1,
      transactionId = 0x1f,
    } = {}) {
      const fn = Number(functionId) & 0xff;
      return buildPacket({
        commandClass: 0x02,
        commandId: 0x0c,
        dataSize: 0x07,
        args: [
          Math.max(1, Math.min(6, Number(slotId) || 1)) & 0xff,
          Number(buttonIndex) & 0xff,
          isHypershift ? 0x01 : 0x00,
          fn === 0 ? 0x00 : 0x01,
          0x01,
          fn,
          0x00,
        ],
        transactionId,
      });
    },

    /**
     * Multi-Key Analog Actuation Point (Class 0x02, Cmd 0x19)
     * Verified on Huntsman V3 Pro TKL (PID 679): 1.0 mm = 16380 units (4.0 mm = 65520 units).
     */
    setAnalogActuation({
      slotId = 1,
      actuationMm = 1.2,
      rtEnabled = true,
      rtDownMm = 0.3,
      rtUpMm = 0.3,
      continuousRt = true,
      keyIds = [18, 31, 32, 33, 17, 19, 20, 34, 44, 58, 61],
      transactionId = 0x1f,
    } = {}) {
      const clampedMm = Math.max(0.1, Math.min(4.0, Number(actuationMm) || 1.2));
      const breakMm = Math.max(0.1, clampedMm - 0.1);
      const makeVal = Math.round(clampedMm * 16380);
      const breakVal = Math.round(breakMm * 16380);
      const keys = (Array.isArray(keyIds) && keyIds.length > 0
        ? keyIds
        : [18, 31, 32, 33, 17, 19, 20, 34, 44, 58, 61]
      ).slice(0, 15);

      const args = [0x00, Math.max(1, Math.min(6, Number(slotId) || 1)) & 0xff];
      for (const rawKey of keys) {
        const k = typeof rawKey === "string" ? resolveRazerKeyId(rawKey) : Number(rawKey) & 0xff;
        args.push(
          k & 0xff,
          (breakVal >> 8) & 0xff,
          breakVal & 0xff,
          (makeVal >> 8) & 0xff,
          makeVal & 0xff
        );
      }

      return buildPacket({
        commandClass: 0x02,
        commandId: 0x19,
        dataSize: 2 + keys.length * 5,
        args,
        transactionId,
      });
    },

    /**
     * Multi-Key Rapid Trigger Sensitivity (Class 0x02, Cmd 0x1A)
     * Verified on Huntsman V3 Pro TKL (PID 679): 1.0 mm = 16380 units (0.3 mm = 4914 units).
     */
    setAnalogRapidTrigger({
      slotId = 1,
      rtEnabled = true,
      rtDownMm = 0.3,
      rtUpMm = 0.3,
      keyIds = [18, 31, 32, 33, 17, 19, 20, 34, 44, 58, 61],
      transactionId = 0x1f,
    } = {}) {
      const upVal = Math.round(Math.max(0.1, Math.min(4.0, Number(rtUpMm) || 0.3)) * 16380);
      const downVal = Math.round(Math.max(0.1, Math.min(4.0, Number(rtDownMm) || 0.3)) * 16380);
      const keys = (Array.isArray(keyIds) && keyIds.length > 0
        ? keyIds
        : [18, 31, 32, 33, 17, 19, 20, 34, 44, 58, 61]
      ).slice(0, 13);

      const args = [0x00, Math.max(1, Math.min(6, Number(slotId) || 1)) & 0xff];
      for (const rawKey of keys) {
        const k = typeof rawKey === "string" ? resolveRazerKeyId(rawKey) : Number(rawKey) & 0xff;
        args.push(
          k & 0xff,
          rtEnabled ? 0x01 : 0x00,
          (upVal >> 8) & 0xff,
          upVal & 0xff,
          (downVal >> 8) & 0xff,
          downVal & 0xff
        );
      }

      return buildPacket({
        commandClass: 0x02,
        commandId: 0x1a,
        dataSize: 2 + keys.length * 6,
        args,
        transactionId,
      });
    },

    /**
     * Continuous Rapid Trigger Mode (Class 0x02, Cmd 0x20)
     */
    setContinuousRapidTrigger({ slotId = 1, enabled = true, transactionId = 0x1f } = {}) {
      return buildPacket({
        commandClass: 0x02,
        commandId: 0x20,
        dataSize: 0x02,
        args: [Math.max(1, Math.min(6, Number(slotId) || 1)) & 0xff, enabled ? 0x01 : 0x00],
        transactionId,
      });
    },

    setBrightness(brightness = 255, ledId = 0x00, varStore = 0x01, transactionId = 0x1f) {
      return buildPacket({
        commandClass: 0x0f,
        commandId: 0x04,
        dataSize: 0x03,
        args: [varStore & 0xff, ledId & 0xff, brightness & 0xff],
        transactionId,
      });
    },

    setChromaEffect({
      effect = "static",
      r = 0,
      g = 230,
      b = 118,
      r2 = 0,
      g2 = 180,
      b2 = 255,
      direction = 1,
      speed = 2,
      varStore = 0x01,
      ledId = 0x00,
      transactionId = 0x1f,
    } = {}) {
      let args;
      switch (effect) {
        case "off":
          args = [varStore, ledId, 0x00, 0x00, 0x00, 0x00];
          break;
        case "static":
          args = [varStore, ledId, 0x01, 0x00, 0x00, 0x01, r & 0xff, g & 0xff, b & 0xff];
          break;
        case "breathing":
          args = [varStore, ledId, 0x02, 0x01, 0x00, 0x01, r & 0xff, g & 0xff, b & 0xff];
          break;
        case "breathingDual":
          args = [
            varStore,
            ledId,
            0x02,
            0x02,
            0x00,
            0x02,
            r & 0xff,
            g & 0xff,
            b & 0xff,
            r2 & 0xff,
            g2 & 0xff,
            b2 & 0xff,
          ];
          break;
        case "spectrum":
          args = [varStore, ledId, 0x03, 0x00, 0x00, 0x00];
          break;
        case "wave":
          args = [varStore, ledId, 0x04, direction & 0xff, 0x28, 0x00];
          break;
        case "reactive":
          args = [varStore, ledId, 0x05, 0x00, speed & 0xff, 0x01, r & 0xff, g & 0xff, b & 0xff];
          break;
        case "starlight":
          args = [varStore, ledId, 0x07, 0x01, speed & 0xff, 0x01, r & 0xff, g & 0xff, b & 0xff];
          break;
        default:
          args = [varStore, ledId, 0x01, 0x00, 0x00, 0x01, r & 0xff, g & 0xff, b & 0xff];
      }
      return buildPacket({
        commandClass: 0x0f,
        commandId: 0x02,
        dataSize: Math.max(6, args.length),
        args,
        transactionId,
      });
    },

    /**
     * Single DPI X/Y (Class 0x04, Cmd 0x05)
     */
    setDpiXY(dpiX = 1600, dpiY = 1600, varStore = 0x01, transactionId = 0x1f) {
      const args = [
        varStore & 0xff,
        (dpiX >> 8) & 0xff,
        dpiX & 0xff,
        (dpiY >> 8) & 0xff,
        dpiY & 0xff,
        0x00,
        0x00,
      ];
      return buildPacket({
        commandClass: 0x04,
        commandId: 0x05,
        dataSize: 0x07,
        args,
        transactionId,
      });
    },

    /**
     * Multi-Stage DPI Table (Class 0x04, Cmd 0x06)
     * Encodes up to 5 stages [{x, y}] + active stage index (1..5) into onboard memory
     */
    setDpiStages(stages = [], activeStageIndex = 1, varStore = 0x01, transactionId = 0x1f) {
      const validStages = stages.slice(0, 5);
      const count = Math.max(1, validStages.length);
      const active = Math.max(1, Math.min(count, activeStageIndex));
      const args = [varStore & 0xff, active & 0xff, count & 0xff];
      validStages.forEach((st, idx) => {
        const x = Number(st.x || st.dpi || 1600);
        const y = Number(st.y || st.dpi || x);
        args.push(
          (idx + 1) & 0xff,
          (x >> 8) & 0xff,
          x & 0xff,
          (y >> 8) & 0xff,
          y & 0xff,
          0x00,
          0x00
        );
      });
      return buildPacket({
        commandClass: 0x04,
        commandId: 0x06,
        dataSize: 3 + count * 7,
        args,
        transactionId,
      });
    },

    /**
     * Smart Tracking / Asymmetric Cut-Off (Class 0x0B, Cmd 0x0B)
     * Accepts `{ asymmetric, liftOff, landing }` (UI) or `{ asymmetric, symmetricLevel, liftOffLevel, landingLevel }` (Server)
     */
    setSmartTracking(opts = {}) {
      const asymmetric = Boolean(opts.asymmetric);
      const liftVal = Number(opts.liftOff ?? opts.liftOffLevel ?? 14) & 0xff;
      const landVal = Number(opts.landing ?? opts.landingLevel ?? 10) & 0xff;
      const symVal = Number(opts.symmetricLevel ?? opts.liftOff ?? 1) & 0xff;
      const transactionId = opts.transactionId ?? 0x1f;
      return buildPacket({
        commandClass: 0x0b,
        commandId: 0x0b,
        dataSize: 0x04,
        args: [
          0x01,
          0x01,
          asymmetric ? 0x01 : 0x00,
          asymmetric ? liftVal : symVal,
          asymmetric ? landVal : 0x00,
        ].slice(0, 4),
        transactionId,
      });
    },

    /**
     * Mouse Sensor Angle Tune (-44..+44 degrees) (Class 0x0B, Cmd 0x14)
     */
    setSensorAngle(arg = 0, transactionId = 0x1f) {
      const deg =
        typeof arg === "object" && arg !== null ? Number(arg.angleDeg ?? arg.angle ?? 0) : Number(arg) || 0;
      const clamped = Math.max(-44, Math.min(44, Math.round(deg)));
      const signedByte = clamped < 0 ? (256 + clamped) & 0xff : clamped & 0xff;
      return buildPacket({
        commandClass: 0x0b,
        commandId: 0x14,
        dataSize: 0x03,
        args: [0x01, 0x01, signedByte],
        transactionId,
      });
    },

    /**
     * Mouse Dynamic Sensitivity / Acceleration Mode (Class 0x0B, Cmd 0x11)
     */
    setDynamicSensitivity({ enabled = false, preset = 1, transactionId = 0x1f } = {}) {
      const mode = enabled ? Math.max(1, Math.min(4, Number(preset) || 1)) & 0xff : 0x00;
      return buildPacket({
        commandClass: 0x0b,
        commandId: 0x11,
        dataSize: 0x02,
        args: [0x01, mode],
        transactionId,
      });
    },

    /**
     * Combined Sensor Angle Rotation & Dynamic Sensitivity helper
     */
    setSensorAngleAndCurve({ angleDeg = 0, dynamicCurve = 0, transactionId = 0x1f } = {}) {
      if (dynamicCurve !== undefined && angleDeg === 0) {
        return Builders.setDynamicSensitivity({
          enabled: Number(dynamicCurve) > 0,
          preset: Number(dynamicCurve) || 1,
          transactionId,
        });
      }
      return Builders.setSensorAngle(angleDeg, transactionId);
    },

    /**
     * Wireless Idle Sleep Timeout (Class 0x07, Cmd 0x03)
     */
    setPowerSaving({ idleMinutes = 5, lowPowerPercent = 15, transactionId = 0x1f } = {}) {
      const seconds = Math.max(60, Math.min(900, Math.round((Number(idleMinutes) || 5) * 60)));
      return buildPacket({
        commandClass: 0x07,
        commandId: 0x03,
        dataSize: 0x02,
        args: [(seconds >> 8) & 0xff, seconds & 0xff],
        transactionId,
      });
    },

    /**
     * Wireless Low Power Threshold % (Class 0x07, Cmd 0x01)
     */
    setLowPowerThreshold(lowPowerPercent = 15, transactionId = 0x1f) {
      const pct = Math.max(5, Math.min(100, Number(lowPowerPercent) || 15));
      const raw = Math.ceil((pct / 100) * 255) & 0xff;
      return buildPacket({
        commandClass: 0x07,
        commandId: 0x01,
        dataSize: 0x01,
        args: [raw],
        transactionId,
      });
    },

    /**
     * USB High Speed Polling Period (Class 0x00, Cmd 0x40)
     * Verified on PID 679 & PID 193 for all polling rates (125..8000 Hz)
     */
    setPollingRate(hz = 1000, transactionId = 0x1f) {
      const codeMap = {
        8000: 0x01,
        4000: 0x02,
        2000: 0x04,
        1000: 0x08,
        500: 0x10,
        250: 0x20,
        125: 0x40,
      };
      const code = codeMap[Number(hz)] || 0x08;
      return buildPacket({
        commandClass: 0x00,
        commandId: 0x40,
        dataSize: 0x02,
        args: [0x01, code],
        transactionId,
      });
    },

    getBatteryLevel(transactionId = 0x1f) {
      return buildPacket({
        commandClass: 0x07,
        commandId: 0x80,
        dataSize: 0x02,
        args: [0x00, 0x00],
        transactionId,
      });
    },
  };

  return {
    RAZER_VENDOR_ID,
    STATUS,
    STATUS_NAMES,
    PROFILE_SLOT_COLORS,
    KNOWN_DEVICES,
    computeCrc,
    buildPacket,
    parsePacket,
    Builders,
  };
});
