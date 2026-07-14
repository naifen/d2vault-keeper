/**
 * Ensure the WebExtension `browser` global exists.
 * Chromium exposes `chrome` (Promise-capable when callbacks omitted); Firefox
 * exposes `browser`. Product code keeps calling `browser.*`.
 */

type WebExtGlobal = typeof globalThis & {
  browser?: typeof browser;
  chrome?: typeof browser;
};

export function ensureBrowser(): void {
  const g = globalThis as WebExtGlobal;
  if (g.browser?.runtime) return;
  if (g.chrome?.runtime) {
    g.browser = g.chrome;
  }
}
