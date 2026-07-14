import { describe, expect, it } from "vitest";
import {
  canStageDefault,
  emptyTrashState,
  exclusionDenialReason,
  filterExcludedRecommendations,
  loadTrash,
  parseTrash,
  saveTrash,
  serializeTrash,
  stageDenialReason,
  stageItems,
  unstageItems,
  TRASH_SAFE_COPY,
  TRASH_STORAGE_KEY,
  type StageCandidate,
  type TrashStorage,
} from "../src/trash/index.js";

function memStorage(initial: Record<string, unknown> = {}): TrashStorage & { data: Record<string, unknown> } {
  const data = { ...initial };
  return {
    data,
    async get(key) {
      return data[key];
    },
    async set(key, value) {
      data[key] = value;
    },
  };
}

const legendary: StageCandidate = {
  id: "1",
  itemHash: 100,
  name: "Trust",
  tierType: "Legendary",
};

const exotic: StageCandidate = {
  id: "2",
  itemHash: 200,
  name: "Hawkmoon",
  isExotic: true,
  tierType: "Exotic",
};

const favorite: StageCandidate = {
  id: "3",
  itemHash: 300,
  name: "Beloved",
  tag: "favorite",
  tierType: "Legendary",
};

describe("exclusion rules", () => {
  it("allows legendary non-favorite", () => {
    expect(canStageDefault(legendary)).toBe(true);
    expect(stageDenialReason(legendary)).toBeNull();
    expect(exclusionDenialReason(legendary)).toBeNull();
  });

  it("denies exotic", () => {
    expect(canStageDefault(exotic)).toBe(false);
    expect(stageDenialReason(exotic)).toBe("exotic");
    expect(exclusionDenialReason(exotic)).toBe("exotic");
  });

  it("denies favorite tag", () => {
    expect(canStageDefault(favorite)).toBe(false);
    expect(stageDenialReason(favorite)).toBe("favorite");
    expect(exclusionDenialReason(favorite)).toBe("favorite");
  });

  it("denies tierType Exotic without isExotic flag", () => {
    expect(stageDenialReason({ id: "x", itemHash: 1, name: "X", tierType: "Exotic" })).toBe(
      "exotic",
    );
  });

  it("filterExcludedRecommendations drops exotic/favorite via resolve", () => {
    const recs = [
      { id: "leg", itemHash: 1, name: "Trust" },
      { id: "ex", itemHash: 2, name: "Hawk" },
      { id: "fav", itemHash: 3, name: "Beloved" },
      { id: "unknown", itemHash: 4, name: "Mystery" },
    ];
    const vault = new Map([
      ["leg", { tierType: "Legendary" }],
      ["ex", { tierType: "Exotic" }],
      ["fav", { tag: "favorite", tierType: "Legendary" }],
    ]);
    const kept = filterExcludedRecommendations(recs, (id) => vault.get(id));
    expect(kept.map((r) => r.id).sort()).toEqual(["leg", "unknown"]);
  });

  it("filterExcludedRecommendations uses fields on the rec itself", () => {
    const kept = filterExcludedRecommendations([
      { id: "a", itemHash: 1, name: "A", isExotic: true },
      { id: "b", itemHash: 2, name: "B", tag: "favorite" },
      { id: "c", itemHash: 3, name: "C", tierType: "Legendary" },
    ]);
    expect(kept.map((r) => r.id)).toEqual(["c"]);
  });

  it("vault resolve wins over model fields that would weaken exclusion", () => {
    // Model claims safe; vault says Exotic / favorite — must still drop.
    const recs = [
      { id: "ex", itemHash: 1, name: "Hawk", isExotic: false, tierType: "Legendary" },
      { id: "fav", itemHash: 2, name: "Beloved", tag: "keep", tierType: "Legendary" },
      { id: "leg", itemHash: 3, name: "Trust", tierType: "Legendary" },
    ];
    const vault = new Map([
      ["ex", { isExotic: true, tierType: "Exotic" }],
      ["fav", { tag: "favorite", tierType: "Legendary" }],
      ["leg", { tierType: "Legendary" }],
    ]);
    const kept = filterExcludedRecommendations(recs, (id) => vault.get(id));
    expect(kept.map((r) => r.id)).toEqual(["leg"]);
  });

  it("isExotic-only vault row drops rec without tierType on the payload", () => {
    const kept = filterExcludedRecommendations(
      [{ id: "x", itemHash: 1, name: "ExoticGun" }],
      (id) => (id === "x" ? { isExotic: true } : undefined),
    );
    expect(kept).toEqual([]);
  });
});

describe("stage / unstage", () => {
  it("stages without confirm path (pure stageItems)", () => {
    const { state, result } = stageItems(emptyTrashState(), [legendary], 1000);
    expect(result.staged).toHaveLength(1);
    expect(result.denied).toHaveLength(0);
    expect(state.items[0]?.name).toBe("Trust");
    expect(state.items[0]?.stagedAt).toBe(1000);
    expect(state.items[0]?.mirrorStatus).toBe("none");
  });

  it("denies exotic and favorite in batch", () => {
    const { result } = stageItems(emptyTrashState(), [legendary, exotic, favorite]);
    expect(result.staged.map((s) => s.id)).toEqual(["1"]);
    expect(result.denied).toEqual(
      expect.arrayContaining([
        { id: "2", reason: "exotic" },
        { id: "3", reason: "favorite" },
      ]),
    );
  });

  it("unstages by id", () => {
    const staged = stageItems(emptyTrashState(), [legendary]).state;
    const { state, removed } = unstageItems(staged, ["1"]);
    expect(removed).toHaveLength(1);
    expect(state.items).toHaveLength(0);
  });

  it("denies already-staged", () => {
    const once = stageItems(emptyTrashState(), [legendary]).state;
    const { result } = stageItems(once, [legendary]);
    expect(result.denied).toEqual([{ id: "1", reason: "already-staged" }]);
  });
});

describe("persistence serializer", () => {
  it("round-trips through serialize/parse", () => {
    const { state } = stageItems(emptyTrashState(), [legendary], 42);
    const raw = serializeTrash(state);
    const parsed = parseTrash(raw);
    expect(parsed).toEqual(state);
  });

  it("survives storage.local style object load/save", async () => {
    const storage = memStorage();
    const { state } = stageItems(emptyTrashState(), [legendary], 99);
    await saveTrash(storage, state);
    expect(storage.data[TRASH_STORAGE_KEY]).toEqual(state);
    const loaded = await loadTrash(storage);
    expect(loaded.items).toHaveLength(1);
    expect(loaded.items[0]?.id).toBe("1");
  });

  it("returns empty on corrupt data", () => {
    expect(parseTrash("not-json")).toEqual(emptyTrashState());
    expect(parseTrash({ version: 99 })).toEqual(emptyTrashState());
  });
});

describe("safe copy", () => {
  it("never claims items are deleted from Destiny", () => {
    // Positive safety claims are required; false "we deleted it" claims are forbidden.
    expect(TRASH_SAFE_COPY.sectionHelp).toMatch(/never deletes/i);
    expect(TRASH_SAFE_COPY.stagedOk(1)).toMatch(/Not deleted from Destiny/);
    const unsafe = /items (are|were) deleted from Destiny|permanently deleted from Destiny/i;
    expect(TRASH_SAFE_COPY.sectionHelp).not.toMatch(unsafe);
    expect(TRASH_SAFE_COPY.stagedOk(2)).not.toMatch(unsafe);
  });
});
