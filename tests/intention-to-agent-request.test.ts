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
  // Beyond default LLM slice — must still land in exclusionById.
  if (i === 240) {
    row.isExotic = true;
    row.tierType = "Exotic";
  }
  if (i === 241) row.tag = "favorite";
  return row;
});

describe("intentionToAgentRequest (shipped)", () => {
  it("strips LLM vault dump when opt-in false but keeps full exclusionById", () => {
    const req = intentionToAgentRequest({
      intention: "junk sidearms",
      vaultContextOptIn: false,
      vaultItems: items,
    });
    expect(req.vaultContextOptIn).toBe(false);
    expect(req.vaultSlice).toBeUndefined();
    expect(requestIncludesVaultDump(req)).toBe(false);
    // Opt-in is LLM privacy only — product exclusion still sees full vault.
    expect(req.exclusionById?.["id-1"]?.isExotic).toBe(true);
    expect(req.exclusionById?.["id-240"]?.isExotic).toBe(true);
    expect(req.exclusionById?.["id-241"]?.tag).toBe("favorite");
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
    // exclusionById is not slice-capped — past LLM window still protected.
    expect(req.vaultSlice?.some((r) => r.id === "id-240")).toBe(false);
    expect(req.exclusionById?.["id-240"]?.isExotic).toBe(true);
    expect(req.exclusionById?.["id-241"]?.tag).toBe("favorite");
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
    expect(req.exclusionById).toEqual({ ex: { isExotic: true } });
  });

  it("respects custom limit for LLM slice only", () => {
    const req = intentionToAgentRequest({
      intention: "x",
      vaultContextOptIn: true,
      vaultItems: items,
      vaultSliceLimit: 3,
    });
    expect(req.vaultSlice).toHaveLength(3);
    expect(req.exclusionById?.["id-240"]?.isExotic).toBe(true);
  });
});
