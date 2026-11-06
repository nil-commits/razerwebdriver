/**
 * Razer Local Web Driver — Browser Application & WebHID + window.apiElectron Bridge
 */
(function () {
  "use strict";

  const P25 = window.RazerProtocol25;

  let currentDevices = [];
  let selectedDevice = {
    vendorId: 5426,
    productId: 679,
    hexPid: "0x02A7",
    productName: "Razer Huntsman V3 Pro TKL",
    interface: 3,
    protocol: "25",
  };
  let webHidDevice = null;

  // Expose a compatible window.apiElectron shim so any original Razer Synapse frontend code
  // or console command can call window.apiElectron.doRzDeviceAction(...) in any browser!
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
    doSimpleServiceAction: async (arg) => {
      const res = await fetch("/api/rpc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: "doSimpleServiceAction", arg }),
      });
      return (await res.json()).result;
    },
  };

  // Helper: parse "#RRGGBB" to [r, g, b]
  function hexToRgb(hex) {
    const clean = (hex || "#00ff66").replace("#", "");
    const num = parseInt(clean, 16);
    return [(num >> 16) & 0xff, (num >> 8) & 0xff, num & 0xff];
  }

  function formatHex(bytes) {
    return Array.from(bytes || [])
      .map((b) => (b & 0xff).toString(16).toUpperCase().padStart(2, "0"))
      .join(" ");
  }

  /**
   * Sends a 90-byte Protocol 25 packet via:
   *   1. Connected Browser WebHID handle (if the user clicked "Connect Browser WebHID"), AND/OR
   *   2. Local Hardware Server (/api/send-packet)
   */
  async function sendPacket90(packet90, statePatch = null) {
    let webHidResult = null;

    if (webHidDevice && webHidDevice.opened) {
      try {
        const u8 = new Uint8Array(packet90);
        await webHidDevice.sendFeatureReport(0x00, u8);
        await new Promise((r) => setTimeout(r, 6));
        const dv = await webHidDevice.receiveFeatureReport(0x00);
        const rxBytes = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
        webHidResult = Array.from(rxBytes);
      } catch (err) {
        console.warn("WebHID feature report warning:", err.message);
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
    await refreshStatus();
    return { ...data, webHidResult };
  }

  // Connect Browser WebHID directly to Razer USB device (VID 0x1532)
  async function connectBrowserWebHid() {
    if (!navigator.hid) {
      alert("WebHID is available in Chromium-based browsers (Chrome, Edge, Brave). Using local server bridge.");
      return;
    }
    try {
      const devices = await navigator.hid.requestDevice({
        filters: [{ vendorId: 0x1532 }],
      });
      if (!devices || devices.length === 0) return;
      // Prefer control interface with feature reports
      const chosen =
        devices.find((d) => d.collections?.some((c) => c.featureReports?.length > 0)) || devices[0];
      if (!chosen.opened) {
        await chosen.open();
      }
      webHidDevice = chosen;
      const badge = document.getElementById("badgeTransport");
      badge.textContent = `WebHID Connected: ${chosen.productName || "0x1532"}`;
      badge.classList.add("ok");
    } catch (err) {
      console.error("WebHID connect error:", err);
    }
  }

  function renderDevices(devices) {
    const container = document.getElementById("deviceList");
    container.innerHTML = "";
    for (const dev of devices) {
      const card = document.createElement("div");
      card.className = `device-card ${dev.productId === selectedDevice.productId ? "active" : ""}`;
      card.innerHTML = `
        <div class="dev-title">${dev.productName}</div>
        <div class="dev-meta">VID: 0x1532 • PID: ${dev.hexPid} (${dev.productId})</div>
        <div class="dev-meta">Protocol ${dev.protocol} • Interface ${dev.interface} • ${
        dev.connectedLive ? "Live HID" : "Restore Profile"
      }</div>
      `;
      card.addEventListener("click", () => {
        selectedDevice = dev;
        renderDevices(currentDevices);
      });
      container.appendChild(card);
    }
  }

  function renderPacketLogs(logs) {
    const list = document.getElementById("packetLogList");
    if (!logs || logs.length === 0) {
      list.innerHTML = `<div class="log-item"><div class="log-head">No packets sent yet. Use any control or click "Build & Send".</div></div>`;
      return;
    }
    list.innerHTML = logs
      .map((item) => {
        const pTx = item.parsedTx || {};
        const pRx = item.parsedRx || {};
        return `
        <div class="log-item">
          <div class="log-head">
            <span>#${item.id} • PID ${item.productId} (If ${item.interfaceNum}) • Class 0x${(
          pTx.commandClass ?? 0
        )
          .toString(16)
          .toUpperCase()
          .padStart(2, "0")} Cmd 0x${(pTx.commandId ?? 0)
          .toString(16)
          .toUpperCase()
          .padStart(2, "0")} • CRC 0x${(pTx.crc ?? 0).toString(16).toUpperCase().padStart(2, "0")}</span>
            <span>${pRx.statusName || item.mode} • ${new Date(item.timestamp).toLocaleTimeString()}</span>
          </div>
          <div class="tx">TX [91B]: ${item.txHex}</div>
          <div class="rx">RX [91B]: ${item.rxHex}</div>
        </div>
      `;
      })
      .join("");
  }

  async function refreshStatus() {
    try {
      const res = await fetch("/api/status");
      const data = await res.json();
      if (!data.ok) return;

      currentDevices = data.devices || [];
      if (currentDevices.length > 0 && !currentDevices.some((d) => d.productId === selectedDevice.productId)) {
        selectedDevice = currentDevices[0];
      }
      renderDevices(currentDevices);
      renderPacketLogs(data.packetHistory || []);

      const rtBadge = document.getElementById("badgeRuntime");
      rtBadge.textContent = data.nativeStatus?.runtime || "Local Server";
      rtBadge.classList.add("ok");

      if (!webHidDevice) {
        const trBadge = document.getElementById("badgeTransport");
        trBadge.textContent = data.nativeStatus?.hidLoaded
          ? "Transport: Native node-rz-hid"
          : "Transport: Local Bridge + WebHID Ready";
        if (data.nativeStatus?.hidLoaded) trBadge.classList.add("ok");
      }
    } catch (err) {
      console.warn("Status poll failed:", err);
    }
  }

  // Update live preview in Protocol 25 Packet Studio
  function updateCustomPacketPreview() {
    const commandClass = parseInt(document.getElementById("inpCmdClass").value, 16) || 0;
    const commandId = parseInt(document.getElementById("inpCmdId").value, 16) || 0;
    const dataSize = parseInt(document.getElementById("inpDataSize").value, 10) || 0;
    const rawArgs = document
      .getElementById("inpArgsHex")
      .value.trim()
      .split(/[\s,]+/)
      .filter(Boolean)
      .map((h) => parseInt(h, 16) || 0);

    const pkt90 = P25.buildPacket({
      commandClass,
      commandId,
      dataSize,
      args: rawArgs,
      transactionId: 0x1f,
    });
    const report91 = [0x00, ...pkt90];
    document.getElementById("customPacketPreview").textContent =
      `Report91 (${report91.length} bytes) | XOR CRC (Byte 88) = 0x${pkt90[88]
        .toString(16)
        .toUpperCase()
        .padStart(2, "0")} (${pkt90[88]}):\n` + formatHex(report91);
    return pkt90;
  }

  // Wire UI Events
  function initUi() {
    // Tab switching
    document.querySelectorAll(".nav-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".nav-tab").forEach((b) => b.classList.remove("active"));
        document.querySelectorAll(".tab-panel").forEach((p) => p.classList.add("hidden"));
        btn.classList.add("active");
        document.getElementById(btn.dataset.tab).classList.remove("hidden");
      });
    });

    document.getElementById("btnWebHid").addEventListener("click", connectBrowserWebHid);
    document.getElementById("btnRefresh").addEventListener("click", refreshStatus);

    // Effect pills
    let activeEffect = "static";
    document.querySelectorAll("#effectGroup .pill").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#effectGroup .pill").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        activeEffect = btn.dataset.effect;
      });
    });

    document.getElementById("rngSpeed").addEventListener("input", (e) => {
      document.getElementById("valSpeed").textContent = e.target.value;
    });

    document.getElementById("btnApplyLighting").addEventListener("click", async () => {
      const [r, g, b] = hexToRgb(document.getElementById("colorPrimary").value);
      const [r2, g2, b2] = hexToRgb(document.getElementById("colorSecondary").value);
      const direction = Number(document.getElementById("selWaveDir").value);
      const speed = Number(document.getElementById("rngSpeed").value);

      const pkt90 = P25.Builders.setChromaEffect({
        effect: activeEffect,
        r,
        g,
        b,
        r2,
        g2,
        b2,
        direction,
        speed,
      });
      await sendPacket90(pkt90, {
        lighting: {
          effect: activeEffect,
          color1: document.getElementById("colorPrimary").value,
          color2: document.getElementById("colorSecondary").value,
          waveDirection: direction,
          speed,
        },
      });
    });

    // Brightness
    document.getElementById("rngBrightness").addEventListener("input", (e) => {
      document.getElementById("valBrightness").textContent = `${e.target.value}%`;
    });

    document.getElementById("btnApplyBrightness").addEventListener("click", async () => {
      const pct = Number(document.getElementById("rngBrightness").value);
      const raw255 = Math.round((pct / 100) * 255);
      const pkt90 = P25.Builders.setBrightness(raw255);
      await sendPacket90(pkt90, { lighting: { brightness: pct } });
    });

    // Device Mode (Normal 0x00 vs Driver 0x03)
    document.getElementById("btnModeNormal").addEventListener("click", async () => {
      document.getElementById("btnModeNormal").classList.add("active");
      document.getElementById("btnModeDriver").classList.remove("active");
      const pkt90 = P25.Builders.setDeviceMode(0x00, 0x00, 0x00);
      await sendPacket90(pkt90, { deviceMode: "normal" });
    });

    document.getElementById("btnModeDriver").addEventListener("click", async () => {
      document.getElementById("btnModeDriver").classList.add("active");
      document.getElementById("btnModeNormal").classList.remove("active");
      const pkt90 = P25.Builders.setDeviceMode(0x03, 0x00, 0x1f);
      await sendPacket90(pkt90, { deviceMode: "driver" });
    });

    // Replay exact 5426_679.json restore packet
    document.getElementById("btnReplayRestore").addEventListener("click", async () => {
      const pkt90 = P25.Builders.setDeviceMode(0x00, 0x00, 0x00);
      await sendPacket90(pkt90, { deviceMode: "normal" });
    });

    // Huntsman V3 Pro TKL Actuation & Rapid Trigger
    const rngAct = document.getElementById("rngActuation");
    const rngRtDown = document.getElementById("rngRtDown");
    const rngRtUp = document.getElementById("rngRtUp");

    rngAct.addEventListener("input", (e) => {
      document.getElementById("valActuation").textContent = `${Number(e.target.value).toFixed(1)} mm`;
    });
    rngRtDown.addEventListener("input", (e) => {
      document.getElementById("valRtDown").textContent = `${Number(e.target.value).toFixed(1)} mm`;
    });
    rngRtUp.addEventListener("input", (e) => {
      document.getElementById("valRtUp").textContent = `${Number(e.target.value).toFixed(1)} mm`;
    });

    document.querySelectorAll("[data-act-preset]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const preset = btn.dataset.actPreset;
        if (preset === "fps") {
          rngAct.value = 0.4;
          rngRtDown.value = 0.1;
          rngRtUp.value = 0.1;
          document.getElementById("chkRapidTrigger").checked = true;
        } else if (preset === "balanced") {
          rngAct.value = 1.2;
          rngRtDown.value = 0.3;
          rngRtUp.value = 0.3;
          document.getElementById("chkRapidTrigger").checked = true;
        } else {
          rngAct.value = 2.0;
          rngRtDown.value = 0.5;
          rngRtUp.value = 0.5;
          document.getElementById("chkRapidTrigger").checked = false;
        }
        rngAct.dispatchEvent(new Event("input"));
        rngRtDown.dispatchEvent(new Event("input"));
        rngRtUp.dispatchEvent(new Event("input"));
      });
    });

    document.getElementById("btnApplyHuntsman").addEventListener("click", async () => {
      const actMm = Number(rngAct.value);
      const rtEnabled = document.getElementById("chkRapidTrigger").checked;
      const rtDownMm = Number(rngRtDown.value);
      const rtUpMm = Number(rngRtUp.value);

      // Encode actuation in 0.1mm units (1..40)
      const actUnits = Math.round(actMm * 10);
      const downUnits = Math.round(rtDownMm * 10);
      const upUnits = Math.round(rtUpMm * 10);

      const pkt90 = P25.buildPacket({
        commandClass: 0x0b,
        commandId: 0x02,
        dataSize: 0x06,
        args: [0x01, actUnits, rtEnabled ? 0x01 : 0x00, downUnits, upUnits, 0x00],
      });
      await sendPacket90(pkt90, {
        huntsman: {
          actuationMm: actMm,
          rapidTriggerEnabled: rtEnabled,
          rapidTriggerDownMm: rtDownMm,
          rapidTriggerUpMm: rtUpMm,
        },
      });
    });

    document.getElementById("btnApplySnapTap").addEventListener("click", async () => {
      const enabled = document.getElementById("chkSnapTap").checked;
      const keyA = document.getElementById("inpSnapA").value.toUpperCase() || "A";
      const keyB = document.getElementById("inpSnapB").value.toUpperCase() || "D";
      const pkt90 = P25.buildPacket({
        commandClass: 0x0b,
        commandId: 0x08,
        dataSize: 0x04,
        args: [0x01, enabled ? 0x01 : 0x00, keyA.charCodeAt(0) & 0xff, keyB.charCodeAt(0) & 0xff],
      });
      await sendPacket90(pkt90, {
        huntsman: {
          snapTapEnabled: enabled,
          snapTapKeyA: keyA,
          snapTapKeyB: keyB,
        },
      });
    });

    // Mouse DPI & Polling
    const rngDpiX = document.getElementById("rngDpiX");
    const rngDpiY = document.getElementById("rngDpiY");
    rngDpiX.addEventListener("input", (e) => {
      document.getElementById("valDpiX").textContent = e.target.value;
    });
    rngDpiY.addEventListener("input", (e) => {
      document.getElementById("valDpiY").textContent = e.target.value;
    });

    document.querySelectorAll("[data-dpi]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("[data-dpi]").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        rngDpiX.value = btn.dataset.dpi;
        rngDpiY.value = btn.dataset.dpi;
        rngDpiX.dispatchEvent(new Event("input"));
        rngDpiY.dispatchEvent(new Event("input"));
      });
    });

    document.getElementById("btnApplyDpi").addEventListener("click", async () => {
      const dpiX = Number(rngDpiX.value);
      const dpiY = Number(rngDpiY.value);
      const pkt90 = P25.Builders.setDpiXY(dpiX, dpiY);
      await sendPacket90(pkt90, { mouse: { dpiX, dpiY } });
    });

    document.querySelectorAll("#pollingGroup .pill").forEach((btn) => {
      btn.addEventListener("click", async () => {
        document.querySelectorAll("#pollingGroup .pill").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const hz = Number(btn.dataset.hz);
        const pkt90 = P25.Builders.setPollingRate(hz);
        await sendPacket90(pkt90, { mouse: { pollingHz: hz } });
      });
    });

    // Firmware & Battery queries
    document.getElementById("btnQueryFw").addEventListener("click", async () => {
      const pkt90 = P25.Builders.getFirmwareVersion();
      const res = await sendPacket90(pkt90);
      const args = res.parsedRx?.args || [];
      document.getElementById("valFirmware").textContent = `v${args[0] ?? 1}.${String(args[1] ?? 0).padStart(2, "0")}.00`;
    });

    document.getElementById("btnQueryBattery").addEventListener("click", async () => {
      const pkt90 = P25.Builders.getBatteryLevel();
      const res = await sendPacket90(pkt90);
      const raw = res.parsedRx?.args?.[1] ?? 255;
      const pct = Math.round((raw / 255) * 100);
      document.getElementById("valBattery").textContent = `${pct}% (0x${raw.toString(16).toUpperCase()})`;
    });

    // Mapping Engine hooks
    document.getElementById("btnEnableHooks").addEventListener("click", async () => {
      await window.apiElectron.doMappingEngineAction({ action: "enableAllDevicesHooks" });
      document.getElementById("valMappingStatus").textContent = "Enabled";
    });
    document.getElementById("btnDisableHooks").addEventListener("click", async () => {
      await window.apiElectron.doMappingEngineAction({ action: "disableAllDevicesHooks" });
      document.getElementById("valMappingStatus").textContent = "Disabled";
    });

    // Audio sliders
    document.getElementById("rngSpeaker").addEventListener("input", (e) => {
      document.getElementById("valSpeaker").textContent = `${e.target.value}%`;
    });
    document.getElementById("rngSidetone").addEventListener("input", (e) => {
      document.getElementById("valSidetone").textContent = `${e.target.value}%`;
    });

    // Custom Protocol 25 Packet Studio
    ["inpCmdClass", "inpCmdId", "inpDataSize", "inpArgsHex"].forEach((id) => {
      document.getElementById(id).addEventListener("input", updateCustomPacketPreview);
    });
    updateCustomPacketPreview();

    document.getElementById("btnSendCustomPacket").addEventListener("click", async () => {
      const pkt90 = updateCustomPacketPreview();
      await sendPacket90(pkt90);
    });

    document.getElementById("btnClearLogs").addEventListener("click", async () => {
      await fetch("/api/clear-logs", { method: "POST" });
      await refreshStatus();
    });
  }

  initUi();
  refreshStatus();
})();
