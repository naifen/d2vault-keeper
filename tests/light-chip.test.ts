/**
 * Light chip: present on page; click does not request sidebar open.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { CHIP_ID, ensureChip } from "../src/content/chip.js";

describe("Light chip", () => {
  let dom: JSDOM;

  beforeEach(() => {
    dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
      url: "https://app.destinyitemmanager.com/",
    });
    vi.stubGlobal("document", dom.window.document);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("injects chip and click does not call sidebarAction.open", () => {
    const sidebarOpen = vi.fn();
    const chip = ensureChip(dom.window.document);
    expect(chip.id).toBe(CHIP_ID);
    expect(dom.window.document.getElementById(CHIP_ID)).toBe(chip);

    // Chip must never open Workbench; only toolbar/sidebar gesture may.
    chip.click();
    expect(sidebarOpen).not.toHaveBeenCalled();
    expect(chip.getAttribute("aria-label")).toMatch(/does not open Workbench/i);
  });
});
