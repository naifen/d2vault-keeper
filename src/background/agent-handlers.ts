/**
 * Agent envelope adapter — thin pack/unpack over AgentSession.
 * Product rules (cancel slot, key mask) live in createAgentSession.
 */

import {
  createAgentSession,
  type AgentRequest,
  type AgentSettings,
  type FetchFn,
  type KvStorage,
} from "../agent/index.js";
import { createEnvelope, type Envelope } from "../messaging/index.js";

function storageLocal(): KvStorage {
  return {
    async get(key) {
      const bag = await browser.storage.local.get(key);
      return (bag as Record<string, unknown>)[key];
    },
    async set(key, value) {
      await browser.storage.local.set({ [key]: value });
    },
  };
}

/** Process-wide session (background event page / service worker). */
const session = createAgentSession({
  getStorage: storageLocal,
});

export async function handleAgentSettingsGet(requestId: string): Promise<Envelope> {
  const settings = await session.getSettings();
  return createEnvelope("agent-settings-result", requestId, {
    ok: true,
    settings,
  });
}

export async function handleAgentSettingsSet(
  requestId: string,
  partial: Partial<AgentSettings> & { apiKey?: string },
): Promise<Envelope> {
  const settings = await session.setSettings(partial);
  return createEnvelope("agent-settings-result", requestId, {
    ok: true,
    settings,
  });
}

export async function handleAgentRun(
  requestId: string,
  request: AgentRequest,
  /** Test seam: inject fetch (production uses global fetch). */
  fetchFn?: FetchFn,
): Promise<Envelope> {
  const outcome = await session.run(request, fetchFn ? { fetchFn } : undefined);
  if (outcome.ok) {
    return createEnvelope("agent-result", requestId, { ok: true, result: outcome.result });
  }
  return createEnvelope("agent-result", requestId, {
    ok: false,
    cancelled: outcome.cancelled,
    error: outcome.error,
  });
}

export function handleAgentCancel(requestId: string): Envelope {
  session.cancel();
  return createEnvelope("agent-result", requestId, {
    ok: false,
    cancelled: true,
    error: "cancelled",
  });
}

