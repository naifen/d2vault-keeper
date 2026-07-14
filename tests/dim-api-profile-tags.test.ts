/**
 * Favorite read + Mirror write share shipped dim-api-profile tag module.
 */
import { describe, expect, it } from "vitest";
import {
  DIM_API_PROFILE_KEY,
  accountKeyMatchesMembership,
  dimAccountKey,
  extractTagsFromDimApiProfile,
  mutateDimApiProfileTag,
} from "../src/dim-api-profile/index.js";

describe("dim-api-profile tag module (read+write same semantics)", () => {
  it("set junk then extractTags sees junk for membership", () => {
    const { next, changed } = mutateDimApiProfileTag(undefined, "inst-1", "junk", "42");
    expect(changed).toBe(true);
    const tags = extractTagsFromDimApiProfile(next, "42");
    expect(tags.get("inst-1")).toBe("junk");
    // Wrong membership must not see tag
    expect(extractTagsFromDimApiProfile(next, "99").has("inst-1")).toBe(false);
  });

  it("clear junk only when tag is junk; favorite preserved", () => {
    let blob: unknown = undefined;
    blob = mutateDimApiProfileTag(blob, "a", "junk", "7").next;
    // Manually add favorite sibling via second set then override? set only writes junk.
    // Seed favorite by mutate path then inject:
    const seeded = {
      profiles: {
        [dimAccountKey("7")]: {
          tags: {
            a: { id: "a", tag: "junk" },
            b: { id: "b", tag: "favorite" },
          },
        },
      },
    };
    const cleared = mutateDimApiProfileTag(seeded, "a", null, "7");
    expect(cleared.changed).toBe(true);
    const tags = extractTagsFromDimApiProfile(cleared.next, "7");
    expect(tags.has("a")).toBe(false);
    expect(tags.get("b")).toBe("favorite");

    const noClearFav = mutateDimApiProfileTag(seeded, "b", null, "7");
    expect(noClearFav.changed).toBe(false);
    expect(extractTagsFromDimApiProfile(noClearFav.next, "7").get("b")).toBe("favorite");
  });

  it("account key match rejects bare prefix collisions", () => {
    expect(accountKeyMatchesMembership("42-d2", "42")).toBe(true);
    expect(accountKeyMatchesMembership("421-d2", "42")).toBe(false);
    expect(dimAccountKey("99", 2)).toBe("99-d2");
  });

  it("exports stable IDB key", () => {
    expect(DIM_API_PROFILE_KEY).toBe("dim-api-profile");
  });
});
