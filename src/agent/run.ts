/**
 * Cancelable Agent loop over OpenRouter-compatible HTTP.
 * API key never logged.
 * Post-parse: Favorite/Exotic exclusion drops violating recommendations (shared policy).
 */

import { filterExcludedRecommendations } from "../trash/exclusions.js";
import { buildCompletionBody } from "./build-request.js";
import { parseAgentResponse } from "./parse.js";
import type { AgentRequest, AgentResult, AgentSettings } from "./types.js";

export type FetchFn = typeof fetch;

export interface RunAgentOptions {
  settings: AgentSettings;
  request: AgentRequest;
  signal?: AbortSignal;
  fetchFn?: FetchFn;
}

export async function runAgent(options: RunAgentOptions): Promise<AgentResult> {
  const { settings, request, signal } = options;
  const fetchFn = options.fetchFn ?? fetch;

  if (!settings.apiKey.trim()) {
    throw new Error("API key not set");
  }
  if (!request.intention.trim()) {
    throw new Error("Intention is empty");
  }

  // Safety: strip vault if opt-in false even if slice provided.
  const safeRequest: AgentRequest = request.vaultContextOptIn
    ? request
    : { intention: request.intention, vaultContextOptIn: false };

  const url = `${settings.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const body = buildCompletionBody(settings, safeRequest);

  const init: RequestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify(body),
  };
  if (signal) init.signal = signal;

  const res = await fetchFn(url, init);

  if (!res.ok) {
    // Never include Authorization or apiKey in error text.
    throw new Error(`Agent HTTP ${res.status}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content ?? "";
  const parsed = parseAgentResponse(content);

  // Enforce same Favorite/Exotic rules as Stage (prompt is advisory only).
  const vaultById = new Map(
    (safeRequest.vaultSlice ?? []).map((row) => [row.id, row] as const),
  );
  return {
    ...parsed,
    recommendations: filterExcludedRecommendations(parsed.recommendations, (id) =>
      vaultById.get(id),
    ),
  };
}

export function createAgentController(): {
  signal: AbortSignal;
  cancel: () => void;
} {
  const ac = new AbortController();
  return {
    signal: ac.signal,
    cancel: () => ac.abort(),
  };
}
