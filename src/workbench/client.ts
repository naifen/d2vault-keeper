/**
 * Workbench messaging client — deep module for panel actions.
 * DOM shell injects runtime send; tests inject a fake.
 */

import {
  createEnvelope,
  isEnvelope,
  newRequestId,
  type Envelope,
  type RoundTripResultPayload,
} from "../messaging/index.js";
import type { InventoryStatus, VaultItem } from "../inventory/index.js";
import type { StageCandidate, TrashRecord, TrashState } from "../trash/index.js";
import type { AgentRecommendation, AgentResult } from "../agent/index.js";
import { selectedStageCandidates } from "./stage-map.js";

export type RuntimeSend = (message: Envelope) => Promise<unknown>;

export type ClientOk<T> = { ok: true } & T;
export type ClientErr = { ok: false; error: string };
export type ClientResult<T> = ClientOk<T> | ClientErr;

export interface WorkbenchClient {
  ping(): Promise<boolean>;
  roundTrip(token: string): Promise<ClientResult<{ hops: string[]; token: string }>>;
  loadVault(): Promise<ClientResult<{ status: InventoryStatus; items: VaultItem[] }>>;
  loadTrash(): Promise<ClientResult<{ items: TrashRecord[]; state: TrashState }>>;
  stage(
    vaultItems: readonly VaultItem[],
    selectedIds: ReadonlySet<string>,
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

function asTrashPayload(payload: unknown): {
  ok?: boolean;
  error?: string;
  state?: TrashState;
  result?: { staged: TrashRecord[]; denied: Array<{ id: string; reason: string }> };
  removed?: TrashRecord[];
  repaired?: TrashRecord[];
} {
  return (payload ?? {}) as {
    ok?: boolean;
    error?: string;
    state?: TrashState;
    result?: { staged: TrashRecord[]; denied: Array<{ id: string; reason: string }> };
    removed?: TrashRecord[];
    repaired?: TrashRecord[];
  };
}

function trashFailed(payload: { ok?: boolean; error?: string }, fallback: string): ClientErr | null {
  if (payload.ok === false) return bad(payload.error ?? fallback);
  return null;
}

/** Build vault slice for Agent (field subset + hard cap). Bound is client policy for C1; C4 may relocate. */
export function buildVaultSlice(
  vaultItems: readonly VaultItem[],
  optIn: boolean,
  limit = 200,
): Array<{ id: string; itemHash: number; name: string; tierType?: string; tag?: string }> | undefined {
  if (!optIn) return undefined;
  return vaultItems.slice(0, limit).map((v) => {
    const row: {
      id: string;
      itemHash: number;
      name: string;
      tierType?: string;
      tag?: string;
    } = { id: v.id, itemHash: v.itemHash, name: v.name };
    if (v.tierType !== undefined) row.tierType = v.tierType;
    if (v.tag !== undefined) row.tag = v.tag;
    return row;
  });
}

export function createWorkbenchClient(send: RuntimeSend): WorkbenchClient {
  return {
    async ping() {
      try {
        const res = await send(
          createEnvelope("ping", newRequestId(), { from: "workbench", at: Date.now() }),
        );
        return isEnvelope(res) && res.kind === "pong";
      } catch {
        return false;
      }
    },

    async roundTrip(token: string) {
      try {
        const res = await send(
          createEnvelope("roundtrip", newRequestId(), { token, hop: "workbench" }),
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
        const res = await send(createEnvelope("vault-get", newRequestId()));
        if (!isEnvelope(res) || res.kind !== "vault-result") {
          return bad("bad response");
        }
        const status = res.payload as InventoryStatus;
        if (status.state === "ok") {
          return { ok: true, status, items: status.items };
        }
        return { ok: true, status, items: [] as VaultItem[] };
      } catch (err) {
        return bad(String(err));
      }
    },

    async loadTrash() {
      try {
        const res = await send(createEnvelope("trash-get", newRequestId()));
        if (!isEnvelope(res) || res.kind !== "trash-result") {
          return bad("Trash load failed");
        }
        const payload = asTrashPayload(res.payload);
        const fail = trashFailed(payload, "Trash load failed");
        if (fail) return fail;
        const state = payload.state ?? { version: 1 as const, items: [] };
        return { ok: true, items: state.items, state };
      } catch (err) {
        return bad(String(err));
      }
    },

    async stage(vaultItems, selectedIds) {
      const candidates = selectedStageCandidates(vaultItems, selectedIds);
      if (candidates.length === 0) {
        return bad("Select vault items to stage");
      }
      try {
        const res = await send(
          createEnvelope("trash-stage", newRequestId(), { candidates }),
        );
        if (!isEnvelope(res) || res.kind !== "trash-result") {
          return bad("Stage failed");
        }
        const payload = asTrashPayload(res.payload);
        const fail = trashFailed(payload, "Stage failed");
        if (fail) return fail;
        const items = payload.state?.items ?? [];
        return {
          ok: true,
          items,
          staged: payload.result?.staged ?? [],
          denied: payload.result?.denied ?? [],
          candidates,
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
        const res = await send(createEnvelope("trash-unstage", newRequestId(), { ids }));
        if (!isEnvelope(res) || res.kind !== "trash-result") {
          return bad("Unstage failed");
        }
        const payload = asTrashPayload(res.payload);
        const fail = trashFailed(payload, "Unstage failed");
        if (fail) return fail;
        return {
          ok: true,
          items: payload.state?.items ?? [],
          removed: payload.removed ?? [],
        };
      } catch (err) {
        return bad(String(err));
      }
    },

    async applyFilter(query) {
      try {
        const res = await send(
          createEnvelope("filter-apply", newRequestId(), { query }),
        );
        if (!isEnvelope(res) || res.kind !== "filter-result") {
          return bad("Apply failed: bad response");
        }
        const payload = res.payload as {
          ok?: boolean;
          applied?: boolean;
          error?: string;
          query?: string;
        };
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
        const res = await send(createEnvelope("filter-clear", newRequestId()));
        if (!isEnvelope(res) || res.kind !== "filter-result") {
          return bad("Clear failed: bad response");
        }
        const payload = res.payload as { ok?: boolean; applied?: boolean; error?: string };
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
        const res = await send(createEnvelope("trash-repair-mirror", newRequestId()));
        if (!isEnvelope(res) || res.kind !== "trash-result") {
          return bad("Repair Mirror failed");
        }
        const payload = asTrashPayload(res.payload);
        const fail = trashFailed(payload, "Repair Mirror failed");
        if (fail) return fail;
        return {
          ok: true,
          items: payload.state?.items ?? [],
          repaired: payload.repaired ?? [],
        };
      } catch (err) {
        return bad(String(err));
      }
    },

    async saveApiKey(apiKey) {
      const trimmed = apiKey.trim();
      if (!trimmed || trimmed === "••••••••") {
        return bad("Enter a new API key to update (empty save ignored)");
      }
      try {
        const res = await send(
          createEnvelope("agent-settings-set", newRequestId(), { apiKey: trimmed }),
        );
        if (isEnvelope(res) && res.kind === "agent-settings-result") {
          return { ok: true, saved: true };
        }
        return bad("Failed to save API key");
      } catch (err) {
        return bad(String(err));
      }
    },

    async runAgent(input) {
      const vaultSlice = buildVaultSlice(
        input.vaultItems,
        input.vaultContextOptIn,
        input.vaultSliceLimit ?? 200,
      );
      const payload: {
        intention: string;
        vaultContextOptIn: boolean;
        vaultSlice?: typeof vaultSlice;
      } = {
        intention: input.intention,
        vaultContextOptIn: input.vaultContextOptIn,
      };
      if (input.vaultContextOptIn && vaultSlice) payload.vaultSlice = vaultSlice;

      try {
        const res = await send(createEnvelope("agent-run", newRequestId(), payload));
        if (!isEnvelope(res) || res.kind !== "agent-result") {
          return bad("Agent failed: bad response");
        }
        const body = res.payload as {
          ok?: boolean;
          cancelled?: boolean;
          error?: string;
          result?: AgentResult;
        };
        if (body.cancelled) {
          return bad("cancelled");
        }
        if (!body.ok || !body.result) {
          return bad(body.error ?? "Agent failed");
        }
        return { ok: true, result: body.result };
      } catch (err) {
        return bad(String(err));
      }
    },

    async cancelAgent() {
      try {
        await send(createEnvelope("agent-cancel", newRequestId()));
      } catch {
        // Best-effort cancel — UI still shows cancel requested.
      }
    },
  };
}

export type { AgentRecommendation, AgentResult, StageCandidate, TrashRecord, VaultItem };
