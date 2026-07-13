import {
  createBrowserTrashStorage,
  loadTrash,
  saveTrash,
  stageItems,
  unstageItems,
  type StageCandidate,
  type TrashRecord,
  type TrashState,
  type TrashStorage,
} from "../trash/index.js";
import {
  mirrorStageBatch,
  mirrorUnstageBatch,
  recordsNeedingRepair,
  type MirrorBridge,
} from "../mirror/index.js";
import { createEnvelope, type Envelope } from "../messaging/index.js";

let storage: TrashStorage | null = null;

let mirrorBridge: MirrorBridge | null = null;

/** Serialize Trash RMW so concurrent stage/unstage cannot drop items. */
let mutationTail: Promise<unknown> = Promise.resolve();

function getStorage(): TrashStorage {
  if (!storage) storage = createBrowserTrashStorage();
  return storage;
}

function runTrashMutation<T>(fn: () => Promise<T>): Promise<T> {
  const run = mutationTail.then(fn, fn);
  mutationTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Inject mockable Mirror bridge (tests + production messaging adapter). */
export function setMirrorBridge(bridge: MirrorBridge | null): void {
  mirrorBridge = bridge;
}

/** Inject Trash storage (tests). */
export function setTrashStorage(next: TrashStorage): void {
  storage = next;
}

function mergeMirrored(state: TrashState, mirrored: TrashRecord[]): TrashState {
  const byId = new Map(mirrored.map((r) => [r.id, r]));
  return {
    version: 1,
    items: state.items.map((r) => byId.get(r.id) ?? r),
  };
}

export async function handleTrashGet(requestId: string): Promise<Envelope> {
  const state = await loadTrash(getStorage());
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
  return runTrashMutation(async () => {
    const store = getStorage();
    const current = await loadTrash(store);
    const { state: stagedState, result } = stageItems(current, candidates);
    // Persist Trash first — Mirror failure must not roll back Stage.
    await saveTrash(store, stagedState);

    let state = stagedState;
    if (mirrorBridge && result.staged.length > 0) {
      const mirrored = await mirrorStageBatch(result.staged, mirrorBridge);
      state = mergeMirrored(stagedState, mirrored);
      await saveTrash(store, state);
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
  });
}

export async function handleTrashUnstage(
  requestId: string,
  ids: string[],
): Promise<Envelope> {
  return runTrashMutation(async () => {
    const store = getStorage();
    const current = await loadTrash(store);
    const toRemove = current.items.filter((i) => ids.includes(i.id));
    const { state, removed } = unstageItems(current, ids);
    // Persist Trash removal first.
    await saveTrash(store, state);

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
  });
}

export async function handleRepairMirror(requestId: string): Promise<Envelope> {
  return runTrashMutation(async () => {
    const store = getStorage();
    const current = await loadTrash(store);
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
    await saveTrash(store, state);
    return createEnvelope("trash-result", requestId, {
      ok: true,
      action: "repair-mirror",
      state,
      repaired: mirrored,
    });
  });
}

export type { TrashState };
