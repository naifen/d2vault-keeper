/**
 * Pure Intention → AgentRequest policy.
 * Opt-in, field subset, and hard vault slice bound live here — not in Workbench DOM.
 */

import type { AgentRequest } from "./types.js";

export const DEFAULT_VAULT_SLICE_LIMIT = 200;

/** Minimal vault row accepted for LLM context (Workbench vault view). */
export interface VaultViewItem {
  id: string;
  itemHash: number;
  name: string;
  tierType?: string;
  tag?: string;
}

export interface BuildAgentRequestInput {
  intention: string;
  vaultContextOptIn: boolean;
  /** Full or partial vault view; only used when opt-in true. */
  vaultItems?: readonly VaultViewItem[];
  vaultSliceLimit?: number;
}

function toVaultSliceRow(
  v: VaultViewItem,
): { id: string; itemHash: number; name: string; tierType?: string; tag?: string } {
  const row: { id: string; itemHash: number; name: string; tierType?: string; tag?: string } = {
    id: v.id,
    itemHash: v.itemHash,
    name: v.name,
  };
  if (v.tierType !== undefined) row.tierType = v.tierType;
  if (v.tag !== undefined) row.tag = v.tag;
  return row;
}

/**
 * Build AgentRequest from Intention + opt-in + vault view.
 * When opt-in is false, vault slice is omitted regardless of vaultItems.
 */
export function buildAgentRequest(input: BuildAgentRequestInput): AgentRequest {
  const limit = input.vaultSliceLimit ?? DEFAULT_VAULT_SLICE_LIMIT;
  if (!input.vaultContextOptIn) {
    return {
      intention: input.intention,
      vaultContextOptIn: false,
    };
  }
  const items = input.vaultItems ?? [];
  const vaultSlice = items.slice(0, Math.max(0, limit)).map(toVaultSliceRow);
  const req: AgentRequest = {
    intention: input.intention,
    vaultContextOptIn: true,
  };
  if (vaultSlice.length > 0) {
    req.vaultSlice = vaultSlice;
  }
  return req;
}
