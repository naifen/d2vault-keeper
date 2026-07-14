/**
 * Results perk hover/focus display contract (#38).
 * Drives shipped formatPerkHoverLine; structural checks for Matches + Recs row titles.
 */
import { describe, expect, it } from "vitest";
import {
  formatPerkHoverLine,
  hasKnownPerks,
  PERKS_UNKNOWN_LABEL,
} from "../src/workbench/perk-display.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const main = readFileSync(join(root, "src/workbench/main.ts"), "utf8");

describe("formatPerkHoverLine (shipped)", () => {
  it("surfaces enriched perk names when present", () => {
    expect(formatPerkHoverLine(["Outlaw", "Rampage"])).toBe("Outlaw · Rampage");
    expect(hasKnownPerks(["Outlaw"])).toBe(true);
  });

  it("honest empty/unknown when absent or empty — never fabricates", () => {
    expect(formatPerkHoverLine(undefined)).toBe(PERKS_UNKNOWN_LABEL);
    expect(formatPerkHoverLine(null)).toBe(PERKS_UNKNOWN_LABEL);
    expect(formatPerkHoverLine([])).toBe(PERKS_UNKNOWN_LABEL);
    expect(formatPerkHoverLine(["", "  "])).toBe(PERKS_UNKNOWN_LABEL);
    expect(hasKnownPerks(undefined)).toBe(false);
    expect(hasKnownPerks([])).toBe(false);
  });
});

describe("Results row rendering paths (Matches + Recs)", () => {
  it("rowTitle uses formatPerkHoverLine for hover/focus (title + aria + popover)", () => {
    expect(main).toMatch(/formatPerkHoverLine/);
    expect(main).toMatch(/function rowTitle/);
    expect(main).toMatch(/row\.title = title/);
    expect(main).toMatch(/aria-label/);
    expect(main).toMatch(/aria-description/);
    expect(main).toMatch(/vault-row-perks/);
    // Both Matches (matchVaultItems) and Recs (recRowsFromAgent) share renderResultsList → rowTitle
    expect(main).toMatch(/function renderResultsList/);
    expect(main).toMatch(/currentResultRows/);
    expect(main).toMatch(/recRowsFromAgent/);
    expect(main).toMatch(/matchVaultItems/);
    expect(main).toMatch(/resultsTab === "recs"/);
  });
});
