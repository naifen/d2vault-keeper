/**
 * Matches tab: best-effort local DIM filter against vault cache (shipped helper).
 */
import { describe, expect, it } from "vitest";
import {
  extractIdTerms,
  matchVaultItems,
} from "../src/workbench/match-filter.js";
import type { VaultItem } from "../src/inventory/index.js";

const trust: VaultItem = {
  id: "9000000001",
  itemHash: 1,
  quantity: 1,
  bucketHash: 0,
  name: "Trust",
  tierType: "Legendary",
  itemType: "Hand Cannon",
};

const hawk: VaultItem = {
  id: "9000000002",
  itemHash: 2,
  quantity: 1,
  bucketHash: 0,
  name: "Hawkmoon",
  tierType: "Exotic",
  itemType: "Hand Cannon",
  isExotic: true,
};

const beloved: VaultItem = {
  id: "9000000003",
  itemHash: 3,
  quantity: 1,
  bucketHash: 0,
  name: "Beloved",
  tierType: "Legendary",
  itemType: "Sniper Rifle",
  tag: "favorite",
};

const items = [trust, hawk, beloved];

describe("extractIdTerms", () => {
  it("pulls id: terms from Selection filter strings", () => {
    expect(extractIdTerms("id:a or id:b")).toEqual(["a", "b"]);
    expect(extractIdTerms("is:weapon id:9000000001")).toEqual(["9000000001"]);
  });
});

describe("matchVaultItems", () => {
  it("empty query returns all vault items", () => {
    expect(matchVaultItems(items, "").map((i) => i.id)).toEqual([
      "9000000001",
      "9000000002",
      "9000000003",
    ]);
  });

  it("Selection filter id: OR-join targets exact instances", () => {
    expect(
      matchVaultItems(items, "id:9000000001 or id:9000000002").map((i) => i.id),
    ).toEqual(["9000000001", "9000000002"]);
  });

  it("is:handcannon -is:exotic keeps legendary hand cannons only", () => {
    expect(matchVaultItems(items, "is:handcannon -is:exotic").map((i) => i.id)).toEqual([
      "9000000001",
    ]);
  });

  it("tag:favorite matches tagged rows", () => {
    expect(matchVaultItems(items, "tag:favorite").map((i) => i.id)).toEqual(["9000000003"]);
  });

  it("free-text name match", () => {
    expect(matchVaultItems(items, "hawk").map((i) => i.id)).toEqual(["9000000002"]);
  });
});
