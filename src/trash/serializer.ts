import type { TrashRecord, TrashState } from "./types.js";

export function emptyTrashState(): TrashState {
  return { version: 1, items: [] };
}

export function serializeTrash(state: TrashState): string {
  return JSON.stringify(state);
}

export function parseTrash(raw: unknown): TrashState {
  if (raw === null || raw === undefined) return emptyTrashState();
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      return emptyTrashState();
    }
  }
  if (typeof value !== "object" || value === null) return emptyTrashState();
  const obj = value as Record<string, unknown>;
  if (obj.version !== 1 || !Array.isArray(obj.items)) return emptyTrashState();
  const items: TrashRecord[] = [];
  for (const entry of obj.items) {
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.id !== "string" || typeof e.itemHash !== "number" || typeof e.name !== "string") {
      continue;
    }
    const rec: TrashRecord = {
      id: e.id,
      itemHash: e.itemHash,
      name: e.name,
      stagedAt: typeof e.stagedAt === "number" ? e.stagedAt : Date.now(),
      mirrorAppliedByUs: e.mirrorAppliedByUs === true,
      mirrorStatus:
        e.mirrorStatus === "ok" ||
        e.mirrorStatus === "pending" ||
        e.mirrorStatus === "failed" ||
        e.mirrorStatus === "none"
          ? e.mirrorStatus
          : "none",
    };
    if (typeof e.tierType === "string") rec.tierType = e.tierType;
    if (typeof e.itemType === "string") rec.itemType = e.itemType;
    if (typeof e.isExotic === "boolean") rec.isExotic = e.isExotic;
    if (typeof e.tag === "string") rec.tag = e.tag;
    items.push(rec);
  }
  return { version: 1, items };
}
