/**
 * Vault projection seam — field carry for Stage / Agent / exclusion index.
 */
import { describe, expect, it } from "vitest";
import {
  exclusionByIdFromVault,
  selectedStageCandidates,
  toAgentVaultSliceRow,
  toExclusionFields,
  toStageCandidate,
  type VaultItem,
} from "../src/inventory/index.js";
import { emptyTrashState, stageItems } from "../src/trash/index.js";

const full: VaultItem = {
  id: "1",
  itemHash: 10,
  quantity: 2,
  bucketHash: 0,
  name: "Trust",
  tierType: "Legendary",
  itemType: "Hand Cannon",
  isExotic: false,
  tag: "keep",
  perks: ["Outlaw"],
};

const exotic: VaultItem = {
  id: "2",
  itemHash: 20,
  quantity: 1,
  bucketHash: 0,
  name: "Hawkmoon",
  isExotic: true,
  tierType: "Exotic",
};

describe("toStageCandidate (inventory project)", () => {
  it("preserves identity + exclusion fields; drops quantity/perks", () => {
    const c = toStageCandidate(full);
    expect(c).toEqual({
      id: "1",
      itemHash: 10,
      name: "Trust",
      tierType: "Legendary",
      itemType: "Hand Cannon",
      isExotic: false,
      tag: "keep",
    });
    expect("quantity" in c).toBe(false);
    expect("perks" in c).toBe(false);
  });

  it("selectedStageCandidates filters by id set", () => {
    const selected = selectedStageCandidates([full, exotic], new Set(["2"]));
    expect(selected).toHaveLength(1);
    expect(selected[0]?.isExotic).toBe(true);
  });

  it("Stage exclusions fire on projected candidates", () => {
    const { result } = stageItems(
      emptyTrashState(),
      [full, exotic].map(toStageCandidate),
    );
    expect(result.staged.map((s) => s.id)).toEqual(["1"]);
    expect(result.denied).toEqual([{ id: "2", reason: "exotic" }]);
  });
});

describe("toAgentVaultSliceRow + exclusionByIdFromVault", () => {
  it("slice row keeps exclusion signals", () => {
    expect(toAgentVaultSliceRow(exotic)).toEqual({
      id: "2",
      itemHash: 20,
      name: "Hawkmoon",
      isExotic: true,
      tierType: "Exotic",
    });
  });

  it("exclusion index only includes rows with signals", () => {
    const bare: VaultItem = {
      id: "3",
      itemHash: 30,
      quantity: 1,
      bucketHash: 0,
      name: "Bare",
    };
    const map = exclusionByIdFromVault([full, bare, exotic]);
    expect(map).toEqual({
      "1": { tierType: "Legendary", tag: "keep", isExotic: false },
      "2": { isExotic: true, tierType: "Exotic" },
    });
    expect(map?.["3"]).toBeUndefined();
  });

  it("toExclusionFields returns undefined when no signal", () => {
    expect(
      toExclusionFields({
        id: "x",
        itemHash: 1,
        name: "x",
      }),
    ).toBeUndefined();
  });
});
