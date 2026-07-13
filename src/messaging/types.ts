/**
 * Extension message bus types.
 * Workbench ↔ background ↔ Light (content script).
 */

export const MESSAGE_SOURCE = "vault-keeper" as const;

export type MessageKind =
  | "ping"
  | "pong"
  | "roundtrip"
  | "roundtrip-result"
  | "light-status"
  | "vault-get"
  | "vault-result"
  | "filter-apply"
  | "filter-clear"
  | "filter-result"
  | "trash-get"
  | "trash-stage"
  | "trash-unstage"
  | "trash-result"
  | "trash-repair-mirror"
  | "mirror-set"
  | "mirror-clear"
  | "mirror-result"
  | "agent-run"
  | "agent-cancel"
  | "agent-result"
  | "agent-settings-get"
  | "agent-settings-set"
  | "agent-settings-result"
  | "error";

export interface FilterApplyPayload {
  query: string;
}

export interface FilterResultPayload {
  ok: boolean;
  query: string;
  applied: boolean;
  error?: string;
}

export interface Envelope<TKind extends MessageKind = MessageKind, TPayload = unknown> {
  source: typeof MESSAGE_SOURCE;
  kind: TKind;
  requestId: string;
  payload?: TPayload;
  error?: string;
}

export interface PingPayload {
  from: "workbench" | "background" | "light";
  at: number;
}

export interface RoundTripPayload {
  /** Correlation token echoed end-to-end. */
  token: string;
  hop: "workbench" | "background" | "light";
}

export interface RoundTripResultPayload {
  token: string;
  hops: Array<"workbench" | "background" | "light">;
  ok: boolean;
}

export interface LightStatusPayload {
  present: boolean;
  href: string;
  /** Optional DIM BroadcastChannel inventory hint (stores-updated / item-moved). */
  inventoryHint?: string;
}

export function isEnvelope(value: unknown): value is Envelope {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return v.source === MESSAGE_SOURCE && typeof v.kind === "string" && typeof v.requestId === "string";
}

export function createEnvelope<TKind extends MessageKind, TPayload>(
  kind: TKind,
  requestId: string,
  payload?: TPayload,
): Envelope<TKind, TPayload> {
  const env: Envelope<TKind, TPayload> = {
    source: MESSAGE_SOURCE,
    kind,
    requestId,
  };
  if (payload !== undefined) {
    env.payload = payload;
  }
  return env;
}
