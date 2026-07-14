/**
 * Pure Workbench shell policies (testable without DOM).
 * Composer-first IA: Suggest fill, Stage → Selection filter, Results tab choice.
 */

import { buildSelectionFilter } from "./selection-filter.js";
import type { VaultItem } from "../inventory/types.js";
import type { AgentRecommendation, AgentResult } from "../agent/types.js";

export type ResultsTab = "matches" | "recs";

/**
 * After successful Suggest: which Results tab to open.
 * Recs when recommendations exist; otherwise Matches.
 */
export function resultsTabAfterSuggest(result: Pick<AgentResult, "recommendations">): ResultsTab {
  return result.recommendations.length > 0 ? "recs" : "matches";
}

/**
 * DIM filter card value after Suggest (joined agent filters; no auto-Apply).
 */
export function filterTextFromAgentResult(result: Pick<AgentResult, "filters">): string {
  return result.filters.filter((f) => f.trim()).join(" ");
}

/**
 * Selection filter rewrite for Stage selected.
 * Non-empty selection → Selection filter string (even if some rows later denied).
 * Empty selection → null (do not invent / do not clear existing filter).
 */
export function selectionFilterAfterStage(
  vaultItems: readonly VaultItem[],
  selectedIds: ReadonlySet<string>,
): string | null {
  if (selectedIds.size === 0) return null;
  const selected = vaultItems.filter((v) => selectedIds.has(v.id));
  if (selected.length === 0) return null;
  return buildSelectionFilter(selected);
}

/**
 * Map agent recommendations to vault-backed rows for Recs list (when ids match).
 * Unmatched recs still appear as lightweight rows for multi-select Stage when possible.
 */
export function recRowsFromAgent(
  recommendations: readonly AgentRecommendation[],
  vaultItems: readonly VaultItem[],
): Array<VaultItem & { reason?: string }> {
  const byId = new Map(vaultItems.map((v) => [v.id, v]));
  const rows: Array<VaultItem & { reason?: string }> = [];
  for (const r of recommendations) {
    const vault = byId.get(r.id);
    if (vault) {
      const row: VaultItem & { reason?: string } = { ...vault };
      if (r.reason) row.reason = r.reason;
      rows.push(row);
      continue;
    }
    const synthetic: VaultItem & { reason?: string } = {
      id: r.id,
      itemHash: r.itemHash,
      quantity: 1,
      bucketHash: 0,
      name: r.name,
    };
    if (r.reason) synthetic.reason = r.reason;
    rows.push(synthetic);
  }
  return rows;
}

/**
 * Stage candidate pool: full vault plus agent-only rec ids (vault wins on id).
 * Display reasons are not needed for Stage — only identity + StageCandidate fields.
 */
export function stagePoolFromVaultAndRecs(
  vaultItems: readonly VaultItem[],
  recommendations: readonly AgentRecommendation[],
): VaultItem[] {
  const pool: VaultItem[] = [...vaultItems];
  const seen = new Set(vaultItems.map((v) => v.id));
  for (const r of recommendations) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    pool.push({
      id: r.id,
      itemHash: r.itemHash,
      quantity: 1,
      bucketHash: 0,
      name: r.name,
    });
  }
  return pool;
}
