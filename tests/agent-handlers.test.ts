/**
 * Drives shipped agent-handlers cancel slot (BUG: predecessor finally must not wipe live run).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  handleAgentCancel,
  handleAgentRun,
} from "../src/background/agent-handlers.js";
import { AGENT_SETTINGS_KEY, type FetchFn } from "../src/agent/index.js";

const settingsBag = {
  apiKey: "test-key",
  baseUrl: "https://example.test/v1",
  model: "m",
};

function installBrowserStorage(): void {
  const data: Record<string, unknown> = {
    [AGENT_SETTINGS_KEY]: settingsBag,
  };
  vi.stubGlobal("browser", {
    storage: {
      local: {
        async get(key: string) {
          return { [key]: data[key] };
        },
        async set(obj: Record<string, unknown>) {
          Object.assign(data, obj);
        },
      },
    },
  });
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

describe("handleAgentRun cancel slot (shipped)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    // Clear any live cancel so tests stay isolated.
    handleAgentCancel("cleanup");
  });

  it("keeps cancel for the live run after a predecessor is aborted", async () => {
    installBrowserStorage();
    const { fetchFn, whenInFlight } = hangingFetch();
    const firstInFlight = whenInFlight(1);

    const runA = handleAgentRun("a", { intention: "first", vaultContextOptIn: false }, fetchFn);
    await firstInFlight;

    const secondInFlight = whenInFlight(2);
    const runB = handleAgentRun("b", { intention: "second", vaultContextOptIn: false }, fetchFn);

    // A is aborted by B; wait for A's finally (bug would clear B's cancel here).
    const aResult = await runA;
    expect(aResult.kind).toBe("agent-result");
    expect((aResult.payload as { cancelled?: boolean }).cancelled).toBe(true);

    await secondInFlight;

    // Cancel must still abort B.
    const cancelRes = handleAgentCancel("cancel");
    expect((cancelRes.payload as { cancelled?: boolean }).cancelled).toBe(true);

    const bResult = await runB;
    expect((bResult.payload as { cancelled?: boolean }).cancelled).toBe(true);
    expect((bResult.payload as { ok?: boolean }).ok).toBe(false);
  });

  it("cancel during settings load aborts before HTTP", async () => {
    let releaseGet!: () => void;
    const getGate = new Promise<void>((resolve) => {
      releaseGet = resolve;
    });
    const data: Record<string, unknown> = {
      [AGENT_SETTINGS_KEY]: settingsBag,
    };
    vi.stubGlobal("browser", {
      storage: {
        local: {
          async get(key: string) {
            await getGate;
            return { [key]: data[key] };
          },
          async set(obj: Record<string, unknown>) {
            Object.assign(data, obj);
          },
        },
      },
    });

    const fetchFn = vi.fn(async () => {
      throw new Error("fetch must not run after cancel-during-settings");
    }) as unknown as FetchFn;

    const run = handleAgentRun("c", { intention: "slow-settings", vaultContextOptIn: false }, fetchFn);
    // Yield so run registers cancel and blocks in storage.get.
    await Promise.resolve();
    await Promise.resolve();

    handleAgentCancel("cancel-early");
    releaseGet();

    const result = await run;
    expect((result.payload as { cancelled?: boolean }).cancelled).toBe(true);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
