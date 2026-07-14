/**
 * Tag-clear policy for Mirror (built-in DIM `junk`).
 * Unstage clears tag only when Trash record says we applied it.
 * Mirror failure never rolls back Trash.
 */

import type { MirrorStatus, TrashRecord } from "../trash/types.js";
import { JUNK_TAG } from "../dim-api-profile/index.js";

/** Built-in DIM junk tag — same constant as dim-api-profile tag module. */
export const MIRROR_TAG = JUNK_TAG;

export interface MirrorBridge {
  /** Best-effort set tag on item instance. */
  setJunkTag(itemId: string): Promise<{ ok: boolean; error?: string }>;
  /** Clear junk tag only when requested by policy. */
  clearJunkTag(itemId: string): Promise<{ ok: boolean; error?: string }>;
}

/** Whether Unstage should clear the DIM junk tag. */
export function shouldClearJunkOnUnstage(record: Pick<TrashRecord, "mirrorAppliedByUs">): boolean {
  return record.mirrorAppliedByUs === true;
}

export function applyMirrorSuccess(record: TrashRecord): TrashRecord {
  return {
    ...record,
    mirrorAppliedByUs: true,
    mirrorStatus: "ok",
  };
}

export function applyMirrorFailure(record: TrashRecord, _error?: string): TrashRecord {
  // Trash row stays; only status changes.
  return {
    ...record,
    mirrorStatus: "failed",
    // Do not claim we applied if set failed.
    mirrorAppliedByUs: record.mirrorAppliedByUs,
  };
}

export function applyMirrorPending(record: TrashRecord): TrashRecord {
  return { ...record, mirrorStatus: "pending" };
}

export function recordsNeedingRepair(items: TrashRecord[]): TrashRecord[] {
  return items.filter(
    (r) => r.mirrorStatus === "failed" || r.mirrorStatus === "none" || r.mirrorStatus === "pending",
  );
}

export async function mirrorStageBatch(
  records: TrashRecord[],
  bridge: MirrorBridge,
): Promise<TrashRecord[]> {
  const out: TrashRecord[] = [];
  for (const rec of records) {
    let next = applyMirrorPending(rec);
    try {
      const res = await bridge.setJunkTag(rec.id);
      next = res.ok ? applyMirrorSuccess(next) : applyMirrorFailure(next, res.error);
    } catch (err) {
      next = applyMirrorFailure(next, err instanceof Error ? err.message : String(err));
    }
    out.push(next);
  }
  return out;
}

export async function mirrorUnstageBatch(
  records: TrashRecord[],
  bridge: MirrorBridge,
): Promise<{ cleared: string[]; skipped: string[]; errors: string[] }> {
  const cleared: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];
  for (const rec of records) {
    if (!shouldClearJunkOnUnstage(rec)) {
      skipped.push(rec.id);
      continue;
    }
    try {
      const res = await bridge.clearJunkTag(rec.id);
      if (res.ok) cleared.push(rec.id);
      else errors.push(res.error ?? `clear failed for ${rec.id}`);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  return { cleared, skipped, errors };
}

export type { MirrorStatus };
