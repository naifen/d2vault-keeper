/**
 * Product step: AgentRequest → HTTP completion body / chat messages.
 * Never include vault dump unless opt-in. Does not log API keys.
 */

import type { AgentRequest, AgentSettings } from "./types.js";

export function agentMessages(req: AgentRequest): Array<{ role: string; content: string }> {
  const system = [
    "You are Vault Keeper Agent for Destiny Item Manager.",
    "Return ONLY JSON: {\"filters\":[\"dim filter strings\"],\"explanation\":\"short\",\"recommendations\":[{\"id\",\"itemHash\",\"name\",\"reason\"}?]}",
    "Never auto-stage. Recommendations are optional suggestions only.",
    "Prefer common DIM filters (is:weapon, is:handcannon, -is:exotic, tag:junk, …).",
    "Exclude exotics and favorite-tagged items from recommendations.",
  ].join(" ");

  let user = `Intention: ${req.intention}`;
  if (req.vaultContextOptIn && req.vaultSlice && req.vaultSlice.length > 0) {
    // Bounded slice only — caller must not pass full vault without opt-in.
    user += `\nVault context (opt-in, ${req.vaultSlice.length} items):\n${JSON.stringify(req.vaultSlice)}`;
  } else {
    user += "\n(No vault dump; vaultContextOptIn is false.)";
  }

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

export function completionBody(settings: AgentSettings, req: AgentRequest): Record<string, unknown> {
  return {
    model: settings.model,
    messages: agentMessages(req),
    temperature: 0.2,
  };
}

/** Assert no vault dump when opt-in is false (for tests + guard). */
export function requestIncludesVaultDump(req: AgentRequest): boolean {
  return Boolean(req.vaultContextOptIn && req.vaultSlice && req.vaultSlice.length > 0);
}
