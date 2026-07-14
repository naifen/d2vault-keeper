/**
 * Product step: Intention → AgentRequest (vault opt-in + slice bound).
 * Pure policy — not Workbench DOM, not HTTP.
 * Preserves exclusion fields (isExotic, tierType, tag) for Agent post-filter.
 */

import type { AgentRequest, AgentVaultSliceRow } from "./types.js";

export const DEFAULT_VAULT_SLICE_LIMIT = 200;

/** Minimal vault row accepted for LLM context (Workbench vault view). */
export interface VaultViewItem {
  id: string;
  itemHash: number;
  name: string;
  tierType?: string;
  tag?: string;
  /** Same exotic signal Stage keeps via stage-map — required for vault-aware exclusion. */
  isExotic?: boolean;
}

export interface IntentionToAgentRequestInput {
  intention: string;
  vaultContextOptIn: boolean;
  /** Full or partial vault view; only used when opt-in true. */
  vaultItems?: readonly VaultViewItem[];
  vaultSliceLimit?: number;
}

function toVaultSliceRow(v: VaultViewItem): AgentVaultSliceRow {
  const row: AgentVaultSliceRow = {
    id: v.id,
    itemHash: v.itemHash,
    name: v.name,
  };
  if (v.tierType !== undefined) row.tierType = v.tierType;
  if (v.tag !== undefined) row.tag = v.tag;
  if (v.isExotic !== undefined) row.isExotic = v.isExotic;
  return row;
}

/**
 * Intention + opt-in + vault view → AgentRequest.
 * When opt-in is false, vault slice is omitted regardless of vaultItems.
 */
export function intentionToAgentRequest(input: IntentionToAgentRequestInput): AgentRequest {
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
