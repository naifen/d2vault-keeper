/**
 * Product step: Intention → AgentRequest (vault opt-in + slice bound).
 * Pure policy — not Workbench DOM, not HTTP.
 * Exclusion index from full vault (not slice-capped); LLM dump only when opt-in.
 */

import type {
  AgentExclusionFields,
  AgentRequest,
  AgentVaultSliceRow,
} from "./types.js";

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
  /**
   * Vault view: always used for exclusionById when present.
   * LLM vaultSlice only when vaultContextOptIn is true.
   */
  vaultItems?: readonly VaultViewItem[];
  vaultSliceLimit?: number;
}

function toExclusionFields(v: VaultViewItem): AgentExclusionFields | undefined {
  const fields: AgentExclusionFields = {};
  if (v.tierType !== undefined) fields.tierType = v.tierType;
  if (v.tag !== undefined) fields.tag = v.tag;
  if (v.isExotic !== undefined) fields.isExotic = v.isExotic;
  return fields.tierType !== undefined || fields.tag !== undefined || fields.isExotic !== undefined
    ? fields
    : undefined;
}

function buildExclusionById(
  items: readonly VaultViewItem[],
): Record<string, AgentExclusionFields> | undefined {
  const map: Record<string, AgentExclusionFields> = {};
  let any = false;
  for (const v of items) {
    const fields = toExclusionFields(v);
    if (fields) {
      map[v.id] = fields;
      any = true;
    }
  }
  return any ? map : undefined;
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
 * - vaultContextOptIn false: no LLM vault dump; still attach exclusionById when vault known.
 * - vaultContextOptIn true: bounded vaultSlice for the model + full exclusionById for filter.
 */
export function intentionToAgentRequest(input: IntentionToAgentRequestInput): AgentRequest {
  const items = input.vaultItems ?? [];
  const exclusionById = buildExclusionById(items);
  const req: AgentRequest = {
    intention: input.intention,
    vaultContextOptIn: input.vaultContextOptIn,
  };
  if (exclusionById) req.exclusionById = exclusionById;

  if (!input.vaultContextOptIn) {
    return req;
  }

  const limit = input.vaultSliceLimit ?? DEFAULT_VAULT_SLICE_LIMIT;
  const vaultSlice = items.slice(0, Math.max(0, limit)).map(toVaultSliceRow);
  if (vaultSlice.length > 0) {
    req.vaultSlice = vaultSlice;
  }
  return req;
}
