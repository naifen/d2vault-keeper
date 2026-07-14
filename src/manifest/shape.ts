/**
 * Build-time / test-time manifest shaping for Firefox vs Chromium MV3 shells.
 * Shared product fields come from manifest.base.json; browser-specific keys
 * that cannot coexist in one load-valid file are injected here.
 */

export type ManifestBase = {
  manifest_version: number;
  name: string;
  version: string;
  description: string;
  permissions: string[];
  host_permissions: string[];
  optional_host_permissions?: string[];
  content_scripts: Array<{
    matches: string[];
    js: string[];
    run_at?: string;
  }>;
  [key: string]: unknown;
};

export type BrowserTarget = "firefox" | "chromium";

export const BROWSER_TARGETS: readonly BrowserTarget[] = ["firefox", "chromium"];

export function shapeFirefoxManifest(base: ManifestBase): Record<string, unknown> {
  return {
    ...base,
    browser_specific_settings: {
      gecko: {
        id: "vault-keeper@d2vault-keeper.local",
        strict_min_version: "121.0",
      },
    },
    background: {
      scripts: ["background.js"],
      type: "module",
    },
    sidebar_action: {
      default_title: "Vault Keeper",
      default_panel: "workbench.html",
      open_at_install: false,
    },
    action: {
      default_title: "Vault Keeper",
      default_area: "navbar",
    },
    commands: {
      _execute_sidebar_action: {
        description: "Open Vault Keeper Workbench",
      },
    },
  };
}

export function shapeChromiumManifest(base: ManifestBase): Record<string, unknown> {
  const permissions = Array.isArray(base.permissions) ? [...base.permissions] : [];
  if (!permissions.includes("sidePanel")) {
    permissions.push("sidePanel");
  }
  return {
    ...base,
    permissions,
    background: {
      service_worker: "background.js",
      type: "module",
    },
    side_panel: {
      default_path: "workbench.html",
    },
    action: {
      default_title: "Vault Keeper",
    },
    minimum_chrome_version: "116",
  };
}
