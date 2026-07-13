/**
 * Extension message bus types.
 * Workbench ↔ background ↔ Light (content script).
 * Kind ↔ payload contracts live here; prefer/fallback in protocol.ts.
 */

import type { InventoryStatus } from "../inventory/types.js";
import type { AgentRequest, AgentResult, AgentSettings } from "../agent/types.js";
import type { StageCandidate, TrashRecord, TrashState } from "../trash/types.js";

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
}

export interface MirrorItemPayload {
  itemId: string;
}

export interface MirrorResultPayload {
  ok: boolean;
  error?: string;
}

export interface TrashStagePayload {
  candidates: StageCandidate[];
}

export interface TrashUnstagePayload {
  ids: string[];
}

export interface TrashResultPayload {
  ok: boolean;
  action: "get" | "stage" | "unstage" | "repair-mirror";
  state: TrashState;
  error?: string;
  result?: {
    staged: TrashRecord[];
    denied: Array<{ id: string; reason: string }>;
  };
  removed?: TrashRecord[];
  repaired?: TrashRecord[];
  mirror?: { cleared: string[]; skipped: string[]; errors: string[] };
}

export interface AgentRunPayload extends AgentRequest {}

export interface AgentResultPayload {
  ok: boolean;
  cancelled?: boolean;
  error?: string;
  result?: AgentResult;
}

export interface AgentSettingsSetPayload {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

export interface AgentSettingsResultPayload {
  ok: boolean;
  settings: AgentSettings & { hasKey?: boolean };
}

/** Coupled kind → payload map for domain traffic. */
export type PayloadByKind = {
  ping: PingPayload;
  pong: PingPayload;
  roundtrip: RoundTripPayload;
  "roundtrip-result": RoundTripResultPayload;
  "light-status": LightStatusPayload;
  "vault-get": undefined;
  "vault-result": InventoryStatus;
  "filter-apply": FilterApplyPayload;
  "filter-clear": undefined;
  "filter-result": FilterResultPayload;
  "trash-get": undefined;
  "trash-stage": TrashStagePayload;
  "trash-unstage": TrashUnstagePayload;
  "trash-result": TrashResultPayload;
  "trash-repair-mirror": undefined;
  "mirror-set": MirrorItemPayload;
  "mirror-clear": MirrorItemPayload;
  "mirror-result": MirrorResultPayload;
  "agent-run": AgentRunPayload;
  "agent-cancel": undefined;
  "agent-result": AgentResultPayload;
  "agent-settings-get": undefined;
  "agent-settings-set": AgentSettingsSetPayload;
  "agent-settings-result": AgentSettingsResultPayload;
  error: undefined;
};

export type TypedEnvelope<K extends MessageKind = MessageKind> = Envelope<
  K,
  K extends keyof PayloadByKind ? PayloadByKind[K] : unknown
>;

export interface Envelope<TKind extends MessageKind = MessageKind, TPayload = unknown> {
  source: typeof MESSAGE_SOURCE;
  kind: TKind;
  requestId: string;
  payload?: TPayload;
  error?: string;
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

/** Typed create for known kind→payload pairs. */
export function createTypedEnvelope<K extends keyof PayloadByKind>(
  kind: K,
  requestId: string,
  ...args: PayloadByKind[K] extends undefined
    ? []
    : undefined extends PayloadByKind[K]
      ? [payload?: PayloadByKind[K]]
      : [payload: PayloadByKind[K]]
): Envelope<K, PayloadByKind[K]> {
  const payload = args[0] as PayloadByKind[K] | undefined;
  return createEnvelope(kind, requestId, payload);
}
