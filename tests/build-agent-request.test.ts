/**
 * Intention → AgentRequest pure policy (shipped buildAgentRequest).
 */
import { describe, expect, it } from "vitest";
import {
  buildAgentRequest,
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
  return row;
});

describe("buildAgentRequest (shipped)", () => {
  it("strips vault when opt-in false even if items provided", () => {
    const req = buildAgentRequest({
      intention: "junk sidearms",
      vaultContextOptIn: false,
      vaultItems: items,
    });
    expect(req).toEqual({ intention: "junk sidearms", vaultContextOptIn: false });
    expect(requestIncludesVaultDump(req)).toBe(false);
  });

  it("includes field subset and enforces hard cap when opt-in true", () => {
    const req = buildAgentRequest({
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
    });
    expect(req.vaultSlice![0]).not.toHaveProperty("itemType");
    expect(req.vaultSlice![0]).not.toHaveProperty("isExotic");
    expect(requestIncludesVaultDump(req)).toBe(true);
  });

  it("respects custom limit", () => {
    const req = buildAgentRequest({
      intention: "x",
      vaultContextOptIn: true,
      vaultItems: items,
      vaultSliceLimit: 3,
    });
    expect(req.vaultSlice).toHaveLength(3);
  });
});
