"use strict";

/**
 * websynap.se Background Chroma Frame Timer Worker
 * Runs timing intervals in a Dedicated Web Worker so Chromium does not throttle
 * USB HID LampArray RGB animations to 1 FPS when the browser tab is in the background
 * or minimized while gaming.
 */
const timers = new Map();

self.addEventListener("message", (ev) => {
  const data = ev.data;
  if (!data || typeof data !== "object") return;

  if (data.cmd === "start") {
    const id = Number(data.id);
    const ms = Math.max(16, Math.min(2000, Number(data.intervalMs) || 42));
    if (timers.has(id)) {
      clearInterval(timers.get(id));
    }
    const handle = setInterval(() => {
      self.postMessage({ id });
    }, ms);
    timers.set(id, handle);
  } else if (data.cmd === "stop") {
    const id = Number(data.id);
    if (timers.has(id)) {
      clearInterval(timers.get(id));
      timers.delete(id);
    }
  } else if (data.cmd === "stopAll") {
    for (const handle of timers.values()) {
      clearInterval(handle);
    }
    timers.clear();
  }
});
