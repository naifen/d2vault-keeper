/**
 * Built content script must be classic (no top-level import/export).
 * Regression for #17: ESM export broke Light load on DIM.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const contentPaths = [
  join(root, "dist/content.js"),
  join(root, "dist/firefox/content.js"),
  join(root, "dist/chromium/content.js"),
];

describe("dist content.js classic script + dual targets", () => {
  beforeAll(() => {
    const build = spawnSync("npm", ["run", "build"], { cwd: root, encoding: "utf8" });
    expect(build.status, build.stderr || build.stdout).toBe(0);
  });

  it("exists after build for stage + both browser targets", () => {
    for (const p of contentPaths) {
      expect(existsSync(p), p).toBe(true);
    }
  });

  it("has no top-level import or export (classic content script)", () => {
    const src = readFileSync(contentPaths[0]!, "utf8");
    // Strip line comments for a rough check; ESM keywords at start of line are fatal in classic CS.
    const lines = src.split("\n").filter((l) => !l.trimStart().startsWith("//"));
    const code = lines.join("\n");
    expect(code).not.toMatch(/^\s*export\s/m);
    expect(code).not.toMatch(/^\s*import\s/m);
  });

  it("emits Chromium and Firefox manifests with correct shell keys", () => {
    const chromium = JSON.parse(
      readFileSync(join(root, "dist/chromium/manifest.json"), "utf8"),
    ) as {
      background: { service_worker?: string; scripts?: string[] };
      side_panel?: { default_path: string };
      permissions: string[];
    };
    const firefox = JSON.parse(
      readFileSync(join(root, "dist/firefox/manifest.json"), "utf8"),
    ) as {
      background: { service_worker?: string; scripts?: string[] };
      sidebar_action?: { default_panel: string };
      permissions: string[];
    };

    expect(chromium.background.service_worker).toBe("background.js");
    expect(chromium.side_panel?.default_path).toBe("workbench.html");
    expect(chromium.permissions).toContain("sidePanel");

    expect(firefox.background.scripts).toContain("background.js");
    expect(firefox.sidebar_action?.default_panel).toBe("workbench.html");
    expect(firefox.permissions).not.toContain("sidePanel");
  });
});
