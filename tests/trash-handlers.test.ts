/**
 * Concurrent Stage mutations must not drop items (serialized RMW on Trash SoT).
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  handleTrashStage,
  setMirrorBridge,
  setTrashStorage,
} from "../src/background/trash-handlers.js";
import {
  emptyTrashState,
  TRASH_STORAGE_KEY,
  type StageCandidate,
  type TrashStorage,
} from "../src/trash/index.js";

function memStorage(initial: Record<string, unknown> = {}): TrashStorage & {
  data: Record<string, unknown>;
  getCalls: number;
} {
  const data = { ...initial };
  let getCalls = 0;
  return {
    data,
    get getCalls() {
      return getCalls;
    },
    async get(key) {
      getCalls += 1;
      // Yield so concurrent handlers interleave without a serial queue.
      await Promise.resolve();
      return data[key];
    },
    async set(key, value) {
      await Promise.resolve();
      data[key] = value;
    },
  };
}

const a: StageCandidate = { id: "a", itemHash: 1, name: "A", tierType: "Legendary" };
const b: StageCandidate = { id: "b", itemHash: 2, name: "B", tierType: "Legendary" };

describe("handleTrashStage concurrency (shipped)", () => {
  afterEach(() => {
    setMirrorBridge(null);
  });

  it("serializes concurrent stages so both items persist", async () => {
    const storage = memStorage({ [TRASH_STORAGE_KEY]: emptyTrashState() });
    setTrashStorage(storage);
    setMirrorBridge(null);

    const [resA, resB] = await Promise.all([
      handleTrashStage("r1", [a]),
      handleTrashStage("r2", [b]),
    ]);

    expect(resA.kind).toBe("trash-result");
    expect(resB.kind).toBe("trash-result");

    const final = storage.data[TRASH_STORAGE_KEY] as { items: Array<{ id: string }> };
    const ids = final.items.map((i) => i.id).sort();
    expect(ids).toEqual(["a", "b"]);
  });
});
