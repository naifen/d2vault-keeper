/**
 * ensureBrowser aliases chrome → browser when browser is missing.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureBrowser } from "../src/shared/webext.js";

describe("ensureBrowser", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is a no-op when browser.runtime already exists", () => {
    const runtime = { id: "already" };
    vi.stubGlobal("browser", { runtime });
    vi.stubGlobal("chrome", { runtime: { id: "chrome-only" } });
    ensureBrowser();
    expect((globalThis as { browser: { runtime: { id: string } } }).browser.runtime.id).toBe(
      "already",
    );
  });

  it("assigns chrome to browser when browser is absent", () => {
    const chromeApi = { runtime: { id: "chromium" } };
    vi.stubGlobal("browser", undefined);
    vi.stubGlobal("chrome", chromeApi);
    // Some environments define browser as non-configurable; force delete via stub.
    Object.defineProperty(globalThis, "browser", {
      value: undefined,
      writable: true,
      configurable: true,
    });
    ensureBrowser();
    expect((globalThis as { browser: typeof chromeApi }).browser).toBe(chromeApi);
  });
});
