/**
 * Stage selected → Selection filter rewrite (#37).
 * Pure seam + Stage exclusions still hold; Apply is not invoked by rewrite helper.
 */
import { describe, expect, it, vi } from "vitest";
import {
  selectionFilterAfterStage,
  stagePoolFromVaultAndRecs,
} from "../src/workbench/shell-state.js";
import type { AgentRecommendation } from "../src/agent/index.js";
import { buildSelectionFilter } from "../src/workbench/selection-filter.js";
import { selectedStageCandidates, toStageCandidate } from "../src/workbench/stage-map.js";
import { createWorkbenchClient, type RuntimeSend } from "../src/workbench/client.js";
import { emptyTrashState, stageItems } from "../src/trash/index.js";
import { createEnvelope } from "../src/messaging/index.js";
import type { VaultItem } from "../src/inventory/index.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const main = readFileSync(join(root, "src/workbench/main.ts"), "utf8");

const normal: VaultItem = {
  id: "9000000001",
  itemHash: 1,
  quantity: 1,
  bucketHash: 0,
  name: "Trust",
  tierType: "Legendary",
};

const exotic: VaultItem = {
  id: "9000000002",
  itemHash: 2,
  quantity: 1,
  bucketHash: 0,
  name: "Hawkmoon",
  isExotic: true,
};

const stack: VaultItem = {
  id: "stack-2001-0-0",
  itemHash: 2001,
  quantity: 5,
  bucketHash: 0,
  name: "Glimmer",
};

describe("selectionFilterAfterStage (Workbench seam)", () => {
  it("non-empty selection → Selection filter string (instance ids OR-joined)", () => {
    const filter = selectionFilterAfterStage(
      [normal, exotic],
      new Set(["9000000001", "9000000002"]),
    );
    expect(filter).toBe("id:9000000001 or id:9000000002");
    expect(filter).toBe(buildSelectionFilter([normal, exotic]));
  });

  it("empty selection → null (no bogus filter invented)", () => {
    expect(selectionFilterAfterStage([normal], new Set())).toBeNull();
    expect(selectionFilterAfterStage([normal], new Set(["missing"]))).toBeNull();
  });

  it("synthetic-only selection → empty string (safe; not null if selection non-empty)", () => {
    // Non-empty selection of stack keys: rewrite is "" (no invented id:), not null.
    const filter = selectionFilterAfterStage([stack], new Set(["stack-2001-0-0"]));
    expect(filter).toBe("");
  });

  it("rewrite reflects intended selection even when Stage would deny some rows", () => {
    // Exotic is still in Selection filter identity; Stage exclusions are separate.
    const filter = selectionFilterAfterStage([normal, exotic], new Set(["9000000001", "9000000002"]));
    expect(filter).toContain("id:9000000002");
    const candidates = selectedStageCandidates(
      [normal, exotic],
      new Set(["9000000001", "9000000002"]),
    );
    const { result } = stageItems(emptyTrashState(), candidates);
    expect(result.staged.map((s) => s.id)).toEqual(["9000000001"]);
    expect(result.denied).toEqual(expect.arrayContaining([{ id: "9000000002", reason: "exotic" }]));
  });
});

describe("stagePoolFromVaultAndRecs (Workbench seam)", () => {
  it("merges vault with agent-only rec ids; vault wins on id collision", () => {
    const recOnly: AgentRecommendation = {
      id: "rec-only-1",
      itemHash: 99,
      name: "Synthetic Rec",
      reason: "agent pick",
    };
    const vaultDup: AgentRecommendation = {
      id: normal.id,
      itemHash: normal.itemHash,
      name: "Should not replace vault",
    };
    const pool = stagePoolFromVaultAndRecs([normal], [recOnly, vaultDup]);
    expect(pool).toHaveLength(2);
    expect(pool[0]).toBe(normal);
    expect(pool[1]?.id).toBe("rec-only-1");
    expect(pool[1]?.name).toBe("Synthetic Rec");
    // Stage pool is identity-only — does not carry display reason from recs
    expect((pool[1] as { reason?: string }).reason).toBeUndefined();
  });
});

describe("Stage selected DOM adapter wiring", () => {
  it("stageSelected rewrites filter via selectionFilterAfterStage and does not call applyFilter", () => {
    const stageStart = main.indexOf("async function stageSelected");
    const stageEnd = main.indexOf("async function unstageSelected");
    expect(stageStart).toBeGreaterThan(-1);
    const body = main.slice(stageStart, stageEnd);
    expect(body).toMatch(/selectionFilterAfterStage/);
    expect(body).toMatch(/stagePoolFromVaultAndRecs/);
    expect(body).not.toMatch(/applyFilter\(/);
    expect(body).not.toMatch(/client\.applyFilter/);
    expect(body).toMatch(/filterInput\.value = filterRewrite/);
  });

  it("client.stage still Stages under exclusion rules (no auto elsewhere)", async () => {
    const send = vi.fn<RuntimeSend>(async (msg) => {
      expect(msg.kind).toBe("trash-stage");
      const candidates = (msg.payload as { candidates: ReturnType<typeof toStageCandidate>[] })
        .candidates;
      const { result, state } = stageItems(emptyTrashState(), candidates);
      return createEnvelope("trash-result", msg.requestId, {
        ok: true,
        action: "stage",
        state,
        result,
      });
    });
    const client = createWorkbenchClient(send);
    const out = await client.stage([normal, exotic], new Set(["9000000001", "9000000002"]));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.staged.map((s) => s.id)).toEqual(["9000000001"]);
    expect(out.denied).toEqual(expect.arrayContaining([{ id: "9000000002", reason: "exotic" }]));
  });
});
