import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  extractVaultItems,
  membershipProfileKey,
  readVaultInventory,
  resolveMembershipId,
  LAST_MEMBERSHIP_KEY,
  type DestinyProfileResponseLike,
  type DefinitionMap,
  type IdbKeyval,
} from "../src/inventory/index.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const warmProfile = JSON.parse(
  readFileSync(join(root, "tests/fixtures/profile-warm.json"), "utf8"),
) as DestinyProfileResponseLike;

describe("membership key", () => {
  it("builds profile-${membershipId}", () => {
    expect(membershipProfileKey("1234567890")).toBe("profile-1234567890");
  });

  it("rejects empty membership id", () => {
    expect(() => membershipProfileKey("")).toThrow(/membershipId/);
    expect(() => membershipProfileKey("   ")).toThrow(/membershipId/);
  });

  it("resolves dim-last-membership-id from localStorage get", () => {
    const store: Record<string, string> = {
      [LAST_MEMBERSHIP_KEY]: "999888777",
    };
    expect(resolveMembershipId((k) => store[k] ?? null)).toBe("999888777");
    expect(resolveMembershipId(() => null)).toBeNull();
    expect(resolveMembershipId(() => "  ")).toBeNull();
  });
});

describe("extractVaultItems from fixture profile", () => {
  it("returns vault-only items (excludes non-vault location and Special Orders)", () => {
    const items = extractVaultItems(warmProfile);
    const ids = items.map((i) => i.id).sort();
    // Special Orders 8000000001 excluded; location=1 character item excluded.
    expect(ids).toEqual(["9000000001", "9000000002", "stack-2001-1469714392-2"]);
  });

  it("attaches power from instance components", () => {
    const items = extractVaultItems(warmProfile);
    const a = items.find((i) => i.id === "9000000001");
    expect(a?.power).toBe(1810);
  });

  it("uses definition map for name/tier when provided", () => {
    const defs: DefinitionMap = new Map([
      [
        1001,
        {
          name: "Trust",
          tierTypeName: "Legendary",
          itemTypeDisplayName: "Hand Cannon",
          tierType: 5,
        },
      ],
    ]);
    const items = extractVaultItems(warmProfile, { definitions: defs });
    const trust = items.find((i) => i.itemHash === 1001);
    expect(trust?.name).toBe("Trust");
    expect(trust?.tierType).toBe("Legendary");
    expect(trust?.itemType).toBe("Hand Cannon");
  });

  it("returns empty for missing profile", () => {
    expect(extractVaultItems(null)).toEqual([]);
    expect(extractVaultItems({})).toEqual([]);
  });
});

describe("readVaultInventory (mock IDB)", () => {
  it("ok path with warm cache", async () => {
    const idb: IdbKeyval = {
      async get<T>(key: string) {
        if (key === "profile-42") return warmProfile as T;
        // Enrichment may probe manifest / dim-api keys — empty is fine.
        return undefined;
      },
    };
    const status = await readVaultInventory({
      getLocalStorage: (k) => (k === LAST_MEMBERSHIP_KEY ? "42" : null),
      idb,
    });
    expect(status.state).toBe("ok");
    if (status.state === "ok") {
      expect(status.membershipId).toBe("42");
      expect(status.items.length).toBe(3);
      expect(status.source).toBe("idb");
    }
  });

  it("empty when membership missing", async () => {
    const status = await readVaultInventory({
      getLocalStorage: () => null,
      idb: { async get() { return undefined; } },
    });
    expect(status.state).toBe("empty");
    if (status.state === "empty") {
      expect(status.reason).toBe("no-membership");
      expect(status.message).toMatch(/Open DIM logged in/i);
    }
  });

  it("empty when profile key missing", async () => {
    const status = await readVaultInventory({
      getLocalStorage: () => "42",
      idb: { async get() { return undefined; } },
    });
    expect(status.state).toBe("empty");
    if (status.state === "empty") {
      expect(status.reason).toBe("no-profile");
      expect(status.message).toMatch(/Open DIM logged in/i);
    }
  });
});
