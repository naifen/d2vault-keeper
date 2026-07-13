import { describe, expect, it, vi } from "vitest";
import {
  createEnvelope,
  handleRoundTrip,
  isEnvelope,
  lightHandleMessage,
  MESSAGE_SOURCE,
  newRequestId,
  type Envelope,
  type RoundTripPayload,
} from "../src/messaging/index.js";

describe("messaging envelope", () => {
  it("createEnvelope sets source and kind", () => {
    const id = newRequestId();
    const env = createEnvelope("ping", id, { from: "workbench" as const, at: 1 });
    expect(env.source).toBe(MESSAGE_SOURCE);
    expect(env.kind).toBe("ping");
    expect(env.requestId).toBe(id);
    expect(env.payload).toEqual({ from: "workbench", at: 1 });
  });

  it("isEnvelope rejects foreign messages", () => {
    expect(isEnvelope(null)).toBe(false);
    expect(isEnvelope({})).toBe(false);
    expect(isEnvelope({ source: "other", kind: "ping", requestId: "1" })).toBe(false);
    expect(isEnvelope(createEnvelope("ping", "1"))).toBe(true);
  });
});

describe("lightHandleMessage", () => {
  it("echoes roundtrip with hop=light", () => {
    const req = createEnvelope<"roundtrip", RoundTripPayload>("roundtrip", "r1", {
      token: "tok-abc",
      hop: "background",
    });
    const res = lightHandleMessage(req);
    expect(res).not.toBeNull();
    expect(res!.kind).toBe("roundtrip");
    expect(res!.payload).toEqual({ token: "tok-abc", hop: "light" });
  });

  it("responds to ping with pong from light", () => {
    const res = lightHandleMessage(createEnvelope("ping", "p1"));
    expect(res?.kind).toBe("pong");
    expect((res?.payload as { from: string }).from).toBe("light");
  });

  it("ignores non-envelopes", () => {
    expect(lightHandleMessage({ foo: 1 })).toBeNull();
  });
});

describe("handleRoundTrip", () => {
  it("completes Workbench → background → Light → background → Workbench", async () => {
    const token = "trip-1";
    const incoming = createEnvelope<"roundtrip", RoundTripPayload>("roundtrip", "req-1", {
      token,
      hop: "workbench",
    });

    const relay = vi.fn(async (msg: Envelope) => {
      // Simulate Light content script.
      return lightHandleMessage(msg) ?? undefined;
    });

    const result = await handleRoundTrip(incoming, relay);
    expect(result.kind).toBe("roundtrip-result");
    expect(result.payload).toEqual({
      token,
      hops: ["workbench", "background", "light", "background", "workbench"],
      ok: true,
    });
    expect(relay).toHaveBeenCalledOnce();
  });

  it("reports failure when Light is unreachable", async () => {
    const incoming = createEnvelope<"roundtrip", RoundTripPayload>("roundtrip", "req-2", {
      token: "tok",
      hop: "workbench",
    });
    const result = await handleRoundTrip(incoming, async () => undefined);
    expect(result.payload?.ok).toBe(false);
    expect(result.payload?.hops).toEqual(["workbench", "background"]);
  });

  it("reports failure when Light returns wrong token", async () => {
    const incoming = createEnvelope<"roundtrip", RoundTripPayload>("roundtrip", "req-3", {
      token: "expected",
      hop: "workbench",
    });
    const result = await handleRoundTrip(incoming, async () =>
      createEnvelope<"roundtrip", RoundTripPayload>("roundtrip", "req-3", {
        token: "wrong",
        hop: "light",
      }),
    );
    expect(result.payload?.ok).toBe(false);
  });
});
