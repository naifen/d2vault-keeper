import {
  createAgentController,
  loadAgentSettings,
  runAgent,
  saveAgentSettings,
  type AgentRequest,
  type AgentSettings,
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

let activeCancel: (() => void) | null = null;

export async function handleAgentSettingsGet(requestId: string): Promise<Envelope> {
  const settings = await loadAgentSettings(storageLocal());
  // Never put raw key into logs; response to Workbench is intentional storage UX.
  return createEnvelope("agent-settings-result", requestId, {
    ok: true,
    settings: {
      ...settings,
      // Mask in transit display default — Workbench can still save new key.
      apiKey: settings.apiKey ? "••••••••" : "",
      hasKey: Boolean(settings.apiKey),
    },
  });
}

export async function handleAgentSettingsSet(
  requestId: string,
  partial: Partial<AgentSettings> & { apiKey?: string },
): Promise<Envelope> {
  const current = await loadAgentSettings(storageLocal());
  const incomingKey = partial.apiKey;
  const next: AgentSettings = {
    apiKey:
      typeof incomingKey === "string" &&
      incomingKey.trim() !== "" &&
      incomingKey !== "••••••••"
        ? incomingKey
        : current.apiKey,
    baseUrl: partial.baseUrl?.trim() || current.baseUrl,
    model: partial.model?.trim() || current.model,
  };
  await saveAgentSettings(storageLocal(), next);
  return createEnvelope("agent-settings-result", requestId, {
    ok: true,
    settings: {
      ...next,
      apiKey: next.apiKey ? "••••••••" : "",
      hasKey: Boolean(next.apiKey),
    },
  });
}

export async function handleAgentRun(
  requestId: string,
  request: AgentRequest,
): Promise<Envelope> {
  if (activeCancel) {
    activeCancel();
    activeCancel = null;
  }
  const settings = await loadAgentSettings(storageLocal());
  const ctrl = createAgentController();
  activeCancel = ctrl.cancel;
  try {
    const result = await runAgent({
      settings,
      request,
      signal: ctrl.signal,
    });
    return createEnvelope("agent-result", requestId, { ok: true, result });
  } catch (err) {
    const aborted =
      (err instanceof Error && err.name === "AbortError") ||
      (typeof DOMException !== "undefined" && err instanceof DOMException && err.name === "AbortError");
    return createEnvelope("agent-result", requestId, {
      ok: false,
      cancelled: aborted,
      error: aborted ? "cancelled" : err instanceof Error ? err.message : String(err),
    });
  } finally {
    activeCancel = null;
  }
}

export function handleAgentCancel(requestId: string): Envelope {
  if (activeCancel) {
    activeCancel();
    activeCancel = null;
  }
  return createEnvelope("agent-result", requestId, {
    ok: false,
    cancelled: true,
    error: "cancelled",
  });
}
