/**
 * Stage selected deep module (#37 + architecture C1/C2).
 * Tests drive planStageSelection / runStageSelection — not main.ts greps.
 */
import { describe, expect, it, vi } from "vitest";
import type { AgentRecommendation } from "../src/agent/index.js";
import { createEnvelope } from "../src/messaging/index.js";
import type { VaultItem } from "../src/inventory/index.js";
import { emptyTrashState, stageItems } from "../src/trash/index.js";
import { createWorkbenchClient, type RuntimeSend } from "../src/workbench/client.js";
import { buildSelectionFilter } from "../src/workbench/selection-filter.js";
import {
  planStageSelection,
  projectRecToVaultRow,
  recRowsFromAgent,
  runStageSelection,
  selectionFilterAfterStage,
  stagePoolFromVaultAndRecs,
} from "../src/workbench/stage-selection.js";
import { selectedStageCandidates, toStageCandidate } from "../src/workbench/stage-map.js";

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

describe("planStageSelection (deep Stage shell)", () => {
  it("non-empty selection → Selection filter string (instance ids OR-joined)", () => {
    const plan = planStageSelection({
      vaultItems: [normal, exotic],
      recommendations: [],
      selectedIds: new Set(["9000000001", "9000000002"]),
    });
    expect(plan.selectionFilter).toBe("id:9000000001 or id:9000000002");
    expect(plan.selectionFilter).toBe(buildSelectionFilter([normal, exotic]));
    expect(plan.candidates.map((c) => c.id)).toEqual(["9000000001", "9000000002"]);
  });

  it("empty selection → selectionFilter null (no bogus filter invented)", () => {
    expect(
      planStageSelection({
        vaultItems: [normal],
        recommendations: [],
        selectedIds: new Set(),
      }).selectionFilter,
    ).toBeNull();
    expect(
      planStageSelection({
        vaultItems: [normal],
        recommendations: [],
        selectedIds: new Set(["missing"]),
      }).selectionFilter,
    ).toBeNull();
  });

  it("synthetic-only selection → empty string (safe; not null if selection non-empty)", () => {
    const plan = planStageSelection({
      vaultItems: [stack],
      recommendations: [],
      selectedIds: new Set(["stack-2001-0-0"]),
    });
    expect(plan.selectionFilter).toBe("");
  });

  it("rewrite reflects intended selection even when Stage would deny some rows", () => {
    const plan = planStageSelection({
      vaultItems: [normal, exotic],
      recommendations: [],
      selectedIds: new Set(["9000000001", "9000000002"]),
    });
    expect(plan.selectionFilter).toContain("id:9000000002");
    const { result } = stageItems(emptyTrashState(), plan.candidates);
    expect(result.staged.map((s) => s.id)).toEqual(["9000000001"]);
    expect(result.denied).toEqual(
      expect.arrayContaining([{ id: "9000000002", reason: "exotic" }]),
    );
  });

  it("pool merges vault with agent-only rec ids; vault wins on id collision", () => {
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
    const plan = planStageSelection({
      vaultItems: [normal],
      recommendations: [recOnly, vaultDup],
      selectedIds: new Set(),
    });
    expect(plan.pool).toHaveLength(2);
    expect(plan.pool[0]).toEqual(normal);
    expect(plan.pool[1]?.id).toBe("rec-only-1");
    expect(plan.pool[1]?.name).toBe("Synthetic Rec");
    expect((plan.pool[1] as { reason?: string }).reason).toBeUndefined();
  });
});

