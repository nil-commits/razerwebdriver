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
 *   [6]      commandClass       (e.g., 0x00=Device, 0x03=Standard LED, 0x04=DPI, 0x07=Power, 0x0F=Extended Matrix)
 *   [7]      commandId          (e.g., 0x04=SetDeviceMode, 0x84=GetDeviceMode, 0x81=GetFirmwareVersion)
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

  const COMMANDS = {
    GET_FIRMWARE_VERSION: { classId: 0x00, cmdId: 0x81, dataSize: 0x02 },
    GET_SERIAL: { classId: 0x00, cmdId: 0x82, dataSize: 0x16 },
    SET_DEVICE_MODE: { classId: 0x00, cmdId: 0x04, dataSize: 0x02 },
    GET_DEVICE_MODE: { classId: 0x00, cmdId: 0x84, dataSize: 0x02 },
    SET_POLLING_RATE: { classId: 0x00, cmdId: 0x05, dataSize: 0x01 },
    GET_POLLING_RATE: { classId: 0x00, cmdId: 0x85, dataSize: 0x01 },
    SET_POLLING_RATE_HYPER: { classId: 0x00, cmdId: 0x40, dataSize: 0x02 },
    GET_POLLING_RATE_HYPER: { classId: 0x00, cmdId: 0xc0, dataSize: 0x02 },
    GET_EDITION: { classId: 0x00, cmdId: 0x86, dataSize: 0x02 },

    // Standard LED / Matrix (Class 0x03)
    SET_LED_STATE: { classId: 0x03, cmdId: 0x00, dataSize: 0x03 },
    SET_LED_BRIGHTNESS: { classId: 0x03, cmdId: 0x04, dataSize: 0x03 },
    GET_LED_BRIGHTNESS: { classId: 0x03, cmdId: 0x84, dataSize: 0x03 },
    SET_LED_MATRIX_EFFECT: { classId: 0x03, cmdId: 0x0a, dataSize: 0x08 },

    // Extended Chroma Matrix (Class 0x0F)
    SET_CHROMA_EFFECT: { classId: 0x0f, cmdId: 0x02, dataSize: 0x0c },
    GET_CHROMA_EFFECT: { classId: 0x0f, cmdId: 0x82, dataSize: 0x0c },
    SET_CHROMA_BRIGHTNESS: { classId: 0x0f, cmdId: 0x04, dataSize: 0x03 },
    GET_CHROMA_BRIGHTNESS: { classId: 0x0f, cmdId: 0x84, dataSize: 0x03 },

    // Sensor / DPI (Class 0x04)
    SET_DPI_XY: { classId: 0x04, cmdId: 0x05, dataSize: 0x07 },
    GET_DPI_XY: { classId: 0x04, cmdId: 0x85, dataSize: 0x07 },
    SET_DPI_STAGES: { classId: 0x04, cmdId: 0x06, dataSize: 0x26 },
    GET_DPI_STAGES: { classId: 0x04, cmdId: 0x86, dataSize: 0x26 },

    // Power / Battery (Class 0x07)
    GET_BATTERY_LEVEL: { classId: 0x07, cmdId: 0x80, dataSize: 0x02 },
    GET_CHARGING_STATUS: { classId: 0x07, cmdId: 0x84, dataSize: 0x02 },
    SET_IDLE_TIME: { classId: 0x07, cmdId: 0x03, dataSize: 0x02 },
    GET_IDLE_TIME: { classId: 0x07, cmdId: 0x83, dataSize: 0x02 },
  };

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
      features: ["chroma", "analog-actuation", "rapid-trigger", "snaptap", "polling-8k", "device-mode", "macros"],
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
      features: ["dpi", "polling-8k", "battery", "sensor-angle", "device-mode"],
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
      features: ["chroma", "analog-actuation", "rapid-trigger", "snaptap", "polling-8k", "device-mode", "macros"],
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
      features: ["chroma", "analog-actuation", "rapid-trigger", "snaptap", "polling-8k", "device-mode", "macros"],
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
      features: ["dpi", "polling-8k", "battery", "sensor-angle", "device-mode"],
    },
    165: {
      productId: 165,
      hexPid: "0x00A5",
      name: "Razer DeathAdder / Mouse",
      category: "mouse",
      protocol: "25",
      interface: 0,
      defaultTransactionId: 0x1f,
      reportId: 0,
      features: ["dpi", "polling", "battery", "chroma", "device-mode"],
    },
    1365: {
      productId: 1365,
      hexPid: "0x0555",
      name: "Razer BlackShark / Audio Headset",
      category: "audio",
      protocol: "25",
      interface: 0,
      defaultTransactionId: 0x1f,
      reportId: 0,
      features: ["audio", "sidetone", "battery"],
    },
  };

  /**
   * Computes the Razer Protocol 25 XOR CRC over bytes [2..87] of a 90-byte packet.
   */
  function computeCrc(packet90) {
    let crc = 0;
    for (let i = 2; i < 88; i++) {
      crc ^= packet90[i] & 0xff;
    }
    return crc & 0xff;
  }

  /**
   * Builds a 90-byte Protocol 25 packet (and optional 91-byte report with reportId prefix).
   */
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

  /**
   * Parses a 90-byte or 91-byte Protocol 25 response buffer/array.
   */
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

    setBrightness(brightness = 255, ledId = 0x05, varStore = 0x01, transactionId = 0x1f) {
      return buildPacket({
        commandClass: 0x0f,
        commandId: 0x04,
        dataSize: 0x03,
        args: [varStore & 0xff, ledId & 0xff, brightness & 0xff],
        transactionId,
      });
    },

    getBrightness(ledId = 0x05, varStore = 0x01, transactionId = 0x1f) {
      return buildPacket({
        commandClass: 0x0f,
        commandId: 0x84,
        dataSize: 0x03,
        args: [varStore & 0xff, ledId & 0xff, 0x00],
        transactionId,
      });
    },

    setChromaEffect({
      effect = "static",
      r = 0,
      g = 255,
      b = 0,
      r2 = 0,
      g2 = 0,
      b2 = 255,
      direction = 1,
      speed = 2,
      varStore = 0x01,
      ledId = 0x05,
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

    getDpiXY(varStore = 0x01, transactionId = 0x1f) {
      return buildPacket({
        commandClass: 0x04,
        commandId: 0x85,
        dataSize: 0x07,
        args: [varStore & 0xff, 0, 0, 0, 0, 0, 0],
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
    COMMANDS,
    KNOWN_DEVICES,
    computeCrc,
    buildPacket,
    parsePacket,
    Builders,
  };
});
