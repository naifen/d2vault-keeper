import { isEnvelope, type Envelope } from "../messaging/index.js";

/**
 * Choose best Light response across DIM tabs.
 * For filter apply/clear, prefer applied:true so a stale tab's soft-fail
 * does not block a live inventory tab.
 */
export function selectLightResponse(
  message: Envelope,
  responses: Array<Envelope | undefined>,
): Envelope | undefined {
  let fallback: Envelope | undefined;
  for (const response of responses) {
    if (!response || !isEnvelope(response)) continue;
    if (
      (message.kind === "filter-apply" || message.kind === "filter-clear") &&
      response.kind === "filter-result"
    ) {
      const applied = (response.payload as { applied?: boolean } | undefined)?.applied;
      if (applied) return response;
      fallback ??= response;
      continue;
    }
    return response;
  }
  return fallback;
}
