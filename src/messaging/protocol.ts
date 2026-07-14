/**
 * Protocol policy: multi-tab prefer-success + no-Light fallbacks.
 * Lives with payload contracts so hub/UI/Light do not re-encode rules.
 */

import type { InventoryStatus } from "../inventory/types.js";
import {
  createEnvelope,
  isEnvelope,
  type Envelope,
  type FilterApplyPayload,
  type FilterResultPayload,
  type MessageKind,
  type MirrorResultPayload,
} from "./types.js";

/** Prefer-policy request → expected Light response kind (single source of truth). */
const LIGHT_RESULT_KIND: Partial<Record<MessageKind, MessageKind>> = {
  "filter-apply": "filter-result",
  "filter-clear": "filter-result",
  "vault-get": "vault-result",
  "mirror-set": "mirror-result",
  "mirror-clear": "mirror-result",
};

function isPreferPolicyKind(kind: MessageKind): boolean {
  return LIGHT_RESULT_KIND[kind] !== undefined;
}

function isSuccessPayload(requestKind: MessageKind, response: Envelope): boolean {
  if (requestKind === "filter-apply" || requestKind === "filter-clear") {
    return (response.payload as FilterResultPayload | undefined)?.applied === true;
  }
  if (requestKind === "vault-get") {
    return (response.payload as InventoryStatus | undefined)?.state === "ok";
  }
  if (requestKind === "mirror-set" || requestKind === "mirror-clear") {
    return (response.payload as MirrorResultPayload | undefined)?.ok === true;
  }
  return false;
}

/** Whether a Light response is the success-shaped winner for multi-tab prefer. */
export function isPreferableLightResponse(
  request: Envelope,
  response: Envelope,
): boolean {
  if (!isEnvelope(response)) return false;
  if (!isPreferPolicyKind(request.kind)) return false;
  if (LIGHT_RESULT_KIND[request.kind] !== response.kind) return false;
  return isSuccessPayload(request.kind, response);
}

/** Soft-fail / partial responses still usable as fallback when no success exists. */
export function isMatchingLightResponse(
  request: Envelope,
  response: Envelope | undefined,
): response is Envelope {
  if (!response || !isEnvelope(response)) return false;
  const expected = LIGHT_RESULT_KIND[request.kind];
  if (expected) return response.kind === expected;
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
    // Non-prefer kinds (e.g. roundtrip): first matching envelope wins.
    if (!isPreferPolicyKind(message.kind)) return response;
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
  const q = kind === "filter-apply" ? query : "";
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
export function noLightFallback(message: Envelope): Envelope | undefined {
  switch (message.kind) {
    case "vault-get":
      return noLightVaultResult(message.requestId);
    case "filter-apply": {
      const query = (message.payload as FilterApplyPayload | undefined)?.query ?? "";
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
