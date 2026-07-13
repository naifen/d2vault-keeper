/**
 * Messaging protocol: prefer-success + no-Light fallbacks (shipped).
 */
import { describe, expect, it } from "vitest";
import {
  createEnvelope,
  createTypedEnvelope,
  isPreferableLightResponse,
  noLightFallback,
  noLightFilterResult,
  noLightVaultResult,
  selectLightResponse,
} from "../src/messaging/index.js";

describe("createTypedEnvelope", () => {
  it("couples filter-apply payload shape", () => {
    const env = createTypedEnvelope("filter-apply", "r1", { query: "is:weapon" });
    expect(env.kind).toBe("filter-apply");
    expect(env.payload).toEqual({ query: "is:weapon" });
  });

  it("allows vault-get without payload", () => {
    const env = createTypedEnvelope("vault-get", "r2");
    expect(env.kind).toBe("vault-get");
    expect(env.payload).toBeUndefined();
  });
});

describe("isPreferableLightResponse", () => {
  it("rejects soft-fail filter results", () => {
    const req = createEnvelope("filter-apply", "1", { query: "x" });
    const fail = createEnvelope("filter-result", "1", {
      ok: false,
      query: "x",
      applied: false,
      error: "missing",
    });
    expect(isPreferableLightResponse(req, fail)).toBe(false);
  });

  it("accepts applied filter results", () => {
    const req = createEnvelope("filter-apply", "1", { query: "x" });
    const ok = createEnvelope("filter-result", "1", {
      ok: true,
      query: "x",
      applied: true,
    });
    expect(isPreferableLightResponse(req, ok)).toBe(true);
  });

  it("prefers vault ok only", () => {
    const req = createEnvelope("vault-get", "2");
    const empty = createEnvelope("vault-result", "2", {
      state: "empty",
      reason: "no-membership",
      message: "no",
    });
    const ok = createEnvelope("vault-result", "2", {
      state: "ok",
      membershipId: "1",
      items: [],
      source: "idb",
    });
    expect(isPreferableLightResponse(req, empty)).toBe(false);
    expect(isPreferableLightResponse(req, ok)).toBe(true);
  });
});

describe("selectLightResponse via protocol", () => {
  it("does not prefer missing success payload over soft-fail when only fail exists", () => {
    const request = createEnvelope("mirror-set", "m1", { itemId: "a" });
    const fail = createEnvelope("mirror-result", "m1", { ok: false, error: "no" });
    expect(selectLightResponse(request, [fail])).toBe(fail);
    expect(isPreferableLightResponse(request, fail)).toBe(false);
  });

  it("prefers success among multi-tab responses", () => {
    const request = createEnvelope("vault-get", "v1");
    const empty = createEnvelope("vault-result", "v1", {
      state: "empty",
      reason: "no-profile",
      message: "cold",
    });
    const ok = createEnvelope("vault-result", "v1", {
      state: "ok",
      membershipId: "9",
      items: [{ id: "i", itemHash: 1, quantity: 1, bucketHash: 0, name: "G" }],
      source: "idb",
    });
    expect(selectLightResponse(request, [empty, ok])).toBe(ok);
  });
});

describe("noLightFallback", () => {
  it("builds vault empty/no-light envelope", () => {
    const fb = noLightVaultResult("id-1");
    expect(fb.kind).toBe("vault-result");
    expect(fb.payload?.state).toBe("empty");
    if (fb.payload?.state === "empty") {
      expect(fb.payload.reason).toBe("no-light");
    }
  });

  it("builds filter fallback from request query", () => {
    const msg = createEnvelope("filter-apply", "f1", { query: "tag:junk" });
    const fb = noLightFallback(msg);
    expect(fb?.kind).toBe("filter-result");
    expect(fb?.payload).toMatchObject({
      ok: false,
      applied: false,
      query: "tag:junk",
    });
  });

  it("builds mirror fallback", () => {
    const msg = createEnvelope("mirror-clear", "m2", { itemId: "x" });
    const fb = noLightFallback(msg);
    expect(fb?.kind).toBe("mirror-result");
    expect(fb?.payload).toMatchObject({ ok: false });
  });

  it("returns undefined for local kinds", () => {
    expect(noLightFallback(createEnvelope("trash-get", "t1"))).toBeUndefined();
    expect(noLightFallback(createEnvelope("ping", "p1", { from: "workbench", at: 1 }))).toBeUndefined();
  });

  it("filter-clear uses empty query", () => {
    const fb = noLightFilterResult("c1", "filter-clear");
    expect(fb.payload?.query).toBe("");
  });
});
