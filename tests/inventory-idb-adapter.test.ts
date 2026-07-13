import { describe, expect, it, vi } from "vitest";
import { createBrowserIdbKeyval, IDB_DB_NAME } from "../src/inventory/idb-reader.js";

describe("createBrowserIdbKeyval safety", () => {
  it("refuses to open when DIM keyval-store is missing (does not create)", async () => {
    const openDb = vi.fn(() => {
      throw new Error("open should not be called when DB missing");
    });
    const listDatabases = vi.fn(async () => [{ name: "other-db", version: 1 }]);

    const idb = createBrowserIdbKeyval(openDb as never, listDatabases);
    await expect(idb.get("profile-1")).rejects.toThrow(/Open DIM logged in/i);
    expect(openDb).not.toHaveBeenCalled();
    expect(listDatabases).toHaveBeenCalled();
  });

  it("opens when keyval-store is listed", async () => {
    const storeGet = vi.fn((_key: string) => {
      const req = {
        result: { ok: true },
        onerror: null as ((this: unknown, ev: Event) => void) | null,
        onsuccess: null as ((this: unknown, ev: Event) => void) | null,
      };
      queueMicrotask(() => req.onsuccess?.call(req, {} as Event));
      return req;
    });

    const fakeDb = {
      objectStoreNames: { contains: (n: string) => n === "keyval" },
      transaction: () => ({
        objectStore: () => ({ get: storeGet }),
      }),
      close: vi.fn(),
    };

    const openDb = vi.fn((_name: string) => {
      const req = {
        result: fakeDb,
        error: null,
        transaction: null,
        onerror: null as ((this: unknown, ev: Event) => void) | null,
        onsuccess: null as ((this: unknown, ev: Event) => void) | null,
        onupgradeneeded: null as ((this: unknown, ev: Event) => void) | null,
        onblocked: null as ((this: unknown, ev: Event) => void) | null,
      };
      queueMicrotask(() => req.onsuccess?.call(req, {} as Event));
      return req as unknown as IDBOpenDBRequest;
    });

    const listDatabases = vi.fn(async () => [{ name: IDB_DB_NAME, version: 1 }]);
    const idb = createBrowserIdbKeyval(openDb, listDatabases);
    const value = await idb.get<{ ok: boolean }>("profile-1");
    expect(value).toEqual({ ok: true });
    expect(openDb).toHaveBeenCalledWith(IDB_DB_NAME);
  });
});
