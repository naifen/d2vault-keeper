/**
 * Agent session use-case.
 * One domain surface: settings get/set, run, cancel.
 * Inject KvStorage (+ optional fetch). No envelope shapes.
 *
 * Product rules (locality):
 * - Single-flight: new run cancels predecessor; predecessor finally must not clear live cancel
 * - Cancel registered before settings load await
 * - API key mask in transit; set ignores mask/empty as keep-current
 */

import { runAgent, createAgentController, type FetchFn } from "./run.js";
import { loadAgentSettings, saveAgentSettings, type KvStorage } from "./settings.js";
import type { AgentRequest, AgentResult, AgentSettings } from "./types.js";

/** Transit / Workbench display sentinel — never store as real key. */
export const API_KEY_MASK = "••••••••";

export function isApiKeyMask(value: string): boolean {
  return value === API_KEY_MASK;
}

export function maskApiKeyForTransit(apiKey: string): string {
  return apiKey ? API_KEY_MASK : "";
}

/** Incoming key update: real non-empty non-mask → replace; else keep current. */
export function resolveApiKeyUpdate(current: string, incoming: string | undefined): string {
  if (typeof incoming === "string" && incoming.trim() !== "" && !isApiKeyMask(incoming)) {
    return incoming;
  }
  return current;
}

export interface PublicAgentSettings {
  apiKey: string;
  baseUrl: string;
  model: string;
  hasKey: boolean;
}

export type AgentRunOutcome =
  | { ok: true; result: AgentResult }
  | { ok: false; cancelled: boolean; error: string };

export interface AgentSessionPorts {
  getStorage(): KvStorage;
  /** Optional default fetch (tests inject; production may omit and use global). */
  getFetch?: () => FetchFn | undefined;
}

export interface AgentSession {
  getSettings(): Promise<PublicAgentSettings>;
  setSettings(partial: Partial<AgentSettings> & { apiKey?: string }): Promise<PublicAgentSettings>;
  run(request: AgentRequest, opts?: { fetchFn?: FetchFn }): Promise<AgentRunOutcome>;
  cancel(): void;
}

function toPublic(settings: AgentSettings): PublicAgentSettings {
  return {
    apiKey: maskApiKeyForTransit(settings.apiKey),
    baseUrl: settings.baseUrl,
    model: settings.model,
    hasKey: Boolean(settings.apiKey),
  };
}

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof Error && err.name === "AbortError") ||
    (typeof DOMException !== "undefined" && err instanceof DOMException && err.name === "AbortError")
  );
}

/**
 * Create Agent session. Cancel slot lives inside the instance.
 * Ports may resolve storage dynamically (tests inject; production wires browser.local).
 */
export function createAgentSession(ports: AgentSessionPorts): AgentSession {
  let activeCancel: (() => void) | null = null;

  return {
    async getSettings(): Promise<PublicAgentSettings> {
      const settings = await loadAgentSettings(ports.getStorage());
      return toPublic(settings);
    },

    async setSettings(
      partial: Partial<AgentSettings> & { apiKey?: string },
    ): Promise<PublicAgentSettings> {
      const current = await loadAgentSettings(ports.getStorage());
      const next: AgentSettings = {
        apiKey: resolveApiKeyUpdate(current.apiKey, partial.apiKey),
        baseUrl: partial.baseUrl?.trim() || current.baseUrl,
        model: partial.model?.trim() || current.model,
      };
      await saveAgentSettings(ports.getStorage(), next);
      return toPublic(next);
    },

    async run(
      request: AgentRequest,
      opts?: { fetchFn?: FetchFn },
    ): Promise<AgentRunOutcome> {
      if (activeCancel) {
        activeCancel();
        activeCancel = null;
      }
      // Register cancel before any await so Cancel during settings load still aborts this run.
      const ctrl = createAgentController();
      activeCancel = ctrl.cancel;
      try {
        const settings = await loadAgentSettings(ports.getStorage());
        if (ctrl.signal.aborted) {
          return { ok: false, cancelled: true, error: "cancelled" };
        }
        const fetchFn = opts?.fetchFn ?? ports.getFetch?.();
        const result = await runAgent({
          settings,
          request,
          signal: ctrl.signal,
          ...(fetchFn ? { fetchFn } : {}),
        });
        return { ok: true, result };
      } catch (err) {
        const aborted = isAbortError(err);
        return {
          ok: false,
          cancelled: aborted,
          error: aborted ? "cancelled" : err instanceof Error ? err.message : String(err),
        };
      } finally {
        // Only clear if we still own the slot — a newer run must keep its cancel handle.
        if (activeCancel === ctrl.cancel) {
          activeCancel = null;
        }
      }
    },

    cancel(): void {
      if (activeCancel) {
        activeCancel();
        activeCancel = null;
      }
    },
  };
}
