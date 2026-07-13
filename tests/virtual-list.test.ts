import { describe, expect, it } from "vitest";
import { visibleWindow } from "../src/workbench/virtual-list.js";

describe("visibleWindow (chunked list)", () => {
  it("does not cover all 1000+ rows at once", () => {
    const count = 1500;
    const rowHeight = 28;
    const viewport = 280;
    const win = visibleWindow(0, viewport, count, rowHeight, 8);
    const rendered = win.endIndex - win.startIndex;
    expect(rendered).toBeLessThan(100);
    expect(rendered).toBeGreaterThan(0);
    expect(win.totalHeight).toBe(count * rowHeight);
  });

  it("shifts window on scroll", () => {
    const win0 = visibleWindow(0, 280, 1000, 28, 0);
    const win1 = visibleWindow(28 * 50, 280, 1000, 28, 0);
    expect(win1.startIndex).toBeGreaterThan(win0.startIndex);
    expect(win1.offsetY).toBe(win1.startIndex * 28);
  });

  it("handles empty list", () => {
    expect(visibleWindow(0, 280, 0, 28)).toEqual({
      startIndex: 0,
      endIndex: 0,
      offsetY: 0,
      totalHeight: 0,
    });
  });
});

describe("vault list scroll preservation contract", () => {
  it("visibleWindow uses provided scrollTop (not zero) after partial scroll", () => {
    // Ensures render path that saves scrollTop before rebuild keeps correct window.
    const scrolled = 28 * 40;
    const win = visibleWindow(scrolled, 280, 2000, 28, 4);
    expect(win.startIndex).toBeGreaterThanOrEqual(36);
    expect(win.offsetY).toBe(win.startIndex * 28);
  });
});
