/**
 * Contract tests: dim-bridge apply/clear against a mocked DOM search input.
 * DOM details stay inside dim-bridge; consumers only see ApplyFilterResult.
 */
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDimBridge,
  findDimSearchInput,
  setNativeInputValue,
  type SearchInputLocator,
} from "../src/dim-bridge/index.js";

describe("setNativeInputValue", () => {
  it("sets value and dispatches input + change", () => {
    const dom = new JSDOM(`<!DOCTYPE html><input id="q" />`);
    const input = dom.window.document.getElementById("q") as HTMLInputElement;
    const events: string[] = [];
    input.addEventListener("input", () => events.push("input"));
    input.addEventListener("change", () => events.push("change"));

    // Use real HTMLInputElement from jsdom
    vi.stubGlobal("HTMLInputElement", dom.window.HTMLInputElement);
    vi.stubGlobal("Event", dom.window.Event);
    setNativeInputValue(input, "is:weapon");
    expect(input.value).toBe("is:weapon");
    expect(events).toEqual(["input", "change"]);
    vi.unstubAllGlobals();
  });
});

describe("createDimBridge contract", () => {
  let dom: JSDOM;
  let input: HTMLInputElement;

  beforeEach(() => {
    dom = new JSDOM(`<!DOCTYPE html><html><body>
      <header>
        <input role="combobox" aria-label="Search items" placeholder="Search" type="text" />
      </header>
    </body></html>`);
    vi.stubGlobal("HTMLInputElement", dom.window.HTMLInputElement);
    vi.stubGlobal("Event", dom.window.Event);
    input = dom.window.document.querySelector("input") as HTMLInputElement;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("applyFilter writes string into search input", () => {
    const locator: SearchInputLocator = {
      findSearchInput: (doc) => doc.querySelector("input") as HTMLInputElement,
    };
    const bridge = createDimBridge(dom.window.document, locator);
    const result = bridge.applyFilter("is:handcannon -is:exotic");
    expect(result.ok).toBe(true);
    expect(result.applied).toBe(true);
    expect(result.query).toBe("is:handcannon -is:exotic");
    expect(input.value).toBe("is:handcannon -is:exotic");
    expect(bridge.readFilter()).toBe("is:handcannon -is:exotic");
  });

  it("clearFilter restores empty search", () => {
    const locator: SearchInputLocator = {
      findSearchInput: (doc) => doc.querySelector("input") as HTMLInputElement,
    };
    const bridge = createDimBridge(dom.window.document, locator);
    bridge.applyFilter("tag:junk");
    const cleared = bridge.clearFilter();
    expect(cleared.ok).toBe(true);
    expect(cleared.applied).toBe(true);
    expect(cleared.query).toBe("");
    expect(input.value).toBe("");
  });

  it("soft-fails when input missing (does not throw)", () => {
    const locator: SearchInputLocator = {
      findSearchInput: () => null,
    };
    const bridge = createDimBridge(dom.window.document, locator);
    const result = bridge.applyFilter("is:weapon");
    expect(result.ok).toBe(false);
    expect(result.applied).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });

  it("invalid filter string still applies (DIM soft-fail)", () => {
    const locator: SearchInputLocator = {
      findSearchInput: (doc) => doc.querySelector("input") as HTMLInputElement,
    };
    const bridge = createDimBridge(dom.window.document, locator);
    // Bridge does not validate grammar — writes as-is; DIM matches nothing.
    const result = bridge.applyFilter("not:a:real:filter::::");
    expect(result.ok).toBe(true);
    expect(input.value).toBe("not:a:real:filter::::");
  });
});

describe("findDimSearchInput", () => {
  it("finds combobox search input", () => {
    const dom = new JSDOM(`<!DOCTYPE html><input role="combobox" aria-label="Search items" />`);
    const found = findDimSearchInput(dom.window.document);
    expect(found).not.toBeNull();
    expect(found?.getAttribute("role")).toBe("combobox");
  });
});

describe("dim-bridge isolation", () => {
  it("exports no trash/agent coupling from dim-bridge module surface", async () => {
    const mod = await import("../src/dim-bridge/index.js");
    expect(mod.createDimBridge).toBeTypeOf("function");
    expect(mod).not.toHaveProperty("stage");
    expect(mod).not.toHaveProperty("runAgent");
  });
});
