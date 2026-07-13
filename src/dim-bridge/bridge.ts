/**
 * dim-bridge: apply/clear DIM inventory filter via injectable search input.
 */

import { setNativeInputValue } from "./dom-search.js";
import type { ApplyFilterResult, DimBridge, SearchInputLocator } from "./types.js";

export function createDimBridge(
  doc: Document,
  locator: SearchInputLocator,
): DimBridge {
  function applyToInput(query: string): ApplyFilterResult {
    try {
      const input = locator.findSearchInput(doc);
      if (!input) {
        return {
          ok: false,
          query,
          applied: false,
          error: "DIM search input not found (open inventory page).",
        };
      }
      input.focus();
      setNativeInputValue(input, query);
      return { ok: true, query, applied: true };
    } catch (err) {
      return {
        ok: false,
        query,
        applied: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return {
    applyFilter(query: string): ApplyFilterResult {
      // Soft-fail invalid filters: still write; DIM matches nothing for bad queries.
      return applyToInput(query);
    },
    clearFilter(): ApplyFilterResult {
      return applyToInput("");
    },
    readFilter(): string | null {
      const input = locator.findSearchInput(doc);
      return input ? input.value : null;
    },
  };
}
