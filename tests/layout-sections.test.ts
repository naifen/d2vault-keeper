import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("Workbench locked layout sections (composer-first)", () => {
  it("HTML has Intention → DIM filter → Results → Trash in order", () => {
    const html = readFileSync(join(root, "src/workbench/index.html"), "utf8");
    const intention = html.indexOf('id="section-intention"');
    const filter = html.indexOf('id="section-filter"');
    const results = html.indexOf('id="section-results"');
    const trash = html.indexOf('id="section-trash"');
    expect(intention).toBeGreaterThan(-1);
    expect(filter).toBeGreaterThan(intention);
    expect(results).toBeGreaterThan(filter);
    expect(trash).toBeGreaterThan(results);
    expect(html).toMatch(/Intention/i);
    expect(html).toMatch(/DIM filter/i);
    expect(html).toMatch(/Results/i);
    expect(html).toMatch(/Trash/);
    expect(html).toMatch(/Suggest/);
  });

  it("manual QA + packaging docs exist", () => {
    expect(readFileSync(join(root, "docs/manual-qa.md"), "utf8")).toMatch(/Happy path/);
    expect(readFileSync(join(root, "docs/packaging.md"), "utf8")).toMatch(/npm run build/);
  });
});
