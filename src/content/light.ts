/**
 * Light trigger content-script entry (classic script; built as IIFE).
 * Hosts dim-bridge (search apply + IDB junk Mirror) + inventory IDB read.
 * Does NOT open the Workbench (Firefox user-gesture rules).
 */

import {
  createEnvelope,
  isEnvelope,
  lightHandleMessage,
  newRequestId,
  type Envelope,
  type FilterResultPayload,
  type LightStatusPayload,
} from "../messaging/index.js";
import {
  browserLocalStorageGet,
  createBrowserIdbKeyval,
  LAST_MEMBERSHIP_KEY,
  readVaultInventory,
  type InventoryStatus,
} from "../inventory/index.js";
import {
  createBrowserIdbTagHooks,
  createDimBridge,
  createMirrorBridgeFromHooks,
  defaultSearchLocator,
} from "../dim-bridge/index.js";
import { ensureChip } from "./chip.js";

const idb = createBrowserIdbKeyval();
const bridge = createDimBridge(document, defaultSearchLocator);
const tagBridge = createMirrorBridgeFromHooks(
  createBrowserIdbTagHooks(idb, () => browserLocalStorageGet(LAST_MEMBERSHIP_KEY)),
);

function announcePresence(): void {
  const payload: LightStatusPayload = {
    present: true,
    href: location.href,
  };
  void browser.runtime
    .sendMessage(createEnvelope("light-status", newRequestId(), payload))
    .catch(() => undefined);
}

async function handleVaultGet(requestId: string): Promise<Envelope<"vault-result", InventoryStatus>> {
  // Always enrich from DIM IDB (defs + tags) so Stage exclusions see isExotic / favorite.
  const status = await readVaultInventory({
    getLocalStorage: browserLocalStorageGet,
    idb,
    enrich: true,
  });
  return createEnvelope("vault-result", requestId, status);
}

function handleFilterApply(requestId: string, query: string): Envelope<"filter-result", FilterResultPayload> {
  const result = bridge.applyFilter(query);
  return createEnvelope("filter-result", requestId, result);
}

function handleFilterClear(requestId: string): Envelope<"filter-result", FilterResultPayload> {
  const result = bridge.clearFilter();
  return createEnvelope("filter-result", requestId, result);
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

  if (message.kind === "filter-apply") {
    const query = String((message.payload as { query?: string } | undefined)?.query ?? "");
    sendResponse(handleFilterApply(message.requestId, query));
    return false;
  }

  if (message.kind === "filter-clear") {
    sendResponse(handleFilterClear(message.requestId));
    return false;
  }

  if (message.kind === "mirror-set" || message.kind === "mirror-clear") {
    const itemId = String((message.payload as { itemId?: string } | undefined)?.itemId ?? "");
    void (async () => {
      const res =
        message.kind === "mirror-set"
          ? await tagBridge.setJunkTag(itemId)
          : await tagBridge.clearJunkTag(itemId);
      sendResponse(createEnvelope("mirror-result", message.requestId, res));
    })();
    return true;
  }

  const response = lightHandleMessage(message);
  sendResponse(response);
  return false;
});

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
  // optional
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
