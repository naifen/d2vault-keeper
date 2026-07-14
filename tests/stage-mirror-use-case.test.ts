/**
 * Stage + Mirror use-case — shipped domain surface (no envelopes).
 * Asserts RMW serialization, persist-first Stage, Mirror merge/failure, Repair.
 */
import { describe, expect, it, vi } from "vitest";
import {
  createStageMirrorUseCase,
  emptyTrashState,
  TRASH_STORAGE_KEY,
  type StageCandidate,
  type TrashState,
  type TrashStorage,
} from "../src/trash/index.js";
import type { MirrorBridge } from "../src/mirror/index.js";

function memStorage(initial: Record<string, unknown> = {}): TrashStorage & {
  data: Record<string, unknown>;
  getCalls: number;
  setLog: Array<{ key: string; value: unknown }>;
} {
  const data = { ...initial };
  let getCalls = 0;
  const setLog: Array<{ key: string; value: unknown }> = [];
  return {
    data,
    setLog,
    get getCalls() {
      return getCalls;
    },
    async get(key) {
      getCalls += 1;
      await Promise.resolve();
      return data[key];
    },
    async set(key, value) {
      await Promise.resolve();
      data[key] = value;
      setLog.push({ key, value });
    },
  };
}

const legendary = (id: string, name = id): StageCandidate => ({
  id,
  itemHash: 1,
  name,
  tierType: "Legendary",
});

function trashItems(storage: { data: Record<string, unknown> }): string[] {
  const state = storage.data[TRASH_STORAGE_KEY] as TrashState | undefined;
  return (state?.items ?? []).map((i) => i.id).sort();
}

