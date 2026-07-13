import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DIM_URL_PATTERNS } from "../src/shared/dim.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("manifest permissions and shell", () => {
  const manifest = JSON.parse(readFileSync(join(root, "src/manifest.json"), "utf8")) as {
    manifest_version: number;
    permissions: string[];
    host_permissions: string[];
    background: { scripts: string[]; type?: string };
    content_scripts: Array<{ matches: string[]; js: string[] }>;
    sidebar_action: { default_panel: string };
    action: { default_title: string };
    commands: Record<string, unknown>;
  };

  it("is Firefox MV3", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.background.scripts).toContain("background.js");
    expect(manifest.background.type).toBe("module");
  });

  it("permissions: storage; hosts DIM + OpenRouter (no Bungie OAuth/tabs)", () => {
    expect(manifest.permissions).toEqual(["storage"]);
    // No tabs / identity / Bungie OAuth.
    expect(manifest.permissions).not.toContain("tabs");
    expect(manifest.permissions).not.toContain("identity");
    expect(manifest.permissions).not.toContain("<all_urls>");
    expect(manifest.host_permissions.some((h) => h.includes("<all_urls>"))).toBe(false);
    expect(
      manifest.host_permissions.some((h) => h.includes("destinyitemmanager.com")),
    ).toBe(true);
    // Agent BYO OpenRouter-compatible default host (#22).
    expect(manifest.host_permissions.some((h) => h.includes("openrouter.ai"))).toBe(true);
  });

  it("declares Light content script on DIM", () => {
    const cs = manifest.content_scripts[0];
    expect(cs).toBeDefined();
    expect(cs!.matches.some((m) => m.includes("destinyitemmanager.com"))).toBe(true);
    expect(cs!.js).toContain("content.js");
  });

  it("Workbench opens via sidebar_action and _execute_sidebar_action", () => {
    expect(manifest.sidebar_action.default_panel).toBe("workbench.html");
    expect(manifest.commands).toHaveProperty("_execute_sidebar_action");
    expect(manifest.action.default_title).toBe("Vault Keeper");
  });

  it("DIM URL patterns stay aligned with background query list", () => {
    const dimHosts = manifest.host_permissions.filter((h) => h.includes("destinyitemmanager.com"));
    expect([...dimHosts].sort()).toEqual([...DIM_URL_PATTERNS].sort());
    expect([...manifest.content_scripts[0]!.matches].sort()).toEqual([...DIM_URL_PATTERNS].sort());
  });
});
