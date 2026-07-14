/**
 * Best-effort vault perk enrichment — drives shipped extract/enrich path.
 * Present / partial / absent socket+def cases; never invents perk names.
 */
import { describe, expect, it } from "vitest";
import {
  applyPerks,
  definitionsFromManifestTables,
  enrichVaultItems,
  extractVaultItems,
  perkNamesFromPlugHashes,
  plugHashesFromProfile,
  type DestinyProfileResponseLike,
  type DefinitionMap,
} from "../src/inventory/index.js";

const baseItems = {
  profileInventory: {
    data: {
      items: [
        {
          itemHash: 1001,
          itemInstanceId: "inst-full",
          quantity: 1,
          bucketHash: 215593132,
          location: 2,
        },
        {
          itemHash: 1002,
          itemInstanceId: "inst-partial",
          quantity: 1,
          bucketHash: 215593132,
          location: 2,
        },
        {
          itemHash: 1003,
          itemInstanceId: "inst-none",
          quantity: 1,
          bucketHash: 215593132,
          location: 2,
        },
      ],
    },
  },
} satisfies DestinyProfileResponseLike;

const manifestWithPlugs = {
  tables: {
    InventoryItem: {
      "1001": {
        displayProperties: { name: "Trust" },
        inventory: { tierType: 5, tierTypeName: "Legendary" },
        itemTypeDisplayName: "Hand Cannon",
      },
      "1002": {
        displayProperties: { name: "Fatebringer" },
        inventory: { tierType: 5, tierTypeName: "Legendary" },
      },
      "1003": {
        displayProperties: { name: "Dire Promise" },
        inventory: { tierType: 5, tierTypeName: "Legendary" },
      },
      // Plug / perk defs
      "5001": { displayProperties: { name: "Outlaw" } },
      "5002": { displayProperties: { name: "Rampage" } },
      "5003": { displayProperties: { name: "Rangefinder" } },
      // 5004 intentionally missing from defs → partial resolve
    },
  },
};

function profileWithSockets(
  sockets: Record<
    string,
    { sockets: Array<{ plugHash?: number; isEnabled?: boolean; isVisible?: boolean }> }
  >,
): DestinyProfileResponseLike {
  return {
    ...baseItems,
    itemComponents: { sockets: { data: sockets } },
  };
}

describe("plugHashesFromProfile", () => {
  it("returns empty map when sockets table absent", () => {
    expect(plugHashesFromProfile(baseItems).size).toBe(0);
    expect(plugHashesFromProfile(null).size).toBe(0);
  });

  it("collects enabled plug hashes by instance id", () => {
    const profile = profileWithSockets({
      "inst-full": {
        sockets: [
          { plugHash: 5001, isEnabled: true },
          { plugHash: 5002, isEnabled: true },
          { plugHash: 0, isEnabled: true },
          { plugHash: 5003, isEnabled: false },
        ],
      },
    });
    const map = plugHashesFromProfile(profile);
    expect(map.get("inst-full")).toEqual([5001, 5002]);
  });

  it("skips plugs with isVisible === false (hidden sockets are not perks)", () => {
    const profile = profileWithSockets({
      "inst-full": {
        sockets: [
          { plugHash: 5001, isEnabled: true, isVisible: true },
          { plugHash: 5002, isEnabled: true, isVisible: false },
          { plugHash: 5003, isEnabled: true }, // omitted visibility → keep
        ],
      },
    });
    expect(plugHashesFromProfile(profile).get("inst-full")).toEqual([5001, 5003]);
  });
});

describe("perkNamesFromPlugHashes", () => {
  it("resolves only known plugs; never invents names", () => {
    const defs = definitionsFromManifestTables(manifestWithPlugs);
    expect(perkNamesFromPlugHashes([5001, 5002, 9999], defs)).toEqual(["Outlaw", "Rampage"]);
    expect(perkNamesFromPlugHashes([9999], defs)).toEqual([]);
  });
});

describe("applyPerks / enrichVaultItems perks", () => {
  it("present: full socket + def data attaches perk names", () => {
    const profile = profileWithSockets({
      "inst-full": {
        sockets: [
          { plugHash: 5001, isEnabled: true },
          { plugHash: 5002, isEnabled: true },
        ],
      },
    });
    const defs = definitionsFromManifestTables(manifestWithPlugs);
    const items = extractVaultItems(profile);
    const plugs = plugHashesFromProfile(profile);
    const out = applyPerks(items, plugs, defs);
    const full = out.find((i) => i.id === "inst-full");
    expect(full?.perks).toEqual(["Outlaw", "Rampage"]);
    expect(out.find((i) => i.id === "inst-none")?.perks).toBeUndefined();
  });

  it("partial: only resolvable plugs become names; missing def skipped", () => {
    const profile = profileWithSockets({
      "inst-partial": {
        sockets: [
          { plugHash: 5003, isEnabled: true },
          { plugHash: 5004, isEnabled: true }, // no def
        ],
      },
    });
    const defs = definitionsFromManifestTables(manifestWithPlugs);
    const items = extractVaultItems(profile);
    const out = applyPerks(items, plugHashesFromProfile(profile), defs);
    const partial = out.find((i) => i.id === "inst-partial");
    expect(partial?.perks).toEqual(["Rangefinder"]);
    // Must not invent a name for 5004
    expect(partial?.perks?.some((p) => p.includes("5004"))).toBe(false);
  });

  it("absent: no sockets / empty defs → no perks field fabricated", () => {
    const items = extractVaultItems(baseItems);
    const emptyDefs: DefinitionMap = new Map();
    const withEmptyDefs = applyPerks(items, new Map([["inst-full", [5001]]]), emptyDefs);
    expect(withEmptyDefs.every((i) => i.perks === undefined)).toBe(true);

    const noPlugs = applyPerks(items, new Map(), definitionsFromManifestTables(manifestWithPlugs));
    expect(noPlugs.every((i) => i.perks === undefined)).toBe(true);
  });

  it("enrichVaultItems wires plugHashes + definitions without inventing", () => {
    const profile = profileWithSockets({
      "inst-full": {
        sockets: [{ plugHash: 5001, isEnabled: true }],
      },
    });
    const defs = definitionsFromManifestTables(manifestWithPlugs);
    const raw = extractVaultItems(profile);
    const enriched = enrichVaultItems(raw, {
      definitions: defs,
      plugHashesByItemId: plugHashesFromProfile(profile),
    });
    expect(enriched.find((i) => i.id === "inst-full")?.perks).toEqual(["Outlaw"]);
    expect(enriched.find((i) => i.id === "inst-none")?.name).toBe("Dire Promise");
    expect(enriched.find((i) => i.id === "inst-none")?.perks).toBeUndefined();
  });
});
