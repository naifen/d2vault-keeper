/**
 * Event-page background hub.
 * Sleeps when idle; routes Workbench ↔ Light messages. No long polling.
 */

import {
  createEnvelope,
  handleRoundTrip,
  isEnvelope,
  newRequestId,
  type Envelope,
  type RoundTripPayload,
} from "../messaging/index.js";
import { DIM_URL_PATTERNS } from "../shared/dim.js";
import { selectLightResponse } from "./relay.js";

async function queryDimTabs(): Promise<browser.tabs.Tab[]> {
  return browser.tabs.query({ url: [...DIM_URL_PATTERNS] });
}

async function relayToLight(message: Envelope): Promise<Envelope | undefined> {
  const tabs = await queryDimTabs();
  const responses: Array<Envelope | undefined> = [];
  for (const tab of tabs) {
    if (tab.id === undefined) continue;
    try {
      const response = (await browser.tabs.sendMessage(tab.id, message)) as unknown;
      responses.push(isEnvelope(response) ? response : undefined);
    } catch {
      // Tab may not have content script yet; try next.
    }
  }
  return selectLightResponse(message, responses);
}

browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  void (async () => {
    if (!isEnvelope(message)) {
      sendResponse(createEnvelope("error", newRequestId()));
      return;
    }

    switch (message.kind) {
      case "ping": {
        sendResponse(
          createEnvelope("pong", message.requestId, {
            from: "background",
            at: Date.now(),
          }),
        );
        return;
      }
      case "roundtrip": {
        const result = await handleRoundTrip(
          message as Envelope<"roundtrip", RoundTripPayload>,
          relayToLight,
        );
        sendResponse(result);
        return;
      }
      case "vault-get": {
        const lightRes = await relayToLight(
          createEnvelope("vault-get", message.requestId),
        );
        if (lightRes && lightRes.kind === "vault-result") {
          sendResponse(lightRes);
        } else {
          sendResponse(
            createEnvelope("vault-result", message.requestId, {
              state: "empty",
              reason: "no-light",
              message: "Open DIM logged in (no Light content script on a DIM tab).",
            }),
          );
        }
        return;
      }
      case "filter-apply":
      case "filter-clear": {
        const lightRes = await relayToLight(message);
        if (lightRes && lightRes.kind === "filter-result") {
          sendResponse(lightRes);
        } else {
          sendResponse(
            createEnvelope("filter-result", message.requestId, {
              ok: false,
              query:
                message.kind === "filter-apply"
                  ? String((message.payload as { query?: string } | undefined)?.query ?? "")
                  : "",
              applied: false,
              error: "Open DIM inventory (Light not reachable).",
            }),
          );
        }
        return;
      }
      case "light-status": {
        sendResponse(createEnvelope("light-status", message.requestId, { ack: true }));
        return;
      }
      default: {
        sendResponse(createEnvelope("error", message.requestId));
      }
    }
  })();
  return true;
});

browser.action.onClicked.addListener(() => {
  void browser.sidebarAction.open();
});
