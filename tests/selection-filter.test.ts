/**
 * Selection filter pure builder — drives shipped helper only.
 */
import { describe, expect, it } from "vitest";
import {
  buildSelectionFilter,
  isVaultInstanceId,
} from "../src/workbench/selection-filter.js";

describe("isVaultInstanceId", () => {
  it("accepts real instance ids", () => {
    expect(isVaultInstanceId("9000000001")).toBe(true);
    expect(isVaultInstanceId("inst-leg")).toBe(true);
  });

  it("rejects synthetic stack keys, empty, and 0", () => {
    expect(isVaultInstanceId("stack-2001-1469714392-2")).toBe(false);
    expect(isVaultInstanceId("stack-1-0-0")).toBe(false);
    expect(isVaultInstanceId("")).toBe(false);
    expect(isVaultInstanceId("0")).toBe(false);
  });
});

describe("buildSelectionFilter (Selection filter)", () => {
  it("empty selection → empty string", () => {
    expect(buildSelectionFilter([])).toBe("");
  });

  it("single instance id → id: term", () => {
    expect(buildSelectionFilter([{ id: "9000000001" }])).toBe("id:9000000001");
  });

  it("multiple instance ids → OR-joined id: terms (first-seen order)", () => {
    expect(
      buildSelectionFilter([{ id: "a" }, { id: "b" }, { id: "c" }]),
    ).toBe("id:a or id:b or id:c");
  });

  it("dedupes duplicate ids", () => {
    expect(buildSelectionFilter([{ id: "a" }, { id: "a" }, { id: "b" }])).toBe(
      "id:a or id:b",
    );
  });

  it("skips synthetic/non-instance keys (no invented id: terms)", () => {
    expect(
      buildSelectionFilter([
        { id: "stack-2001-1469714392-2" },
        { id: "0" },
        { id: "" },
      ]),
    ).toBe("");
  });

  it("mix: keeps instance ids, drops synthetic", () => {
    expect(
      buildSelectionFilter([
        { id: "stack-1-0-0" },
        { id: "9000000001" },
        { id: "stack-2-0-1" },
        { id: "9000000002" },
      ]),
    ).toBe("id:9000000001 or id:9000000002");
  });
});