describe("C2 Rec → Stage exclusion field continuity", () => {
  it("projectRecToVaultRow keeps ExclusionSubject on agent-only rows", () => {
    const rec: AgentRecommendation = {
      id: "exo-only",
      itemHash: 7,
      name: "Agent Exotic",
      isExotic: true,
      tierType: "Exotic",
      tag: "favorite",
      reason: "keep me",
    };
    const row = projectRecToVaultRow(rec, new Map(), { includeReason: true });
    expect(row.isExotic).toBe(true);
    expect(row.tierType).toBe("Exotic");
    expect(row.tag).toBe("favorite");
    expect(row.reason).toBe("keep me");
  });

  it("vault wins over rec fields when ids match", () => {
    const rec: AgentRecommendation = {
      id: normal.id,
      itemHash: 999,
      name: "Model lie",
      isExotic: true,
      reason: "why",
    };
    const row = projectRecToVaultRow(rec, new Map([[normal.id, normal]]), {
      includeReason: true,
    });
    expect(row.name).toBe(normal.name);
    expect(row.itemHash).toBe(normal.itemHash);
    expect(row.isExotic).toBeUndefined();
    expect(row.reason).toBe("why");
  });

  it("agent-only exotic rec cannot Stage when fields preserved through plan", () => {
    const rec: AgentRecommendation = {
      id: "9000000099",
      itemHash: 42,
      name: "Gjallarhorn",
      isExotic: true,
    };
    const plan = planStageSelection({
      vaultItems: [],
      recommendations: [rec],
      selectedIds: new Set(["9000000099"]),
    });
    expect(plan.candidates[0]?.isExotic).toBe(true);
    const { result } = stageItems(emptyTrashState(), plan.candidates);
    expect(result.staged).toHaveLength(0);
    expect(result.denied).toEqual([{ id: "9000000099", reason: "exotic" }]);
  });

  it("agent-only favorite rec cannot Stage when tag preserved", () => {
    const rec: AgentRecommendation = {
      id: "9000000098",
      itemHash: 43,
      name: "Keep",
      tag: "favorite",
    };
    const plan = planStageSelection({
      vaultItems: [],
      recommendations: [rec],
      selectedIds: new Set(["9000000098"]),
    });
    const { result } = stageItems(emptyTrashState(), plan.candidates);
    expect(result.staged).toHaveLength(0);
    expect(result.denied).toEqual([{ id: "9000000098", reason: "favorite" }]);
  });

  it("recRowsFromAgent shares projector (reason + exclusion fields)", () => {
    const rec: AgentRecommendation = {
      id: "r1",
      itemHash: 1,
      name: "Synth",
      isExotic: true,
      reason: "because",
    };
    const rows = recRowsFromAgent([rec], []);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.isExotic).toBe(true);
    expect(rows[0]?.reason).toBe("because");
  });
});

describe("runStageSelection", () => {
  it("calls stage port once with pool + selectedIds; does not Apply filter", async () => {
    const stage = vi.fn(async (pool: readonly VaultItem[], ids: ReadonlySet<string>) => {
      const candidates = selectedStageCandidates(pool, ids);
      const { result, state } = stageItems(emptyTrashState(), candidates);
      return {
        ok: true as const,
        items: state.items,
        staged: result.staged,
        denied: result.denied,
        candidates,
      };
    });
    const outcome = await runStageSelection(
      {
        vaultItems: [normal, exotic],
        recommendations: [],
        selectedIds: new Set(["9000000001", "9000000002"]),
      },
      stage,
    );
    expect(stage).toHaveBeenCalledTimes(1);
    expect(stage.mock.calls[0]?.[0]).toEqual([normal, exotic]);
    expect(outcome.stage.ok).toBe(true);
    if (!outcome.stage.ok) return;
    expect(outcome.stage.staged.map((s) => s.id)).toEqual(["9000000001"]);
    expect(outcome.selectionFilter).toBe("id:9000000001 or id:9000000002");
  });

  it("propagates stage failure without inventing success paint data", async () => {
    const outcome = await runStageSelection(
      {
        vaultItems: [normal],
        recommendations: [],
        selectedIds: new Set(["9000000001"]),
      },
      async () => ({ ok: false, error: "Stage failed" }),
    );
    expect(outcome.stage).toEqual({ ok: false, error: "Stage failed" });
    expect(outcome.selectionFilter).toBe("id:9000000001");
  });
});

describe("selectionFilterAfterStage (re-export / leaf)", () => {
  it("matches plan Stage filter rules", () => {
    expect(selectionFilterAfterStage([normal, exotic], new Set(["9000000001", "9000000002"]))).toBe(
      "id:9000000001 or id:9000000002",
    );
    expect(selectionFilterAfterStage([normal], new Set())).toBeNull();
  });
});

describe("stagePoolFromVaultAndRecs (leaf)", () => {
  it("still available for direct callers", () => {
    const pool = stagePoolFromVaultAndRecs([normal], [
      { id: "x", itemHash: 1, name: "X", isExotic: true },
    ]);
    expect(pool[1]?.isExotic).toBe(true);
  });
});

describe("Stage send path (client + exclusions, no auto-Apply)", () => {
  it("client.stage Stages under exclusion rules via trash-stage envelope", async () => {
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

  it("runStageSelection port is stage-only (no applyFilter in outcome)", async () => {
    const outcome = await runStageSelection(
      {
        vaultItems: [normal],
        recommendations: [],
        selectedIds: new Set(["9000000001"]),
      },
      async (pool, ids) => {
        const candidates = selectedStageCandidates(pool, ids);
        const { result, state } = stageItems(emptyTrashState(), candidates);
        return {
          ok: true as const,
          items: state.items,
          staged: result.staged,
          denied: result.denied,
          candidates,
        };
      },
    );
    expect(outcome.stage.ok).toBe(true);
    // Product: Selection filter is data for paint; module does not Apply to DIM
    expect(outcome.selectionFilter).toBe("id:9000000001");
    expect("applyFilter" in outcome).toBe(false);
  });
});
