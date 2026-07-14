/**
 * Background → Light messaging MirrorBridge adapter.
 * Second production adapter at the MirrorBridge seam (page IDB is the other).
 */

import type { MirrorBridge } from "../mirror/index.js";

/** Messaging-based bridge: background asks Light to set/clear tags. */
export function createMessagingMirrorBridge(
  sendToLight: (kind: "mirror-set" | "mirror-clear", itemId: string) => Promise<boolean>,
): MirrorBridge {
  async function call(
    kind: "mirror-set" | "mirror-clear",
    itemId: string,
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const ok = await sendToLight(kind, itemId);
      return ok ? { ok: true } : { ok: false, error: `${kind} failed` };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  return {
    setJunkTag: (itemId) => call("mirror-set", itemId),
    clearJunkTag: (itemId) => call("mirror-clear", itemId),
  };
}
