import type { AgentRecommendation, AgentResult } from "./types.js";

/**
 * Parse model JSON (or fenced JSON) into AgentResult.
 * Independent of HTTP transport.
 */
export function parseAgentResponse(text: string): AgentResult {
  const json = extractJsonObject(text);
  if (!json) {
    return {
      filters: [],
      explanation: text.trim() || "Empty agent response",
      recommendations: [],
    };
  }

  const filters = normalizeFilters(json.filters ?? json.filter);
  const explanation =
    typeof json.explanation === "string"
      ? json.explanation
      : typeof json.reason === "string"
        ? json.reason
        : "";
  const recommendations = normalizeRecs(json.recommendations);

  return { filters, explanation, recommendations };
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  try {
    const v = JSON.parse(candidate) as unknown;
    if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      return v as Record<string, unknown>;
    }
  } catch {
    // try first {...} slice
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        const v = JSON.parse(candidate.slice(start, end + 1)) as unknown;
        if (typeof v === "object" && v !== null && !Array.isArray(v)) {
          return v as Record<string, unknown>;
        }
      } catch {
        return null;
      }
    }
  }
  return null;
}

function normalizeFilters(raw: unknown): string[] {
  if (typeof raw === "string" && raw.trim()) return [raw.trim()];
  if (Array.isArray(raw)) {
    return raw.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((s) => s.trim());
  }
  return [];
}

function normalizeRecs(raw: unknown): AgentRecommendation[] {
  if (!Array.isArray(raw)) return [];
  const out: AgentRecommendation[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as Record<string, unknown>;
    const id = e.id !== undefined && e.id !== null ? String(e.id) : "";
    const name = typeof e.name === "string" ? e.name : "";
    const hashRaw = e.itemHash;
    const itemHash =
      typeof hashRaw === "number"
        ? hashRaw
        : typeof hashRaw === "string" && hashRaw.trim() !== ""
          ? Number(hashRaw)
          : NaN;
    if (!id || !name || !Number.isFinite(itemHash)) continue;
    const rec: AgentRecommendation = { id, itemHash, name };
    if (typeof e.reason === "string") rec.reason = e.reason;
    out.push(rec);
  }
  return out;
}
