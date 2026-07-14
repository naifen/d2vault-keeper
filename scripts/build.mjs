import * as esbuild from "esbuild";
import {
  cpSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
  unlinkSync,
  renameSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outdir = join(root, "dist");
const lockPath = join(root, ".build.lock");

/** Exclusive lock so parallel vitest/npm builds cannot half-wipe dist/. */
async function withBuildLock(run) {
  const deadline = Date.now() + 120_000;
  for (;;) {
    try {
      writeFileSync(lockPath, `${process.pid}\n`, { flag: "wx" });
      break;
    } catch (err) {
      if (err && typeof err === "object" && "code" in err && err.code !== "EEXIST") throw err;
      if (Date.now() > deadline) throw new Error("timed out waiting for .build.lock");
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  try {
    await run();
  } finally {
    try {
      unlinkSync(lockPath);
    } catch {
      // lock already gone
    }
  }
}

await withBuildLock(async () => {
  // Stage outside publish tree (not shipped under dist/). WIP holds only loadable outputs.
  const stamp = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const stagedir = join(root, `.dist-stage-${stamp}`);
  const wip = join(root, `.dist-wip-${stamp}`);
  mkdirSync(stagedir, { recursive: true });
  mkdirSync(wip, { recursive: true });

  let outgoing = /** @type {string | null} */ (null);
  try {
    // Bundle TS shape module for Node import (single source of truth w/ tests).
    const shapeBundle = join(stagedir, "manifest-shape.mjs");
    await esbuild.build({
      entryPoints: [join(root, "src/manifest/shape.ts")],
      outfile: shapeBundle,
      format: "esm",
      platform: "node",
      bundle: true,
      logLevel: "silent",
    });
    const { BROWSER_TARGETS, shapeChromiumManifest, shapeFirefoxManifest } = await import(
      pathToFileURL(shapeBundle).href
    );

    const shared = {
      bundle: true,
      sourcemap: true,
      // Chrome 116+ / Firefox 121+ — ES2022 is fine for both shells.
      target: ["chrome116", "firefox121"],
      logLevel: "info",
      platform: "browser",
    };

    // Background + Workbench are ES modules (manifest type:module / <script type=module>).
    await esbuild.build({
      ...shared,
      format: "esm",
      entryPoints: {
        background: join(root, "src/background/index.ts"),
        workbench: join(root, "src/workbench/main.ts"),
      },
      outdir: stagedir,
    });

    // Content script must be classic IIFE — no top-level import/export.
    await esbuild.build({
      ...shared,
      format: "iife",
      entryPoints: [join(root, "src/content/light.ts")],
      outfile: join(stagedir, "content.js"),
    });

    cpSync(join(root, "src/workbench/index.html"), join(stagedir, "workbench.html"));
    cpSync(join(root, "src/workbench/styles.css"), join(stagedir, "workbench.css"));

    const base = JSON.parse(readFileSync(join(root, "src/manifest.base.json"), "utf8"));
    const shapers = {
      firefox: shapeFirefoxManifest,
      chromium: shapeChromiumManifest,
    };

    const requiredAssets = [
      "background.js",
      "workbench.js",
      "content.js",
      "workbench.html",
      "workbench.css",
    ];
    const optionalAssets = ["background.js.map", "workbench.js.map", "content.js.map"];

    for (const name of requiredAssets) {
      if (!existsSync(join(stagedir, name))) {
        throw new Error(`build missing required asset: ${name}`);
      }
    }

    for (const target of BROWSER_TARGETS) {
      const targetDir = join(wip, target);
      mkdirSync(targetDir, { recursive: true });
      for (const name of requiredAssets) {
        cpSync(join(stagedir, name), join(targetDir, name));
      }
      for (const name of optionalAssets) {
        const from = join(stagedir, name);
        if (existsSync(from)) cpSync(from, join(targetDir, name));
      }
      const manifest = shapers[target](base);
      writeFileSync(join(targetDir, "manifest.json"), JSON.stringify(manifest, null, 2));
    }

    // Stable path for classic-script regression tests.
    cpSync(join(stagedir, "content.js"), join(wip, "content.js"));
    if (existsSync(join(stagedir, "content.js.map"))) {
      cpSync(join(stagedir, "content.js.map"), join(wip, "content.js.map"));
    }

    // Publish WIP as dist (move old dist aside first).
    outgoing = join(root, `.dist-old-${stamp}`);
    if (existsSync(outdir)) {
      renameSync(outdir, outgoing);
    }
    renameSync(wip, outdir);
    rmSync(outgoing, { recursive: true, force: true });
    outgoing = null;
  } catch (err) {
    // Restore previous dist if publish moved it aside but failed to land WIP.
    if (outgoing && existsSync(outgoing) && !existsSync(outdir)) {
      try {
        renameSync(outgoing, outdir);
      } catch {
        // best-effort restore
      }
    }
    rmSync(wip, { recursive: true, force: true });
    throw err;
  } finally {
    rmSync(stagedir, { recursive: true, force: true });
  }

  console.log("build ok → dist/firefox/ + dist/chromium/");
});
