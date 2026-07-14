/**
 * Light-relay: multi-tab send + selectLightResponse + noLightFallback.
 * One path for vault-get / filter-* / other Light-relayed kinds.
 * Browser tab APIs injected — tests never need a real content script.
 */

import { createEnvelope, isEnvelope, type Envelope } from "./types.js";
import { isMatchingLightResponse, noLightFallback, selectLightResponse } from "./protocol.js";

export type DimTab = { id?: number | undefined };

/** Query DIM tabs (host permissions already scoped by caller). */
export type DimTabQuery = () => Promise<DimTab[]>;

/** Send a message to one tab; may throw if content script missing. */
export type TabMessageSender = (tabId: number, message: Envelope) => Promise<unknown>;

export interface LightRelayPorts {
  queryDimTabs: DimTabQuery;
  sendToTab: TabMessageSender;
}

/** Collect envelopes from every DIM tab (parallel). */
export async function collectLightResponses(
  message: Envelope,
  ports: LightRelayPorts,
): Promise<Array<Envelope | undefined>> {
  const tabs = await ports.queryDimTabs();
  return Promise.all(
    tabs.map(async (tab): Promise<Envelope | undefined> => {
      if (tab.id === undefined) return undefined;
      try {
        const response: unknown = await ports.sendToTab(tab.id, message);
        return isEnvelope(response) ? response : undefined;
      } catch {
        // Tab may not have content script yet.
        return undefined;
      }
    }),
  );
}

/**
 * Multi-tab send + prefer-success selection.
 * Returns undefined when no matching Light response exists.
 */
export async function relayToLight(
  message: Envelope,
  ports: LightRelayPorts,
): Promise<Envelope | undefined> {
  const responses = await collectLightResponses(message, ports);
  return selectLightResponse(message, responses);
}

/**
 * Full Light-kind path for the hub: select winner or no-Light fallback (or error).
 */
export async function relayLightKind(
  message: Envelope,
  ports: LightRelayPorts,
): Promise<Envelope> {
  const selected = await relayToLight(message, ports);
  if (selected && isMatchingLightResponse(message, selected)) {
    return selected;
  }
  return noLightFallback(message) ?? createEnvelope("error", message.requestId);
}

/** Bind ports once; hub calls relay / relayKind without re-encoding the template. */
export function createLightRelay(ports: LightRelayPorts): {
  relay: (message: Envelope) => Promise<Envelope | undefined>;
  relayKind: (message: Envelope) => Promise<Envelope>;
} {
  return {
    relay: (message) => relayToLight(message, ports),
    relayKind: (message) => relayLightKind(message, ports),
  };
}
