/**
 * Composer-first Workbench shell contracts (#36).
 * Asserts shipping HTML structure + pure shell policies (no DOM reimplementation).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  filterTextFromAgentResult,
  planAfterSuggest,
  resultsTabAfterSuggest,
} from "../src/workbench/shell-state.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "src/workbench/index.html"), "utf8");
const css = readFileSync(join(root, "src/workbench/styles.css"), "utf8");
const main = readFileSync(join(root, "src/workbench/main.ts"), "utf8");

describe("composer-first Workbench shell (shipping HTML)", () => {
  it("Intention/Suggest appear before filter and Results", () => {
    const intention = html.indexOf('id="section-intention"');
    const filter = html.indexOf('id="section-filter"');
    const results = html.indexOf('id="section-results"');
    const trash = html.indexOf('id="section-trash"');
    expect(intention).toBeGreaterThan(-1);
    expect(filter).toBeGreaterThan(intention);
    expect(results).toBeGreaterThan(filter);
    expect(trash).toBeGreaterThan(results);
  });

  it("exposes Suggest, Apply, Stage, Copy, Trash, Settings affordances", () => {
    expect(html).toMatch(/id="btn-suggest"/);
    expect(html).toMatch(/>\s*Suggest\s*</);
    expect(html).toMatch(/id="btn-apply-filter"/);
    expect(html).toMatch(/>\s*Apply\s*</);
    expect(html).toMatch(/id="btn-stage"/);
    expect(html).toMatch(/Stage selected/);
    expect(html).toMatch(/id="btn-copy-filter"/);
    expect(html).toMatch(/>\s*Copy\s*</);
    expect(html).toMatch(/id="section-trash"/);
    expect(html).toMatch(/Trash ·/);
    expect(html).toMatch(/id="btn-settings"/);
    expect(html).toMatch(/aria-label="Settings"/);
  });

  it("has no Dismantle product control (safe copy may mention in-game dismantle)", () => {
    // No button/action labeled Dismantle; "in-game dismantle" in help copy is intentional.
    expect(html).not.toMatch(/id="btn-dismantle"/i);
    expect(html).not.toMatch(/>\s*Dismantle\s*</i);
    expect(main).not.toMatch(/btn-dismantle|Dismantle selected/i);
  });

  it("Stage copy does not claim Destiny delete", () => {
    expect(html).toMatch(/never deletes Destiny items/i);
    expect(html + main).toMatch(/not deleted from Destiny|never deletes/i);
  });

  it("Settings sheet holds API key; Connection not main-column first chrome", () => {
    expect(html).toMatch(/id="settings-sheet"/);
    expect(html).toMatch(/id="api-key"/);
    // Connection lives under Advanced, not as primary section-connection first
    expect(html).not.toMatch(/id="section-connection"/);
    expect(html).toMatch(/Advanced \/ debug/);
    expect(html).toMatch(/id="btn-roundtrip"/);
    const settingsIdx = html.indexOf('id="settings-scrim"');
    const intentionIdx = html.indexOf('id="section-intention"');
    expect(intentionIdx).toBeGreaterThan(-1);
    // Intention is in main flow; settings is overlay
    expect(html.indexOf("Intention")).toBeGreaterThan(-1);
    expect(settingsIdx).toBeGreaterThan(intentionIdx);
  });

  it("Suggest is disabled by default until key (path to Settings)", () => {
    expect(html).toMatch(/id="btn-suggest"[^>]*disabled/);
    expect(html).toMatch(/Open Settings for API key/);
  });

  it("Trash peek pattern with Unstage + Repair Mirror", () => {
    expect(html).toMatch(/id="btn-trash-toggle"/);
    expect(html).toMatch(/id="btn-unstage"/);
    expect(html).toMatch(/Repair Mirror/);
    expect(html).toMatch(/wb-trash-peek|wb-peek-bar/);
  });

  it("Results Matches | Recs chips present", () => {
    expect(html).toMatch(/id="tab-matches"/);
    expect(html).toMatch(/id="tab-recs"/);
    expect(html).toMatch(/>Matches</);
    expect(html).toMatch(/>Recs</);
  });

  it("DIM-adjacent tokens (navy/charcoal + brass), not neon blue / candy pink primary", () => {
    expect(css).toMatch(/#0d111a|#0D111A/i);
    expect(css).toMatch(/#c5a572|#C5A572/i);
    // Not wireframe neon blue shell or candy pink pills as primary chrome
    expect(css).not.toMatch(/#ff69b4|#ff1493|#00bfff|#1e90ff/i);
  });
});

describe("Suggest shell policy (pure)", () => {
  it("opens Recs when recommendations exist, else Matches", () => {
    expect(resultsTabAfterSuggest({ recommendations: [{ id: "1", itemHash: 1, name: "A" }] })).toBe(
      "recs",
    );
    expect(resultsTabAfterSuggest({ recommendations: [] })).toBe("matches");
  });

  it("fills filter from agent filters without side effects", () => {
    expect(filterTextFromAgentResult({ filters: ["is:handcannon", "-is:exotic"] })).toBe(
      "is:handcannon -is:exotic",
    );
    expect(filterTextFromAgentResult({ filters: [] })).toBe("");
  });

  it("planAfterSuggest fills filter + tab + recs without Apply/Stage side effects", () => {
    const withRecs = planAfterSuggest({
      filters: ["is:handcannon", ""],
      explanation: "why",
      recommendations: [{ id: "1", itemHash: 1, name: "A" }],
    });
    expect(withRecs.filterText).toBe("is:handcannon");
    expect(withRecs.resultsTab).toBe("recs");
    expect(withRecs.recommendations).toHaveLength(1);
    expect(withRecs.explanation).toBe("why");

    const noRecs = planAfterSuggest({
      filters: [],
      explanation: "",
      recommendations: [],
    });
    expect(noRecs.filterText).toBe("");
    expect(noRecs.resultsTab).toBe("matches");
    expect(noRecs.explanation).toBe("—");

    // Plan is data only — no Apply/Stage hooks on the shape
    expect("applyFilter" in withRecs).toBe(false);
    expect("stage" in withRecs).toBe(false);
  });

  it("Enter handlers ignore IME composition (filter Apply + intention Suggest)", () => {
    expect(main).toMatch(/isComposing/);
    // Both product Enter paths must consult composition state before acting.
    const filterKey = main.indexOf('filterInput?.addEventListener("keydown"');
    const intentionKey = main.indexOf('intentionInput?.addEventListener("keydown"');
    expect(filterKey).toBeGreaterThan(-1);
    expect(intentionKey).toBeGreaterThan(-1);
    const filterBody = main.slice(filterKey, filterKey + 280);
    const intentionBody = main.slice(intentionKey, intentionKey + 280);
    expect(filterBody).toMatch(/isComposing/);
    expect(intentionBody).toMatch(/isComposing/);
  });
});
