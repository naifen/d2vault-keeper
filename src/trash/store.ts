/**
 * Pure Trash mutations — Stage / Unstage without confirmation.
 * Persistence is injected (browser.storage.local adapter).
 */

import { stageDenialReason } from "./exclusions.js";
import { emptyTrashState, parseTrash, serializeTrash } from "./serializer.js";
import type {
  StageCandidate,
  StageResult,
  TrashRecord,
  TrashState,
} from "./types.js";
import { TRASH_STORAGE_KEY } from "./types.js";

export interface TrashStorage {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

export async function loadTrash(storage: TrashStorage): Promise<TrashState> {
  const raw = await storage.get(TRASH_STORAGE_KEY);
  return parseTrash(raw);
}

export async function saveTrash(storage: TrashStorage, state: TrashState): Promise<void> {
  // Store structured object (storage.local JSON-serializes); also tolerate string round-trip in tests.
  await storage.set(TRASH_STORAGE_KEY, state);
}

export function stageItems(state: TrashState, candidates: StageCandidate[], now = Date.now()): {
  state: TrashState;
  result: StageResult;
} {
  const items = [...state.items];
  const byId = new Map(items.map((i) => [i.id, i]));
  const staged: TrashRecord[] = [];
  const denied: StageResult["denied"] = [];

  for (const c of candidates) {
    if (byId.has(c.id)) {
      denied.push({ id: c.id, reason: "already-staged" });
      continue;
    }
    const reason = stageDenialReason(c);
    if (reason) {
      denied.push({ id: c.id, reason });
      continue;
    }
    const rec: TrashRecord = {
      id: c.id,
      itemHash: c.itemHash,
      name: c.name,
      stagedAt: now,
      mirrorAppliedByUs: false,
      mirrorStatus: "none",
    };
    if (c.tierType !== undefined) rec.tierType = c.tierType;
    if (c.itemType !== undefined) rec.itemType = c.itemType;
    if (c.isExotic !== undefined) rec.isExotic = c.isExotic;
    if (c.tag !== undefined) rec.tag = c.tag;
    items.push(rec);
    byId.set(rec.id, rec);
    staged.push(rec);
  }

  return { state: { version: 1, items }, result: { staged, denied } };
}

export function unstageItems(state: TrashState, ids: string[]): {
  state: TrashState;
  removed: TrashRecord[];
} {
  const idSet = new Set(ids);
  const removed: TrashRecord[] = [];
  const items: TrashRecord[] = [];
  for (const rec of state.items) {
    if (idSet.has(rec.id)) removed.push(rec);
    else items.push(rec);
  }
  return { state: { version: 1, items }, removed };
}

/** Safe product copy — never claims Destiny delete. */
export const TRASH_SAFE_COPY = {
  sectionTitle: "Trash",
  sectionHelp:
    "Staged for in-game dismantle. Vault Keeper never deletes items from Destiny.",
  stageButton: "Stage",
  unstageButton: "Unstage",
  empty: "No staged items.",
  stagedOk: (n: number) => `Staged ${n} item(s). Not deleted from Destiny.`,
  deniedExotic: "Exotics cannot be staged by default.",
  deniedFavorite: "Favorites cannot be staged by default.",
} as const;

export { emptyTrashState, parseTrash, serializeTrash, TRASH_STORAGE_KEY };
