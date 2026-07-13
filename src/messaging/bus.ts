import {
  createEnvelope,
  isEnvelope,
  type Envelope,
  type RoundTripPayload,
  type RoundTripResultPayload,
} from "./types.js";

export type LightRelay = (message: Envelope) => Promise<Envelope | undefined>;

/**
 * Pure round-trip orchestrator used by the background hub.
 * Light hop is injected so unit tests never need a real content script.
 */
export async function handleRoundTrip(
  incoming: Envelope<"roundtrip", RoundTripPayload>,
  relayToLight: LightRelay,
): Promise<Envelope<"roundtrip-result", RoundTripResultPayload>> {
  const token = incoming.payload?.token;
  if (!token) {
    return createEnvelope("roundtrip-result", incoming.requestId, {
      token: "",
      hops: ["workbench", "background"],
      ok: false,
    });
  }

  const hops: RoundTripResultPayload["hops"] = ["workbench", "background"];

  const lightRequest = createEnvelope<"roundtrip", RoundTripPayload>(
    "roundtrip",
    incoming.requestId,
    { token, hop: "background" },
  );

  const lightResponse = await relayToLight(lightRequest);
  if (lightResponse && isEnvelope(lightResponse) && lightResponse.kind === "roundtrip") {
    const lightPayload = lightResponse.payload as RoundTripPayload | undefined;
    if (lightPayload?.token === token && lightPayload.hop === "light") {
      hops.push("light");
      return createEnvelope("roundtrip-result", incoming.requestId, {
        token,
        hops: [...hops, "background", "workbench"],
        ok: true,
      });
    }
  }

  return createEnvelope("roundtrip-result", incoming.requestId, {
    token,
    hops,
    ok: false,
  });
}

/**
 * Light-side handler: echo roundtrip with hop=light.
 */
export function lightHandleMessage(message: unknown): Envelope | null {
  if (!isEnvelope(message)) return null;
  if (message.kind === "ping") {
    return createEnvelope("pong", message.requestId, {
      from: "light",
      at: Date.now(),
    });
  }
  if (message.kind === "roundtrip") {
    const payload = message.payload as RoundTripPayload | undefined;
    if (!payload?.token) return null;
    return createEnvelope<"roundtrip", RoundTripPayload>("roundtrip", message.requestId, {
      token: payload.token,
      hop: "light",
    });
  }
  return null;
}

export function newRequestId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export type { Envelope } from "./types.js";
