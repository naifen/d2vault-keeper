/**
 * Workbench messaging client — deep module for panel actions.
 * DOM shell injects runtime send; tests inject a fake.
 */

import {
  createTypedEnvelope,
  isEnvelope,
  newRequestId,
  type AgentResultPayload,
  type Envelope,
  type FilterResultPayload,
  type RoundTripResultPayload,
  type TrashResultPayload,
} from "../messaging/index.js";
import type { InventoryStatus, VaultItem } from "../inventory/index.js";
import {
  emptyTrashState,
  type StageCandidate,
  type TrashRecord,
  type TrashState,
} from "../trash/index.js";
import {
  intentionToAgentRequest,
  isApiKeyMask,
  type AgentRecommendation,
  type AgentResult,
} from "../agent/index.js";
import type { AgentSettingsResultPayload } from "../messaging/types.js";

export type RuntimeSend = (message: Envelope) => Promise<unknown>;

export type ClientOk<T> = { ok: true } & T;
export type ClientErr = { ok: false; error: string };
export type ClientResult<T> = ClientOk<T> | ClientErr;

export interface WorkbenchClient {
  ping(): Promise<boolean>;
  roundTrip(token: string): Promise<ClientResult<{ hops: string[]; token: string }>>;
  loadVault(): Promise<ClientResult<{ status: InventoryStatus; items: VaultItem[] }>>;
  loadTrash(): Promise<ClientResult<{ items: TrashRecord[]; state: TrashState }>>;
  /** Stage pre-projected candidates (projection lives in planStageSelection / inventory). */
  stage(
    candidates: readonly StageCandidate[],
  ): Promise<
    ClientResult<{
      items: TrashRecord[];
      staged: TrashRecord[];
      denied: Array<{ id: string; reason: string }>;
      candidates: StageCandidate[];
    }>
  >;
  unstage(ids: string[]): Promise<ClientResult<{ items: TrashRecord[]; removed: TrashRecord[] }>>;
  applyFilter(query: string): Promise<ClientResult<{ query: string; applied: boolean }>>;
  clearFilter(): Promise<ClientResult<{ applied: boolean }>>;
  repairMirror(): Promise<ClientResult<{ items: TrashRecord[]; repaired: TrashRecord[] }>>;
  saveApiKey(apiKey: string): Promise<ClientResult<{ saved: boolean }>>;
  /** Load agent settings (api key masked; hasKey for Suggest gating). */
  loadSettings(): Promise<ClientResult<{ hasKey: boolean }>>;
  runAgent(input: {
    intention: string;
    vaultContextOptIn: boolean;
    vaultItems: readonly VaultItem[];
    vaultSliceLimit?: number;
  }): Promise<ClientResult<{ result: AgentResult }>>;
  cancelAgent(): Promise<void>;
}

function bad(error: string): ClientErr {
  return { ok: false, error };
}

function trashFailed(payload: TrashResultPayload | undefined, fallback: string): ClientErr | null {
  if (payload?.ok === false) return bad(payload.error ?? fallback);
  return null;
}

