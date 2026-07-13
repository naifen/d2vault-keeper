/**
 * DOM helpers for DIM inventory search box.
 * Prefer structure/ARIA over CSS-module hashes (research #3).
 */

import type { SearchInputLocator } from "./types.js";

/** Set input value the React/downshift-friendly way + fire input/change. */
export function setNativeInputValue(input: HTMLInputElement, value: string): void {
  const proto = Object.getPrototypeOf(input) as HTMLInputElement;
  const descriptor =
    Object.getOwnPropertyDescriptor(proto, "value") ??
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  if (descriptor?.set) {
    descriptor.set.call(input, value);
  } else {
    input.value = value;
  }

  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * Locate DIM header search: text input in combobox / search role, or placeholder heuristics.
 */
function asTextInput(el: Element): HTMLInputElement | null {
  // Duck-type: works across jsdom / browser realms (instanceof can fail across windows).
  if (el.tagName !== "INPUT") return null;
  const input = el as HTMLInputElement;
  if (input.type === "hidden" || input.disabled) return null;
  return input;
}

export function findDimSearchInput(doc: Document): HTMLInputElement | null {
  const candidates: HTMLInputElement[] = [];

  // Combobox pattern (downshift / SearchBar)
  for (const el of doc.querySelectorAll('input[role="combobox"], [role="combobox"] input')) {
    const input = asTextInput(el);
    if (input) candidates.push(input);
  }

  // Explicit search type
  for (const el of doc.querySelectorAll('input[type="search"]')) {
    const input = asTextInput(el);
    if (input) candidates.push(input);
  }

  // Placeholder / aria-label heuristics used by DIM SearchBar variants
  for (const el of doc.querySelectorAll("input")) {
    const input = asTextInput(el);
    if (!input) continue;
    const ph = (input.placeholder ?? "").toLowerCase();
    const aria = (input.getAttribute("aria-label") ?? "").toLowerCase();
    if (
      ph.includes("search") ||
      aria.includes("search") ||
      ph.includes("filter") ||
      aria.includes("filter")
    ) {
      candidates.push(input);
    }
  }

  // Prefer visible inputs in document order (header first).
  for (const input of candidates) {
    if (input.offsetParent !== null || input.getClientRects().length > 0) {
      return input;
    }
  }
  return candidates[0] ?? null;
}

export const defaultSearchLocator: SearchInputLocator = {
  findSearchInput: findDimSearchInput,
};
