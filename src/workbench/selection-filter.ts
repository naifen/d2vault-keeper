/**
 * Selection filter pure builder.
 * Maps selected Vault items → DIM filter string that exactly targets those items.
 * Prefer instance `id:` terms OR-joined. Never invent broken `id:` for synthetic keys.
 */

/** Synthetic stack keys from extract (non-instanced) use this prefix. */
const SYNTHETIC_STACK_PREFIX = "stack-";

/**
 * True when `id` is a real Destiny item instance id safe for DIM `id:` filters.
 * Synthetic extract keys (`stack-…`) and empty/`0` are not.
 */
export function isVaultInstanceId(id: string): boolean {
  if (!id || id === "0") return false;
  if (id.startsWith(SYNTHETIC_STACK_PREFIX)) return false;
  return true;
}

/**
 * Build a **Selection filter** for the given Vault items (typically the multi-select).
 *
 * - Real instance ids → `id:{instanceId}` terms, OR-joined (`id:a or id:b`)
 * - Empty selection → `""`
 * - Synthetic/non-instance keys are skipped (no fabricated `id:` terms)
 * - Duplicate ids appear once, first-seen order preserved
 */
export function buildSelectionFilter(items: readonly { id: string }[]): string {
  const terms: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!isVaultInstanceId(item.id) || seen.has(item.id)) continue;
    seen.add(item.id);
    terms.push(`id:${item.id}`);
  }
  return terms.join(" or ");
}
