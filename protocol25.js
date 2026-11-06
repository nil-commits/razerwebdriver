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
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.RazerProtocol25 = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
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

    setDeviceMode(mode = 0x00, param = 0x00, transactionId = 0x00) {
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
        args: [Math.max(1, Math.min(6, slotId)) & 0xff],
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
     * Force Razer Chroma Control over Windows 11 Dynamic Lighting / LampArray (Class 0x0F, Cmd 0x10 / 0x90)
     */
    setForceChromaCtrl(enabled = 1, transactionId = 0x1f) {
      return buildPacket({
        commandClass: 0x0f,
        commandId: 0x10,
        dataSize: 0x01,
        args: [enabled ? 0x01 : 0x00],
        transactionId,
      });
    },

    getForceChromaCtrl(transactionId = 0x1f) {
      return buildPacket({
        commandClass: 0x0f,
        commandId: 0x90,
        dataSize: 0x01,
        args: [0x00],
        transactionId,
      });
    },

    /**
     * Gaming Mode / Win-Key Lock (Class 0x03, Cmd 0x00, LED ID 0x02 = Game Mode Indicator)
     */
    setGamingMode(enabled = false, disableAltTab = false, disableAltF4 = false, transactionId = 0x1f) {
      return buildPacket({
        commandClass: 0x03,
        commandId: 0x00,
        dataSize: 0x05,
        args: [
          0x01,
          0x02,
          enabled ? 0x01 : 0x00,
          disableAltTab ? 0x01 : 0x00,
          disableAltF4 ? 0x01 : 0x00,
        ],
        transactionId,
      });
    },

    /**
     * Key / Mouse Button Remapping (Class 0x02, Cmd 0x0C)
     * layer: 0x00 = Standard, 0x01 = Hypershift
     */
    setKeyBinding({
      slotId = 1,
      keyId = 0x04,
      layer = 0x00,
      fnType = 0x01,
      fnCode = 0x04,
      modifier = 0x00,
      transactionId = 0x1f,
    } = {}) {
      return buildPacket({
        commandClass: 0x02,
        commandId: 0x0c,
        dataSize: 0x07,
        args: [
          slotId & 0xff,
          keyId & 0xff,
          layer & 0xff,
          fnType & 0xff,
          0x02,
          modifier & 0xff,
          fnCode & 0xff,
        ],
        transactionId,
      });
    },

    /**
     * Per-Key or Global Analog Actuation & Rapid Trigger (Class 0x0B, Cmd 0x02 / 0x04)
     */
    setAnalogActuation({
      slotId = 1,
      actuationMm = 1.2,
      rtEnabled = true,
      rtDownMm = 0.3,
      rtUpMm = 0.3,
      continuousRt = true,
      keyCount = 0,
      transactionId = 0x1f,
    } = {}) {
      const actUnits = Math.round(actuationMm * 10) & 0xff;
      const downUnits = Math.round(rtDownMm * 10) & 0xff;
      const upUnits = Math.round(rtUpMm * 10) & 0xff;
      return buildPacket({
        commandClass: 0x0b,
        commandId: 0x02,
        dataSize: 0x08,
        args: [
          slotId & 0xff,
          actUnits,
          rtEnabled ? 0x01 : 0x00,
          downUnits,
          upUnits,
          continuousRt ? 0x01 : 0x00,
          keyCount & 0xff,
          0x00,
        ],
        transactionId,
      });
    },

    setBrightness(brightnessPct = 100, ledId = 0x00, varStore = 0x01, transactionId = 0x1f) {
      const num = Number(brightnessPct);
      const rawByte =
        num > 100
          ? Math.max(0, Math.min(255, Math.round(num)))
          : Math.round((Math.max(0, Math.min(100, num)) / 100) * 255);
      return buildPacket({
        commandClass: 0x0f,
        commandId: 0x04,
        dataSize: 0x03,
        args: [varStore & 0xff, ledId & 0xff, rawByte & 0xff],
        transactionId,
      });
    },

    setChromaFrame({
      row = 0,
      startCol = 0,
      endCol = 17,
      rgbBytes = [],
      profileId = 0x00,
      regionId = 0x00,
      transactionId = 0x1f,
    } = {}) {
      const payload = [
        profileId & 0xff,
        regionId & 0xff,
        row & 0xff,
        startCol & 0xff,
        endCol & 0xff,
        ...rgbBytes.slice(0, 72).map((b) => b & 0xff),
      ];
      return buildPacket({
        commandClass: 0x0f,
        commandId: 0x03,
        dataSize: payload.length,
        args: payload,
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
      const waveRate = speed === 1 ? 75 : speed === 3 ? 15 : 40;
      const waveDir = direction === 2 ? 0x02 : 0x01;
      switch (effect) {
        case "off":
          args = [varStore & 0xff, ledId & 0xff, 0x00, 0x00, 0x00, 0x00];
          break;
        case "static":
          args = [varStore & 0xff, ledId & 0xff, 0x01, 0x00, 0x00, 0x01, r & 0xff, g & 0xff, b & 0xff];
          break;
        case "breathing":
          args = [varStore & 0xff, ledId & 0xff, 0x02, 0x01, 0x00, 0x01, r & 0xff, g & 0xff, b & 0xff];
          break;
        case "breathingDual":
          args = [
            varStore & 0xff,
            ledId & 0xff,
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
          args = [varStore & 0xff, ledId & 0xff, 0x03, 0x00, 0x00, 0x00];
          break;
        case "wave":
          args = [varStore & 0xff, ledId & 0xff, 0x04, waveDir, waveRate & 0xff, 0x00];
          break;
        case "reactive":
          args = [varStore & 0xff, ledId & 0xff, 0x05, 0x00, Math.max(1, Math.min(4, speed)) & 0xff, 0x01, r & 0xff, g & 0xff, b & 0xff];
          break;
        case "ripple":
          args = [varStore & 0xff, ledId & 0xff, 0x06, 0x00, 0x00, 0x01, r & 0xff, g & 0xff, b & 0xff];
          break;
        case "starlight":
          args = [varStore & 0xff, ledId & 0xff, 0x07, 0x01, Math.max(1, Math.min(3, speed)) & 0xff, 0x01, r & 0xff, g & 0xff, b & 0xff];
          break;
        case "customFrame":
          args = [varStore & 0xff, ledId & 0xff, 0x08, 0x00, 0x00, 0x00];
          break;
        case "fire":
          args = [varStore & 0xff, ledId & 0xff, 0x09, 0x00, 0x00, 0x00];
          break;
        case "wheel":
          args = [varStore & 0xff, ledId & 0xff, 0x0a, waveDir, 0x00, 0x00];
          break;
        default:
          args = [varStore & 0xff, ledId & 0xff, 0x01, 0x00, 0x00, 0x01, r & 0xff, g & 0xff, b & 0xff];
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
          idx & 0xff,
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
        dataSize: 0x26,
        args,
        transactionId,
      });
    },

    /**
     * Smart Tracking / Asymmetric Cut-Off (Class 0x04, Cmd 0x0B)
     * asymmetric: false = Symmetric (Low 1 / Med 2 / High 3), true = Asymmetric (liftOff 2..26, landing 1..25)
     */
    setSmartTracking({
      asymmetric = false,
      symmetricLevel = 1,
      liftOffLevel = 14,
      landingLevel = 10,
      transactionId = 0x1f,
    } = {}) {
      return buildPacket({
        commandClass: 0x04,
        commandId: 0x0b,
        dataSize: 0x04,
        args: [
          0x01,
          asymmetric ? 0x01 : 0x00,
          (asymmetric ? liftOffLevel : symmetricLevel) & 0xff,
          (asymmetric ? landingLevel : 0x00) & 0xff,
        ],
        transactionId,
      });
    },

    /**
     * Sensor Angle Rotation (-44..+44 degrees) & Dynamic Sensitivity (Class 0x04, Cmd 0x0E)
     */
    setSensorAngleAndCurve({ angleDeg = 0, dynamicCurve = 0, transactionId = 0x1f } = {}) {
      const signedByte = angleDeg < 0 ? (256 + angleDeg) & 0xff : angleDeg & 0xff;
      return buildPacket({
        commandClass: 0x04,
        commandId: 0x0e,
        dataSize: 0x04,
        args: [0x01, signedByte, dynamicCurve & 0xff, 0x00],
        transactionId,
      });
    },

    /**
     * Wireless Idle Sleep Timeout & Low Power Threshold (Class 0x07, Cmd 0x03 & 0x01)
     */
    setPowerSaving({ idleMinutes = 5, lowPowerPercent = 15, transactionId = 0x1f } = {}) {
      const seconds = Math.max(60, Math.min(900, idleMinutes * 60));
      const rawThreshold = Math.round((lowPowerPercent / 100) * 255) & 0xff;
      return buildPacket({
        commandClass: 0x07,
        commandId: 0x03,
        dataSize: 0x03,
        args: [(seconds >> 8) & 0xff, seconds & 0xff, rawThreshold],
        transactionId,
      });
    },

    setPollingRate(hz = 1000, transactionId = 0x1f) {
      if (hz > 1000) {
        const codeMap = { 8000: 0x01, 4000: 0x02, 2000: 0x04, 1000: 0x08, 500: 0x10, 250: 0x20, 125: 0x40 };
        const code = codeMap[hz] || 0x08;
        return buildPacket({
          commandClass: 0x00,
          commandId: 0x40,
          dataSize: 0x02,
          args: [0x01, code],
          transactionId,
        });
      }
      const legacyMap = { 1000: 0x01, 500: 0x02, 125: 0x08 };
      const code = legacyMap[hz] || 0x01;
      return buildPacket({
        commandClass: 0x00,
        commandId: 0x05,
        dataSize: 0x01,
        args: [code],
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
