/**
 * Product step: Intention → AgentRequest (shipped intentionToAgentRequest).
 */
import { describe, expect, it } from "vitest";
import {
  intentionToAgentRequest,
  DEFAULT_VAULT_SLICE_LIMIT,
  requestIncludesVaultDump,
} from "../src/agent/index.js";

const items = Array.from({ length: 250 }, (_, i) => {
  const row: {
    id: string;
    itemHash: number;
    name: string;
    tierType: string;
    tag?: string;
    itemType: string;
    isExotic: boolean;
  } = {
    id: `id-${i}`,
    itemHash: i,
    name: `Item ${i}`,
    tierType: "Legendary",
    itemType: "should-not-appear",
    isExotic: false,
  };
  if (i === 0) row.tag = "keep";
  if (i === 1) row.isExotic = true;
  return row;
});

describe("intentionToAgentRequest (shipped)", () => {
  it("strips vault when opt-in false even if items provided", () => {
    const req = intentionToAgentRequest({
      intention: "junk sidearms",
      vaultContextOptIn: false,
      vaultItems: items,
    });
    expect(req).toEqual({ intention: "junk sidearms", vaultContextOptIn: false });
    expect(requestIncludesVaultDump(req)).toBe(false);
  });

  it("includes field subset and enforces hard cap when opt-in true", () => {
    const req = intentionToAgentRequest({
      intention: "clean vault",
      vaultContextOptIn: true,
      vaultItems: items,
    });
    expect(req.vaultContextOptIn).toBe(true);
    expect(req.vaultSlice).toHaveLength(DEFAULT_VAULT_SLICE_LIMIT);
    expect(req.vaultSlice![0]).toEqual({
      id: "id-0",
      itemHash: 0,
      name: "Item 0",
      tierType: "Legendary",
      tag: "keep",
      isExotic: false,
    });
    // itemType is Workbench-only noise; isExotic is preserved for exclusion (Stage parity).
    expect(req.vaultSlice![0]).not.toHaveProperty("itemType");
    expect(req.vaultSlice![1]?.isExotic).toBe(true);
    expect(requestIncludesVaultDump(req)).toBe(true);
  });

  it("preserves isExotic-only vault signal for Agent exclusion path", () => {
    const req = intentionToAgentRequest({
      intention: "junk",
      vaultContextOptIn: true,
      vaultItems: [{ id: "ex", itemHash: 9, name: "Hawk", isExotic: true }],
    });
    expect(req.vaultSlice).toEqual([
      { id: "ex", itemHash: 9, name: "Hawk", isExotic: true },
    ]);
  });

  it("respects custom limit", () => {
    const req = intentionToAgentRequest({
      intention: "x",
      vaultContextOptIn: true,
      vaultItems: items,
      vaultSliceLimit: 3,
    });
    expect(req.vaultSlice).toHaveLength(3);
  });
});
