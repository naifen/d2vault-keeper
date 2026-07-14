/**
 * Stage + Mirror product use-case.
 * One domain surface: get Trash / Stage / Unstage / Repair Mirror.
 * Inject TrashStorage + MirrorBridge. No envelope shapes.
 *
 * Product rules (locality):
 * - RMW mutations serialized (concurrent Stage/Unstage cannot drop items)
 * - Persist Trash SoT before Mirror
 * - Mirror best-effort: failure never rolls back Stage / Unstage
 */

import {
  mirrorStageBatch,
  mirrorUnstageBatch,
  recordsNeedingRepair,
  type MirrorBridge,
} from "../mirror/index.js";
import {
  loadTrash,
  saveTrash,
  stageItems,
  unstageItems,
  type TrashStorage,
} from "./store.js";
import type { StageCandidate, StageResult, TrashRecord, TrashState } from "./types.js";

export interface MirrorClearSummary {
  cleared: string[];
  skipped: string[];
  errors: string[];
}

export interface StageOutcome {
  state: TrashState;
  result: StageResult;
}

export interface UnstageOutcome {
  state: TrashState;
  removed: TrashRecord[];
  mirror?: MirrorClearSummary;
}

export interface RepairMirrorOutcome {
  ok: boolean;
  state: TrashState;
  repaired: TrashRecord[];
  error?: string;
}

/** Ports for the use-case — storage and optional Mirror seam. */
export interface StageMirrorPorts {
  getStorage(): TrashStorage;
  getMirrorBridge(): MirrorBridge | null;
}

/**
 * Domain interface for Stage + Mirror orchestration.
 * Callers (background envelope adapter, tests) share this surface.
 */
export interface StageMirrorUseCase {
  getTrash(): Promise<TrashState>;
  stage(candidates: StageCandidate[]): Promise<StageOutcome>;
  unstage(ids: string[]): Promise<UnstageOutcome>;
  repairMirror(): Promise<RepairMirrorOutcome>;
}

function mergeMirrored(state: TrashState, mirrored: TrashRecord[]): TrashState {
  const byId = new Map(mirrored.map((r) => [r.id, r]));
  return {
    version: 1,
    items: state.items.map((r) => byId.get(r.id) ?? r),
  };
}

/**
 * Create Stage + Mirror use-case. RMW queue lives inside the instance.
 * Ports may resolve storage/bridge dynamically (tests inject; production wires once).
 */
export function createStageMirrorUseCase(ports: StageMirrorPorts): StageMirrorUseCase {
  /** Serialize Trash RMW so concurrent stage/unstage cannot drop items. */
  let mutationTail: Promise<unknown> = Promise.resolve();

  function runMutation<T>(fn: () => Promise<T>): Promise<T> {
    const run = mutationTail.then(fn, fn);
    mutationTail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  return {
    async getTrash(): Promise<TrashState> {
      return loadTrash(ports.getStorage());
    },

    stage(candidates: StageCandidate[]): Promise<StageOutcome> {
      return runMutation(async () => {
        const store = ports.getStorage();
        const current = await loadTrash(store);
        const { state: stagedState, result } = stageItems(current, candidates);
        // Persist Trash first — Mirror failure must not roll back Stage.
        await saveTrash(store, stagedState);

        let state = stagedState;
        const bridge = ports.getMirrorBridge();
        if (bridge && result.staged.length > 0) {
          const mirrored = await mirrorStageBatch(result.staged, bridge);
          state = mergeMirrored(stagedState, mirrored);
          await saveTrash(store, state);
        }

        const stagedIds = new Set(result.staged.map((s) => s.id));
        return {
          state,
          result: {
            staged: state.items.filter((i) => stagedIds.has(i.id)),
            denied: result.denied,
          },
        };
      });
    },

    unstage(ids: string[]): Promise<UnstageOutcome> {
      return runMutation(async () => {
        const store = ports.getStorage();
        const current = await loadTrash(store);
        const { state, removed } = unstageItems(current, ids);
        // Persist Trash removal first.
        await saveTrash(store, state);

        let mirror: MirrorClearSummary | undefined;
        const bridge = ports.getMirrorBridge();
        if (bridge && removed.length > 0) {
          mirror = await mirrorUnstageBatch(removed, bridge);
        }

        const out: UnstageOutcome = { state, removed };
        if (mirror !== undefined) out.mirror = mirror;
        return out;
      });
    },

    repairMirror(): Promise<RepairMirrorOutcome> {
      return runMutation(async () => {
        const store = ports.getStorage();
        const current = await loadTrash(store);
        const bridge = ports.getMirrorBridge();
        if (!bridge) {
          return {
            ok: false,
            state: current,
            repaired: [],
            error: "Mirror bridge unavailable",
          };
        }
        const need = recordsNeedingRepair(current.items);
        if (need.length === 0) {
          return { ok: true, state: current, repaired: [] };
        }
        const mirrored = await mirrorStageBatch(need, bridge);
        const state = mergeMirrored(current, mirrored);
        await saveTrash(store, state);
        return { ok: true, state, repaired: mirrored };
      });
    },
  };
}
