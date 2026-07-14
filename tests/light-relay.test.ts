/**
 * Light-relay (shipped): multi-tab collect + select + noLightFallback.
 * Drives createLightRelay / relayLightKind — not a reimplementation.
 */
import { describe, expect, it, vi } from "vitest";
import {
  createEnvelope,
  createLightRelay,
  createTypedEnvelope,
  relayLightKind,
  type Envelope,
  type LightRelayPorts,
} from "../src/messaging/index.js";

function portsWith(
  tabResponses: Map<number, Envelope | Error | "not-envelope">,
  tabIds: number[] = [...tabResponses.keys()],
): LightRelayPorts {
  return {
    queryDimTabs: async () => tabIds.map((id) => ({ id })),
    sendToTab: async (tabId) => {
      const r = tabResponses.get(tabId);
      if (r === undefined) throw new Error("no script");
      if (r === "not-envelope") return { garbage: true };
      if (r instanceof Error) throw r;
      return r;
    },
  };
}

describe("createLightRelay / relayLightKind (shipped)", () => {
  it("prefers success-shaped filter-result across tabs", async () => {
    const request = createEnvelope("filter-apply", "1", { query: "is:weapon" });
    const fail = createEnvelope("filter-result", "1", {
      ok: false,
      query: "is:weapon",
      applied: false,
      error: "stale",
    });
    const ok = createEnvelope("filter-result", "1", {
      ok: true,
      query: "is:weapon",
      applied: true,
    });
    const light = createLightRelay(
      portsWith(
        new Map([
          [10, fail],
          [20, ok],
        ]),
      ),
    );
    const res = await light.relayKind(request);
    expect(res).toBe(ok);
  });

  it("returns no-Light vault fallback when no tabs", async () => {
    const light = createLightRelay({
      queryDimTabs: async () => [],
      sendToTab: vi.fn(),
    });
    const res = await light.relayKind(createTypedEnvelope("vault-get", "v1"));
    expect(res.kind).toBe("vault-result");
    expect((res.payload as { reason?: string }).reason).toBe("no-light");
  });

  it("returns no-Light filter fallback when all tabs throw", async () => {
    const request = createEnvelope("filter-clear", "f1");
    const res = await relayLightKind(
      request,
      portsWith(new Map([[1, new Error("no cs")]])),
    );
    expect(res.kind).toBe("filter-result");
    expect((res.payload as { applied?: boolean }).applied).toBe(false);
  });

  it("relay returns undefined without inventing fallback (mirror path)", async () => {
    const light = createLightRelay({
      queryDimTabs: async () => [],
      sendToTab: vi.fn(),
    });
    const res = await light.relay(
      createTypedEnvelope("mirror-set", "m1", { itemId: "x" }),
    );
    expect(res).toBeUndefined();
  });

  it("ignores non-envelope tab replies", async () => {
    const request = createEnvelope("vault-get", "v2");
    const ok = createEnvelope("vault-result", "v2", {
      state: "ok",
      membershipId: "1",
      items: [],
      source: "idb",
    });
    const light = createLightRelay(
      portsWith(
        new Map<number, Envelope | Error | "not-envelope">([
          [1, "not-envelope"],
          [2, ok],
        ]),
      ),
    );
    expect(await light.relayKind(request)).toBe(ok);
  });
});
