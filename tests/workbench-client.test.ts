/**
 * Workbench client + Stage mapping — shipped modules only.
 */
import { describe, expect, it, vi } from "vitest";
import {
  createWorkbenchClient,
  type RuntimeSend,
} from "../src/workbench/client.js";
import { toStageCandidate, selectedStageCandidates } from "../src/inventory/index.js";
import { emptyTrashState, stageItems } from "../src/trash/index.js";
import type { VaultItem } from "../src/inventory/index.js";
import { createEnvelope } from "../src/messaging/index.js";

const normal: VaultItem = {
  id: "n1",
  itemHash: 1,
  quantity: 1,
  bucketHash: 0,
  name: "Trust",
  tierType: "Legendary",
  itemType: "Hand Cannon",
};

const exotic: VaultItem = {
  id: "e1",
  itemHash: 2,
  quantity: 1,
  bucketHash: 0,
  name: "Hawkmoon",
  tierType: "Exotic",
  isExotic: true,
};

const favorite: VaultItem = {
  id: "f1",
  itemHash: 3,
  quantity: 1,
  bucketHash: 0,
  name: "Beloved",
  tierType: "Legendary",
  tag: "favorite",
};

describe("toStageCandidate (shipped)", () => {
  it("preserves exclusion fields for stageItems policy", () => {
    const candidates = [normal, exotic, favorite].map(toStageCandidate);
    expect(candidates.find((c) => c.id === "e1")?.isExotic).toBe(true);
    expect(candidates.find((c) => c.id === "f1")?.tag).toBe("favorite");
    expect(candidates.find((c) => c.id === "n1")?.tierType).toBe("Legendary");
    expect(candidates.find((c) => c.id === "n1")?.itemType).toBe("Hand Cannon");

    const { result } = stageItems(emptyTrashState(), candidates);
    expect(result.staged.map((s) => s.id)).toEqual(["n1"]);
    expect(result.denied).toEqual(
      expect.arrayContaining([
        { id: "e1", reason: "exotic" },
        { id: "f1", reason: "favorite" },
      ]),
    );
  });

  it("selectedStageCandidates only includes selected ids", () => {
    const selected = selectedStageCandidates([normal, exotic, favorite], new Set(["f1", "n1"]));
    expect(selected.map((c) => c.id).sort()).toEqual(["f1", "n1"]);
  });
});

describe("createWorkbenchClient", () => {
  it("stage sends pre-projected StageCandidates on trash-stage envelope", async () => {
    const send = vi.fn<RuntimeSend>(async (msg) => {
      expect(msg.kind).toBe("trash-stage");
      const candidates = (msg.payload as { candidates: unknown[] }).candidates;
      expect(candidates).toEqual([
        {
          id: "n1",
          itemHash: 1,
          name: "Trust",
          tierType: "Legendary",
          itemType: "Hand Cannon",
        },
      ]);
      return createEnvelope("trash-result", msg.requestId, {
        ok: true,
        action: "stage",
        state: { version: 1, items: [{ id: "n1", itemHash: 1, name: "Trust", stagedAt: 1, mirrorAppliedByUs: false, mirrorStatus: "none" }] },
        result: {
          staged: [{ id: "n1", itemHash: 1, name: "Trust", stagedAt: 1, mirrorAppliedByUs: false, mirrorStatus: "none" }],
          denied: [],
        },
      });
    });

    const client = createWorkbenchClient(send);
    const projected = selectedStageCandidates([normal, exotic], new Set(["n1"]));
    const out = await client.stage(projected);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.staged).toHaveLength(1);
    expect(out.candidates).toEqual([toStageCandidate(normal)]);
  });

  it("loadVault returns items on ok status", async () => {
    const send: RuntimeSend = async (msg) =>
      createEnvelope("vault-result", msg.requestId, {
        state: "ok",
        membershipId: "42",
        items: [normal],
        source: "idb",
      });
    const client = createWorkbenchClient(send);
    const out = await client.loadVault();
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.items).toEqual([normal]);
  });

  it("loadTrash falls back to emptyTrashState when payload omits state", async () => {
    const send: RuntimeSend = async (msg) =>
      createEnvelope("trash-result", msg.requestId, {
        ok: true,
        action: "get",
        // deliberately omit state — client must use canonical emptyTrashState
      } as { ok: true; action: "get" });
    const client = createWorkbenchClient(send);
    const out = await client.loadTrash();
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.state).toEqual(emptyTrashState());
    expect(out.items).toEqual([]);
  });

  it("applyFilter surfaces error from filter-result", async () => {
    const send: RuntimeSend = async (msg) =>
      createEnvelope("filter-result", msg.requestId, {
        ok: false,
        query: "x",
        applied: false,
        error: "DIM search input not found",
      });
    const client = createWorkbenchClient(send);
    const out = await client.applyFilter("x");
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toMatch(/DIM search/);
  });

  it("repairMirror surfaces trash-result ok:false", async () => {
    const send: RuntimeSend = async (msg) =>
      createEnvelope("trash-result", msg.requestId, {
        ok: false,
        action: "repair-mirror",
        state: { version: 1, items: [] },
        error: "Mirror bridge unavailable",
      });
    const client = createWorkbenchClient(send);
    const out = await client.repairMirror();
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toBe("Mirror bridge unavailable");
  });

  it("loadSettings reads hasKey; rejects ok payload without settings", async () => {
    const withKey: RuntimeSend = async (msg) =>
      createEnvelope("agent-settings-result", msg.requestId, {
        ok: true,
        settings: { apiKey: "", baseUrl: "", model: "", hasKey: true },
      });
    const client = createWorkbenchClient(withKey);
    const ok = await client.loadSettings();
    expect(ok).toEqual({ ok: true, hasKey: true });

    const missingSettings: RuntimeSend = async (msg) =>
      createEnvelope("agent-settings-result", msg.requestId, {
        ok: true,
      } as { ok: true });
    const bad = await createWorkbenchClient(missingSettings).loadSettings();
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.error).toMatch(/settings/i);
  });
});
