/**
 * Stage selected shell transition (composer-first).
 * One deep module: pool merge + rec exclusion projector + Selection filter + candidates.
 * main paints from the outcome; does not Apply filter to DIM.
 */

import type { AgentRecommendation } from "../agent/types.js";
import type { VaultItem } from "../inventory/types.js";
import type { StageCandidate, TrashRecord } from "../trash/types.js";
import { buildSelectionFilter } from "./selection-filter.js";
import { selectedStageCandidates } from "../inventory/project.js";

export interface StageSelectionInput {
  vaultItems: readonly VaultItem[];
  recommendations: readonly AgentRecommendation[];
  selectedIds: ReadonlySet<string>;
}

export interface StageSelectionPlan {
  /** Vault ∪ agent-only recs (vault wins on id). Exclusion fields preserved on synthetic rows. */
  pool: VaultItem[];
  /** Stage candidates for the current selection from the pool. */
  candidates: StageCandidate[];
  /**
   * Selection filter rewrite.
   * null = empty selection → do not invent / do not clear existing filter.
   * "" = selection had no instance ids safe for `id:`.
   */
  selectionFilter: string | null;
}

export type StageSendResult =
  | {
      ok: true;
      items: TrashRecord[];
      staged: TrashRecord[];
      denied: Array<{ id: string; reason: string }>;
      candidates: StageCandidate[];
    }
  | { ok: false; error: string };

export type StageSelectionOutcome = StageSelectionPlan & {
  stage: StageSendResult;
};

/** Stage port receives pre-projected candidates (single projection in plan). */
export type StagePort = (candidates: readonly StageCandidate[]) => Promise<StageSendResult>;

/**
 * Project one agent recommendation to a vault-shaped row.
 * Vault wins on id; otherwise synthetic row keeps ExclusionSubject fields from the rec.
 * Optional `reason` is display-only (Recs list); Stage pool omits it.
 */
export function projectRecToVaultRow(
  rec: AgentRecommendation,
  vaultById: ReadonlyMap<string, VaultItem>,
  opts?: { includeReason?: boolean },
): VaultItem & { reason?: string } {
  const vault = vaultById.get(rec.id);
  if (vault) {
    const row: VaultItem & { reason?: string } = { ...vault };
    if (opts?.includeReason && rec.reason) row.reason = rec.reason;
    return row;
  }
  return syntheticVaultFromRec(rec, opts);
}

/** Agent-only row → vault shape (exclusion fields preserved; no vault lookup). */
export function syntheticVaultFromRec(
  rec: AgentRecommendation,
  opts?: { includeReason?: boolean },
): VaultItem & { reason?: string } {
  const synthetic: VaultItem & { reason?: string } = {
    id: rec.id,
    itemHash: rec.itemHash,
    quantity: 1,
    bucketHash: 0,
    name: rec.name,
  };
  if (rec.tierType !== undefined) synthetic.tierType = rec.tierType;
  if (rec.tag !== undefined) synthetic.tag = rec.tag;
  if (rec.isExotic !== undefined) synthetic.isExotic = rec.isExotic;
  if (opts?.includeReason && rec.reason) synthetic.reason = rec.reason;
  return synthetic;
}

/**
 * Map agent recommendations to vault-backed rows for Recs list.
 * Unmatched recs appear as lightweight rows (exclusion fields preserved).
 */
export function recRowsFromAgent(
  recommendations: readonly AgentRecommendation[],
  vaultItems: readonly VaultItem[],
): Array<VaultItem & { reason?: string }> {
  const byId = new Map(vaultItems.map((v) => [v.id, v]));
  return recommendations.map((r) => projectRecToVaultRow(r, byId, { includeReason: true }));
}

/**
 * Stage candidate pool: full vault plus agent-only rec ids (vault wins on id).
 * Display reasons omitted — identity + StageCandidate / exclusion fields only.
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
    // Agent-only only — vault ids already skipped; no byId map needed.
    pool.push(syntheticVaultFromRec(r));
  }
  return pool;
}

/**
 * Selection filter rewrite for Stage selected.
 * Non-empty selection → Selection filter string (even if some rows later denied).
 * Empty selection → null.
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

/** Pure Stage selection plan — pool, candidates, Selection filter. No I/O. */
export function planStageSelection(input: StageSelectionInput): StageSelectionPlan {
  const pool = stagePoolFromVaultAndRecs(input.vaultItems, input.recommendations);
  const candidates = selectedStageCandidates(pool, input.selectedIds);
  const selectionFilter = selectionFilterAfterStage(pool, input.selectedIds);
  return { pool, candidates, selectionFilter };
}

/**
 * Full Stage selected transition: plan then stage port once with candidates.
 * Does not Apply filter to DIM — callers paint Selection filter from the plan after success.
 */
export async function runStageSelection(
  input: StageSelectionInput,
  stage: StagePort,
): Promise<StageSelectionOutcome> {
  const plan = planStageSelection(input);
  const stageResult = await stage(plan.candidates);
  return { ...plan, stage: stageResult };
}
