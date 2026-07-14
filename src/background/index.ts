/**
 * Background hub (Firefox event page / Chromium service worker).
 * Sleeps when idle; routes Workbench ↔ Light messages. No long polling.
 * Light kinds → createLightRelay; local kinds → domain handlers.
 */

import {
  createEnvelope,
  createLightRelay,
  createTypedEnvelope,
  handleRoundTrip,
  isEnvelope,
  newRequestId,
  type AgentRunPayload,
  type AgentSettingsSetPayload,
  type Envelope,
  type MirrorResultPayload,
  type RoundTripPayload,
  type TrashStagePayload,
  type TrashUnstagePayload,
} from "../messaging/index.js";
import { DIM_URL_PATTERNS } from "../shared/dim.js";
import { ensureBrowser } from "../shared/webext.js";
import {
  handleTrashGet,
  handleTrashStage,
  handleTrashUnstage,
  handleRepairMirror,
  setMirrorBridge,
} from "./trash-handlers.js";
import { createMessagingMirrorBridge } from "../dim-bridge/index.js";
import {
  handleAgentCancel,
  handleAgentRun,
  handleAgentSettingsGet,
  handleAgentSettingsSet,
} from "./agent-handlers.js";
import { installWorkbenchOpenOnAction } from "./workbench-open.js";

ensureBrowser();

const light = createLightRelay({
  queryDimTabs: () => browser.tabs.query({ url: [...DIM_URL_PATTERNS] }),
  sendToTab: (tabId, message) => browser.tabs.sendMessage(tabId, message),
});

// Best-effort Mirror: Light content script tag hooks (soft-fail when unavailable).
setMirrorBridge(
  createMessagingMirrorBridge(async (kind, itemId) => {
    const res = await light.relay(createTypedEnvelope(kind, newRequestId(), { itemId }));
    if (!res || res.kind !== "mirror-result") return false;
    return (res.payload as MirrorResultPayload | undefined)?.ok === true;
  }),
);

browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  void (async () => {
    if (!isEnvelope(message)) {
      sendResponse(createEnvelope("error", newRequestId()));
      return;
    }

    switch (message.kind) {
      case "ping": {
        sendResponse(
          createTypedEnvelope("pong", message.requestId, {
            from: "background",
            at: Date.now(),
          }),
        );
        return;
      }
      case "roundtrip": {
        const result = await handleRoundTrip(
          message as Envelope<"roundtrip", RoundTripPayload>,
          light.relay,
        );
        sendResponse(result);
        return;
      }
      case "vault-get": {
        sendResponse(
          await light.relayKind(createTypedEnvelope("vault-get", message.requestId)),
        );
        return;
      }
      case "filter-apply":
      case "filter-clear": {
        sendResponse(await light.relayKind(message));
        return;
      }
      case "light-status": {
        // Fire-and-forget announce from Light — ack without inventing a fake payload shape.
        sendResponse(createEnvelope("light-status", message.requestId));
        return;
      }
      case "trash-get": {
        sendResponse(await handleTrashGet(message.requestId));
        return;
      }
      case "trash-stage": {
        const candidates =
          (message.payload as TrashStagePayload | undefined)?.candidates ?? [];
        sendResponse(await handleTrashStage(message.requestId, candidates));
        return;
      }
      case "trash-unstage": {
        const ids = (message.payload as TrashUnstagePayload | undefined)?.ids ?? [];
        sendResponse(await handleTrashUnstage(message.requestId, ids));
        return;
      }
      case "trash-repair-mirror": {
        sendResponse(await handleRepairMirror(message.requestId));
        return;
      }
      case "agent-settings-get": {
        sendResponse(await handleAgentSettingsGet(message.requestId));
        return;
      }
      case "agent-settings-set": {
        const partial = (message.payload ?? {}) as AgentSettingsSetPayload;
        sendResponse(await handleAgentSettingsSet(message.requestId, partial));
        return;
      }
      case "agent-run": {
        const req = (message.payload ?? {}) as AgentRunPayload;
        sendResponse(await handleAgentRun(message.requestId, req));
        return;
      }
      case "agent-cancel": {
        sendResponse(handleAgentCancel(message.requestId));
        return;
      }
      default: {
        sendResponse(createEnvelope("error", message.requestId));
      }
    }
  })();
  return true;
});

// Toolbar → Workbench: Side Panel on Chromium; sidebarAction on Firefox.
// Light chip never opens Workbench.
installWorkbenchOpenOnAction(browser);
