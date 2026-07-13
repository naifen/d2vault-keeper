/**
 * Light trigger content-script entry (classic script; built as IIFE).
 * Does NOT open the Workbench (Firefox user-gesture rules).
 * Also serves as DIM-origin inventory reader (IndexedDB).
 */

import {
  createEnvelope,
  isEnvelope,
  lightHandleMessage,
  newRequestId,
  type Envelope,
  type LightStatusPayload,
} from "../messaging/index.js";
import {
  browserLocalStorageGet,
  createBrowserIdbKeyval,
  readVaultInventory,
  type InventoryStatus,
} from "../inventory/index.js";
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

async function handleVaultGet(requestId: string): Promise<Envelope<"vault-result", InventoryStatus>> {
  const status = await readVaultInventory({
    getLocalStorage: browserLocalStorageGet,
    idb: createBrowserIdbKeyval(),
  });
  return createEnvelope("vault-result", requestId, status);
}

browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isEnvelope(message)) {
    sendResponse(null);
    return false;
  }

  if (message.kind === "vault-get") {
    void handleVaultGet(message.requestId).then(sendResponse);
    return true;
  }

  const response = lightHandleMessage(message);
  sendResponse(response);
  return false;
});

// Invalidate / re-read hint for future Workbench refresh (no polling).
try {
  const channel = new BroadcastChannel("dim");
  channel.addEventListener("message", (event: MessageEvent) => {
    const data = event.data as { type?: string } | undefined;
    if (data?.type === "stores-updated" || data?.type === "item-moved") {
      void browser.runtime
        .sendMessage(
          createEnvelope("light-status", newRequestId(), {
            present: true,
            href: location.href,
            inventoryHint: data.type,
          }),
        )
        .catch(() => undefined);
    }
  });
} catch {
  // BroadcastChannel unavailable — Workbench can still manual-refresh.
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    ensureChip();
    announcePresence();
  });
} else {
  ensureChip();
  announcePresence();
}
