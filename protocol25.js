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

  // From Razer Synapse 4 main.js (PID 679 profileNavigationGroup) & module 17204:
  // Slot 1: KEY_INSERT (fwID 75), Slot 2: KEY_HOME (fwID 80), Slot 3: KEY_PAGE_UP (fwID 85),
  // Slot 4: KEY_DELETE (fwID 76), Slot 5: KEY_END (fwID 81), Slot 6: KEY_PAGE_DOWN (fwID 86)
  const SLOT_NAV_FW_KEY_IDS = { 1: 75, 2: 80, 3: 85, 4: 76, 5: 81, 6: 86 };
  const KEY_LED_INDICATOR_ID = 255; // $.Ay.config.keyLedIndicatorId = 255

  const KNOWN_DEVICES = {
    70: {"productId":70,"hexPid":"0x0046","name":"Razer Mamba TE","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":70,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    80: {"productId":80,"hexPid":"0x0050","name":"Razer Naga Hex V2","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":80,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    83: {"productId":83,"hexPid":"0x0053","name":"Razer Naga Chroma","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":83,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    89: {"productId":89,"hexPid":"0x0059","name":"Razer Lancehead","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":89,"donglePid":90,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    90: {"productId":90,"hexPid":"0x005A","name":"Razer Lancehead (2.4GHz Wireless)","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":63,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"dongle","primaryPid":89,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    92: {"productId":92,"hexPid":"0x005C","name":"Razer Deathadder Elite","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":92,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    96: {"productId":96,"hexPid":"0x0060","name":"Razer Lancehead TE","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":96,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    97: {"productId":97,"hexPid":"0x0061","name":"Razer Atheris (Bluetooth)","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"ble","primaryPid":98,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    98: {"productId":98,"hexPid":"0x0062","name":"Razer Atheris","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"wired","primaryPid":98,"donglePid":98,"blePid":97,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    99: {"productId":99,"hexPid":"0x0063","name":"Razer Jugan","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":99,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    100: {"productId":100,"hexPid":"0x0064","name":"Razer Basilisk","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":100,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    101: {"productId":101,"hexPid":"0x0065","name":"Razer Basilisk Essential","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":101,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    103: {"productId":103,"hexPid":"0x0067","name":"Razer Naga Trinity","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":103,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    104: {"productId":104,"hexPid":"0x0068","name":"Razer Mamba Hyperflux","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":104,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    105: {"productId":105,"hexPid":"0x0069","name":"Razer Mamba Hyperflux","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":105,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    106: {"productId":106,"hexPid":"0x006A","name":"Razer D.VA Razer Abyssus Elite","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":106,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    107: {"productId":107,"hexPid":"0x006B","name":"Razer Abyssus Essential","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":107,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    108: {"productId":108,"hexPid":"0x006C","name":"Razer Mamba Elite","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":108,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    110: {"productId":110,"hexPid":"0x006E","name":"Razer DeathAdder Essential","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"wired","primaryPid":110,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    111: {"productId":111,"hexPid":"0x006F","name":"Razer Lancehead Wireless (2.4GHz Wireless)","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":63,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"dongle","primaryPid":112,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    112: {"productId":112,"hexPid":"0x0070","name":"Razer Lancehead Wireless","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":112,"donglePid":111,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    113: {"productId":113,"hexPid":"0x0071","name":"Razer DeathAdder Essential White Edition","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"wired","primaryPid":113,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    114: {"productId":114,"hexPid":"0x0072","name":"Razer Mamba Wireless (2.4GHz Wireless)","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":63,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"dongle","primaryPid":115,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    115: {"productId":115,"hexPid":"0x0073","name":"Razer Mamba Wireless","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":115,"donglePid":114,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    116: {"productId":116,"hexPid":"0x0074","name":"Razer Abyssus Lite","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":116,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    117: {"productId":117,"hexPid":"0x0075","name":"Razer Turret Mouse Xbox One Edition","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":117,"donglePid":2308,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    118: {"productId":118,"hexPid":"0x0076","name":"Razer Pro Click (Bluetooth)","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"ble","primaryPid":128,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    119: {"productId":119,"hexPid":"0x0077","name":"Razer Pro Click (2.4GHz Wireless)","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":63,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"dongle","primaryPid":128,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    120: {"productId":120,"hexPid":"0x0078","name":"Razer Viper","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":120,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    122: {"productId":122,"hexPid":"0x007A","name":"Razer Viper Ultimate","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":122,"donglePid":123,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    123: {"productId":123,"hexPid":"0x007B","name":"Razer Viper Ultimate (2.4GHz Wireless)","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":63,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"dongle","primaryPid":122,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    124: {"productId":124,"hexPid":"0x007C","name":"Razer Deathadder V2 Pro","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":124,"donglePid":125,"blePid":142,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    125: {"productId":125,"hexPid":"0x007D","name":"Razer Deathadder V2 Pro (2.4GHz Wireless)","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":63,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"dongle","primaryPid":124,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    126: {"productId":126,"hexPid":"0x007E","name":"Razer Mouse Dock Chroma","category":"mat-accessory","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":126,"features":["chroma","brightness","zoneStudio","accessoryTelemetry"]},
    128: {"productId":128,"hexPid":"0x0080","name":"Razer Pro Click","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"wired","primaryPid":128,"donglePid":119,"blePid":118,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    130: {"productId":130,"hexPid":"0x0082","name":"Razer Basilisk X HyperSpeed (Bluetooth)","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"ble","primaryPid":131,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    131: {"productId":131,"hexPid":"0x0083","name":"Razer Basilisk X HyperSpeed","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"wired","primaryPid":131,"donglePid":131,"blePid":130,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    132: {"productId":132,"hexPid":"0x0084","name":"Razer Deathadder V2","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":132,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    133: {"productId":133,"hexPid":"0x0085","name":"Razer Basilisk V2","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":133,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    134: {"productId":134,"hexPid":"0x0086","name":"Razer Basilisk Ultimate","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":134,"donglePid":136,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    136: {"productId":136,"hexPid":"0x0088","name":"Razer Basilisk Ultimate (2.4GHz Wireless)","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":63,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"dongle","primaryPid":134,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    138: {"productId":138,"hexPid":"0x008A","name":"Razer Viper Mini","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":138,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    140: {"productId":140,"hexPid":"0x008C","name":"Razer Deathadder V2 Mini","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":140,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    141: {"productId":141,"hexPid":"0x008D","name":"Razer Naga Left Handed Edition","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":141,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    142: {"productId":142,"hexPid":"0x008E","name":"Razer Deathadder V2 Pro (Bluetooth)","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"ble","primaryPid":124,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    143: {"productId":143,"hexPid":"0x008F","name":"Razer Naga Pro","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":143,"donglePid":144,"blePid":146,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    144: {"productId":144,"hexPid":"0x0090","name":"Razer Naga Pro (2.4GHz Wireless)","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":63,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"dongle","primaryPid":143,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    145: {"productId":145,"hexPid":"0x0091","name":"Razer Viper 8Khz","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":145,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    146: {"productId":146,"hexPid":"0x0092","name":"Razer Naga Pro (Bluetooth)","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"ble","primaryPid":143,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    147: {"productId":147,"hexPid":"0x0093","name":"Razer Naga Classic Edition","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":147,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    148: {"productId":148,"hexPid":"0x0094","name":"Razer Orochi V2","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"wired","primaryPid":148,"donglePid":148,"blePid":149,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    149: {"productId":149,"hexPid":"0x0095","name":"Razer Orochi V2 (Bluetooth)","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"ble","primaryPid":148,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    150: {"productId":150,"hexPid":"0x0096","name":"Razer Naga X","category":"mouse","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":150,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    152: {"productId":152,"hexPid":"0x0098","name":"Razer DeathAdder Essential","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"wired","primaryPid":152,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    153: {"productId":153,"hexPid":"0x0099","name":"Razer Basilisk V3","category":"mouse","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":153,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    154: {"productId":154,"hexPid":"0x009A","name":"Razer Pro Click Mini","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"wired","primaryPid":154,"donglePid":154,"blePid":155,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    155: {"productId":155,"hexPid":"0x009B","name":"Razer Pro Click Mini (Bluetooth)","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"ble","primaryPid":154,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    156: {"productId":156,"hexPid":"0x009C","name":"Razer DeathAdder V2 X Hyperspeed","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"wired","primaryPid":156,"donglePid":156,"blePid":157,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    157: {"productId":157,"hexPid":"0x009D","name":"Razer DeathAdder V2 X Hyperspeed (Bluetooth)","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"ble","primaryPid":156,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    158: {"productId":158,"hexPid":"0x009E","name":"Razer HyperPolling Wireless Dongle","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":255,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"wired","primaryPid":158,"donglePid":159,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    159: {"productId":159,"hexPid":"0x009F","name":"Razer Viper Mini Signature Edition (2.4GHz Wireless)","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":63,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"dongle","primaryPid":158,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    161: {"productId":161,"hexPid":"0x00A1","name":"Razer Deathadder V2 Lite","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":161,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    163: {"productId":163,"hexPid":"0x00A3","name":"Razer Cobra","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":163,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    164: {"productId":164,"hexPid":"0x00A4","name":"Razer Mouse Dock Pro","category":"mat-accessory","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":164,"features":["chroma","brightness","zoneStudio","accessoryTelemetry"]},
    165: {"productId":165,"hexPid":"0x00A5","name":"Razer Viper V2 Pro","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"wired","primaryPid":165,"donglePid":166,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    166: {"productId":166,"hexPid":"0x00A6","name":"Razer Viper V2 Pro (2.4GHz Wireless)","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":63,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"dongle","primaryPid":165,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    167: {"productId":167,"hexPid":"0x00A7","name":"Razer Naga V2 Pro","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":167,"donglePid":168,"blePid":169,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    168: {"productId":168,"hexPid":"0x00A8","name":"Razer Naga V2 Pro (2.4GHz Wireless)","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":63,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"dongle","primaryPid":167,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    169: {"productId":169,"hexPid":"0x00A9","name":"Razer Naga V2 Pro (Bluetooth)","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"ble","primaryPid":167,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    170: {"productId":170,"hexPid":"0x00AA","name":"Razer Basilisk V3 Pro (Wired)","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":170,"donglePid":171,"blePid":172,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    171: {"productId":171,"hexPid":"0x00AB","name":"Razer Basilisk V3 Pro (Wireless)","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":255,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"dongle","primaryPid":170,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    172: {"productId":172,"hexPid":"0x00AC","name":"Razer Basilisk V3 Pro (Bluetooth)","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"ble","primaryPid":170,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    175: {"productId":175,"hexPid":"0x00AF","name":"Razer Cobra Pro","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":175,"donglePid":176,"blePid":177,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    176: {"productId":176,"hexPid":"0x00B0","name":"Razer Cobra Pro (2.4GHz Wireless)","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":63,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"dongle","primaryPid":175,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    177: {"productId":177,"hexPid":"0x00B1","name":"Razer Cobra Pro (Bluetooth)","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"ble","primaryPid":175,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    178: {"productId":178,"hexPid":"0x00B2","name":"Razer DeathAdder V3","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"wired","primaryPid":178,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    179: {"productId":179,"hexPid":"0x00B3","name":"Razer HyperPolling Wireless Dongle","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"wired","primaryPid":179,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    180: {"productId":180,"hexPid":"0x00B4","name":"Razer Naga V2 Hyperspeed","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"wired","primaryPid":180,"donglePid":181,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    181: {"productId":181,"hexPid":"0x00B5","name":"Razer Naga V2 Hyperspeed (2.4GHz Wireless)","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":63,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"dongle","primaryPid":180,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    182: {"productId":182,"hexPid":"0x00B6","name":"Razer DeathAdder V3 Pro (Wired)","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"wired","primaryPid":182,"donglePid":183,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    183: {"productId":183,"hexPid":"0x00B7","name":"Razer DeathAdder V3 Pro (Wireless)","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":255,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"dongle","primaryPid":182,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    184: {"productId":184,"hexPid":"0x00B8","name":"Razer Viper V3 HyperSpeed","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"wired","primaryPid":184,"donglePid":184,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    185: {"productId":185,"hexPid":"0x00B9","name":"Razer Basilisk V3 X HyperSpeed","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":185,"donglePid":185,"blePid":186,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    186: {"productId":186,"hexPid":"0x00BA","name":"Razer Basilisk V3 X HyperSpeed (Bluetooth)","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"ble","primaryPid":185,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    190: {"productId":190,"hexPid":"0x00BE","name":"Razer Viper V3 Pro","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"wired","primaryPid":190,"donglePid":191,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    191: {"productId":191,"hexPid":"0x00BF","name":"Razer Viper V3 Pro (2.4GHz Wireless)","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":63,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"dongle","primaryPid":190,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    192: {"productId":192,"hexPid":"0x00C0","name":"Razer Viper V3 Pro (Wired)","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"wired","primaryPid":192,"donglePid":193,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    193: {"productId":193,"hexPid":"0x00C1","name":"Razer Viper V3 Pro (HyperPolling Wireless)","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":255,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"dongle","primaryPid":192,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    194: {"productId":194,"hexPid":"0x00C2","name":"Razer DeathAdder V3 Pro Hyperpolling Technology","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"wired","primaryPid":194,"donglePid":195,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    195: {"productId":195,"hexPid":"0x00C3","name":"Razer DeathAdder V3 Pro Hyperpolling Technology (2.4GHz Wireless)","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":63,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"dongle","primaryPid":194,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    196: {"productId":196,"hexPid":"0x00C4","name":"Razer DeathAdder V3 Hyperspeed","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"wired","primaryPid":196,"donglePid":197,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    197: {"productId":197,"hexPid":"0x00C5","name":"Razer DeathAdder V3 Hyperspeed (2.4GHz Wireless)","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":63,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"dongle","primaryPid":196,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    199: {"productId":199,"hexPid":"0x00C7","name":"Razer Pro Click V2 Vertical Edition","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":199,"donglePid":200,"blePid":201,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    200: {"productId":200,"hexPid":"0x00C8","name":"Razer Pro Click V2 Vertical Edition (2.4GHz Wireless)","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":63,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"dongle","primaryPid":199,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    201: {"productId":201,"hexPid":"0x00C9","name":"Razer Pro Click V2 Vertical Edition (Bluetooth)","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"ble","primaryPid":199,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    203: {"productId":203,"hexPid":"0x00CB","name":"Razer Basilisk V3 35K","category":"mouse","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":203,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    204: {"productId":204,"hexPid":"0x00CC","name":"Razer Basilisk V3 Pro 35K","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":204,"donglePid":205,"blePid":206,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    205: {"productId":205,"hexPid":"0x00CD","name":"Razer Basilisk V3 Pro 35K (2.4GHz Wireless)","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":63,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"dongle","primaryPid":204,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    206: {"productId":206,"hexPid":"0x00CE","name":"Razer Basilisk V3 Pro 35K (Bluetooth)","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"ble","primaryPid":204,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    207: {"productId":207,"hexPid":"0x00CF","name":"Razer HyperFlux V2 Hard Edition","category":"mat-accessory","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"wired","primaryPid":207,"features":["chroma","brightness","zoneStudio","accessoryTelemetry"]},
    208: {"productId":208,"hexPid":"0x00D0","name":"Razer Pro Click V2","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":208,"donglePid":209,"blePid":210,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    209: {"productId":209,"hexPid":"0x00D1","name":"Razer Pro Click V2 (2.4GHz Wireless)","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":63,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"dongle","primaryPid":208,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    210: {"productId":210,"hexPid":"0x00D2","name":"Razer Pro Click V2 (Bluetooth)","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"ble","primaryPid":208,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    211: {"productId":211,"hexPid":"0x00D3","name":"Razer Basilisk Mobile","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":211,"donglePid":212,"blePid":213,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    212: {"productId":212,"hexPid":"0x00D4","name":"Razer Basilisk Mobile (2.4GHz Wireless)","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":63,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"dongle","primaryPid":211,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    213: {"productId":213,"hexPid":"0x00D5","name":"Razer Basilisk Mobile (Bluetooth)","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"ble","primaryPid":211,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    214: {"productId":214,"hexPid":"0x00D6","name":"Razer Basilisk V3 Pro 35K Phantom Green Edition","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":214,"donglePid":215,"blePid":216,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    215: {"productId":215,"hexPid":"0x00D7","name":"Razer Basilisk V3 Pro 35K Phantom Green Edition (2.4GHz Wireless)","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":63,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"dongle","primaryPid":214,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    216: {"productId":216,"hexPid":"0x00D8","name":"Razer Basilisk V3 Pro 35K Phantom Green Edition (Bluetooth)","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"ble","primaryPid":214,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    218: {"productId":218,"hexPid":"0x00DA","name":"Razer Cobra HyperSpeed","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":218,"donglePid":219,"blePid":220,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    219: {"productId":219,"hexPid":"0x00DB","name":"Razer Cobra HyperSpeed (2.4GHz Wireless)","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":63,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"dongle","primaryPid":218,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    220: {"productId":220,"hexPid":"0x00DC","name":"Razer Cobra HyperSpeed (Bluetooth)","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"ble","primaryPid":218,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    221: {"productId":221,"hexPid":"0x00DD","name":"RAZER BOOMSLANG 20th ANNIVERSARY EDITION","category":"mouse","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":221,"donglePid":221,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    222: {"productId":222,"hexPid":"0x00DE","name":"Razer Viper V3 Pro","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"wired","primaryPid":222,"donglePid":223,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    223: {"productId":223,"hexPid":"0x00DF","name":"Razer Viper V3 Pro (2.4GHz Wireless)","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":63,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"dongle","primaryPid":222,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    224: {"productId":224,"hexPid":"0x00E0","name":"Razer Orochi V2 (Special Edition)","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"wired","primaryPid":224,"donglePid":224,"blePid":225,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    225: {"productId":225,"hexPid":"0x00E1","name":"Razer Orochi V2 (Special Edition) (Bluetooth)","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"ble","primaryPid":224,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    226: {"productId":226,"hexPid":"0x00E2","name":"Razer Basilisk V4 Pro","category":"mouse","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":226,"donglePid":227,"blePid":228,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    227: {"productId":227,"hexPid":"0x00E3","name":"Razer Basilisk V4 Pro (2.4GHz Wireless)","category":"mouse","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":63,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"dongle","primaryPid":226,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    228: {"productId":228,"hexPid":"0x00E4","name":"Razer Basilisk V4 Pro (Bluetooth)","category":"mouse","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"ble","primaryPid":226,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    229: {"productId":229,"hexPid":"0x00E5","name":"Razer Viper V4 Pro","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"wired","primaryPid":229,"donglePid":230,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    230: {"productId":230,"hexPid":"0x00E6","name":"Razer Viper V4 Pro (2.4GHz Wireless)","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":63,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"dongle","primaryPid":229,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    231: {"productId":231,"hexPid":"0x00E7","name":"Razer Naga V3 Pro","category":"mouse","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":231,"donglePid":232,"blePid":233,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    232: {"productId":232,"hexPid":"0x00E8","name":"Razer Naga V3 Pro (2.4GHz Wireless)","category":"mouse","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":63,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"dongle","primaryPid":231,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    233: {"productId":233,"hexPid":"0x00E9","name":"Razer Naga V3 Pro (Bluetooth)","category":"mouse","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"ble","primaryPid":231,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    234: {"productId":234,"hexPid":"0x00EA","name":"Razer Basilisk V4 HyperSpeed (2.4GHz Wireless)","category":"mouse","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":63,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"dongle","primaryPid":235,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    235: {"productId":235,"hexPid":"0x00EB","name":"Razer Basilisk V4 HyperSpeed","category":"mouse","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":235,"donglePid":234,"blePid":236,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    236: {"productId":236,"hexPid":"0x00EC","name":"Razer Basilisk V4 HyperSpeed (Bluetooth)","category":"mouse","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"ble","primaryPid":235,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    239: {"productId":239,"hexPid":"0x00EF","name":"Razer DeathAdder V4 Pro Carbon Fiber Edition","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"wired","primaryPid":239,"donglePid":240,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    240: {"productId":240,"hexPid":"0x00F0","name":"Razer DeathAdder V4 Pro Carbon Fiber Edition (2.4GHz Wireless)","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":63,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"dongle","primaryPid":239,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    241: {"productId":241,"hexPid":"0x00F1","name":"Razer Mouse Dock V2 Pro","category":"mat-accessory","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":241,"donglePid":241,"features":["chroma","brightness","zoneStudio","accessoryTelemetry"]},
    515: {"productId":515,"hexPid":"0x0203","name":"Razer BlackWidow Chroma","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":515,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    521: {"productId":521,"hexPid":"0x0209","name":"Razer BlackWidow TE Chroma","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":521,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    529: {"productId":529,"hexPid":"0x0211","name":"Razer BlackWidow Chroma Overwatch","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":529,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    534: {"productId":534,"hexPid":"0x0216","name":"Razer BlackWidow X Chroma","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":534,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    542: {"productId":542,"hexPid":"0x021E","name":"Razer Ornata Chroma","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":542,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    545: {"productId":545,"hexPid":"0x0221","name":"Razer BlackWidow Chroma V2","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":545,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    550: {"productId":550,"hexPid":"0x0226","name":"Razer Huntsman Elite","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":550,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    551: {"productId":551,"hexPid":"0x0227","name":"Razer Huntsman","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":551,"donglePid":551,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    552: {"productId":552,"hexPid":"0x0228","name":"Razer BlackWidow Elite","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":552,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    554: {"productId":554,"hexPid":"0x022A","name":"Razer Cynosa Chroma","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":554,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    555: {"productId":555,"hexPid":"0x022B","name":"Razer Tartarus V2","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":555,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    556: {"productId":556,"hexPid":"0x022C","name":"Razer Cynosa Chroma Pro","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":556,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    563: {"productId":563,"hexPid":"0x0233","name":"Razer Blade 15 Advanced Model","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":563,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    564: {"productId":564,"hexPid":"0x0234","name":"Razer Blade Pro 17","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":564,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    565: {"productId":565,"hexPid":"0x0235","name":"Razer BlackWidow Lite","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"wired","primaryPid":565,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    567: {"productId":567,"hexPid":"0x0237","name":"Razer BlackWidow Essential","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"wired","primaryPid":567,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    569: {"productId":569,"hexPid":"0x0239","name":"Razer Blade Stealth 13","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":569,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    570: {"productId":570,"hexPid":"0x023A","name":"Razer Blade 15 Advanced Model","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":570,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    571: {"productId":571,"hexPid":"0x023B","name":"Razer Blade 15 Base Model","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":571,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    574: {"productId":574,"hexPid":"0x023E","name":"Razer Turret Keyboard Xbox One Edition","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":574,"donglePid":2308,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    575: {"productId":575,"hexPid":"0x023F","name":"Razer Cynosa Lite","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":575,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    576: {"productId":576,"hexPid":"0x0240","name":"Razer Blade 15 Mercury White","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":576,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    577: {"productId":577,"hexPid":"0x0241","name":"Razer BlackWidow","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":577,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    579: {"productId":579,"hexPid":"0x0243","name":"Razer Huntsman Tournament Edition","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":579,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    580: {"productId":580,"hexPid":"0x0244","name":"Razer Tartarus Pro","category":"keyboard-analog","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":580,"features":["actuation","rapidTrigger","snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    581: {"productId":581,"hexPid":"0x0245","name":"Razer Blade 15 Advanced Model","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":581,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    582: {"productId":582,"hexPid":"0x0246","name":"Razer Blade 15 Base Model","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":582,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    584: {"productId":584,"hexPid":"0x0248","name":"Razer Pro Type (Bluetooth)","category":"keyboard","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"ble","primaryPid":585,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    585: {"productId":585,"hexPid":"0x0249","name":"Razer Pro Type","category":"keyboard","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"wired","primaryPid":585,"donglePid":585,"blePid":584,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    586: {"productId":586,"hexPid":"0x024A","name":"Razer Blade Stealth 13","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":586,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    587: {"productId":587,"hexPid":"0x024B","name":"Razer Blade 15 Advanced Model","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":587,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    588: {"productId":588,"hexPid":"0x024C","name":"Razer Blade Pro 17","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":588,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    589: {"productId":589,"hexPid":"0x024D","name":"Razer Blade 15 Studio Edition","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":589,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    590: {"productId":590,"hexPid":"0x024E","name":"Razer BlackWidow V3","category":"keyboard","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":590,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    591: {"productId":591,"hexPid":"0x024F","name":"Razer BlackWidow X: Tenkeyless","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"wired","primaryPid":591,"donglePid":591,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    592: {"productId":592,"hexPid":"0x0250","name":"Razer Huntsman Essential","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"wired","primaryPid":592,"donglePid":592,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    593: {"productId":593,"hexPid":"0x0251","name":"Razer Pokémon Pikachu Limited Edition Backlit Keyboard","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"wired","primaryPid":593,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    594: {"productId":594,"hexPid":"0x0252","name":"Razer Blade Stealth 13 Base Model","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":594,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    595: {"productId":595,"hexPid":"0x0253","name":"Razer Blade 15 Advanced Model","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":595,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    597: {"productId":597,"hexPid":"0x0255","name":"Razer Blade 15 Base Model","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":597,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    598: {"productId":598,"hexPid":"0x0256","name":"Razer Blade 15 Advanced Model","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":598,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    599: {"productId":599,"hexPid":"0x0257","name":"Razer Huntsman Mini","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":599,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    600: {"productId":600,"hexPid":"0x0258","name":"Razer BlackWidow V3 Mini Hyperspeed","category":"keyboard","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":600,"donglePid":625,"blePid":626,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    601: {"productId":601,"hexPid":"0x0259","name":"Razer Blade Stealth 13","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":601,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    602: {"productId":602,"hexPid":"0x025A","name":"Razer BlackWidow V3 Pro","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":602,"donglePid":604,"blePid":603,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    603: {"productId":603,"hexPid":"0x025B","name":"Razer BlackWidow V3 Pro (Bluetooth)","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"ble","primaryPid":602,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    604: {"productId":604,"hexPid":"0x025C","name":"Razer BlackWidow V3 Pro (2.4GHz Wireless)","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"dongle","primaryPid":602,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    605: {"productId":605,"hexPid":"0x025D","name":"Razer Ornata V2","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":605,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    606: {"productId":606,"hexPid":"0x025E","name":"Razer Cynosa V2","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":606,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    614: {"productId":614,"hexPid":"0x0266","name":"Razer Huntsman V2 Analog","category":"keyboard-analog","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":614,"features":["actuation","rapidTrigger","snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    616: {"productId":616,"hexPid":"0x0268","name":"Razer Blade 15 Base Model","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":616,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    617: {"productId":617,"hexPid":"0x0269","name":"Razer Huntsman Mini","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":617,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    618: {"productId":618,"hexPid":"0x026A","name":"Razer Book 13","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":618,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    619: {"productId":619,"hexPid":"0x026B","name":"Razer Huntsman V2 Tenkeyless","category":"keyboard","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":619,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    620: {"productId":620,"hexPid":"0x026C","name":"Razer Huntsman V2","category":"keyboard","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":620,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    621: {"productId":621,"hexPid":"0x026D","name":"Razer Blade 15 Advanced Model","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":621,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    622: {"productId":622,"hexPid":"0x026E","name":"Razer Blade Pro 17","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":622,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    623: {"productId":623,"hexPid":"0x026F","name":"Razer Blade 15 Base Model","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":623,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    624: {"productId":624,"hexPid":"0x0270","name":"Razer Blade 14","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":624,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    625: {"productId":625,"hexPid":"0x0271","name":"Razer BlackWidow V3 Mini Hyperspeed (2.4GHz Wireless)","category":"keyboard","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"dongle","primaryPid":600,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    626: {"productId":626,"hexPid":"0x0272","name":"Razer BlackWidow V3 Mini Hyperspeed (Bluetooth)","category":"keyboard","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"ble","primaryPid":600,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    630: {"productId":630,"hexPid":"0x0276","name":"Razer Blade 15 Advanced Model","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":630,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    631: {"productId":631,"hexPid":"0x0277","name":"Razer Pro Type Ultra","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"wired","primaryPid":631,"donglePid":635,"blePid":632,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    632: {"productId":632,"hexPid":"0x0278","name":"Razer Pro Type Ultra (Bluetooth)","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"ble","primaryPid":631,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    633: {"productId":633,"hexPid":"0x0279","name":"Razer Blade 17","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":633,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    634: {"productId":634,"hexPid":"0x027A","name":"Razer Blade 15 Base Model","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":634,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    635: {"productId":635,"hexPid":"0x027B","name":"Razer Pro Type Ultra (2.4GHz Wireless)","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"dongle","primaryPid":631,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    642: {"productId":642,"hexPid":"0x0282","name":"Razer Huntsman Mini Analog","category":"keyboard-analog","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":642,"features":["actuation","rapidTrigger","snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    647: {"productId":647,"hexPid":"0x0287","name":"Razer BlackWidow V4","category":"keyboard","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":647,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    650: {"productId":650,"hexPid":"0x028A","name":"Razer Blade 15 Advanced Model","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":650,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    651: {"productId":651,"hexPid":"0x028B","name":"Razer Blade 17","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":651,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    652: {"productId":652,"hexPid":"0x028C","name":"Razer BlackWidow V4 Pro","category":"keyboard","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":652,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    653: {"productId":653,"hexPid":"0x028D","name":"Razer BlackWidow V4 Pro","category":"keyboard","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":653,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    654: {"productId":654,"hexPid":"0x028E","name":"Razer Cynosa Pro","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"wired","primaryPid":654,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    655: {"productId":655,"hexPid":"0x028F","name":"Razer Ornata V3","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":655,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    656: {"productId":656,"hexPid":"0x0290","name":"Razer DeathStalker V2 Pro (2.4GHz Wireless)","category":"keyboard","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"dongle","primaryPid":658,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    657: {"productId":657,"hexPid":"0x0291","name":"Razer DeathStalker V2 Pro (Bluetooth)","category":"keyboard","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"ble","primaryPid":658,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    658: {"productId":658,"hexPid":"0x0292","name":"Razer DeathStalker V2 Pro","category":"keyboard","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":658,"donglePid":656,"blePid":657,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    659: {"productId":659,"hexPid":"0x0293","name":"Razer BlackWidow V4 X","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":659,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    660: {"productId":660,"hexPid":"0x0294","name":"Razer Ornata V3 X","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":660,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    661: {"productId":661,"hexPid":"0x0295","name":"Razer DeathStalker V2","category":"keyboard","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":661,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    662: {"productId":662,"hexPid":"0x0296","name":"Razer DeathStalker V2 Pro Tenkeyless (2.4GHz Wireless)","category":"keyboard","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"dongle","primaryPid":664,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    663: {"productId":663,"hexPid":"0x0297","name":"Razer DeathStalker V2 Pro Tenkeyless (Bluetooth)","category":"keyboard","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"ble","primaryPid":664,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    664: {"productId":664,"hexPid":"0x0298","name":"Razer DeathStalker V2 Pro Tenkeyless","category":"keyboard","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":664,"donglePid":662,"blePid":663,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    669: {"productId":669,"hexPid":"0x029D","name":"Razer Blade 14","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":669,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    670: {"productId":670,"hexPid":"0x029E","name":"Razer Blade 15","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":670,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    671: {"productId":671,"hexPid":"0x029F","name":"Razer Blade 16","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":671,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    672: {"productId":672,"hexPid":"0x02A0","name":"Razer Blade 18","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":672,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    673: {"productId":673,"hexPid":"0x02A1","name":"Razer Ornata V3","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":673,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    674: {"productId":674,"hexPid":"0x02A2","name":"Razer Ornata V3 X","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":674,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    675: {"productId":675,"hexPid":"0x02A3","name":"Razer Ornata V3 Tenkeyless","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":675,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    677: {"productId":677,"hexPid":"0x02A5","name":"Razer BlackWidow V4 75%","category":"keyboard","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":677,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    678: {"productId":678,"hexPid":"0x02A6","name":"Razer Huntsman V3 Pro","category":"keyboard-analog","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":6,"isChroma":true,"connection":"wired","primaryPid":678,"features":["actuation","rapidTrigger","snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    679: {"productId":679,"hexPid":"0x02A7","name":"Razer Huntsman V3 Pro Tenkeyless","category":"keyboard-analog","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":6,"isChroma":true,"connection":"wired","primaryPid":679,"features":["actuation","rapidTrigger","snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    680: {"productId":680,"hexPid":"0x02A8","name":"Razer Huntsman V3 Pro Mini","category":"keyboard-analog","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":6,"isChroma":true,"connection":"wired","primaryPid":680,"features":["actuation","rapidTrigger","snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    688: {"productId":688,"hexPid":"0x02B0","name":"Razer Huntsman V3 Pro Mini","category":"keyboard-analog","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":688,"features":["actuation","rapidTrigger","snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    689: {"productId":689,"hexPid":"0x02B1","name":"Razer Huntsman V3 X Tenkeyless","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":689,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    691: {"productId":691,"hexPid":"0x02B3","name":"Razer BlackWidow V4 Pro 75%","category":"keyboard","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":691,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    692: {"productId":692,"hexPid":"0x02B4","name":"Razer BlackWidow V4 Pro 75% (2.4GHz Wireless)","category":"keyboard","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"dongle","primaryPid":691,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    693: {"productId":693,"hexPid":"0x02B5","name":"Razer BlackWidow V4 Pro 75% (Bluetooth)","category":"keyboard","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"ble","primaryPid":691,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    694: {"productId":694,"hexPid":"0x02B6","name":"Razer Blade 14","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":694,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    695: {"productId":695,"hexPid":"0x02B7","name":"Razer Blade 16","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":695,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    696: {"productId":696,"hexPid":"0x02B8","name":"Razer Blade 18","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":696,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    697: {"productId":697,"hexPid":"0x02B9","name":"Razer BlackWidow V4 Mini HyperSpeed","category":"keyboard","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":697,"donglePid":698,"blePid":699,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    698: {"productId":698,"hexPid":"0x02BA","name":"Razer BlackWidow V4 Mini HyperSpeed (2.4GHz Wireless)","category":"keyboard","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"dongle","primaryPid":697,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    699: {"productId":699,"hexPid":"0x02BB","name":"Razer BlackWidow V4 Mini HyperSpeed (Bluetooth)","category":"keyboard","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"ble","primaryPid":697,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    706: {"productId":706,"hexPid":"0x02C2","name":"Razer Pro Type Ergo (2.4GHz Wireless)","category":"keyboard","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"dongle","primaryPid":708,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    707: {"productId":707,"hexPid":"0x02C3","name":"Razer Pro Type Ergo (Bluetooth)","category":"keyboard","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"ble","primaryPid":708,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    708: {"productId":708,"hexPid":"0x02C4","name":"Razer Pro Type Ergo","category":"keyboard","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":708,"donglePid":706,"blePid":707,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    709: {"productId":709,"hexPid":"0x02C5","name":"Razer Blade 14","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":709,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    710: {"productId":710,"hexPid":"0x02C6","name":"Razer Blade 16","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":710,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    711: {"productId":711,"hexPid":"0x02C7","name":"Razer Blade 18","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":711,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    713: {"productId":713,"hexPid":"0x02C9","name":"Razer BlackWidow V4 Low-profile HyperSpeed (2.4GHz Wireless)","category":"keyboard","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"dongle","primaryPid":716,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    714: {"productId":714,"hexPid":"0x02CA","name":"Razer BlackWidow V4 Low-profile HyperSpeed (Bluetooth)","category":"keyboard","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"ble","primaryPid":716,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    716: {"productId":716,"hexPid":"0x02CC","name":"Razer BlackWidow V4 Low-profile HyperSpeed","category":"keyboard","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":716,"donglePid":713,"blePid":714,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    717: {"productId":717,"hexPid":"0x02CD","name":"Razer Joro","category":"keyboard","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":717,"donglePid":730,"blePid":718,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    718: {"productId":718,"hexPid":"0x02CE","name":"Razer Joro (Bluetooth)","category":"keyboard","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"ble","primaryPid":717,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    719: {"productId":719,"hexPid":"0x02CF","name":"Razer Huntsman V3 Pro 8KHz","category":"keyboard-analog","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":719,"features":["actuation","rapidTrigger","snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    720: {"productId":720,"hexPid":"0x02D0","name":"Razer Huntsman V3 Pro Tenkeyless 8KHZ","category":"keyboard-analog","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":720,"features":["actuation","rapidTrigger","snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    721: {"productId":721,"hexPid":"0x02D1","name":"Razer Huntsman V3 Pro Mini 8KHz","category":"keyboard-analog","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":721,"features":["actuation","rapidTrigger","snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    722: {"productId":722,"hexPid":"0x02D2","name":"Razer BlackWidow V4 Low-profile Tenkeyless HyperSpeed (2.4GHz Wireless)","category":"keyboard","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"dongle","primaryPid":724,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    723: {"productId":723,"hexPid":"0x02D3","name":"Razer BlackWidow V4 Low-profile Tenkeyless HyperSpeed (Bluetooth)","category":"keyboard","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"ble","primaryPid":724,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    724: {"productId":724,"hexPid":"0x02D4","name":"Razer BlackWidow V4 Low-profile Tenkeyless HyperSpeed","category":"keyboard","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":724,"donglePid":722,"blePid":723,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    725: {"productId":725,"hexPid":"0x02D5","name":"Razer Blackwidow V4 Tenkeyless Hyperspeed (2.4GHz Wireless)","category":"keyboard","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"dongle","primaryPid":727,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    726: {"productId":726,"hexPid":"0x02D6","name":"Razer Blackwidow V4 Tenkeyless Hyperspeed (Bluetooth)","category":"keyboard","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"ble","primaryPid":727,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    727: {"productId":727,"hexPid":"0x02D7","name":"Razer Blackwidow V4 Tenkeyless Hyperspeed","category":"keyboard","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":727,"donglePid":725,"blePid":726,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    728: {"productId":728,"hexPid":"0x02D8","name":"Razer Huntsman V4 Pro Tenkeyless Signature","category":"keyboard-analog","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":728,"features":["actuation","rapidTrigger","snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    730: {"productId":730,"hexPid":"0x02DA","name":"Razer Joro (2.4GHz Wireless)","category":"keyboard","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"dongle","primaryPid":717,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    736: {"productId":736,"hexPid":"0x02E0","name":"Razer Blade 16","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":736,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    737: {"productId":737,"hexPid":"0x02E1","name":"Razer Blade 18","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":737,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    739: {"productId":739,"hexPid":"0x02E3","name":"Razer Reclusa X Mini 65%","category":"keyboard-analog","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":739,"features":["actuation","rapidTrigger","snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    740: {"productId":740,"hexPid":"0x02E4","name":"Razer Huntsman V3 HE Magnetic Mini 65% 8KHz","category":"keyboard-analog","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":740,"features":["actuation","rapidTrigger","snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    741: {"productId":741,"hexPid":"0x02E5","name":"Razer Huntsman V3 Tenkeyless 8KHZ","category":"keyboard-analog","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":741,"features":["actuation","rapidTrigger","snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    742: {"productId":742,"hexPid":"0x02E6","name":"Razer Huntsman V3 Pro Low-Profile Tenkeyless 8KHz","category":"keyboard-analog","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":742,"features":["actuation","rapidTrigger","snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    746: {"productId":746,"hexPid":"0x02EA","name":"Razer Huntsman V3 HE Magnetic Tenkeyless 8KHz","category":"keyboard-analog","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":746,"features":["actuation","rapidTrigger","snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    747: {"productId":747,"hexPid":"0x02EB","name":"Razer Tartarus V2 Pro","category":"keyboard-analog","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":747,"features":["actuation","rapidTrigger","snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    752: {"productId":752,"hexPid":"0x02F0","name":"Razer BlackWidow V4 75% XBOX 25 Anniversary Edition","category":"keyboard","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":752,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    756: {"productId":756,"hexPid":"0x02F4","name":"Razer Reclusa Mini 65%","category":"keyboard-analog","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":756,"donglePid":757,"blePid":758,"features":["actuation","rapidTrigger","snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    757: {"productId":757,"hexPid":"0x02F5","name":"Razer Reclusa Mini 65% (2.4GHz Wireless)","category":"keyboard-analog","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"dongle","primaryPid":756,"features":["actuation","rapidTrigger","snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    758: {"productId":758,"hexPid":"0x02F6","name":"Razer Reclusa Mini 65% (Bluetooth)","category":"keyboard-analog","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"ble","primaryPid":756,"features":["actuation","rapidTrigger","snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    769: {"productId":769,"hexPid":"0x0301","name":"Philips Hue Chroma Bridge","category":"mat-accessory","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":769,"features":["chroma","brightness","zoneStudio","accessoryTelemetry"]},
    777: {"productId":777,"hexPid":"0x0309","name":"Razer Kraken BT Sanrio Limited Edition","category":"audio","protocol":"25","interface":1,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":777,"blePid":777,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement","chroma"]},
    778: {"productId":778,"hexPid":"0x030A","name":"ASRock B550 Taichi Razer Edition","category":"keyboard","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":778,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    780: {"productId":780,"hexPid":"0x030C","name":"Razer Key Light Chroma","category":"mat-accessory","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":780,"features":["chroma","brightness","zoneStudio","accessoryTelemetry"]},
    781: {"productId":781,"hexPid":"0x030D","name":"Razer Aether Lamp Pro","category":"mat-accessory","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":781,"features":["chroma","brightness","zoneStudio","accessoryTelemetry"]},
    782: {"productId":782,"hexPid":"0x030E","name":"Razer Aether Lamp","category":"mat-accessory","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":782,"features":["chroma","brightness","zoneStudio","accessoryTelemetry"]},
    783: {"productId":783,"hexPid":"0x030F","name":"Razer Aether Light Bulb","category":"mat-accessory","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":783,"features":["chroma","brightness","zoneStudio","accessoryTelemetry"]},
    784: {"productId":784,"hexPid":"0x0310","name":"Razer Aether Light Strip","category":"mat-accessory","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":784,"features":["chroma","brightness","zoneStudio","accessoryTelemetry"]},
    790: {"productId":790,"hexPid":"0x0316","name":"Razer Aether Monitor Light Bar","category":"mat-accessory","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":790,"features":["chroma","brightness","zoneStudio","accessoryTelemetry"]},
    791: {"productId":791,"hexPid":"0x0317","name":"Razer Aether Standing Light Bar","category":"mat-accessory","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":791,"features":["chroma","brightness","zoneStudio","accessoryTelemetry"]},
    1303: {"productId":1303,"hexPid":"0x0517","name":"Razer Nommo Chroma","category":"audio","protocol":"25","interface":1,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":1303,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement","chroma"]},
    1304: {"productId":1304,"hexPid":"0x0518","name":"Razer Nommo Pro","category":"audio","protocol":"25","interface":1,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":1304,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement","chroma"]},
    1306: {"productId":1306,"hexPid":"0x051A","name":"Razer Nari Ultimate","category":"audio","protocol":"25","interface":5,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":1306,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement","chroma"]},
    1308: {"productId":1308,"hexPid":"0x051C","name":"Razer Nari","category":"audio","protocol":"25","interface":5,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":1308,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement","chroma"]},
    1310: {"productId":1310,"hexPid":"0x051E","name":"Razer Nari Essential","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"wired","primaryPid":1310,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    1312: {"productId":1312,"hexPid":"0x0520","name":"Razer USB Audio Controller","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"wired","primaryPid":1312,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    1313: {"productId":1313,"hexPid":"0x0521","name":"Razer Kraken Kitty Edition","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":1313,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement","chroma"]},
    1318: {"productId":1318,"hexPid":"0x0526","name":"Razer Kraken X USB","category":"audio","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"wired","primaryPid":1318,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    1319: {"productId":1319,"hexPid":"0x0527","name":"Razer Kraken Ultimate","category":"audio","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":1319,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement","chroma"]},
    1320: {"productId":1320,"hexPid":"0x0528","name":"Razer BlackShark V2 Pro","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"wired","primaryPid":1320,"donglePid":1320,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    1321: {"productId":1321,"hexPid":"0x0529","name":"Razer USB Sound Card","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"wired","primaryPid":1321,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    1324: {"productId":1324,"hexPid":"0x052C","name":"Razer Kraken V3 Pro (2.4GHz Wireless)","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"dongle","primaryPid":1325,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement","chroma"]},
    1325: {"productId":1325,"hexPid":"0x052D","name":"Razer Kraken V3 Pro","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":1325,"donglePid":1324,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement","chroma"]},
    1328: {"productId":1328,"hexPid":"0x0530","name":"Razer Kraken BT Kitty Edition","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":1328,"blePid":1328,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement","chroma"]},
    1330: {"productId":1330,"hexPid":"0x0532","name":"Razer Leviathan V2","category":"audio","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":1330,"blePid":1356,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement","chroma"]},
    1331: {"productId":1331,"hexPid":"0x0533","name":"Razer Kraken V3 Hypersense","category":"audio","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":1331,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement","chroma"]},
    1332: {"productId":1332,"hexPid":"0x0534","name":"Razer Kraken BT - Hello Kitty and Friends Edition","category":"audio","protocol":"25","interface":1,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":1332,"blePid":1332,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement","chroma"]},
    1335: {"productId":1335,"hexPid":"0x0537","name":"Razer Kraken V3 X","category":"audio","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":1335,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement","chroma"]},
    1337: {"productId":1337,"hexPid":"0x0539","name":"Razer Barracuda Pro","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"wired","primaryPid":1337,"donglePid":1338,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    1338: {"productId":1338,"hexPid":"0x053A","name":"Razer Barracuda Pro (2.4GHz Wireless)","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"dongle","primaryPid":1337,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    1339: {"productId":1339,"hexPid":"0x053B","name":"Razer Barracuda","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"wired","primaryPid":1339,"donglePid":1340,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    1340: {"productId":1340,"hexPid":"0x053C","name":"Razer Barracuda (2.4GHz Wireless)","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"dongle","primaryPid":1339,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    1342: {"productId":1342,"hexPid":"0x053E","name":"Razer Audio Mixer","category":"audio","protocol":"25","interface":6,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"wired","primaryPid":1342,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    1346: {"productId":1346,"hexPid":"0x0542","name":"Razer Seiren V2 Pro","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"wired","primaryPid":1346,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    1347: {"productId":1347,"hexPid":"0x0543","name":"Razer Seiren V2 X","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"wired","primaryPid":1347,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    1352: {"productId":1352,"hexPid":"0x0548","name":"Razer Leviathan V2 Pro","category":"audio","protocol":"25","interface":4,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":1352,"blePid":1368,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement","chroma"]},
    1353: {"productId":1353,"hexPid":"0x0549","name":"Razer Kraken V3","category":"audio","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":1353,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement","chroma"]},
    1354: {"productId":1354,"hexPid":"0x054A","name":"Razer Leviathan V2 X","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":1354,"blePid":1369,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement","chroma"]},
    1356: {"productId":1356,"hexPid":"0x054C","name":"Razer Leviathan V2 (Bluetooth)","category":"audio","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"ble","primaryPid":1330,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement","chroma"]},
    1364: {"productId":1364,"hexPid":"0x0554","name":"Razer Kraken Kitty V2 Pro","category":"audio","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":1364,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement","chroma"]},
    1365: {"productId":1365,"hexPid":"0x0555","name":"Razer BlackShark V2 Pro","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"wired","primaryPid":1365,"donglePid":1365,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    1368: {"productId":1368,"hexPid":"0x0558","name":"Razer Leviathan V2 Pro (Bluetooth)","category":"audio","protocol":"25","interface":4,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"ble","primaryPid":1352,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement","chroma"]},
    1369: {"productId":1369,"hexPid":"0x0559","name":"Razer Leviathan V2 X (Bluetooth)","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"ble","primaryPid":1354,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement","chroma"]},
    1370: {"productId":1370,"hexPid":"0x055A","name":"Razer Nommo V2 Pro","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":1370,"blePid":1371,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement","chroma"]},
    1371: {"productId":1371,"hexPid":"0x055B","name":"Razer Nommo V2 Pro (Bluetooth)","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"ble","primaryPid":1370,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement","chroma"]},
    1372: {"productId":1372,"hexPid":"0x055C","name":"Razer Nommo V2","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":1372,"blePid":1373,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement","chroma"]},
    1373: {"productId":1373,"hexPid":"0x055D","name":"Razer Nommo V2 (Bluetooth)","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"ble","primaryPid":1372,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement","chroma"]},
    1374: {"productId":1374,"hexPid":"0x055E","name":"Razer Nommo V2 X","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"wired","primaryPid":1374,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    1376: {"productId":1376,"hexPid":"0x0560","name":"Razer Kraken Kitty V2","category":"audio","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":1376,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement","chroma"]},
    1378: {"productId":1378,"hexPid":"0x0562","name":"Razer Kraken Kitty V2 BT","category":"audio","protocol":"25","interface":1,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":1378,"blePid":1378,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement","chroma"]},
    1381: {"productId":1381,"hexPid":"0x0565","name":"Razer BlackShark V2 HyperSpeed (2.4GHz Wireless)","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"dongle","primaryPid":1390,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    1382: {"productId":1382,"hexPid":"0x0566","name":"Razer Wireless Control Pod","category":"mat-accessory","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":1382,"features":["chroma","brightness","zoneStudio","accessoryTelemetry"]},
    1383: {"productId":1383,"hexPid":"0x0567","name":"Razer Kraken V4 Pro","category":"audio","protocol":"25","interface":5,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":1383,"donglePid":1384,"blePid":1394,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement","chroma"]},
    1384: {"productId":1384,"hexPid":"0x0568","name":"Razer Kraken V4 Pro (2.4GHz Wireless)","category":"audio","protocol":"25","interface":5,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"dongle","primaryPid":1383,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement","chroma"]},
    1386: {"productId":1386,"hexPid":"0x056A","name":"Razer Seiren V3 Mini","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"wired","primaryPid":1386,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    1387: {"productId":1387,"hexPid":"0x056B","name":"Razer Kraken V4","category":"audio","protocol":"25","interface":5,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":1387,"donglePid":1388,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement","chroma"]},
    1388: {"productId":1388,"hexPid":"0x056C","name":"Razer Kraken V4 (2.4GHz Wireless)","category":"audio","protocol":"25","interface":5,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"dongle","primaryPid":1387,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement","chroma"]},
    1389: {"productId":1389,"hexPid":"0x056D","name":"Razer Kraken V4 X","category":"audio","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":1389,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement","chroma"]},
    1390: {"productId":1390,"hexPid":"0x056E","name":"Razer BlackShark V2 HyperSpeed","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"wired","primaryPid":1390,"donglePid":1381,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    1391: {"productId":1391,"hexPid":"0x056F","name":"Razer Seiren V3 Chroma","category":"audio","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":1391,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement","chroma"]},
    1392: {"productId":1392,"hexPid":"0x0570","name":"Razer Clio Wireless Headset Cushion","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"wired","primaryPid":1392,"donglePid":1392,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    1394: {"productId":1394,"hexPid":"0x0572","name":"Razer Kraken V4 Pro (Bluetooth)","category":"audio","protocol":"25","interface":5,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"ble","primaryPid":1383,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement","chroma"]},
    1396: {"productId":1396,"hexPid":"0x0574","name":"Razer Barracuda X Chroma","category":"audio","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":1396,"donglePid":1396,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement","chroma"]},
    1397: {"productId":1397,"hexPid":"0x0575","name":"Razer BlackShark V3 Pro (Bluetooth)","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"ble","primaryPid":1398,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    1398: {"productId":1398,"hexPid":"0x0576","name":"Razer BlackShark V3 Pro","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"wired","primaryPid":1398,"donglePid":1399,"blePid":1397,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    1399: {"productId":1399,"hexPid":"0x0577","name":"Razer BlackShark V3 Pro (2.4GHz Wireless)","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"dongle","primaryPid":1398,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    1400: {"productId":1400,"hexPid":"0x0578","name":"Razer BlackShark V3 (Bluetooth)","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"ble","primaryPid":1401,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    1401: {"productId":1401,"hexPid":"0x0579","name":"Razer BlackShark V3","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"wired","primaryPid":1401,"donglePid":1402,"blePid":1400,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    1402: {"productId":1402,"hexPid":"0x057A","name":"Razer BlackShark V3 (2.4GHz Wireless)","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"dongle","primaryPid":1401,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    1403: {"productId":1403,"hexPid":"0x057B","name":"Razer BlackShark V3 X HyperSpeed (Bluetooth)","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"ble","primaryPid":1404,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    1404: {"productId":1404,"hexPid":"0x057C","name":"Razer BlackShark V3 X HyperSpeed","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"wired","primaryPid":1404,"donglePid":1405,"blePid":1403,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    1405: {"productId":1405,"hexPid":"0x057D","name":"Razer BlackShark V3 X HyperSpeed (2.4GHz Wireless)","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"dongle","primaryPid":1404,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    1406: {"productId":1406,"hexPid":"0x057E","name":"Razer Kraken V2 BT Hello Kitty and Friends Edition","category":"audio","protocol":"25","interface":1,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":1406,"blePid":1406,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement","chroma"]},
    1407: {"productId":1407,"hexPid":"0x057F","name":"Razer | Sanrio Characters Limited Edition Wireless Headset","category":"audio","protocol":"25","interface":1,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":1407,"blePid":1407,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement","chroma"]},
    1411: {"productId":1411,"hexPid":"0x0583","name":"Razer Barracuda Pro (2.4GHz)","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"wired","primaryPid":1411,"donglePid":1411,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    1412: {"productId":1412,"hexPid":"0x0584","name":"Razer Barracuda (2.4GHz)","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"wired","primaryPid":1412,"donglePid":1412,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    1415: {"productId":1415,"hexPid":"0x0587","name":"Razer Kraken Kitty V3 Pro","category":"audio","protocol":"25","interface":5,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":1415,"donglePid":1416,"blePid":1417,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement","chroma"]},
    1416: {"productId":1416,"hexPid":"0x0588","name":"Razer Kraken Kitty V3 Pro (2.4GHz Wireless)","category":"audio","protocol":"25","interface":5,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"dongle","primaryPid":1415,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement","chroma"]},
    1417: {"productId":1417,"hexPid":"0x0589","name":"Razer Kraken Kitty V3 Pro (Bluetooth)","category":"audio","protocol":"25","interface":5,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"ble","primaryPid":1415,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement","chroma"]},
    1420: {"productId":1420,"hexPid":"0x058C","name":"Razer Hammerhead V3 Wired Earbuds","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":1420,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement","chroma"]},
    1422: {"productId":1422,"hexPid":"0x058E","name":"Razer Seiren V3 Pro","category":"audio","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":1422,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement","chroma"]},
    1426: {"productId":1426,"hexPid":"0x0592","name":"Razer BlackShark V3 Pro (Special Edition) (2.4GHz Wireless)","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"dongle","primaryPid":1427,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    1427: {"productId":1427,"hexPid":"0x0593","name":"Razer BlackShark V3 Pro (Special Edition)","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"wired","primaryPid":1427,"donglePid":1426,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    1439: {"productId":1439,"hexPid":"0x059F","name":"Razer Kraken V4 X Sensa HD Haptics","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":1439,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement","chroma"]},
    1442: {"productId":1442,"hexPid":"0x05A2","name":"Razer Clio X","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"wired","primaryPid":1442,"donglePid":1442,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    1443: {"productId":1443,"hexPid":"0x05A3","name":"Razer Leviathan V2","category":"audio","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":1443,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement","chroma"]},
    1446: {"productId":1446,"hexPid":"0x05A6","name":"Razer Seiren V3 Chroma 32-Bit DSP","category":"audio","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":1446,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement","chroma"]},
    1453: {"productId":1453,"hexPid":"0x05AD","name":"Razer Mako X","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":1453,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement","chroma"]},
    1462: {"productId":1462,"hexPid":"0x05B6","name":"Razer Kraken Kitty V3","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":1462,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement","chroma"]},
    1465: {"productId":1465,"hexPid":"0x05B9","name":"Razer Hammerhead V3 Chroma","category":"audio","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":1465,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement","chroma"]},
    2308: {"productId":2308,"hexPid":"0x0904","name":"Razer Turret Keyboard Xbox One Edition (2.4GHz Wireless)","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"dongle","primaryPid":574,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    2580: {"productId":2580,"hexPid":"0x0A14","name":"Razer Wolverine Ultimate","category":"controller","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"wired","primaryPid":2580,"features":["deadzones","triggerStops","vibration","controllerRemap","pollingRate"]},
    2581: {"productId":2581,"hexPid":"0x0A15","name":"Razer Wolverine Tournament Edition","category":"controller","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"wired","primaryPid":2581,"features":["deadzones","triggerStops","vibration","controllerRemap","pollingRate"]},
    2593: {"productId":2593,"hexPid":"0x0A21","name":"Razer Turret Keyboard Gears Of War 5 Edition (2.4GHz Wireless)","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"dongle","primaryPid":2595,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    2594: {"productId":2594,"hexPid":"0x0A22","name":"Razer Turret Mouse Gears Of War 5 Edition","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":2594,"donglePid":2593,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    2595: {"productId":2595,"hexPid":"0x0A23","name":"Razer Turret Keyboard Gears Of War 5 Edition","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":2595,"donglePid":2593,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    2596: {"productId":2596,"hexPid":"0x0A24","name":"Razer BlackWidow V3 Tenkeyless","category":"keyboard","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":2596,"features":["snapTap","pollingRate","chroma","gamingMode","keyMatrix","remap","macros"]},
    2597: {"productId":2597,"hexPid":"0x0A25","name":"Razer Kaira Pro for Xbox","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"dongle","primaryPid":2597,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    2599: {"productId":2599,"hexPid":"0x0A27","name":"Razer Kaira for Xbox","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"dongle","primaryPid":2599,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    2601: {"productId":2601,"hexPid":"0x0A29","name":"Razer Wolverine V2 White","category":"controller","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"wired","primaryPid":2601,"features":["deadzones","triggerStops","vibration","controllerRemap","pollingRate"]},
    2606: {"productId":2606,"hexPid":"0x0A2E","name":"Razer Wolverine V2 Chroma","category":"controller","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":2606,"features":["deadzones","triggerStops","vibration","controllerRemap","pollingRate","chroma"]},
    2610: {"productId":2610,"hexPid":"0x0A32","name":"Razer Hammerhead True Wireless V2","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"dongle","primaryPid":2610,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    2612: {"productId":2612,"hexPid":"0x0A34","name":"Razer Kaira Pro HyperSpeed","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"dongle","primaryPid":2612,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    2623: {"productId":2623,"hexPid":"0x0A3F","name":"Razer Wolverine V3 Pro (Alt Mode)","category":"controller","protocol":"25","interface":1,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"wired","primaryPid":2636,"features":["deadzones","triggerStops","vibration","controllerRemap","pollingRate"]},
    2627: {"productId":2627,"hexPid":"0x0A43","name":"Razer Wolverine V3 Tournament Edition (Alt Mode)","category":"controller","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"wired","primaryPid":2629,"features":["deadzones","triggerStops","vibration","controllerRemap","pollingRate"]},
    2629: {"productId":2629,"hexPid":"0x0A45","name":"Razer Wolverine V3 Tournament Edition","category":"controller","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"wired","primaryPid":2629,"features":["deadzones","triggerStops","vibration","controllerRemap","pollingRate"]},
    2636: {"productId":2636,"hexPid":"0x0A4C","name":"Razer Wolverine V3 Pro","category":"controller","protocol":"25","interface":1,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"wired","primaryPid":2636,"features":["deadzones","triggerStops","vibration","controllerRemap","pollingRate"]},
    2637: {"productId":2637,"hexPid":"0x0A4D","name":"Razer BlackShark V3 Pro for Xbox (Alt Mode)","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"wired","primaryPid":2638,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    2638: {"productId":2638,"hexPid":"0x0A4E","name":"Razer BlackShark V3 Pro for Xbox","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"wired","primaryPid":2638,"donglePid":2645,"blePid":2639,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    2639: {"productId":2639,"hexPid":"0x0A4F","name":"Razer BlackShark V3 Pro for Xbox (Bluetooth)","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"ble","primaryPid":2638,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    2640: {"productId":2640,"hexPid":"0x0A50","name":"Razer BlackShark V3 for Xbox (Alt Mode)","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"wired","primaryPid":2641,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    2641: {"productId":2641,"hexPid":"0x0A51","name":"Razer BlackShark V3 for Xbox","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"wired","primaryPid":2641,"donglePid":2648,"blePid":2642,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    2642: {"productId":2642,"hexPid":"0x0A52","name":"Razer BlackShark V3 for Xbox (Bluetooth)","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"ble","primaryPid":2641,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    2643: {"productId":2643,"hexPid":"0x0A53","name":"Razer BlackShark V3 X HyperSpeed for Xbox (Alt Mode)","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"wired","primaryPid":2644,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    2644: {"productId":2644,"hexPid":"0x0A54","name":"Razer BlackShark V3 X HyperSpeed for Xbox","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"wired","primaryPid":2644,"donglePid":2651,"blePid":2646,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    2645: {"productId":2645,"hexPid":"0x0A55","name":"Razer BlackShark V3 Pro for Xbox (2.4GHz Wireless)","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"dongle","primaryPid":2638,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    2646: {"productId":2646,"hexPid":"0x0A56","name":"Razer BlackShark V3 X HyperSpeed for Xbox (Bluetooth)","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"ble","primaryPid":2644,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    2647: {"productId":2647,"hexPid":"0x0A57","name":"Razer Wolverine V3 Pro 8K PC","category":"controller","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"wired","primaryPid":2647,"donglePid":2649,"features":["deadzones","triggerStops","vibration","controllerRemap","pollingRate"]},
    2648: {"productId":2648,"hexPid":"0x0A58","name":"Razer BlackShark V3 for Xbox (2.4GHz Wireless)","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"dongle","primaryPid":2641,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    2649: {"productId":2649,"hexPid":"0x0A59","name":"Razer Wolverine V3 Pro 8K PC (2.4GHz Wireless)","category":"controller","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"dongle","primaryPid":2647,"features":["deadzones","triggerStops","vibration","controllerRemap","pollingRate"]},
    2650: {"productId":2650,"hexPid":"0x0A5A","name":"Razer Wolverine V3 Tournament Edition 8K PC","category":"controller","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"wired","primaryPid":2650,"features":["deadzones","triggerStops","vibration","controllerRemap","pollingRate"]},
    2651: {"productId":2651,"hexPid":"0x0A5B","name":"Razer BlackShark V3 X HyperSpeed for Xbox (2.4GHz Wireless)","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"dongle","primaryPid":2644,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    2657: {"productId":2657,"hexPid":"0x0A61","name":"Razer Hammerhead V3 HyperSpeed Earbuds","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"wired","primaryPid":2657,"donglePid":2657,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    2660: {"productId":2660,"hexPid":"0x0A64","name":"Razer Hammerhead V3 X HyperSpeed Earbuds","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"wired","primaryPid":2660,"donglePid":2660,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    2664: {"productId":2664,"hexPid":"0x0A68","name":"Razer Hammerhead V3 X HyperSpeed for Xbox","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"wired","primaryPid":2664,"donglePid":2664,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    2665: {"productId":2665,"hexPid":"0x0A69","name":"Razer Hammerhead V3 X HyperSpeed for Xbox (Alt Mode)","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"wired","primaryPid":2664,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    2668: {"productId":2668,"hexPid":"0x0A6C","name":"Razer Hammerhead V3 X HyperSpeed for PlayStation","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"wired","primaryPid":2668,"donglePid":2668,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    2674: {"productId":2674,"hexPid":"0x0A72","name":"Razer Wolverine V4 Pro (Alt Mode)","category":"controller","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"wired","primaryPid":2676,"features":["deadzones","triggerStops","vibration","controllerRemap","pollingRate"]},
    2676: {"productId":2676,"hexPid":"0x0A74","name":"Razer Wolverine V4 Pro","category":"controller","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"wired","primaryPid":2676,"donglePid":2680,"features":["deadzones","triggerStops","vibration","controllerRemap","pollingRate"]},
    2677: {"productId":2677,"hexPid":"0x0A75","name":"Razer Wolverine V4 Pro (Alt Mode)","category":"controller","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"wired","primaryPid":2676,"features":["deadzones","triggerStops","vibration","controllerRemap","pollingRate"]},
    2678: {"productId":2678,"hexPid":"0x0A76","name":"Razer Wolverine V4 Pro (Alt Mode)","category":"controller","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"wired","primaryPid":2676,"features":["deadzones","triggerStops","vibration","controllerRemap","pollingRate"]},
    2680: {"productId":2680,"hexPid":"0x0A78","name":"Razer Wolverine V4 Pro (2.4GHz Wireless)","category":"controller","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"dongle","primaryPid":2676,"features":["deadzones","triggerStops","vibration","controllerRemap","pollingRate"]},
    2681: {"productId":2681,"hexPid":"0x0A79","name":"Razer Wolverine V4 Pro (2.4GHz Wireless)","category":"controller","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"dongle","primaryPid":2676,"features":["deadzones","triggerStops","vibration","controllerRemap","pollingRate"]},
    2682: {"productId":2682,"hexPid":"0x0A7A","name":"Razer Wolverine V4 Tournament Edition (Alt Mode)","category":"controller","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"wired","primaryPid":2684,"features":["deadzones","triggerStops","vibration","controllerRemap","pollingRate"]},
    2684: {"productId":2684,"hexPid":"0x0A7C","name":"Razer Wolverine V4 Tournament Edition","category":"controller","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"wired","primaryPid":2684,"features":["deadzones","triggerStops","vibration","controllerRemap","pollingRate"]},
    2685: {"productId":2685,"hexPid":"0x0A7D","name":"Razer Wolverine V4 Tournament Edition (Alt Mode)","category":"controller","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"wired","primaryPid":2684,"features":["deadzones","triggerStops","vibration","controllerRemap","pollingRate"]},
    2689: {"productId":2689,"hexPid":"0x0A81","name":"Razer Hammerhead V3 X HyperSpeed (Wireless)","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"wired","primaryPid":2689,"donglePid":2689,"blePid":2690,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    2690: {"productId":2690,"hexPid":"0x0A82","name":"Razer Hammerhead V3 X HyperSpeed (Wireless) (Bluetooth)","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"ble","primaryPid":2689,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    3072: {"productId":3072,"hexPid":"0x0C00","name":"Razer Firefly Hard Edition","category":"mat-accessory","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":3072,"features":["chroma","brightness","zoneStudio","accessoryTelemetry"]},
    3073: {"productId":3073,"hexPid":"0x0C01","name":"Razer Goliathus Chroma","category":"mat-accessory","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":3073,"features":["chroma","brightness","zoneStudio","accessoryTelemetry"]},
    3074: {"productId":3074,"hexPid":"0x0C02","name":"Razer Goliathus Chroma Extended","category":"mat-accessory","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":3074,"features":["chroma","brightness","zoneStudio","accessoryTelemetry"]},
    3076: {"productId":3076,"hexPid":"0x0C04","name":"Razer Firefly V2","category":"mat-accessory","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":3076,"features":["chroma","brightness","zoneStudio","accessoryTelemetry"]},
    3077: {"productId":3077,"hexPid":"0x0C05","name":"Razer Strider Chroma","category":"mat-accessory","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":3077,"features":["chroma","brightness","zoneStudio","accessoryTelemetry"]},
    3078: {"productId":3078,"hexPid":"0x0C06","name":"Razer Goliathus Chroma 3XL","category":"mat-accessory","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":3078,"features":["chroma","brightness","zoneStudio","accessoryTelemetry"]},
    3080: {"productId":3080,"hexPid":"0x0C08","name":"Razer Firefly V2 Pro","category":"mat-accessory","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":3080,"features":["chroma","brightness","zoneStudio","accessoryTelemetry"]},
    3331: {"productId":3331,"hexPid":"0x0D03","name":"Razer Ripsaw HD","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"wired","primaryPid":3331,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    3334: {"productId":3334,"hexPid":"0x0D06","name":"Razer Stream Controller","category":"controller","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"wired","primaryPid":3334,"features":["deadzones","triggerStops","vibration","controllerRemap","pollingRate"]},
    3337: {"productId":3337,"hexPid":"0x0D09","name":"Razer Stream Controller X","category":"controller","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"wired","primaryPid":3337,"features":["deadzones","triggerStops","vibration","controllerRemap","pollingRate"]},
    3587: {"productId":3587,"hexPid":"0x0E03","name":"Razer Kiyo","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"wired","primaryPid":3587,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    3589: {"productId":3589,"hexPid":"0x0E05","name":"Razer Kiyo Pro","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"wired","primaryPid":3589,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    3590: {"productId":3590,"hexPid":"0x0E06","name":"Razer Kiyo X","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"wired","primaryPid":3590,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    3592: {"productId":3592,"hexPid":"0x0E08","name":"Razer Kiyo Pro Ultra","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"wired","primaryPid":3592,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    3594: {"productId":3594,"hexPid":"0x0E0A","name":"Razer Kiyo V2 Pro","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"wired","primaryPid":3594,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    3595: {"productId":3595,"hexPid":"0x0E0B","name":"Razer Kiyo V2","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"wired","primaryPid":3595,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    3596: {"productId":3596,"hexPid":"0x0E0C","name":"Razer Kiyo V2 X","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"wired","primaryPid":3596,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    3848: {"productId":3848,"hexPid":"0x0F08","name":"Razer Base Station Chroma","category":"mat-accessory","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":3848,"features":["chroma","brightness","zoneStudio","accessoryTelemetry"]},
    3849: {"productId":3849,"hexPid":"0x0F09","name":"Razer Chroma HDK","category":"mat-accessory","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":3849,"features":["chroma","brightness","zoneStudio","accessoryTelemetry"]},
    3853: {"productId":3853,"hexPid":"0x0F0D","name":"Razer Laptop Stand Chroma","category":"mat-accessory","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":3853,"features":["chroma","brightness","zoneStudio","accessoryTelemetry"]},
    3858: {"productId":3858,"hexPid":"0x0F12","name":"Razer Raptor 27","category":"mat-accessory","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":3858,"features":["chroma","brightness","zoneStudio","accessoryTelemetry"]},
    3859: {"productId":3859,"hexPid":"0x0F13","name":"Lian Li 011 Dynamic Designed by Razer","category":"mat-accessory","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":3859,"features":["chroma","brightness","zoneStudio","accessoryTelemetry"]},
    3863: {"productId":3863,"hexPid":"0x0F17","name":"Razer Tomahawk Chassis","category":"mat-accessory","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":3863,"features":["chroma","brightness","zoneStudio","accessoryTelemetry"]},
    3866: {"productId":3866,"hexPid":"0x0F1A","name":"Razer Core X Chroma","category":"mat-accessory","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":3866,"features":["chroma","brightness","zoneStudio","accessoryTelemetry"]},
    3867: {"productId":3867,"hexPid":"0x0F1B","name":"Razer Seiren Emote","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"wired","primaryPid":3867,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    3869: {"productId":3869,"hexPid":"0x0F1D","name":"Razer Bungee V3 Chroma","category":"mat-accessory","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":3869,"features":["chroma","brightness","zoneStudio","accessoryTelemetry"]},
    3871: {"productId":3871,"hexPid":"0x0F1F","name":"Razer Chroma Addressable RGB Controller","category":"mat-accessory","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":3871,"features":["chroma","brightness","zoneStudio","accessoryTelemetry"]},
    3872: {"productId":3872,"hexPid":"0x0F20","name":"Razer Base Station V2 Chroma","category":"mat-accessory","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":3872,"features":["chroma","brightness","zoneStudio","accessoryTelemetry"]},
    3873: {"productId":3873,"hexPid":"0x0F21","name":"Razer Thunderbolt 4 Dock Chroma","category":"mat-accessory","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":3873,"features":["chroma","brightness","zoneStudio","accessoryTelemetry"]},
    3878: {"productId":3878,"hexPid":"0x0F26","name":"Razer Chroma Charging Pad 10W Fast Wireless Charger","category":"mat-accessory","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":3878,"features":["chroma","brightness","zoneStudio","accessoryTelemetry"]},
    3879: {"productId":3879,"hexPid":"0x0F27","name":"Razer Tomahawk Gaming Desktop","category":"mat-accessory","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":3879,"features":["chroma","brightness","zoneStudio","accessoryTelemetry"]},
    3880: {"productId":3880,"hexPid":"0x0F28","name":"Razer Raptor 27 (165Hz)","category":"mat-accessory","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":3880,"features":["chroma","brightness","zoneStudio","accessoryTelemetry"]},
    3883: {"productId":3883,"hexPid":"0x0F2B","name":"Razer Laptop Stand V2 Chroma","category":"mat-accessory","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":3883,"features":["chroma","brightness","zoneStudio","accessoryTelemetry"]},
    3884: {"productId":3884,"hexPid":"0x0F2C","name":"Razer Chroma Wireless ARGB Controller","category":"mat-accessory","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":3884,"donglePid":3884,"blePid":3885,"features":["chroma","brightness","zoneStudio","accessoryTelemetry"]},
    3885: {"productId":3885,"hexPid":"0x0F2D","name":"Razer Chroma Wireless ARGB Controller (Bluetooth)","category":"mat-accessory","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"ble","primaryPid":3884,"features":["chroma","brightness","zoneStudio","accessoryTelemetry"]},
    3893: {"productId":3893,"hexPid":"0x0F35","name":"Razer Hanbo Aio 240mm Argb","category":"mat-accessory","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":3893,"features":["chroma","brightness","zoneStudio","accessoryTelemetry"]},
    3894: {"productId":3894,"hexPid":"0x0F36","name":"Razer Head Cushion Chroma","category":"mat-accessory","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":3894,"blePid":3894,"features":["chroma","brightness","zoneStudio","accessoryTelemetry"]},
    3900: {"productId":3900,"hexPid":"0x0F3C","name":"Razer PWM PC Fan Controller","category":"mat-accessory","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"wired","primaryPid":3900,"features":["chroma","brightness","zoneStudio","accessoryTelemetry"]},
    3907: {"productId":3907,"hexPid":"0x0F43","name":"Razer Laptop Cooling Pad","category":"mat-accessory","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":3907,"features":["chroma","brightness","zoneStudio","accessoryTelemetry"]},
    3909: {"productId":3909,"hexPid":"0x0F45","name":"Razer Freyja","category":"mat-accessory","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"wired","primaryPid":3909,"blePid":3910,"features":["chroma","brightness","zoneStudio","accessoryTelemetry"]},
    3910: {"productId":3910,"hexPid":"0x0F46","name":"Razer Freyja (Bluetooth)","category":"mat-accessory","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"ble","primaryPid":3909,"features":["chroma","brightness","zoneStudio","accessoryTelemetry"]},
    3921: {"productId":3921,"hexPid":"0x0F51","name":"Razer Core X V2","category":"mat-accessory","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":3921,"features":["chroma","brightness","zoneStudio","accessoryTelemetry"]},
    3922: {"productId":3922,"hexPid":"0x0F52","name":"Razer Thunderbolt 5 Dock Chroma","category":"mat-accessory","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":3922,"features":["chroma","brightness","zoneStudio","accessoryTelemetry"]},
    3929: {"productId":3929,"hexPid":"0x0F59","name":"Razer Monitor Stand Chroma","category":"mat-accessory","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":3929,"features":["chroma","brightness","zoneStudio","accessoryTelemetry"]},
    3932: {"productId":3932,"hexPid":"0x0F5C","name":"Razer Handheld Dock Chroma","category":"mat-accessory","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":3932,"features":["chroma","brightness","zoneStudio","accessoryTelemetry"]},
    3940: {"productId":3940,"hexPid":"0x0F64","name":"Razer Soma Chroma","category":"mat-accessory","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":3940,"features":["chroma","brightness","zoneStudio","accessoryTelemetry"]},
    3942: {"productId":3942,"hexPid":"0x0F66","name":"Razer Soma Pro","category":"mat-accessory","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":3942,"features":["chroma","brightness","zoneStudio","accessoryTelemetry"]},
    3946: {"productId":3946,"hexPid":"0x0F6A","name":"Razer Base Station V3 Chroma","category":"mat-accessory","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":3946,"features":["chroma","brightness","zoneStudio","accessoryTelemetry"]},
    3949: {"productId":3949,"hexPid":"0x0F6D","name":"Razer Soma Sensa HD Haptics","category":"mat-accessory","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"wired","primaryPid":3949,"features":["chroma","brightness","zoneStudio","accessoryTelemetry"]},
    4114: {"productId":4114,"hexPid":"0x1012","name":"Razer Kitsune (Alt Mode)","category":"controller","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":4115,"features":["deadzones","triggerStops","vibration","controllerRemap","pollingRate","chroma"]},
    4115: {"productId":4115,"hexPid":"0x1013","name":"Razer Kitsune","category":"controller","protocol":"25","interface":2,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":4115,"features":["deadzones","triggerStops","vibration","controllerRemap","pollingRate","chroma"]},
    4123: {"productId":4123,"hexPid":"0x101B","name":"Razer BlackShark V3 Pro for PlayStation (2.4GHz Wireless)","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"dongle","primaryPid":4124,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    4124: {"productId":4124,"hexPid":"0x101C","name":"Razer BlackShark V3 Pro for PlayStation","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"wired","primaryPid":4124,"donglePid":4123,"blePid":4125,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    4125: {"productId":4125,"hexPid":"0x101D","name":"Razer BlackShark V3 Pro for PlayStation (Bluetooth)","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"ble","primaryPid":4124,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    4126: {"productId":4126,"hexPid":"0x101E","name":"Razer BlackShark V3 for PlayStation","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"wired","primaryPid":4126,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    4129: {"productId":4129,"hexPid":"0x1021","name":"Razer BlackShark V3 X HyperSpeed for PlayStation (2.4GHz Wireless)","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"dongle","primaryPid":4130,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    4130: {"productId":4130,"hexPid":"0x1022","name":"Razer BlackShark V3 X HyperSpeed for PlayStation","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"wired","primaryPid":4130,"donglePid":4129,"blePid":4131,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    4131: {"productId":4131,"hexPid":"0x1023","name":"Razer BlackShark V3 X HyperSpeed for PlayStation (Bluetooth)","category":"audio","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":false,"connection":"ble","primaryPid":4130,"features":["audioVolume","micControl","sidetone","equalizer","haptics","soundEnhancement"]},
    4132: {"productId":4132,"hexPid":"0x1024","name":"Razer Wolverine V3 Pro (PlayStation / PC) (Alt Mode)","category":"controller","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"wired","primaryPid":4133,"features":["deadzones","triggerStops","vibration","controllerRemap","pollingRate"]},
    4133: {"productId":4133,"hexPid":"0x1025","name":"Razer Wolverine V3 Pro (PlayStation / PC)","category":"controller","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"wired","primaryPid":4133,"donglePid":4135,"blePid":4136,"features":["deadzones","triggerStops","vibration","controllerRemap","pollingRate"]},
    4134: {"productId":4134,"hexPid":"0x1026","name":"Razer Wolverine V3 Pro (PlayStation / PC) (Alt Mode)","category":"controller","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"wired","primaryPid":4133,"features":["deadzones","triggerStops","vibration","controllerRemap","pollingRate"]},
    4135: {"productId":4135,"hexPid":"0x1027","name":"Razer Wolverine V3 Pro (PlayStation / PC) (2.4GHz Wireless)","category":"controller","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"dongle","primaryPid":4133,"features":["deadzones","triggerStops","vibration","controllerRemap","pollingRate"]},
    4136: {"productId":4136,"hexPid":"0x1028","name":"Razer Wolverine V3 Pro (PlayStation / PC) (Bluetooth)","category":"controller","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"ble","primaryPid":4133,"features":["deadzones","triggerStops","vibration","controllerRemap","pollingRate"]},
    4143: {"productId":4143,"hexPid":"0x102F","name":"Razer Raiju V3 Pro Signature Edition (Alt Mode)","category":"controller","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"wired","primaryPid":4144,"features":["deadzones","triggerStops","vibration","controllerRemap","pollingRate"]},
    4144: {"productId":4144,"hexPid":"0x1030","name":"Razer Raiju V3 Pro Signature Edition","category":"controller","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"wired","primaryPid":4144,"donglePid":4146,"blePid":4147,"features":["deadzones","triggerStops","vibration","controllerRemap","pollingRate"]},
    4145: {"productId":4145,"hexPid":"0x1031","name":"Razer Raiju V3 Pro Signature Edition (Alt Mode)","category":"controller","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"wired","primaryPid":4144,"features":["deadzones","triggerStops","vibration","controllerRemap","pollingRate"]},
    4146: {"productId":4146,"hexPid":"0x1032","name":"Razer Raiju V3 Pro Signature Edition (2.4GHz Wireless)","category":"controller","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"dongle","primaryPid":4144,"features":["deadzones","triggerStops","vibration","controllerRemap","pollingRate"]},
    4147: {"productId":4147,"hexPid":"0x1033","name":"Razer Raiju V3 Pro Signature Edition (Bluetooth)","category":"controller","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"ble","primaryPid":4144,"features":["deadzones","triggerStops","vibration","controllerRemap","pollingRate"]},
    5122: {"productId":5122,"hexPid":"0x1402","name":"Razer Raptor 27 (Alt Mode)","category":"mat-accessory","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":3858,"features":["chroma","brightness","zoneStudio","accessoryTelemetry"]},
    5125: {"productId":5125,"hexPid":"0x1405","name":"Razer Raptor 27 (165Hz) (Alt Mode)","category":"mat-accessory","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":3880,"features":["chroma","brightness","zoneStudio","accessoryTelemetry"]},
    5126: {"productId":5126,"hexPid":"0x1406","name":"Razer Raptor 27 (165Hz) (Alt Mode)","category":"mat-accessory","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":3880,"features":["chroma","brightness","zoneStudio","accessoryTelemetry"]},
    5127: {"productId":5127,"hexPid":"0x1407","name":"Razer Raptor 27 (165Hz) (Alt Mode)","category":"mat-accessory","protocol":"25","interface":0,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":4,"isChroma":true,"connection":"wired","primaryPid":3880,"features":["chroma","brightness","zoneStudio","accessoryTelemetry"]},
    45061: {"productId":45061,"hexPid":"0xB005","name":"Razer Viper V4 HyperSpeed","category":"mouse","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"wired","primaryPid":45061,"donglePid":45061,"blePid":45062,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    45062: {"productId":45062,"hexPid":"0xB006","name":"Razer Viper V4 HyperSpeed (Bluetooth)","category":"mouse","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"ble","primaryPid":45061,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    45063: {"productId":45063,"hexPid":"0xB007","name":"Razer DeathAdder V4 HyperSpeed","category":"mouse","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"wired","primaryPid":45063,"donglePid":45063,"blePid":45064,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    45064: {"productId":45064,"hexPid":"0xB008","name":"Razer DeathAdder V4 HyperSpeed (Bluetooth)","category":"mouse","protocol":"25","interface":3,"usagePage":12,"usage":1,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":false,"connection":"ble","primaryPid":45063,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    45066: {"productId":45066,"hexPid":"0xB00A","name":"Razer Basilisk V3 Pro 35K - Xbox 25 Anniversary Edition","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"wired","primaryPid":45066,"donglePid":45067,"blePid":45068,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    45067: {"productId":45067,"hexPid":"0xB00B","name":"Razer Basilisk V3 Pro 35K - Xbox 25 Anniversary Edition (2.4GHz Wireless)","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":63,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"dongle","primaryPid":45066,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
    45068: {"productId":45068,"hexPid":"0xB00C","name":"Razer Basilisk V3 Pro 35K - Xbox 25 Anniversary Edition (Bluetooth)","category":"mouse","protocol":"25","interface":0,"usagePage":1,"usage":2,"defaultTransactionId":31,"reportId":0,"maxSlots":5,"isChroma":true,"connection":"ble","primaryPid":45066,"features":["dpi","pollingRate","smartTracking","sensorAngle","dynamicSensitivity","powerSaving","remap","chroma"]},
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
    0x32: 42, // Non-US #
    0x4f: 89, // Right Arrow
    0x50: 79, // Left Arrow
    0x51: 84, // Down Arrow
    0x52: 83, // Up Arrow
    0x64: 45, // Non-US \
    0x65: 129, // Application / Menu
    0xe0: 58, // Left Ctrl
    0xe1: 44, // Left Shift
    0xe2: 60, // Left Alt
    0xe3: 127, // Left GUI / Win
    0xe4: 64, // Right Ctrl
    0xe5: 57, // Right Shift
    0xe6: 62, // Right Alt
    0xe7: 59, // Right GUI / Fn
  };

  const STRING_TO_RAZER_KEY_ID = {
    ESC: 110, F1: 112, F2: 113, F3: 114, F4: 115, F5: 116, F6: 117, F7: 118, F8: 119, F9: 120, F10: 121, F11: 122, F12: 123,
    PRT: 124, SCR: 125, PAU: 126,
    "`": 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7, 7: 8, 8: 9, 9: 10, 0: 11, "-": 12, "=": 13, BKSP: 15, BACKSPACE: 15,
    INS: 75, HOME: 80, PGUP: 85,
    TAB: 16, Q: 17, W: 18, E: 19, R: 20, T: 21, Y: 22, U: 23, I: 24, O: 25, P: 26, "[": 27, "]": 28, "\\": 29,
    DEL: 76, END: 81, PGDN: 86,
    CAPS: 30, A: 31, S: 32, D: 33, F: 34, G: 35, H: 36, J: 37, K: 38, L: 39, ";": 40, "'": 41, ENTER: 43,
    SHIFT: 44, LSHIFT: 44, Z: 46, X: 47, C: 48, V: 49, B: 50, N: 51, M: 52, ",": 53, ".": 54, "/": 55, RSHIFT: 57,
    UP: 83, "↑": 83,
    CTRL: 58, LCTRL: 58, WIN: 127, LWIN: 127, ALT: 60, LALT: 60, SPACE: 61, RALT: 62, FN: 59, MENU: 129, RCTRL: 64,
    LEFT: 79, "←": 79, DOWN: 84, "↓": 84, RIGHT: 89, "→": 89,
  };

  const KEY_LABEL_TO_USB_HID = {
    A: 0x04, B: 0x05, C: 0x06, D: 0x07, E: 0x08, F: 0x09, G: 0x0a, H: 0x0b, I: 0x0c,
    J: 0x0d, K: 0x0e, L: 0x0f, M: 0x10, N: 0x11, O: 0x12, P: 0x13, Q: 0x14, R: 0x15,
    S: 0x16, T: 0x17, U: 0x18, V: 0x19, W: 0x1a, X: 0x1b, Y: 0x1c, Z: 0x1d,
    1: 0x1e, 2: 0x1f, 3: 0x20, 4: 0x21, 5: 0x22, 6: 0x23, 7: 0x24, 8: 0x25, 9: 0x26, 0: 0x27,
    ENTER: 0x28, ESC: 0x29, BACKSPACE: 0x2a, BKSP: 0x2a, TAB: 0x2b, SPACE: 0x2c,
    "-": 0x2d, "=": 0x2e, "[": 0x2f, "]": 0x30, "\\": 0x31, ";": 0x33, "'": 0x34, "`": 0x35, ",": 0x36, ".": 0x37, "/": 0x38,
    CAPS: 0x39, F1: 0x3a, F2: 0x3b, F3: 0x3c, F4: 0x3d, F5: 0x3e, F6: 0x3f,
    F7: 0x40, F8: 0x41, F9: 0x42, F10: 0x43, F11: 0x44, F12: 0x45,
    PRT: 0x46, SCR: 0x47, PAU: 0x48, INS: 0x49, HOME: 0x4a, PGUP: 0x4b, DEL: 0x4c, END: 0x4d, PGDN: 0x4e,
    RIGHT: 0x4f, "→": 0x4f, LEFT: 0x50, "←": 0x50, DOWN: 0x51, "↓": 0x51, UP: 0x52, "↑": 0x52,
    MENU: 0x65,
    LCTRL: 0xe0, CTRL: 0xe0, LSHIFT: 0xe1, SHIFT: 0xe1, LALT: 0xe2, ALT: 0xe2, WIN: 0xe3, LWIN: 0xe3,
    RCTRL: 0xe4, RSHIFT: 0xe5, RALT: 0xe6, FN: 0xe7,
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
    setContinuousRapidTrigger({ slotId = 1, enabled = true, continuousRt, transactionId = 0x1f } = {}) {
      const isOn = continuousRt !== undefined ? Boolean(continuousRt) : Boolean(enabled);
      return buildPacket({
        commandClass: 0x02,
        commandId: 0x20,
        dataSize: 0x02,
        args: [Math.max(1, Math.min(6, Number(slotId) || 1)) & 0xff, isOn ? 0x01 : 0x00],
        transactionId,
      });
    },

    getBrightness(ledId = 0x00, varStore = 0x01, transactionId = 0x1f) {
      return buildPacket({
        commandClass: 0x0f,
        commandId: 0x84,
        dataSize: 0x03,
        args: [varStore & 0xff, ledId & 0xff, 0x00],
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

    /**
     * Force Chroma Ctrl / WDL Lockout Toggle (Class 0x0F, Cmd 0x10 / 0x90)
     * Setting enabled = false (0x00) unlocks USB HID LampArray (MI_04, UsagePage 0x0059)
     * so browser WebHID LampArray reports can control the hardware LEDs directly.
     */
    setForceChromaCtrl(enabled = false, transactionId = 0x1f) {
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
      const uiSpd = Number(speed) || 2;
      const hwDurationEnum = uiSpd <= 1 ? 0x03 : uiSpd >= 3 ? 0x01 : 0x02;
      const hwWavePeriod = uiSpd <= 1 ? 0x50 : uiSpd >= 3 ? 0x14 : 0x28;
      const hwFirePeriod = uiSpd <= 1 ? 0x8c : uiSpd >= 3 ? 0x32 : 0x5a;
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
          args = [varStore, ledId, 0x04, direction & 0xff, hwWavePeriod, 0x00];
          break;
        case "reactive":
          args = [varStore, ledId, 0x05, 0x00, hwDurationEnum, 0x01, r & 0xff, g & 0xff, b & 0xff];
          break;
        case "ripple":
          args = [varStore, ledId, 0x06, 0x00, hwWavePeriod, 0x01, r & 0xff, g & 0xff, b & 0xff];
          break;
        case "starlight":
          args = [varStore, ledId, 0x07, 0x01, hwDurationEnum, 0x01, r & 0xff, g & 0xff, b & 0xff];
          break;
        case "fire":
          args = [varStore, ledId, 0x09, 0x00, hwFirePeriod, 0x01, 0xff, 0x00, 0x00];
          break;
        case "wheel":
        case "spiral":
          args = [varStore, ledId, 0x0a, direction & 0xff, hwWavePeriod, 0x00];
          break;
        case "splash":
          args = [varStore, ledId, 0x04, direction & 0xff, hwWavePeriod, 0x00];
          break;
        case "rain":
        case "scanner":
        case "aurora":
        case "gradient":
        case "customWave":
        case "sunset":
        case "comet":
        case "sonar":
        case "ember":
        case "raindrops":
        case "equalizer":
        case "shockwave":
        case "heatmap":
        case "disco":
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
     * Trigger Firmware Effects (Class 0x0F, Cmd 0x17, Size 0x50)
     * Carried over from Razer Synapse 4 rzDevice25.js (Vt.Zq = new Uint8Array([80, 15, 23]))
     * & 6737.js (xi: setPresetProfileEffect -> setTriggerFirmwareEffects(1, slotId, keyFwId, 0, 0, 0)).
     * Illuminates the onboard profile slot indicator LED and triggers the hardware preset ripple effect.
     */
    setTriggerFirmwareEffects({
      effectId = 1,
      profileId = 1,
      keyId,
      r = 0,
      g = 0,
      b = 0,
      transactionId = 0x1f,
    } = {}) {
      const slot = Math.max(1, Math.min(6, Number(profileId) || 1)) & 0xff;
      const fwKey =
        keyId !== undefined
          ? Number(keyId) & 0xff
          : (SLOT_NAV_FW_KEY_IDS[slot] ?? 75) & 0xff;
      return buildPacket({
        commandClass: 0x0f,
        commandId: 0x17,
        dataSize: 0x50,
        args: [effectId & 0xff, slot, fwKey, r & 0xff, g & 0xff, b & 0xff],
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

    getPollingRate({ slot = 1, transactionId = 0x1f } = {}) {
      return buildPacket({
        commandClass: 0x00,
        commandId: 0xc0,
        dataSize: 0x02,
        args: [slot & 0xff, 0x00],
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

    getGameMode({ varStore = 1, transactionId = 0x1f } = {}) {
      return buildPacket({
        commandClass: 0x03,
        commandId: 0x80,
        dataSize: 0x03,
        args: [varStore & 0xff, 0x08, 0x00],
        transactionId,
      });
    },

    getSnapTap({ varStore = 1, transactionId = 0x1f } = {}) {
      return buildPacket({
        commandClass: 0x02,
        commandId: 0xa1,
        dataSize: 0x04,
        args: [varStore & 0xff, 0x00, 0x00, 0x00],
        transactionId,
      });
    },

    getAnalogActuation({ keyId = 31, varStore = 0, transactionId = 0x1f } = {}) {
      const k = resolveRazerKeyId(keyId);
      return buildPacket({
        commandClass: 0x02,
        commandId: 0x99,
        dataSize: 0x07,
        args: [varStore & 0xff, 0x01, k & 0xff, 0x00, 0x00, 0x00, 0x00],
        transactionId,
      });
    },

    getRapidTrigger({ keyId = 31, varStore = 0, transactionId = 0x1f } = {}) {
      const k = resolveRazerKeyId(keyId);
      return buildPacket({
        commandClass: 0x02,
        commandId: 0x9a,
        dataSize: 0x08,
        args: [varStore & 0xff, 0x01, k & 0xff, 0x00, 0x00, 0x00, 0x00, 0x00],
        transactionId,
      });
    },

    getContinuousRapidTrigger({ varStore = 1, transactionId = 0x1f } = {}) {
      return buildPacket({
        commandClass: 0x02,
        commandId: 0xa0,
        dataSize: 0x02,
        args: [varStore & 0xff, 0x00],
        transactionId,
      });
    },

    getMultiWirelessStatusV2(transactionId = 0xff) {
      return buildPacket({
        commandClass: 0x00,
        commandId: 0xbf,
        dataSize: 80,
        args: [],
        transactionId,
      });
    },

    getPrimaryDevice(transactionId = 0xff) {
      return buildPacket({
        commandClass: 0x00,
        commandId: 0xc5,
        dataSize: 0x03,
        args: [0x00, 0x00, 0x00],
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

    /**
     * Audio / Headsets / Speakers / Microphones (Protocol 25 Class 0x08 & 0x18)
     */
    setAudioVolume({ volume = 80, transactionId = 0x1f } = {}) {
      const clamped = Math.max(0, Math.min(100, Math.round(Number(volume) || 0)));
      const scaled = Math.round((clamped / 100) * 255) & 0xff;
      return buildPacket({
        commandClass: 0x08,
        commandId: 0x01,
        dataSize: 0x03,
        args: [0x01, 0x01, scaled],
        transactionId,
      });
    },

    setAudioMute({ muted = false, transactionId = 0x1f } = {}) {
      return buildPacket({
        commandClass: 0x08,
        commandId: 0x09,
        dataSize: 0x02,
        args: [0x01, muted ? 0x01 : 0x00],
        transactionId,
      });
    },

    setMicVolume({ volume = 80, transactionId = 0x1f } = {}) {
      const clamped = Math.max(0, Math.min(100, Math.round(Number(volume) || 0)));
      const scaled = Math.round((clamped / 100) * 255) & 0xff;
      return buildPacket({
        commandClass: 0x08,
        commandId: 0x07,
        dataSize: 0x03,
        args: [0x01, 0x01, scaled],
        transactionId,
      });
    },

    setMicMute({ muted = false, transactionId = 0x1f } = {}) {
      return buildPacket({
        commandClass: 0x08,
        commandId: 0x08,
        dataSize: 0x02,
        args: [0x01, muted ? 0x01 : 0x00],
        transactionId,
      });
    },

    setSidetone({ enabled = true, volume = 50, transactionId = 0x1f } = {}) {
      const clamped = Math.max(0, Math.min(100, Math.round(Number(volume) || 0))) & 0xff;
      return buildPacket({
        commandClass: 0x18,
        commandId: 0x03,
        dataSize: 0x03,
        args: [0x01, enabled ? 0x01 : 0x00, clamped],
        transactionId,
      });
    },

    setAudioEQPreset({ presetIndex = 0, transactionId = 0x1f } = {}) {
      return buildPacket({
        commandClass: 0x18,
        commandId: 0x00,
        dataSize: 0x04,
        args: [0x01, presetIndex & 0xff, 0x00, 0x00],
        transactionId,
      });
    },

    setAudioEQBands({ bands = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], transactionId = 0x1f } = {}) {
      const b = Array.isArray(bands) ? bands.slice(0, 10) : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      while (b.length < 10) b.push(0);
      const encoded = b.map((v) => {
        const clamped = Math.max(-12, Math.min(12, Math.round(Number(v) || 0)));
        return (clamped < 0 ? 256 + clamped : clamped) & 0xff;
      });
      return buildPacket({
        commandClass: 0x18,
        commandId: 0x01,
        dataSize: 0x0c,
        args: [0x01, 0x00, ...encoded],
        transactionId,
      });
    },

    setHapticsIntensity({ intensity = 50, transactionId = 0x1f } = {}) {
      const clamped = Math.max(0, Math.min(100, Math.round(Number(intensity) || 0))) & 0xff;
      return buildPacket({
        commandClass: 0x08,
        commandId: 0x10,
        dataSize: 0x03,
        args: [0x01, clamped > 0 ? 0x01 : 0x00, clamped],
        transactionId,
      });
    },

    setSoundEnhancement({ bassBoost = 50, voiceClarity = 50, normalization = false, transactionId = 0x1f } = {}) {
      const bb = Math.max(0, Math.min(100, Math.round(Number(bassBoost) || 0))) & 0xff;
      const vc = Math.max(0, Math.min(100, Math.round(Number(voiceClarity) || 0))) & 0xff;
      return buildPacket({
        commandClass: 0x08,
        commandId: 0x1c,
        dataSize: 0x05,
        args: [0x01, normalization ? 0x01 : 0x00, bb, vc, 0x00],
        transactionId,
      });
    },

    /**
     * Controllers & Fightsticks (Wolverine V2/V3/V4, Kitsune, Raiju) (Class 0x0C)
     */
    setControllerDeadzones({ leftDeadzone = 5, rightDeadzone = 5, transactionId = 0x1f } = {}) {
      const l = Math.max(0, Math.min(30, Math.round(Number(leftDeadzone) || 0))) & 0xff;
      const r = Math.max(0, Math.min(30, Math.round(Number(rightDeadzone) || 0))) & 0xff;
      return buildPacket({
        commandClass: 0x0c,
        commandId: 0x05,
        dataSize: 0x09,
        args: [0x01, 0x01, l, 100, 0x02, r, 100, 0x00, 0x00],
        transactionId,
      });
    },

    setControllerSensitivityClutch({ sensitivity = 50, transactionId = 0x1f } = {}) {
      const s = Math.max(10, Math.min(100, Math.round(Number(sensitivity) || 50))) & 0xff;
      return buildPacket({
        commandClass: 0x0c,
        commandId: 0x02,
        dataSize: 0x03,
        args: [0x01, 0x01, s],
        transactionId,
      });
    },

    setControllerTriggerMode({ leftHairTrigger = true, rightHairTrigger = true, transactionId = 0x1f } = {}) {
      return buildPacket({
        commandClass: 0x0c,
        commandId: 0x15,
        dataSize: 0x03,
        args: [0x01, leftHairTrigger ? 0x01 : 0x00, rightHairTrigger ? 0x01 : 0x00],
        transactionId,
      });
    },

    setControllerTriggerRange({ leftActuation = 40, rightActuation = 40, transactionId = 0x1f } = {}) {
      const l = Math.max(10, Math.min(100, Math.round(Number(leftActuation) || 40))) & 0xff;
      const r = Math.max(10, Math.min(100, Math.round(Number(rightActuation) || 40))) & 0xff;
      return buildPacket({
        commandClass: 0x0c,
        commandId: 0x13,
        dataSize: 0x04,
        args: [0x01, 0x00, l, r],
        transactionId,
      });
    },

    setControllerVibration({ leftMotor = 80, rightMotor = 80, transactionId = 0x1f } = {}) {
      const l = Math.max(0, Math.min(100, Math.round(Number(leftMotor) || 0))) & 0xff;
      const r = Math.max(0, Math.min(100, Math.round(Number(rightMotor) || 0))) & 0xff;
      return buildPacket({
        commandClass: 0x0c,
        commandId: 0x06,
        dataSize: 0x03,
        args: [0x01, l, r],
        transactionId,
      });
    },

    setControllerCircularity({ circularityMode = 1, transactionId = 0x1f } = {}) {
      return buildPacket({
        commandClass: 0x0c,
        commandId: 0x12,
        dataSize: 0x03,
        args: [0x01, 0x00, circularityMode & 0xff],
        transactionId,
      });
    },

    /**
     * Mouse Mats, Docks & Chroma ARGB Accessories (Class 0x0F / 0x0D)
     */
    setChromaStripeLedCount({ ledCount = 15, transactionId = 0x1f } = {}) {
      const c = Math.max(1, Math.min(60, Math.round(Number(ledCount) || 15))) & 0xff;
      return buildPacket({
        commandClass: 0x0f,
        commandId: 0x08,
        dataSize: 0x07,
        args: [0x01, c, 0x00, 0x00, 0x00, 0x00, 0x00],
        transactionId,
      });
    },
  };

  const Decoders = {
    pollingRate(parsed) {
      if (!parsed || parsed.status !== STATUS.SUCCESS) return null;
      const code = parsed.allArgs?.[1] ?? parsed.allArgs?.[0] ?? 0x08;
      const map = { 0x01: 8000, 0x02: 4000, 0x04: 2000, 0x08: 1000, 0x10: 500, 0x20: 250, 0x40: 125 };
      return map[code] || 1000;
    },
    activeProfileSlot(parsed) {
      if (!parsed || parsed.status !== STATUS.SUCCESS) return null;
      const slot = parsed.allArgs?.[0] ?? 1;
      return slot >= 1 && slot <= 6 ? slot : 1;
    },
    snapTap(parsed) {
      if (!parsed || parsed.status !== STATUS.SUCCESS) return null;
      const a = parsed.allArgs || [];
      return {
        varStore: a[0] ?? 1,
        enabled: Boolean(a[1]),
        keyAId: a[2] ?? 31,
        keyBId: a[3] ?? 33,
      };
    },
    analogActuation(parsed) {
      if (!parsed || parsed.status !== STATUS.SUCCESS) return null;
      const a = parsed.allArgs || [];
      const breakRaw = ((a[3] ?? 0) << 8) | (a[4] ?? 0);
      const makeRaw = ((a[5] ?? 0) << 8) | (a[6] ?? 0);
      if (!makeRaw) return null;
      return {
        keyId: a[2] ?? 31,
        resetMm: Math.round((breakRaw / 16380) * 10) / 10,
        actuationMm: Math.round((makeRaw / 16380) * 10) / 10,
      };
    },
    rapidTrigger(parsed) {
      if (!parsed || parsed.status !== STATUS.SUCCESS) return null;
      const a = parsed.allArgs || [];
      const upRaw = ((a[4] ?? 0) << 8) | (a[5] ?? 0);
      const downRaw = ((a[6] ?? 0) << 8) | (a[7] ?? 0);
      return {
        keyId: a[2] ?? 31,
        enabled: Boolean(a[3]),
        upMm: upRaw ? Math.round((upRaw / 16380) * 10) / 10 : 0.3,
        downMm: downRaw ? Math.round((downRaw / 16380) * 10) / 10 : 0.3,
      };
    },
    continuousRapidTrigger(parsed) {
      if (!parsed || parsed.status !== STATUS.SUCCESS) return null;
      const a = parsed.allArgs || [];
      return Boolean(a[1]);
    },
    multiWirelessStatusV2(parsed) {
      if (!parsed || parsed.status !== STATUS.SUCCESS) return null;
      const a = parsed.allArgs || [];
      const count = a[0] ?? 0;
      const devices = [];
      let idx = 1;
      for (let i = 0; i < count && idx + 2 < a.length; i++, idx += 3) {
        const status = a[idx];
        const productId = ((a[idx + 1] ?? 0) << 8) | (a[idx + 2] ?? 0);
        if (productId && productId !== 0xffff) {
          devices.push({ productId, connected: status > 0, status });
        }
      }
      return { deviceCount: count, devices };
    },
  };

  function getDeviceMetadata(pid, fallbackProductName = "") {
    const numPid = Number(pid);
    const known = KNOWN_DEVICES[numPid];
    if (known) {
      return { ...known, productId: numPid };
    }
    const lower = (fallbackProductName || "").toLowerCase();
    let category = "keyboard";
    if (lower.includes("analog") || lower.includes("huntsman v3 pro")) category = "keyboard-analog";
    else if (lower.includes("viper") || lower.includes("deathadder") || lower.includes("basilisk") || lower.includes("naga") || lower.includes("cobra") || lower.includes("orochi") || lower.includes("mouse")) category = "mouse";
    else if (lower.includes("blackshark") || lower.includes("kraken") || lower.includes("barracuda") || lower.includes("nari") || lower.includes("kaira") || lower.includes("hammerhead") || lower.includes("nommo") || lower.includes("leviathan") || lower.includes("seiren") || lower.includes("kiyo") || lower.includes("audio")) category = "audio";
    else if (lower.includes("wolverine") || lower.includes("kitsune") || lower.includes("raiju") || lower.includes("controller")) category = "controller";
    else if (lower.includes("firefly") || lower.includes("goliathus") || lower.includes("strider") || lower.includes("dock") || lower.includes("chroma") || lower.includes("base station") || lower.includes("aether")) category = "mat-accessory";

    const hexPid = "0x" + numPid.toString(16).toUpperCase().padStart(4, "0");
    return {
      productId: numPid,
      hexPid,
      name: fallbackProductName || `Razer Synapse 4 Device (${hexPid})`,
      category,
      protocol: "25",
      interface: category.startsWith("keyboard") ? 3 : 0,
      usagePage: category === "mouse" ? 1 : 12,
      usage: category === "mouse" ? 2 : 1,
      defaultTransactionId: 0x1f,
      reportId: 0,
      maxSlots: 5,
      isChroma: true,
      connection: "wired",
      primaryPid: numPid,
      features: ["chroma", "pollingRate"],
    };
  }

  function getCatalogDevices() {
    const list = [];
    const seenPrimary = new Set();
    for (const [pidStr, info] of Object.entries(KNOWN_DEVICES)) {
      const pid = Number(pidStr);
      if (info.primaryPid && info.primaryPid !== pid && KNOWN_DEVICES[info.primaryPid]) continue;
      if (seenPrimary.has(pid)) continue;
      seenPrimary.add(pid);
      list.push(info);
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }

  return {
    RAZER_VENDOR_ID,
    STATUS,
    STATUS_NAMES,
    PROFILE_SLOT_COLORS,
    SLOT_NAV_FW_KEY_IDS,
    KEY_LED_INDICATOR_ID,
    KNOWN_DEVICES,
    getDeviceMetadata,
    getCatalogDevices,
    keyLabelToMatrixId: resolveRazerKeyId,
    resolveRazerKeyId,
    computeCrc,
    buildPacket,
    parsePacket,
    Builders,
    Decoders,
  };
});
