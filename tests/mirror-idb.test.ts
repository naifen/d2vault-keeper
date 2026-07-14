/**
 * Real Mirror path: write junk into dim-api-profile via shipped IDB tag hooks.
 */
import { describe, expect, it } from "vitest";
import {
  createBrowserIdbMirrorBridge,
  createIdbMirrorBridge,
  mutateDimApiProfileTag,
} from "../src/dim-bridge/index.js";
import { DIM_API_PROFILE_KEY, type IdbKeyval } from "../src/inventory/index.js";
import { mirrorStageBatch, shouldClearJunkOnUnstage } from "../src/mirror/index.js";
import { emptyTrashState, stageItems } from "../src/trash/index.js";

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

describe("mutateDimApiProfileTag", () => {
  it("sets junk on account profile tags", () => {
    const { next, changed } = mutateDimApiProfileTag(undefined, "item-1", "junk", "99");
    expect(changed).toBe(true);
    const tags = (next as { profiles: { "99-d2": { tags: Record<string, { tag?: string }> } } })
      .profiles["99-d2"].tags;
    expect(tags["item-1"]?.tag).toBe("junk");
  });

  it("clears junk without removing non-junk tags", () => {
    const start = {
      profiles: {
        "99-d2": {
          tags: {
            "item-1": { id: "item-1", tag: "junk" },
            "item-2": { id: "item-2", tag: "favorite" },
          },
        },
      },
    };
    const cleared = mutateDimApiProfileTag(start, "item-1", null, "99");
    const tags = (cleared.next as typeof start).profiles["99-d2"].tags;
    expect(tags["item-1"]).toBeUndefined();
    expect(tags["item-2"]?.tag).toBe("favorite");

    const noTouch = mutateDimApiProfileTag(start, "item-2", null, "99");
    expect(noTouch.changed).toBe(false);
  });

  it("clear of missing annotation does not invent a dim-api-profile", () => {
    const cleared = mutateDimApiProfileTag(undefined, "ghost", null, "7");
    expect(cleared.changed).toBe(false);
  });
});

describe("IDB Mirror bridge (shipped path)", () => {
  it("Stage mirror marks ok when IDB write succeeds", async () => {
    const data: Record<string, unknown> = {};
    const bridge = createIdbMirrorBridge({ idb: memIdb(data), membershipId: "42" });

    const { result } = stageItems(emptyTrashState(), [
      { id: "inst-1", itemHash: 1, name: "Gun" },
    ]);
    const mirrored = await mirrorStageBatch(result.staged, bridge);
    expect(mirrored[0]?.mirrorStatus).toBe("ok");
    expect(mirrored[0]?.mirrorAppliedByUs).toBe(true);
    expect(shouldClearJunkOnUnstage(mirrored[0]!)).toBe(true);

    const stored = data[DIM_API_PROFILE_KEY] as {
      profiles: { "42-d2": { tags: { "inst-1": { tag: string } } } };
    };
    expect(stored.profiles["42-d2"].tags["inst-1"].tag).toBe("junk");
  });

  it("clearJunkTag removes junk; membership miss fails soft", async () => {
    const data: Record<string, unknown> = {};
    const bridge = createIdbMirrorBridge({ idb: memIdb(data), membershipId: "42" });
    expect((await bridge.setJunkTag("i1")).ok).toBe(true);
    expect((await bridge.clearJunkTag("i1")).ok).toBe(true);
    expect((await bridge.clearJunkTag("ghost")).ok).toBe(true);

    const noMem = createBrowserIdbMirrorBridge(memIdb({}), () => null);
    expect((await noMem.setJunkTag("x")).ok).toBe(false);
  });
});
