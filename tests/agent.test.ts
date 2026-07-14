import { describe, expect, it, vi } from "vitest";
import {
  agentMessages,
  completionBody,
  createAgentController,
  intentionToAgentRequest,
  parseAgentResponse,
  redactSettings,
  requestIncludesVaultDump,
  runAgent,
  saveAgentSettings,
  loadAgentSettings,
  type AgentRequest,
  type AgentSettings,
  type KvStorage,
} from "../src/agent/index.js";

describe("parseAgentResponse", () => {
  it("parses JSON filters + explanation + recommendations", () => {
    const raw = JSON.stringify({
      filters: ["is:handcannon -is:exotic"],
      explanation: "Legendary HCs only",
      recommendations: [{ id: "1", itemHash: 9, name: "Trust", reason: "no good perks" }],
    });
    const r = parseAgentResponse(raw);
    expect(r.filters).toEqual(["is:handcannon -is:exotic"]);
    expect(r.explanation).toMatch(/Legendary/);
    expect(r.recommendations).toHaveLength(1);
  });

  it("parses fenced JSON", () => {
    const r = parseAgentResponse('```json\n{"filters":["is:weapon"],"explanation":"ok"}\n```');
    expect(r.filters).toEqual(["is:weapon"]);
  });

  it("coerces string itemHash from LLM JSON", () => {
    const r = parseAgentResponse(
      JSON.stringify({
        filters: ["is:weapon"],
        explanation: "x",
        recommendations: [{ id: "9", itemHash: "12345", name: "Gun" }],
      }),
    );
    expect(r.recommendations[0]?.itemHash).toBe(12345);
  });

  it("preserves exclusion fields on recommendations for post-filter", () => {
    const r = parseAgentResponse(
      JSON.stringify({
        filters: [],
        explanation: "x",
        recommendations: [
          { id: "1", itemHash: 1, name: "Hawk", isExotic: true, tierType: "Exotic" },
          { id: "2", itemHash: 2, name: "Fav", tag: "favorite" },
        ],
      }),
    );
    expect(r.recommendations[0]?.isExotic).toBe(true);
    expect(r.recommendations[0]?.tierType).toBe("Exotic");
    expect(r.recommendations[1]?.tag).toBe("favorite");
  });
});

describe("vault opt-in gate", () => {
  it("does not include vault dump without opt-in", () => {
    const req: AgentRequest = {
      intention: "junk blues",
      vaultContextOptIn: false,
      vaultSlice: [{ id: "1", itemHash: 1, name: "Secret" }],
    };
    // agentMessages still sees slice only if opt-in true — runAgent strips.
    const messages = agentMessages({
      intention: req.intention,
      vaultContextOptIn: false,
    });
    const blob = JSON.stringify(messages);
    expect(blob).not.toContain("Secret");
    expect(blob).toMatch(/No vault dump/);
    expect(requestIncludesVaultDump(req)).toBe(false);
  });

  it("includes vault when opted in", () => {
    const req: AgentRequest = {
      intention: "find junk",
      vaultContextOptIn: true,
      vaultSlice: [{ id: "1", itemHash: 1, name: "Trust" }],
    };
    expect(requestIncludesVaultDump(req)).toBe(true);
    expect(JSON.stringify(agentMessages(req))).toContain("Trust");
  });
});

