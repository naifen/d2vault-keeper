/**
 * Cancelable Agent loop over OpenRouter-compatible HTTP.
 * API key never logged.
 * Post-parse: Favorite/Exotic exclusion drops violating recommendations (shared policy).
 */

import { filterExcludedRecommendations } from "../trash/exclusions.js";
import { completionBody } from "./completion-body.js";
import { parseAgentResponse } from "./parse.js";
import type {
  AgentExclusionFields,
  AgentRequest,
  AgentResult,
  AgentSettings,
} from "./types.js";

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

  // Safety: strip LLM vault dump if opt-in false; keep exclusionById (not sent to model).
  const safeRequest: AgentRequest = request.vaultContextOptIn
    ? request
    : {
        intention: request.intention,
        vaultContextOptIn: false,
        ...(request.exclusionById ? { exclusionById: request.exclusionById } : {}),
      };

  const url = `${settings.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const body = completionBody(settings, safeRequest);

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

  // Full exclusion index preferred; vaultSlice is fallback (tests / legacy callers).
  const exclusionResolve = exclusionResolveFromRequest(safeRequest);
  return {
    ...parsed,
    recommendations: filterExcludedRecommendations(
      parsed.recommendations,
      exclusionResolve,
    ),
  };
}

/** Resolve exclusion subject by item id for post-parse filter. */
function exclusionResolveFromRequest(
  request: AgentRequest,
): ((id: string) => AgentExclusionFields | undefined) | undefined {
  if (request.exclusionById) {
    const map = request.exclusionById;
    return (id) => map[id];
  }
  if (request.vaultSlice && request.vaultSlice.length > 0) {
    const byId = new Map(request.vaultSlice.map((row) => [row.id, row] as const));
    return (id) => byId.get(id);
  }
  return undefined;
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
