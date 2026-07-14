/**
 * Thin envelope adapter: maps trash-* messages ↔ StageMirrorUseCase.
 * Product rules live in trash/use-case — not here.
 */

import {
  createBrowserTrashStorage,
  createStageMirrorUseCase,
  type StageCandidate,
  type TrashState,
  type TrashStorage,
} from "../trash/index.js";
import type { MirrorBridge } from "../mirror/index.js";
import { createEnvelope, type Envelope } from "../messaging/index.js";

let storage: TrashStorage | null = null;
let mirrorBridge: MirrorBridge | null = null;

const useCase = createStageMirrorUseCase({
  getStorage(): TrashStorage {
    if (!storage) storage = createBrowserTrashStorage();
    return storage;
  },
  getMirrorBridge(): MirrorBridge | null {
    return mirrorBridge;
  },
});

/** Inject mockable Mirror bridge (tests + production messaging adapter). */
export function setMirrorBridge(bridge: MirrorBridge | null): void {
  mirrorBridge = bridge;
}

/** Inject Trash storage (tests). */
export function setTrashStorage(next: TrashStorage): void {
  storage = next;
}

export async function handleTrashGet(requestId: string): Promise<Envelope> {
  const state = await useCase.getTrash();
  return createEnvelope("trash-result", requestId, {
    ok: true,
    action: "get",
    state,
  });
}

export async function handleTrashStage(
  requestId: string,
  candidates: StageCandidate[],
): Promise<Envelope> {
  const { state, result } = await useCase.stage(candidates);
  return createEnvelope("trash-result", requestId, {
    ok: true,
    action: "stage",
    state,
    result: {
      staged: result.staged,
      denied: result.denied,
    },
  });
}

export async function handleTrashUnstage(
  requestId: string,
  ids: string[],
): Promise<Envelope> {
  const { state, removed, mirror } = await useCase.unstage(ids);
  return createEnvelope("trash-result", requestId, {
    ok: true,
    action: "unstage",
    state,
    removed,
    mirror,
  });
}

export async function handleRepairMirror(requestId: string): Promise<Envelope> {
  const outcome = await useCase.repairMirror();
  if (!outcome.ok) {
    return createEnvelope("trash-result", requestId, {
      ok: false,
      action: "repair-mirror",
      state: outcome.state,
      error: outcome.error ?? "Mirror bridge unavailable",
    });
  }
  return createEnvelope("trash-result", requestId, {
    ok: true,
    action: "repair-mirror",
    state: outcome.state,
    repaired: outcome.repaired,
  });
}

export type { TrashState };
