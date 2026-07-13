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
});
