import { describe, expect, it } from "vitest";
import { createEnvelope } from "../src/messaging/index.js";
import { selectLightResponse } from "../src/background/relay.js";

describe("selectLightResponse (shipped relay policy)", () => {
  it("prefers applied:true over earlier applied:false for filter-apply", () => {
    const request = createEnvelope("filter-apply", "1", { query: "is:weapon" });
    const fail = createEnvelope("filter-result", "1", {
      ok: false,
      query: "is:weapon",
      applied: false,
      error: "not found",
    });
    const ok = createEnvelope("filter-result", "1", {
      ok: true,
      query: "is:weapon",
      applied: true,
    });
    expect(selectLightResponse(request, [fail, ok])).toBe(ok);
  });

  it("returns soft-fail when no tab applied", () => {
    const request = createEnvelope("filter-clear", "2");
    const fail = createEnvelope("filter-result", "2", {
      ok: false,
      query: "",
      applied: false,
      error: "not found",
    });
    expect(selectLightResponse(request, [fail])).toBe(fail);
  });

  it("prefers vault-result state:ok over earlier empty tab", () => {
    const request = createEnvelope("vault-get", "3");
    const empty = createEnvelope("vault-result", "3", {
      state: "empty",
      reason: "no-membership",
      message: "no membership",
    });
    const ok = createEnvelope("vault-result", "3", {
      state: "ok",
      membershipId: "42",
      items: [{ id: "1", itemHash: 1, quantity: 1, bucketHash: 0, name: "Gun" }],
      source: "idb",
    });
    expect(selectLightResponse(request, [empty, ok])).toBe(ok);
  });

  it("prefers mirror-result ok:true over earlier failure", () => {
    const request = createEnvelope("mirror-set", "4", { itemId: "x" });
    const fail = createEnvelope("mirror-result", "4", { ok: false, error: "no light" });
    const ok = createEnvelope("mirror-result", "4", { ok: true });
    expect(selectLightResponse(request, [fail, ok])).toBe(ok);
  });
});