describe("runAgent mocked HTTP", () => {
  const settings: AgentSettings = {
    apiKey: "test-secret-key",
    baseUrl: "https://example.test/v1",
    model: "test-model",
  };

  it("returns parsed result and never logs key", async () => {
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer test-secret-key");
      const body = JSON.parse(String(init?.body)) as { messages: unknown[] };
      expect(JSON.stringify(body)).not.toContain("should-not-leak");
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  filters: ["is:armor"],
                  explanation: "armor focus",
                  recommendations: [],
                }),
              },
            },
          ],
        }),
      } as Response;
    });

    const result = await runAgent({
      settings,
      request: {
        intention: "armor junk",
        vaultContextOptIn: false,
        vaultSlice: [{ id: "x", itemHash: 1, name: "should-not-leak" }],
      },
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(result.filters).toEqual(["is:armor"]);
    expect(result.explanation).toBe("armor focus");
  });

  it("cancel via AbortSignal rejects", async () => {
    const ctrl = createAgentController();
    const fetchFn = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    });
    const p = runAgent({
      settings,
      request: { intention: "slow", vaultContextOptIn: false },
      signal: ctrl.signal,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    ctrl.cancel();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
  });

  it("completionBody uses model", () => {
    const body = completionBody(settings, {
      intention: "x",
      vaultContextOptIn: false,
    });
    expect(body.model).toBe("test-model");
  });

  it("post-parse drops exotic/favorite recs using vault slice (shared exclusion)", async () => {
    const fetchFn = vi.fn(async () => {
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  filters: ["is:weapon"],
                  explanation: "model ignored rules",
                  recommendations: [
                    { id: "leg", itemHash: 1, name: "Trust" },
                    { id: "ex", itemHash: 2, name: "Hawkmoon" },
                    { id: "fav", itemHash: 3, name: "Beloved" },
                  ],
                }),
              },
            },
          ],
        }),
      } as Response;
    });

    const result = await runAgent({
      settings,
      request: {
        intention: "junk",
        vaultContextOptIn: true,
        vaultSlice: [
          { id: "leg", itemHash: 1, name: "Trust", tierType: "Legendary" },
          { id: "ex", itemHash: 2, name: "Hawkmoon", tierType: "Exotic" },
          { id: "fav", itemHash: 3, name: "Beloved", tag: "favorite", tierType: "Legendary" },
        ],
      },
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(result.recommendations.map((r) => r.id)).toEqual(["leg"]);
    expect(result.filters).toEqual(["is:weapon"]);
  });

  it("post-parse drops recs that carry isExotic/tag on the payload without vault", async () => {
    const fetchFn = vi.fn(async () => {
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  filters: [],
                  explanation: "x",
                  recommendations: [
                    { id: "a", itemHash: 1, name: "Leg", tierType: "Legendary" },
                    { id: "b", itemHash: 2, name: "Ex", isExotic: true },
                    { id: "c", itemHash: 3, name: "Fav", tag: "favorite" },
                  ],
                }),
              },
            },
          ],
        }),
      } as Response;
    });

    const result = await runAgent({
      settings,
      request: { intention: "junk", vaultContextOptIn: false },
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(result.recommendations.map((r) => r.id)).toEqual(["a"]);
  });

  it("vault isExotic wins over model isExotic:false (shipped intention→run path)", async () => {
    const request = intentionToAgentRequest({
      intention: "junk",
      vaultContextOptIn: true,
      vaultItems: [
        { id: "ex", itemHash: 2, name: "Hawk", isExotic: true },
        { id: "leg", itemHash: 1, name: "Trust", tierType: "Legendary", isExotic: false },
      ],
    });
    expect(request.vaultSlice?.find((r) => r.id === "ex")?.isExotic).toBe(true);

    const fetchFn = vi.fn(async () => {
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  filters: [],
                  explanation: "model lies",
                  recommendations: [
                    { id: "ex", itemHash: 2, name: "Hawk", isExotic: false, tierType: "Legendary" },
                    { id: "leg", itemHash: 1, name: "Trust" },
                  ],
                }),
              },
            },
          ],
        }),
      } as Response;
    });

    const result = await runAgent({
      settings,
      request,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(result.recommendations.map((r) => r.id)).toEqual(["leg"]);
  });

  it("exclusionById enforces without LLM dump (opt-in false, shipped intention→run)", async () => {
    const request = intentionToAgentRequest({
      intention: "junk",
      vaultContextOptIn: false,
      vaultItems: [
        { id: "ex", itemHash: 2, name: "Hawk", isExotic: true },
        { id: "fav", itemHash: 3, name: "Beloved", tag: "favorite", tierType: "Legendary" },
        { id: "leg", itemHash: 1, name: "Trust", tierType: "Legendary" },
      ],
    });
    expect(request.vaultSlice).toBeUndefined();
    expect(request.exclusionById?.ex?.isExotic).toBe(true);

    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { messages: unknown[] };
      // Exclusion index must never reach the model.
      expect(JSON.stringify(body)).not.toContain("exclusionById");
      expect(JSON.stringify(body)).not.toContain("Hawk");
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  filters: [],
                  explanation: "x",
                  recommendations: [
                    { id: "ex", itemHash: 2, name: "Hawk" },
                    { id: "fav", itemHash: 3, name: "Beloved" },
                    { id: "leg", itemHash: 1, name: "Trust" },
                  ],
                }),
              },
            },
          ],
        }),
      } as Response;
    });

    const result = await runAgent({
      settings,
      request,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(result.recommendations.map((r) => r.id)).toEqual(["leg"]);
  });

  it("exclusionById covers ids outside LLM vaultSlice cap", async () => {
    const vaultItems = Array.from({ length: 10 }, (_, i) => ({
      id: `id-${i}`,
      itemHash: i,
      name: `Item ${i}`,
      tierType: i === 9 ? "Exotic" : "Legendary",
      isExotic: i === 9,
    }));
    const request = intentionToAgentRequest({
      intention: "junk",
      vaultContextOptIn: true,
      vaultItems,
      vaultSliceLimit: 3,
    });
    expect(request.vaultSlice).toHaveLength(3);
    expect(request.exclusionById?.["id-9"]?.isExotic).toBe(true);

    const fetchFn = vi.fn(async () => {
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  filters: [],
                  explanation: "x",
                  recommendations: [
                    { id: "id-0", itemHash: 0, name: "Item 0" },
                    { id: "id-9", itemHash: 9, name: "Item 9" },
                  ],
                }),
              },
            },
          ],
        }),
      } as Response;
    });

    const result = await runAgent({
      settings,
      request,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(result.recommendations.map((r) => r.id)).toEqual(["id-0"]);
  });
});

describe("settings storage + redaction", () => {
  it("saves and loads key without redact losing it in storage", async () => {
    const data: Record<string, unknown> = {};
    const storage: KvStorage = {
      async get(k) {
        return data[k];
      },
      async set(k, v) {
        data[k] = v;
      },
    };
    await saveAgentSettings(storage, {
      apiKey: "sk-secret",
      baseUrl: "https://openrouter.ai/api/v1",
      model: "m",
    });
    const loaded = await loadAgentSettings(storage);
    expect(loaded.apiKey).toBe("sk-secret");
    expect(redactSettings(loaded).apiKey).toBe("[redacted]");
  });
});
