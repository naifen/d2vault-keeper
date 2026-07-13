import { describe, expect, it, vi } from "vitest";
import {
  applyMirrorFailure,
  applyMirrorSuccess,
  mirrorStageBatch,
  mirrorUnstageBatch,
  recordsNeedingRepair,
  shouldClearJunkOnUnstage,
  type MirrorBridge,
} from "../src/mirror/index.js";
import { emptyTrashState, stageItems, type TrashRecord } from "../src/trash/index.js";
import { createMirrorBridgeFromHooks } from "../src/dim-bridge/index.js";

function rec(partial: Partial<TrashRecord> & Pick<TrashRecord, "id">): TrashRecord {
  return {
    id: partial.id,
    itemHash: partial.itemHash ?? 1,
    name: partial.name ?? "Item",
    stagedAt: partial.stagedAt ?? 1,
    mirrorAppliedByUs: partial.mirrorAppliedByUs ?? false,
    mirrorStatus: partial.mirrorStatus ?? "none",
  };
}

describe("tag-clear policy", () => {
  it("clears junk only when we applied the tag", () => {
    expect(shouldClearJunkOnUnstage({ mirrorAppliedByUs: true })).toBe(true);
    expect(shouldClearJunkOnUnstage({ mirrorAppliedByUs: false })).toBe(false);
  });

  it("mirrorUnstageBatch skips pre-existing junk", async () => {
    const clear = vi.fn(async () => ({ ok: true as const }));
    const bridge: MirrorBridge = {
      setJunkTag: async () => ({ ok: true }),
      clearJunkTag: clear,
    };
    const summary = await mirrorUnstageBatch(
      [
        rec({ id: "ours", mirrorAppliedByUs: true, mirrorStatus: "ok" }),
        rec({ id: "theirs", mirrorAppliedByUs: false, mirrorStatus: "none" }),
      ],
      bridge,
    );
    expect(summary.cleared).toEqual(["ours"]);
    expect(summary.skipped).toEqual(["theirs"]);
    expect(clear).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledWith("ours");
  });
});

describe("mirror failure leaves trash", () => {
  it("failed set keeps record fields for Trash SoT", () => {
    const staged = rec({ id: "a", mirrorStatus: "pending" });
    const failed = applyMirrorFailure(staged, "no bridge");
    expect(failed.id).toBe("a");
    expect(failed.mirrorStatus).toBe("failed");
    expect(failed.mirrorAppliedByUs).toBe(false);
  });

  it("mirrorStageBatch failure does not drop items", async () => {
    const bridge: MirrorBridge = {
      setJunkTag: async () => ({ ok: false, error: "boom" }),
      clearJunkTag: async () => ({ ok: true }),
    };
    const { result } = stageItems(emptyTrashState(), [
      { id: "1", itemHash: 1, name: "Gun" },
    ]);
    const mirrored = await mirrorStageBatch(result.staged, bridge);
    expect(mirrored).toHaveLength(1);
    expect(mirrored[0]?.mirrorStatus).toBe("failed");
    expect(mirrored[0]?.id).toBe("1");
  });

  it("success marks applied-by-us", () => {
    const ok = applyMirrorSuccess(rec({ id: "x" }));
    expect(ok.mirrorAppliedByUs).toBe(true);
    expect(ok.mirrorStatus).toBe("ok");
  });
});

describe("Repair Mirror selection", () => {
  it("selects failed/none/pending rows", () => {
    const items = [
      rec({ id: "1", mirrorStatus: "ok", mirrorAppliedByUs: true }),
      rec({ id: "2", mirrorStatus: "failed" }),
      rec({ id: "3", mirrorStatus: "none" }),
    ];
    expect(recordsNeedingRepair(items).map((r) => r.id).sort()).toEqual(["2", "3"]);
  });
});

describe("mockable dim-bridge tag adapter", () => {
  it("createMirrorBridgeFromHooks uses injected hooks", async () => {
    const setTag = vi.fn(async (_id: string, tag: "junk" | null) => tag === "junk");
    const bridge = createMirrorBridgeFromHooks({ setTag });
    expect((await bridge.setJunkTag("abc")).ok).toBe(true);
    expect((await bridge.clearJunkTag("abc")).ok).toBe(false);
    expect(setTag).toHaveBeenCalledWith("abc", "junk");
    expect(setTag).toHaveBeenCalledWith("abc", null);
  });
});
