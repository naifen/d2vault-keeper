/**
 * AgentSession deep module — settings mask + single-flight cancel with fakes.
 */
import { describe, expect, it, vi } from "vitest";
import {
  API_KEY_MASK,
  AGENT_SETTINGS_KEY,
  createAgentSession,
  isApiKeyMask,
  resolveApiKeyUpdate,
  type FetchFn,
  type KvStorage,
} from "../src/agent/index.js";

function memoryStorage(initial: Record<string, unknown> = {}): KvStorage {
  const data = { ...initial };
  return {
    async get(key) {
      return data[key];
    },
    async set(key, value) {
      data[key] = value;
    },
  };
}

function hangingFetch(): { fetchFn: FetchFn; whenInFlight: (n: number) => Promise<void> } {
  let calls = 0;
  const gates = new Map<number, () => void>();
  const whenInFlight = (n: number) =>
    new Promise<void>((resolve) => {
      gates.set(n, resolve);
    });

  const fetchFn: FetchFn = (_url, init) => {
    calls += 1;
    const n = calls;
    gates.get(n)?.();
    return new Promise((_resolve, reject) => {
      const onAbort = () => {
        const err = new Error("aborted");
        err.name = "AbortError";
        reject(err);
      };
      if (init?.signal?.aborted) {
        onAbort();
        return;
      }
      init?.signal?.addEventListener("abort", onAbort);
    });
  };

  return { fetchFn, whenInFlight };
}

describe("API key mask policy (shipped)", () => {
  it("mask constant and resolve keep current on mask/empty", () => {
    expect(isApiKeyMask(API_KEY_MASK)).toBe(true);
    expect(resolveApiKeyUpdate("real", API_KEY_MASK)).toBe("real");
    expect(resolveApiKeyUpdate("real", "")).toBe("real");
    expect(resolveApiKeyUpdate("real", "   ")).toBe("real");
    expect(resolveApiKeyUpdate("real", "new-key")).toBe("new-key");
  });
});

describe("createAgentSession settings", () => {
  it("getSettings masks key and reports hasKey", async () => {
    const store = memoryStorage({
      [AGENT_SETTINGS_KEY]: {
        apiKey: "secret",
        baseUrl: "https://example.test/v1",
        model: "m",
      },
    });
    const session = createAgentSession({ getStorage: () => store });
    const pub = await session.getSettings();
    expect(pub.apiKey).toBe(API_KEY_MASK);
    expect(pub.hasKey).toBe(true);
    expect(pub.model).toBe("m");
  });

  it("setSettings ignores mask sentinel and preserves stored key", async () => {
    const store = memoryStorage({
      [AGENT_SETTINGS_KEY]: {
        apiKey: "secret",
        baseUrl: "https://example.test/v1",
        model: "m",
      },
    });
    const session = createAgentSession({ getStorage: () => store });
    const pub = await session.setSettings({ apiKey: API_KEY_MASK, model: "m2" });
    expect(pub.apiKey).toBe(API_KEY_MASK);
    expect(pub.hasKey).toBe(true);
    expect(pub.model).toBe("m2");
    const raw = (await store.get(AGENT_SETTINGS_KEY)) as { apiKey: string };
    expect(raw.apiKey).toBe("secret");
  });

  it("setSettings replaces key when a real value is provided", async () => {
    const store = memoryStorage({
      [AGENT_SETTINGS_KEY]: {
        apiKey: "old",
        baseUrl: "https://example.test/v1",
        model: "m",
      },
    });
    const session = createAgentSession({ getStorage: () => store });
    await session.setSettings({ apiKey: "new-secret" });
    const raw = (await store.get(AGENT_SETTINGS_KEY)) as { apiKey: string };
    expect(raw.apiKey).toBe("new-secret");
  });
});

describe("createAgentSession cancel slot", () => {
  it("keeps cancel for the live run after a predecessor is aborted", async () => {
    const store = memoryStorage({
      [AGENT_SETTINGS_KEY]: {
        apiKey: "test-key",
        baseUrl: "https://example.test/v1",
        model: "m",
      },
    });
    const session = createAgentSession({ getStorage: () => store });
    const { fetchFn, whenInFlight } = hangingFetch();
    const firstInFlight = whenInFlight(1);

    const runA = session.run({ intention: "first", vaultContextOptIn: false }, { fetchFn });
    await firstInFlight;

    const secondInFlight = whenInFlight(2);
    const runB = session.run({ intention: "second", vaultContextOptIn: false }, { fetchFn });

    const aResult = await runA;
    expect(aResult.ok).toBe(false);
    if (aResult.ok) return;
    expect(aResult.cancelled).toBe(true);

    await secondInFlight;
    session.cancel();

    const bResult = await runB;
    expect(bResult.ok).toBe(false);
    if (bResult.ok) return;
    expect(bResult.cancelled).toBe(true);
  });

  it("cancel during settings load aborts before HTTP", async () => {
    let releaseGet!: () => void;
    const getGate = new Promise<void>((resolve) => {
      releaseGet = resolve;
    });
    const data: Record<string, unknown> = {
      [AGENT_SETTINGS_KEY]: {
        apiKey: "test-key",
        baseUrl: "https://example.test/v1",
        model: "m",
      },
    };
    const store: KvStorage = {
      async get(key) {
        await getGate;
        return data[key];
      },
      async set(key, value) {
        data[key] = value;
      },
    };
    const session = createAgentSession({ getStorage: () => store });
    const fetchFn = vi.fn(async () => {
      throw new Error("fetch must not run after cancel-during-settings");
    }) as unknown as FetchFn;

    const run = session.run(
      { intention: "slow-settings", vaultContextOptIn: false },
      { fetchFn },
    );
    await Promise.resolve();
    await Promise.resolve();

    session.cancel();
    releaseGet();

    const result = await run;
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.cancelled).toBe(true);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
