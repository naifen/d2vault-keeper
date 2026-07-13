/**
 * Protocol policy: multi-tab prefer-success + no-Light fallbacks.
 * Lives with payload contracts so hub/UI/Light do not re-encode rules.
 */

import type { InventoryStatus } from "../inventory/types.js";
import {
  createEnvelope,
  isEnvelope,
  type Envelope,
  type FilterResultPayload,
  type MessageKind,
  type MirrorResultPayload,
} from "./types.js";

/** Whether a Light response is the success-shaped winner for multi-tab prefer. */
export function isPreferableLightResponse(
  request: Envelope,
  response: Envelope,
): boolean {
  if (!isEnvelope(response)) return false;

  if (
    (request.kind === "filter-apply" || request.kind === "filter-clear") &&
    response.kind === "filter-result"
  ) {
    const applied = (response.payload as FilterResultPayload | undefined)?.applied;
    return applied === true;
  }

  if (request.kind === "vault-get" && response.kind === "vault-result") {
    const state = (response.payload as InventoryStatus | undefined)?.state;
    return state === "ok";
  }

  if (
    (request.kind === "mirror-set" || request.kind === "mirror-clear") &&
    response.kind === "mirror-result"
  ) {
    const ok = (response.payload as MirrorResultPayload | undefined)?.ok;
    return ok === true;
  }

  return false;
}

/** Soft-fail / partial responses still usable as fallback when no success exists. */
export function isMatchingLightResponse(
  request: Envelope,
  response: Envelope | undefined,
): response is Envelope {
  if (!response || !isEnvelope(response)) return false;

  if (request.kind === "filter-apply" || request.kind === "filter-clear") {
    return response.kind === "filter-result";
  }
  if (request.kind === "vault-get") {
    return response.kind === "vault-result";
  }
  if (request.kind === "mirror-set" || request.kind === "mirror-clear") {
    return response.kind === "mirror-result";
  }
  // Unknown Light kinds: accept any envelope as last resort.
  return true;
}

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
    if (!isMatchingLightResponse(message, response)) continue;
    if (isPreferableLightResponse(message, response)) return response;
    fallback ??= response;
    // For non-prefer kinds (e.g. roundtrip), first matching envelope wins.
    if (
      message.kind !== "filter-apply" &&
      message.kind !== "filter-clear" &&
      message.kind !== "vault-get" &&
      message.kind !== "mirror-set" &&
      message.kind !== "mirror-clear"
    ) {
      return response;
    }
  }
  return fallback;
}

export function noLightVaultResult(requestId: string): Envelope<"vault-result", InventoryStatus> {
  return createEnvelope("vault-result", requestId, {
    state: "empty",
    reason: "no-light",
    message: "Open DIM logged in (no Light content script on a DIM tab).",
  });
}

export function noLightFilterResult(
  requestId: string,
  kind: "filter-apply" | "filter-clear",
  query = "",
): Envelope<"filter-result", FilterResultPayload> {
  const q =
    kind === "filter-apply" ? query : "";
  return createEnvelope("filter-result", requestId, {
    ok: false,
    query: q,
    applied: false,
    error: "Open DIM inventory (Light not reachable).",
  });
}

export function noLightMirrorResult(requestId: string): Envelope<"mirror-result", MirrorResultPayload> {
  return createEnvelope("mirror-result", requestId, {
    ok: false,
    error: "Open DIM inventory (Light not reachable).",
  });
}

/** Build no-Light fallback for Light-relayed kinds; undefined if kind is local. */
export function noLightFallback(
  message: Envelope,
): Envelope | undefined {
  switch (message.kind as MessageKind) {
    case "vault-get":
      return noLightVaultResult(message.requestId);
    case "filter-apply": {
      const query = String(
        (message.payload as { query?: string } | undefined)?.query ?? "",
      );
      return noLightFilterResult(message.requestId, "filter-apply", query);
    }
    case "filter-clear":
      return noLightFilterResult(message.requestId, "filter-clear");
    case "mirror-set":
    case "mirror-clear":
      return noLightMirrorResult(message.requestId);
    default:
      return undefined;
  }
}
