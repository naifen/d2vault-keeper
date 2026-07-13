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

async function queryDimTabs(): Promise<browser.tabs.Tab[]> {
  return browser.tabs.query({ url: [...DIM_URL_PATTERNS] });
}

async function relayToLight(message: Envelope): Promise<Envelope | undefined> {
  const tabs = await queryDimTabs();
  for (const tab of tabs) {
    if (tab.id === undefined) continue;
    try {
      const response = (await browser.tabs.sendMessage(tab.id, message)) as unknown;
      if (isEnvelope(response)) return response;
    } catch {
      // Tab may not have content script yet; try next.
    }
  }
  return undefined;
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
      case "light-status": {
        // One-way announce from Light; no semantic reply needed.
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

// Toolbar button opens the Workbench sidebar (user gesture).
browser.action.onClicked.addListener(() => {
  void browser.sidebarAction.open();
});
