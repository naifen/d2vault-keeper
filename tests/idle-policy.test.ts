import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { sourceHasIdlePollers } from "../src/background/idle.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("idle / no background pollers", () => {
  it("background entry has no setInterval pollers", () => {
    const src = readFileSync(join(root, "src/background/index.ts"), "utf8");
    expect(sourceHasIdlePollers(src)).toBe(false);
  });

  it("trash + agent handlers have no setInterval", () => {
    for (const rel of [
      "src/background/trash-handlers.ts",
      "src/background/agent-handlers.ts",
      "src/background/relay.ts",
    ]) {
      const src = readFileSync(join(root, rel), "utf8");
      expect(sourceHasIdlePollers(src), rel).toBe(false);
    }
  });

  it("sourceHasIdlePollers detects real pollers", () => {
    expect(sourceHasIdlePollers("setInterval(() => {}, 1000)")).toBe(true);
    expect(sourceHasIdlePollers("// setInterval(() => {}, 1000)")).toBe(false);
  });
});