describe("createStageMirrorUseCase (shipped)", () => {
  it("getTrash returns empty when storage empty", async () => {
    const storage = memStorage();
    const uc = createStageMirrorUseCase({
      getStorage: () => storage,
      getMirrorBridge: () => null,
    });
    const state = await uc.getTrash();
    expect(state).toEqual(emptyTrashState());
  });

  it("stages item and persists Trash without Mirror", async () => {
    const storage = memStorage({ [TRASH_STORAGE_KEY]: emptyTrashState() });
    const uc = createStageMirrorUseCase({
      getStorage: () => storage,
      getMirrorBridge: () => null,
    });
    const { state, result } = await uc.stage([legendary("a", "Trust")]);
    expect(result.denied).toEqual([]);
    expect(result.staged).toHaveLength(1);
    expect(result.staged[0]?.id).toBe("a");
    expect(result.staged[0]?.mirrorStatus).toBe("none");
    expect(state.items.map((i) => i.id)).toEqual(["a"]);
    expect(trashItems(storage)).toEqual(["a"]);
  });

  it("denies exotic and favorite without writing them", async () => {
    const storage = memStorage({ [TRASH_STORAGE_KEY]: emptyTrashState() });
    const uc = createStageMirrorUseCase({
      getStorage: () => storage,
      getMirrorBridge: () => null,
    });
    const { result } = await uc.stage([
      { id: "ex", itemHash: 2, name: "Hawk", isExotic: true },
      { id: "fav", itemHash: 3, name: "Beloved", tag: "favorite", tierType: "Legendary" },
      legendary("ok"),
    ]);
    expect(result.denied.map((d) => d.reason).sort()).toEqual(["exotic", "favorite"]);
    expect(result.staged.map((s) => s.id)).toEqual(["ok"]);
    expect(trashItems(storage)).toEqual(["ok"]);
  });

  it("persists Trash before Mirror and keeps Stage when Mirror fails", async () => {
    const storage = memStorage({ [TRASH_STORAGE_KEY]: emptyTrashState() });
    const setOrder: string[] = [];
    const bridge: MirrorBridge = {
      async setJunkTag(id) {
        setOrder.push(`mirror:${id}`);
        return { ok: false, error: "idb down" };
      },
      async clearJunkTag() {
        return { ok: true };
      },
    };
    const origSet = storage.set.bind(storage);
    storage.set = async (key, value) => {
      setOrder.push(`persist`);
      return origSet(key, value);
    };

    const uc = createStageMirrorUseCase({
      getStorage: () => storage,
      getMirrorBridge: () => bridge,
    });
    const { state, result } = await uc.stage([legendary("a")]);

    // First persist (Stage SoT) before Mirror attempt.
    expect(setOrder[0]).toBe("persist");
    expect(setOrder).toContain("mirror:a");
    expect(setOrder.indexOf("persist")).toBeLessThan(setOrder.indexOf("mirror:a"));

    expect(result.staged).toHaveLength(1);
    expect(result.staged[0]?.mirrorStatus).toBe("failed");
    expect(state.items[0]?.mirrorStatus).toBe("failed");
    // Item still in Trash SoT after failed Mirror.
    expect(trashItems(storage)).toEqual(["a"]);
  });

  it("merges successful Mirror into Trash SoT", async () => {
    const storage = memStorage({ [TRASH_STORAGE_KEY]: emptyTrashState() });
    const bridge: MirrorBridge = {
      async setJunkTag() {
        return { ok: true };
      },
      async clearJunkTag() {
        return { ok: true };
      },
    };
    const uc = createStageMirrorUseCase({
      getStorage: () => storage,
      getMirrorBridge: () => bridge,
    });
    const { result } = await uc.stage([legendary("a")]);
    expect(result.staged[0]?.mirrorStatus).toBe("ok");
    expect(result.staged[0]?.mirrorAppliedByUs).toBe(true);
    const saved = storage.data[TRASH_STORAGE_KEY] as TrashState;
    expect(saved.items[0]?.mirrorAppliedByUs).toBe(true);
  });

  it("serializes concurrent stages so both items persist", async () => {
    const storage = memStorage({ [TRASH_STORAGE_KEY]: emptyTrashState() });
    const uc = createStageMirrorUseCase({
      getStorage: () => storage,
      getMirrorBridge: () => null,
    });
    await Promise.all([uc.stage([legendary("a")]), uc.stage([legendary("b")])]);
    expect(trashItems(storage)).toEqual(["a", "b"]);
  });

  it("unstages and clears Mirror only when applied by us", async () => {
    const storage = memStorage({
      [TRASH_STORAGE_KEY]: {
        version: 1,
        items: [
          {
            id: "ours",
            itemHash: 1,
            name: "Ours",
            stagedAt: 1,
            mirrorAppliedByUs: true,
            mirrorStatus: "ok",
          },
          {
            id: "theirs",
            itemHash: 2,
            name: "Theirs",
            stagedAt: 1,
            mirrorAppliedByUs: false,
            mirrorStatus: "none",
          },
        ],
      },
    });
    const clear = vi.fn(async () => ({ ok: true as const }));
    const bridge: MirrorBridge = {
      setJunkTag: async () => ({ ok: true }),
      clearJunkTag: clear,
    };
    const uc = createStageMirrorUseCase({
      getStorage: () => storage,
      getMirrorBridge: () => bridge,
    });
    const { state, removed, mirror } = await uc.unstage(["ours", "theirs"]);
    expect(removed.map((r) => r.id).sort()).toEqual(["ours", "theirs"]);
    expect(state.items).toEqual([]);
    expect(mirror?.cleared).toEqual(["ours"]);
    expect(mirror?.skipped).toEqual(["theirs"]);
    expect(clear).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledWith("ours");
    expect(trashItems(storage)).toEqual([]);
  });

  it("repairMirror re-applies Mirror for failed/none rows", async () => {
    const storage = memStorage({
      [TRASH_STORAGE_KEY]: {
        version: 1,
        items: [
          {
            id: "ok",
            itemHash: 1,
            name: "Ok",
            stagedAt: 1,
            mirrorAppliedByUs: true,
            mirrorStatus: "ok",
          },
          {
            id: "bad",
            itemHash: 2,
            name: "Bad",
            stagedAt: 1,
            mirrorAppliedByUs: false,
            mirrorStatus: "failed",
          },
        ],
      },
    });
    const set = vi.fn(async () => ({ ok: true as const }));
    const bridge: MirrorBridge = {
      setJunkTag: set,
      clearJunkTag: async () => ({ ok: true }),
    };
    const uc = createStageMirrorUseCase({
      getStorage: () => storage,
      getMirrorBridge: () => bridge,
    });
    const outcome = await uc.repairMirror();
    expect(outcome.ok).toBe(true);
    expect(outcome.repaired.map((r) => r.id)).toEqual(["bad"]);
    expect(set).toHaveBeenCalledWith("bad");
    expect(set).not.toHaveBeenCalledWith("ok");
    const saved = storage.data[TRASH_STORAGE_KEY] as TrashState;
    expect(saved.items.find((i) => i.id === "bad")?.mirrorStatus).toBe("ok");
  });

  it("repairMirror fails cleanly when bridge unavailable", async () => {
    const storage = memStorage({
      [TRASH_STORAGE_KEY]: {
        version: 1,
        items: [
          {
            id: "x",
            itemHash: 1,
            name: "X",
            stagedAt: 1,
            mirrorAppliedByUs: false,
            mirrorStatus: "failed",
          },
        ],
      },
    });
    const uc = createStageMirrorUseCase({
      getStorage: () => storage,
      getMirrorBridge: () => null,
    });
    const outcome = await uc.repairMirror();
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toMatch(/unavailable/i);
    expect(outcome.repaired).toEqual([]);
  });
});
