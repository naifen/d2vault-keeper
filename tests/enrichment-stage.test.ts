/**
 * Real Stage path: vault read enrichment populates isExotic/tag → exclusions fire.
 * Drives readVaultInventory → stageItems (shipped functions).
 */
import { describe, expect, it } from "vitest";
import {
  readVaultInventory,
  extractTagsFromDimApiProfile,
  type IdbKeyval,
  LAST_MEMBERSHIP_KEY,
  DIM_API_PROFILE_KEY,
} from "../src/inventory/index.js";
import { emptyTrashState, stageItems } from "../src/trash/index.js";
import type { DestinyProfileResponseLike } from "../src/inventory/types.js";

const profile: DestinyProfileResponseLike = {
  profileInventory: {
    data: {
      items: [
        {
          itemHash: 1001,
          itemInstanceId: "inst-leg",
          quantity: 1,
          bucketHash: 215593132,
          location: 2,
        },
        {
          itemHash: 2002,
          itemInstanceId: "inst-exotic",
          quantity: 1,
          bucketHash: 215593132,
          location: 2,
        },
        {
          itemHash: 3003,
          itemInstanceId: "inst-fav",
          quantity: 1,
          bucketHash: 215593132,
          location: 2,
        },
      ],
    },
  },
};

const manifest = {
  tables: {
    InventoryItem: {
      "1001": {
        displayProperties: { name: "Trust" },
        inventory: { tierType: 5, tierTypeName: "Legendary" },
        itemTypeDisplayName: "Hand Cannon",
      },
      "2002": {
        displayProperties: { name: "Hawkmoon" },
        inventory: { tierType: 6, tierTypeName: "Exotic" },
        itemTypeDisplayName: "Hand Cannon",
      },
      "3003": {
        displayProperties: { name: "Beloved" },
        inventory: { tierType: 5, tierTypeName: "Legendary" },
        itemTypeDisplayName: "Sniper Rifle",
      },
    },
  },
};

const dimApi = {
  profiles: {
    "42-d2": {
      tags: {
        "inst-fav": { id: "inst-fav", tag: "favorite" },
      },
    },
  },
};

function memIdb(data: Record<string, unknown>): IdbKeyval {
  return {
    async get<T>(key: string) {
      return data[key] as T | undefined;
    },
    async set(key, value) {
      data[key] = value;
    },
  };
}

describe("vault enrichment → Stage exclusions (shipped path)", () => {
  it("denies exotic and favorite when Stage uses vault-get items", async () => {
    const data: Record<string, unknown> = {
      "profile-42": profile,
      "d2-manifest-en": manifest,
      [DIM_API_PROFILE_KEY]: dimApi,
    };
    const status = await readVaultInventory({
      getLocalStorage: (k) => (k === LAST_MEMBERSHIP_KEY ? "42" : null),
      idb: memIdb(data),
      enrich: true,
    });
    expect(status.state).toBe("ok");
    if (status.state !== "ok") return;

    const exotic = status.items.find((i) => i.id === "inst-exotic");
    const fav = status.items.find((i) => i.id === "inst-fav");
    const leg = status.items.find((i) => i.id === "inst-leg");
    expect(exotic?.isExotic).toBe(true);
    expect(exotic?.tierType).toBe("Exotic");
    expect(fav?.tag).toBe("favorite");
    expect(leg?.isExotic).not.toBe(true);

    // Same mapping Workbench stageSelected uses.
    const candidates = status.items.map((v) => ({
      id: v.id,
      itemHash: v.itemHash,
      name: v.name,
      ...(v.tierType !== undefined ? { tierType: v.tierType } : {}),
      ...(v.isExotic !== undefined ? { isExotic: v.isExotic } : {}),
      ...(v.tag !== undefined ? { tag: v.tag } : {}),
    }));

    const { result } = stageItems(emptyTrashState(), candidates);
    expect(result.staged.map((s) => s.id)).toEqual(["inst-leg"]);
    expect(result.denied).toEqual(
      expect.arrayContaining([
        { id: "inst-exotic", reason: "exotic" },
        { id: "inst-fav", reason: "favorite" },
      ]),
    );
  });

  it("does not match membership id as bare prefix of another account key", () => {
    const raw = {
      profiles: {
        "421-d2": {
          tags: { "inst-other": { id: "inst-other", tag: "favorite" } },
        },
        "42-d2": {
          tags: { "inst-mine": { id: "inst-mine", tag: "keep" } },
        },
      },
    };
    const tags = extractTagsFromDimApiProfile(raw, "42");
    expect(tags.get("inst-mine")).toBe("keep");
    expect(tags.has("inst-other")).toBe(false);
  });
});
