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
const contentJs = join(root, "dist/content.js");

describe("dist content.js classic script", () => {
  beforeAll(() => {
    const build = spawnSync("npm", ["run", "build"], { cwd: root, encoding: "utf8" });
    expect(build.status, build.stderr || build.stdout).toBe(0);
  });

  it("exists after build", () => {
    expect(existsSync(contentJs)).toBe(true);
  });

  it("has no top-level import or export (classic content script)", () => {
    const src = readFileSync(contentJs, "utf8");
    // Strip line comments for a rough check; ESM keywords at start of line are fatal in classic CS.
    const lines = src.split("\n").filter((l) => !l.trimStart().startsWith("//"));
    const code = lines.join("\n");
    expect(code).not.toMatch(/^\s*export\s/m);
    expect(code).not.toMatch(/^\s*import\s/m);
  });
});
