import { isEnvelope, type Envelope } from "../messaging/index.js";

/**
 * Choose best Light response across DIM tabs.
 * Prefer success-shaped payloads so a stale tab's soft-fail
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

    if (message.kind === "vault-get" && response.kind === "vault-result") {
      const state = (response.payload as { state?: string } | undefined)?.state;
      if (state === "ok") return response;
      fallback ??= response;
      continue;
    }

    if (
      (message.kind === "mirror-set" || message.kind === "mirror-clear") &&
      response.kind === "mirror-result"
    ) {
      const ok = (response.payload as { ok?: boolean } | undefined)?.ok;
      if (ok) return response;
      fallback ??= response;
      continue;
    }

    return response;
  }
  return fallback;
}
