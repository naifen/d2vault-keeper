import {
  AGENT_SETTINGS_KEY,
  DEFAULT_AGENT_SETTINGS,
  type AgentSettings,
} from "./types.js";

export interface KvStorage {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

export function parseAgentSettings(raw: unknown): AgentSettings {
  if (typeof raw !== "object" || raw === null) {
    return { ...DEFAULT_AGENT_SETTINGS };
  }
  const o = raw as Record<string, unknown>;
  return {
    apiKey: typeof o.apiKey === "string" ? o.apiKey : "",
    baseUrl:
      typeof o.baseUrl === "string" && o.baseUrl.trim()
        ? o.baseUrl.trim()
        : DEFAULT_AGENT_SETTINGS.baseUrl,
    model:
      typeof o.model === "string" && o.model.trim()
        ? o.model.trim()
        : DEFAULT_AGENT_SETTINGS.model,
  };
}

export async function loadAgentSettings(storage: KvStorage): Promise<AgentSettings> {
  return parseAgentSettings(await storage.get(AGENT_SETTINGS_KEY));
}

export async function saveAgentSettings(
  storage: KvStorage,
  settings: AgentSettings,
): Promise<void> {
  await storage.set(AGENT_SETTINGS_KEY, {
    apiKey: settings.apiKey,
    baseUrl: settings.baseUrl,
    model: settings.model,
  });
}

/** Redact secrets for any logging surface. */
export function redactSettings(settings: AgentSettings): Record<string, string> {
  return {
    apiKey: settings.apiKey ? "[redacted]" : "",
    baseUrl: settings.baseUrl,
    model: settings.model,
  };
}

export { AGENT_SETTINGS_KEY, DEFAULT_AGENT_SETTINGS };
