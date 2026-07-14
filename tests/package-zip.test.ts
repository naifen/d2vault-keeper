/**
 * package.mjs must emit fresh zips (no stale members from prior runs).
 * Drives the real npm package script against real dual-target dist/.
 */
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { beforeAll, describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const artifacts = join(root, "artifacts");
const chromiumZip = join(artifacts, "vault-keeper-chromium.zip");
const firefoxZip = join(artifacts, "vault-keeper-firefox.zip");

function run(cmd: string, args: string[], cwd = root) {
  return spawnSync(cmd, args, { cwd, encoding: "utf8" });
}

function zipList(zipPath: string): string {
  const out = run("unzip", ["-l", zipPath]);
  expect(out.status, out.stderr || out.stdout).toBe(0);
  return out.stdout;
}

describe("package.mjs dual-target zips", () => {
  beforeAll(() => {
    const build = run("npm", ["run", "build"]);
    expect(build.status, build.stderr || build.stdout).toBe(0);
  }, 60_000);

  it("creates chromium + firefox zips from dist targets", () => {
    const pack = run("npm", ["run", "package"]);
    expect(pack.status, pack.stderr || pack.stdout).toBe(0);
    expect(existsSync(chromiumZip)).toBe(true);
    expect(existsSync(firefoxZip)).toBe(true);
    expect(zipList(chromiumZip)).toMatch(/manifest\.json/);
    expect(zipList(firefoxZip)).toMatch(/manifest\.json/);
  });

  it("re-package drops stale members left in a previous zip", () => {
    // Seed a polluted archive the way a prior broken `zip -r` update would.
    mkdirSync(artifacts, { recursive: true });
    const seedDir = join(root, "dist", "chromium");
    expect(existsSync(join(seedDir, "manifest.json"))).toBe(true);

    const pack1 = run("npm", ["run", "package"]);
    expect(pack1.status, pack1.stderr || pack1.stdout).toBe(0);

    // Inject a ghost file into the existing zip (simulates leftover member).
    const ghost = join(seedDir, "STALE_PACKAGE_MARKER.txt");
    writeFileSync(ghost, "ghost");
    const inject = run("zip", ["-r", "-X", chromiumZip, "STALE_PACKAGE_MARKER.txt"], seedDir);
    expect(inject.status, inject.stderr || inject.stdout).toBe(0);
    expect(zipList(chromiumZip)).toMatch(/STALE_PACKAGE_MARKER/);

    // Remove ghost from disk so a correct package must not re-add it;
    // a buggy update-zip would still keep the member.
    rmSync(ghost, { force: true });

    const pack2 = run("npm", ["run", "package"]);
    expect(pack2.status, pack2.stderr || pack2.stdout).toBe(0);
    expect(zipList(chromiumZip)).not.toMatch(/STALE_PACKAGE_MARKER/);
    // Still has real payload
    expect(zipList(chromiumZip)).toMatch(/background\.js/);
    expect(JSON.parse(readFileSync(join(seedDir, "manifest.json"), "utf8")).manifest_version).toBe(
      3,
    );
  });
});
