/**
 * Light trigger content-script entry (classic script; built as IIFE).
 * Does NOT open the Workbench (Firefox user-gesture rules).
 */

import {
  createEnvelope,
  isEnvelope,
  lightHandleMessage,
  newRequestId,
  type LightStatusPayload,
} from "../messaging/index.js";
import { ensureChip } from "./chip.js";

function announcePresence(): void {
  const payload: LightStatusPayload = {
    present: true,
    href: location.href,
  };
  void browser.runtime
    .sendMessage(createEnvelope("light-status", newRequestId(), payload))
    .catch(() => {
      // Background may be asleep; presence is best-effort.
    });
}

browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isEnvelope(message)) {
    sendResponse(null);
    return false;
  }
  const response = lightHandleMessage(message);
  sendResponse(response);
  return false;
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    ensureChip();
    announcePresence();
  });
} else {
  ensureChip();
  announcePresence();
}
