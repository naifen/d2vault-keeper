/**
 * Product step: Intention → AgentRequest (vault opt-in + slice bound).
 * Pure policy — not Workbench DOM, not HTTP.
 * Exclusion index from full vault (not slice-capped); LLM dump only when opt-in.
 * Field carry via inventory/project (shared with Stage).
 */

import {
  exclusionByIdFromVault,
  toAgentVaultSliceRow,
  type VaultProjectSource,
} from "../inventory/project.js";
import type {
  AgentExclusionFields,
  AgentRequest,
  AgentVaultSliceRow,
} from "./types.js";

export const DEFAULT_VAULT_SLICE_LIMIT = 200;

/** Minimal vault row accepted for LLM context (Workbench vault view). */
export type VaultViewItem = VaultProjectSource;

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

/**
 * Intention + opt-in + vault view → AgentRequest.
 * - vaultContextOptIn false: no LLM vault dump; still attach exclusionById when vault known.
 * - vaultContextOptIn true: bounded vaultSlice for the model + full exclusionById for filter.
 */
export function intentionToAgentRequest(input: IntentionToAgentRequestInput): AgentRequest {
  const items = input.vaultItems ?? [];
  const exclusionById = exclusionByIdFromVault(items) as
    | Record<string, AgentExclusionFields>
    | undefined;
  const req: AgentRequest = {
    intention: input.intention,
    vaultContextOptIn: input.vaultContextOptIn,
  };
  if (exclusionById) req.exclusionById = exclusionById;

  if (!input.vaultContextOptIn) {
    return req;
  }

  const limit = input.vaultSliceLimit ?? DEFAULT_VAULT_SLICE_LIMIT;
  const vaultSlice = items
    .slice(0, Math.max(0, limit))
    .map((v) => toAgentVaultSliceRow(v) as AgentVaultSliceRow);
  if (vaultSlice.length > 0) {
    req.vaultSlice = vaultSlice;
  }
  return req;
}
