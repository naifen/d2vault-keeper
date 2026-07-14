/**
 * Workbench open adapter: Chromium Side Panel vs Firefox sidebarAction.
 * Drives the shipped installWorkbenchOpenOnAction — not a re-implementation.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  installWorkbenchOpenOnAction,
  sidePanelOpenOptions,
  type WorkbenchOpenApis,
} from "../src/background/workbench-open.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("sidePanelOpenOptions", () => {
  it("prefers windowId over tabId", () => {
    expect(sidePanelOpenOptions({ id: 1, windowId: 7 })).toEqual({ windowId: 7 });
  });

  it("falls back to tabId when windowId absent", () => {
    expect(sidePanelOpenOptions({ id: 3 })).toEqual({ tabId: 3 });
  });

  it("returns undefined when neither id is usable", () => {
    expect(sidePanelOpenOptions({})).toBeUndefined();
    expect(sidePanelOpenOptions({ id: undefined, windowId: undefined })).toBeUndefined();
  });
});

describe("installWorkbenchOpenOnAction", () => {
  it("Chromium: setPanelBehavior openPanelOnActionClick; no sidebarAction listener", () => {
    const setPanelBehavior = vi.fn().mockResolvedValue(undefined);
    const onClickedAdd = vi.fn();
    const api: WorkbenchOpenApis = {
      sidePanel: { setPanelBehavior },
      action: { onClicked: { addListener: onClickedAdd } },
    };

    const mode = installWorkbenchOpenOnAction(api);

    expect(mode).toBe("sidePanel");
    expect(setPanelBehavior).toHaveBeenCalledWith({ openPanelOnActionClick: true });
    expect(onClickedAdd).not.toHaveBeenCalled();
  });

  it("Chromium: setPanelBehavior reject installs gesture open fallback", async () => {
    const setPanelBehavior = vi.fn().mockRejectedValue(new Error("no perm"));
    const open = vi.fn().mockResolvedValue(undefined);
    const listeners: Array<(tab: { id?: number; windowId?: number }) => void> = [];
    const api: WorkbenchOpenApis = {
      sidePanel: { setPanelBehavior, open },
      action: {
        onClicked: {
          addListener: (cb) => {
            listeners.push(cb);
          },
        },
      },
    };

    expect(installWorkbenchOpenOnAction(api)).toBe("sidePanel");
    await vi.waitFor(() => expect(listeners).toHaveLength(1));
    listeners[0]!({ windowId: 7 });
    expect(open).toHaveBeenCalledWith({ windowId: 7 });
  });

  it("Chromium: setPanelBehavior sync throw installs gesture open fallback", async () => {
    const setPanelBehavior = vi.fn().mockImplementation(() => {
      throw new Error("sync boom");
    });
    const open = vi.fn().mockResolvedValue(undefined);
    const listeners: Array<(tab: { id?: number; windowId?: number }) => void> = [];
    const api: WorkbenchOpenApis = {
      sidePanel: { setPanelBehavior, open },
      action: {
        onClicked: {
          addListener: (cb) => {
            listeners.push(cb);
          },
        },
      },
    };

    expect(installWorkbenchOpenOnAction(api)).toBe("sidePanel");
    await vi.waitFor(() => expect(listeners).toHaveLength(1));
    listeners[0]!({ id: 9 });
    expect(open).toHaveBeenCalledWith({ tabId: 9 });
  });

  it("Firefox: action click opens sidebarAction", () => {
    const sidebarOpen = vi.fn().mockResolvedValue(undefined);
    const listeners: Array<() => void> = [];
    const api: WorkbenchOpenApis = {
      sidebarAction: { open: sidebarOpen },
      action: {
        onClicked: {
          addListener: (cb) => {
            listeners.push(cb as () => void);
          },
        },
      },
    };

    const mode = installWorkbenchOpenOnAction(api);

    expect(mode).toBe("sidebarAction");
    expect(listeners).toHaveLength(1);
    listeners[0]!();
    expect(sidebarOpen).toHaveBeenCalledTimes(1);
  });

  it("does not register dead listener when neither open API is usable", () => {
    const onClickedAdd = vi.fn();
    const mode = installWorkbenchOpenOnAction({
      action: { onClicked: { addListener: onClickedAdd } },
    });
    expect(mode).toBe("sidebarAction");
    expect(onClickedAdd).not.toHaveBeenCalled();
  });

  it("prefers Side Panel when both APIs present (Chromium-shaped dual)", () => {
    const setPanelBehavior = vi.fn().mockResolvedValue(undefined);
    const sidebarOpen = vi.fn();
    const onClickedAdd = vi.fn();
    const mode = installWorkbenchOpenOnAction({
      sidePanel: { setPanelBehavior },
      sidebarAction: { open: sidebarOpen },
      action: { onClicked: { addListener: onClickedAdd } },
    });
    expect(mode).toBe("sidePanel");
    expect(setPanelBehavior).toHaveBeenCalled();
    expect(onClickedAdd).not.toHaveBeenCalled();
    expect(sidebarOpen).not.toHaveBeenCalled();
  });
});

describe("Light chip must not open Workbench", () => {
  it("chip module does not import Workbench open adapter or side panel APIs", () => {
    const chipSrc = readFileSync(join(root, "src/content/chip.ts"), "utf8");
    const lightSrc = readFileSync(join(root, "src/content/light.ts"), "utf8");
    for (const src of [chipSrc, lightSrc]) {
      expect(src).not.toMatch(/installWorkbenchOpenOnAction/);
      expect(src).not.toMatch(/sidebarAction/);
      expect(src).not.toMatch(/sidePanel/);
      expect(src).not.toMatch(/setPanelBehavior/);
    }
  });

  it("ensureChip click only updates status title (shipped chip)", async () => {
    const { JSDOM } = await import("jsdom");
    const { ensureChip } = await import("../src/content/chip.js");
    const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
      url: "https://app.destinyitemmanager.com/",
    });
    const chip = ensureChip(dom.window.document);
    const before = chip.title;
    chip.click();
    expect(chip.getAttribute("aria-label")).toMatch(/does not open Workbench/i);
    expect(chip.title).not.toBe(before);
    expect(chip.title).toMatch(/toolbar or sidebar/i);
  });
});

describe("background install call site (type contract)", () => {
  it("background index passes browser without cast to installWorkbenchOpenOnAction", () => {
    const src = readFileSync(join(root, "src/background/index.ts"), "utf8");
    expect(src).toMatch(/installWorkbenchOpenOnAction\(\s*browser\s*\)/);
    expect(src).not.toMatch(/installWorkbenchOpenOnAction\(\s*browser\s+as\s/);
  });
});
