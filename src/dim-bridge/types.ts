/**
 * dim-bridge public surface — DOM/Redux details stay behind this interface.
 * Trash/agent/workbench must not reach into page DOM selectors.
 */

export interface ApplyFilterResult {
  ok: boolean;
  query: string;
  /** True when a search input was found and updated. */
  applied: boolean;
  error?: string;
}

export interface DimBridge {
  /** Write filter string into DIM search (same path a user would). */
  applyFilter(query: string): ApplyFilterResult;
  /** Clear search to empty string. */
  clearFilter(): ApplyFilterResult;
  /** Current value of the search input if found. */
  readFilter(): string | null;
}

export interface SearchInputLocator {
  findSearchInput(doc: Document): HTMLInputElement | null;
}
