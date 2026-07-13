import {
  createBrowserTrashStorage,
  loadTrash,
  saveTrash,
  stageItems,
  unstageItems,
  type StageCandidate,
  type TrashRecord,
  type TrashState,
} from "../trash/index.js";
import {
  mirrorStageBatch,
  mirrorUnstageBatch,
  recordsNeedingRepair,
  type MirrorBridge,
} from "../mirror/index.js";
import { createEnvelope, type Envelope } from "../messaging/index.js";

const storage = createBrowserTrashStorage();

let mirrorBridge: MirrorBridge | null = null;

/** Inject mockable Mirror bridge (tests + production messaging adapter). */
export function setMirrorBridge(bridge: MirrorBridge | null): void {
  mirrorBridge = bridge;
}

function mergeMirrored(state: TrashState, mirrored: TrashRecord[]): TrashState {
  const byId = new Map(mirrored.map((r) => [r.id, r]));
  return {
    version: 1,
    items: state.items.map((r) => byId.get(r.id) ?? r),
  };
}

export async function handleTrashGet(requestId: string): Promise<Envelope> {
  const state = await loadTrash(storage);
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
  const current = await loadTrash(storage);
  const { state: stagedState, result } = stageItems(current, candidates);
  // Persist Trash first — Mirror failure must not roll back Stage.
  await saveTrash(storage, stagedState);

  let state = stagedState;
  if (mirrorBridge && result.staged.length > 0) {
    const mirrored = await mirrorStageBatch(result.staged, mirrorBridge);
    state = mergeMirrored(stagedState, mirrored);
    await saveTrash(storage, state);
  }

  return createEnvelope("trash-result", requestId, {
    ok: true,
    action: "stage",
    state,
    result: {
      staged: state.items.filter((i) => result.staged.some((s) => s.id === i.id)),
      denied: result.denied,
    },
  });
}

export async function handleTrashUnstage(
  requestId: string,
  ids: string[],
): Promise<Envelope> {
  const current = await loadTrash(storage);
  const toRemove = current.items.filter((i) => ids.includes(i.id));
  const { state, removed } = unstageItems(current, ids);
  // Persist Trash removal first.
  await saveTrash(storage, state);

  let clearSummary: { cleared: string[]; skipped: string[]; errors: string[] } | undefined;
  if (mirrorBridge && toRemove.length > 0) {
    clearSummary = await mirrorUnstageBatch(toRemove, mirrorBridge);
  }

  return createEnvelope("trash-result", requestId, {
    ok: true,
    action: "unstage",
    state,
    removed,
    mirror: clearSummary,
  });
}

export async function handleRepairMirror(requestId: string): Promise<Envelope> {
  const current = await loadTrash(storage);
  if (!mirrorBridge) {
    return createEnvelope("trash-result", requestId, {
      ok: false,
      action: "repair-mirror",
      state: current,
      error: "Mirror bridge unavailable",
    });
  }
  const need = recordsNeedingRepair(current.items);
  if (need.length === 0) {
    return createEnvelope("trash-result", requestId, {
      ok: true,
      action: "repair-mirror",
      state: current,
      repaired: [],
    });
  }
  const mirrored = await mirrorStageBatch(need, mirrorBridge);
  const state = mergeMirrored(current, mirrored);
  await saveTrash(storage, state);
  return createEnvelope("trash-result", requestId, {
    ok: true,
    action: "repair-mirror",
    state,
    repaired: mirrored,
  });
}

export type { TrashState };