export function createWorkbenchClient(send: RuntimeSend): WorkbenchClient {
  return {
    async ping() {
      try {
        const res = await send(
          createTypedEnvelope("ping", newRequestId(), { from: "workbench", at: Date.now() }),
        );
        return isEnvelope(res) && res.kind === "pong";
      } catch {
        return false;
      }
    },

    async roundTrip(token: string) {
      try {
        const res = await send(
          createTypedEnvelope("roundtrip", newRequestId(), { token, hop: "workbench" }),
        );
        if (!isEnvelope(res) || res.kind !== "roundtrip-result") {
          return bad("bad response");
        }
        const payload = res.payload as RoundTripResultPayload | undefined;
        if (payload?.ok && payload.token === token) {
          return { ok: true, hops: payload.hops, token: payload.token };
        }
        return bad(`incomplete hops=${payload?.hops?.join(" → ") ?? "?"}`);
      } catch (err) {
        return bad(String(err));
      }
    },

    async loadVault() {
      try {
        const res = await send(createTypedEnvelope("vault-get", newRequestId()));
        if (!isEnvelope(res) || res.kind !== "vault-result") {
          return bad("bad response");
        }
        const status = res.payload as InventoryStatus | undefined;
        if (!status) return bad("bad response");
        if (status.state === "ok") {
          return { ok: true, status, items: status.items };
        }
        return { ok: true, status, items: [] };
      } catch (err) {
        return bad(String(err));
      }
    },

    async loadTrash() {
      try {
        const res = await send(createTypedEnvelope("trash-get", newRequestId()));
        if (!isEnvelope(res) || res.kind !== "trash-result") {
          return bad("Trash load failed");
        }
        const payload = res.payload as TrashResultPayload | undefined;
        const fail = trashFailed(payload, "Trash load failed");
        if (fail) return fail;
        const state = payload?.state ?? emptyTrashState();
        return { ok: true, items: state.items, state };
      } catch (err) {
        return bad(String(err));
      }
    },

    async stage(candidates) {
      if (candidates.length === 0) {
        return bad("Select vault items to stage");
      }
      // Mutable copy for envelope payload + result echo (callers may pass readonly).
      const sent = [...candidates];
      try {
        const res = await send(
          createTypedEnvelope("trash-stage", newRequestId(), { candidates: sent }),
        );
        if (!isEnvelope(res) || res.kind !== "trash-result") {
          return bad("Stage failed");
        }
        const payload = res.payload as TrashResultPayload | undefined;
        const fail = trashFailed(payload, "Stage failed");
        if (fail) return fail;
        const items = payload?.state?.items ?? [];
        return {
          ok: true,
          items,
          staged: payload?.result?.staged ?? [],
          denied: payload?.result?.denied ?? [],
          candidates: sent,
        };
      } catch (err) {
        return bad(String(err));
      }
    },

    async unstage(ids) {
      if (ids.length === 0) {
        return bad("Select Trash items to unstage");
      }
      try {
        const res = await send(createTypedEnvelope("trash-unstage", newRequestId(), { ids }));
        if (!isEnvelope(res) || res.kind !== "trash-result") {
          return bad("Unstage failed");
        }
        const payload = res.payload as TrashResultPayload | undefined;
        const fail = trashFailed(payload, "Unstage failed");
        if (fail) return fail;
        return {
          ok: true,
          items: payload?.state?.items ?? [],
          removed: payload?.removed ?? [],
        };
      } catch (err) {
        return bad(String(err));
      }
    },

    async applyFilter(query) {
      try {
        const res = await send(
          createTypedEnvelope("filter-apply", newRequestId(), { query }),
        );
        if (!isEnvelope(res) || res.kind !== "filter-result") {
          return bad("Apply failed: bad response");
        }
        const payload = res.payload as FilterResultPayload | undefined;
        if (payload?.ok && payload.applied) {
          return { ok: true, query: payload.query || query, applied: true };
        }
        return bad(payload?.error ?? "Apply failed");
      } catch (err) {
        return bad(String(err));
      }
    },

    async clearFilter() {
      try {
        const res = await send(createTypedEnvelope("filter-clear", newRequestId()));
        if (!isEnvelope(res) || res.kind !== "filter-result") {
          return bad("Clear failed: bad response");
        }
        const payload = res.payload as FilterResultPayload | undefined;
        if (payload?.ok && payload.applied) {
          return { ok: true, applied: true };
        }
        return bad(payload?.error ?? "Clear failed");
      } catch (err) {
        return bad(String(err));
      }
    },

    async repairMirror() {
      try {
        const res = await send(createTypedEnvelope("trash-repair-mirror", newRequestId()));
        if (!isEnvelope(res) || res.kind !== "trash-result") {
          return bad("Repair Mirror failed");
        }
        const payload = res.payload as TrashResultPayload | undefined;
        const fail = trashFailed(payload, "Repair Mirror failed");
        if (fail) return fail;
        return {
          ok: true,
          items: payload?.state?.items ?? [],
          repaired: payload?.repaired ?? [],
        };
      } catch (err) {
        return bad(String(err));
      }
    },

    async saveApiKey(apiKey) {
      const trimmed = apiKey.trim();
      if (!trimmed || isApiKeyMask(trimmed)) {
        return bad("Enter a new API key to update (empty save ignored)");
      }
      try {
        const res = await send(
          createTypedEnvelope("agent-settings-set", newRequestId(), { apiKey: trimmed }),
        );
        if (isEnvelope(res) && res.kind === "agent-settings-result") {
          const payload = res.payload as AgentSettingsResultPayload | undefined;
          if (payload?.ok) return { ok: true, saved: true };
        }
        return bad("Failed to save API key");
      } catch (err) {
        return bad(String(err));
      }
    },

    async loadSettings() {
      try {
        const res = await send(createTypedEnvelope("agent-settings-get", newRequestId()));
        if (!isEnvelope(res) || res.kind !== "agent-settings-result") {
          return bad("Failed to load settings");
        }
        const payload = res.payload as AgentSettingsResultPayload | undefined;
        if (!payload?.ok || !payload.settings) return bad("Failed to load settings");
        const settings = payload.settings;
        const hasKey = Boolean(
          settings.hasKey || (settings.apiKey && settings.apiKey !== ""),
        );
        return { ok: true, hasKey };
      } catch (err) {
        return bad(String(err));
      }
    },

    async runAgent(input) {
      const payload = intentionToAgentRequest({
        intention: input.intention,
        vaultContextOptIn: input.vaultContextOptIn,
        vaultItems: input.vaultItems,
        ...(input.vaultSliceLimit !== undefined
          ? { vaultSliceLimit: input.vaultSliceLimit }
          : {}),
      });

      try {
        const res = await send(createTypedEnvelope("agent-run", newRequestId(), payload));
        if (!isEnvelope(res) || res.kind !== "agent-result") {
          return bad("Agent failed: bad response");
        }
        const body = res.payload as AgentResultPayload | undefined;
        if (body?.cancelled) {
          return bad("cancelled");
        }
        if (!body?.ok || !body.result) {
          return bad(body?.error ?? "Agent failed");
        }
        return { ok: true, result: body.result };
      } catch (err) {
        return bad(String(err));
      }
    },

    async cancelAgent() {
      try {
        await send(createTypedEnvelope("agent-cancel", newRequestId()));
      } catch {
        // Best-effort cancel — UI still shows cancel requested.
      }
    },
  };
}

export type { AgentRecommendation, AgentResult, StageCandidate, TrashRecord, VaultItem };
