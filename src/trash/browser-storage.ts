import type { TrashStorage } from "./store.js";

/** browser.storage.local adapter for Trash SoT. */
export function createBrowserTrashStorage(
  area: browser.storage.StorageArea = browser.storage.local,
): TrashStorage {
  return {
    async get(key: string): Promise<unknown> {
      const bag = await area.get(key);
      return (bag as Record<string, unknown>)[key];
    },
    async set(key: string, value: unknown): Promise<void> {
      await area.set({ [key]: value });
    },
  };
}
