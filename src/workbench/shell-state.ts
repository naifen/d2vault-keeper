/**
 * Pure Workbench shell policies (testable without DOM).
 * Composer-first IA: Suggest fill, Results tab choice.
 * Stage selected lives in stage-selection.ts (deep transition).
 */

import type { AgentResult } from "../agent/types.js";

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
