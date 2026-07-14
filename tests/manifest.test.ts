import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DIM_URL_PATTERNS } from "../src/shared/dim.js";
import {
  shapeChromiumManifest,
  shapeFirefoxManifest,
  type ManifestBase,
} from "../src/manifest/shape.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const base = JSON.parse(
  readFileSync(join(root, "src/manifest.base.json"), "utf8"),
) as ManifestBase;

describe("manifest base + multi-browser shells", () => {
  it("base is MV3 with storage + DIM + OpenRouter hosts (no OAuth sprawl)", () => {
    expect(base.manifest_version).toBe(3);
    expect(base.permissions).toEqual(["storage"]);
    expect(base.permissions).not.toContain("tabs");
    expect(base.permissions).not.toContain("identity");
    expect(base.permissions).not.toContain("<all_urls>");
    expect(base.host_permissions.some((h) => h.includes("<all_urls>"))).toBe(false);
    expect(
      base.host_permissions.some((h) => h.includes("destinyitemmanager.com")),
    ).toBe(true);
    expect(base.host_permissions.some((h) => h.includes("openrouter.ai"))).toBe(true);
  });

  it("declares Light content script on DIM in base", () => {
    const cs = base.content_scripts[0];
    expect(cs).toBeDefined();
    expect(cs!.matches.some((m) => m.includes("destinyitemmanager.com"))).toBe(true);
    expect(cs!.js).toContain("content.js");
  });

  it("DIM URL patterns stay aligned with background query list", () => {
    const dimHosts = base.host_permissions.filter((h) => h.includes("destinyitemmanager.com"));
    expect([...dimHosts].sort()).toEqual([...DIM_URL_PATTERNS].sort());
    expect([...base.content_scripts[0]!.matches].sort()).toEqual([...DIM_URL_PATTERNS].sort());
  });
});

describe("Firefox shaped manifest", () => {
  const manifest = shapeFirefoxManifest(base) as {
    background: { scripts: string[]; type?: string; service_worker?: string };
    sidebar_action: { default_panel: string };
    side_panel?: unknown;
    action: { default_title: string; default_area?: string };
    commands: Record<string, unknown>;
    browser_specific_settings: { gecko: { id: string } };
    permissions: string[];
  };

  it("uses event-page scripts + sidebar_action + gecko id", () => {
    expect(manifest.background.scripts).toContain("background.js");
    expect(manifest.background.type).toBe("module");
    expect(manifest.background.service_worker).toBeUndefined();
    expect(manifest.sidebar_action.default_panel).toBe("workbench.html");
    expect(manifest.side_panel).toBeUndefined();
    expect(manifest.commands).toHaveProperty("_execute_sidebar_action");
    expect(manifest.action.default_title).toBe("Vault Keeper");
    expect(manifest.browser_specific_settings.gecko.id).toContain("vault-keeper");
    expect(manifest.permissions).toEqual(["storage"]);
  });
});

describe("Chromium shaped manifest", () => {
  const manifest = shapeChromiumManifest(base) as {
    background: { service_worker: string; type?: string; scripts?: string[] };
    side_panel: { default_path: string };
    sidebar_action?: unknown;
    action: { default_title: string; default_area?: string };
    permissions: string[];
    commands?: Record<string, unknown>;
    minimum_chrome_version?: string;
  };

  it("uses service_worker + side_panel + sidePanel permission", () => {
    expect(manifest.background.service_worker).toBe("background.js");
    expect(manifest.background.type).toBe("module");
    expect(manifest.background.scripts).toBeUndefined();
    expect(manifest.side_panel.default_path).toBe("workbench.html");
    expect(manifest.sidebar_action).toBeUndefined();
    expect(manifest.permissions).toContain("storage");
    expect(manifest.permissions).toContain("sidePanel");
    expect(manifest.permissions).not.toContain("tabs");
    expect(manifest.permissions).not.toContain("identity");
    expect(manifest.action.default_title).toBe("Vault Keeper");
    expect(manifest.action.default_area).toBeUndefined();
    expect(manifest.commands?.["_execute_sidebar_action"]).toBeUndefined();
    expect(manifest.minimum_chrome_version).toBe("116");
  });
});

