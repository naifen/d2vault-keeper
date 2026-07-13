/**
 * Idle / closed-Workbench policy.
 * Background is an event page: no long-lived pollers/timers.
 * Workbench uses focus + user clicks only — never background setInterval.
 */

/** Documented: sources of wake-ups that are allowed. */
export const ALLOWED_WAKEUPS = [
  "runtime.onMessage",
  "action.onClicked",
  "tabs.sendMessage (on demand)",
] as const;

/** Forbidden patterns in background lifetime when Workbench is closed. */
export const FORBIDDEN_WHEN_IDLE = [
  "setInterval inventory poll",
  "setInterval agent poll",
  "long-lived WebSocket to Bungie",
] as const;

/**
 * Pure guard used by tests: a module source string must not introduce idle pollers.
 */
export function sourceHasIdlePollers(source: string): boolean {
  // Allow comments mentioning setInterval; flag real calls.
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  return /\bsetInterval\s*\(/.test(withoutComments);
}
