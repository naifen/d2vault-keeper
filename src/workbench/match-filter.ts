/**
 * Best-effort Matches: vault cache rows that fit the current DIM filter string.
 * Not a full DIM search parser — covers Selection filter `id:` terms and common
 * tags/exotic/text so Results → Matches is honest about the query card.
 */

import type { VaultItem } from "../inventory/types.js";

/** Extract `id:…` instance terms from a DIM filter string (order preserved, unique). */
export function extractIdTerms(query: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /\bid:([^\s|)]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(query)) !== null) {
    const id = m[1]?.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * True if one vault item satisfies a single atomic token (after splitting on ` or `).
 * Unknown operator tokens that cannot be evaluated fail closed for that token
 * only when combined with evaluable constraints — free text matches name/type/tier.
 */
function itemMatchesAtom(item: VaultItem, atom: string): boolean {
  const t = atom.trim();
  if (!t) return true;
  const lower = t.toLowerCase();

  if (lower.startsWith("id:")) {
    return item.id === t.slice(3).trim() || item.id === lower.slice(3).trim();
  }

  if (lower === "-is:exotic" || lower === "not:exotic") {
    return item.isExotic !== true && normalize(item.tierType ?? "") !== "exotic";
  }
  if (lower === "is:exotic") {
    return item.isExotic === true || normalize(item.tierType ?? "") === "exotic";
  }

  if (lower.startsWith("-tag:")) {
    const tag = lower.slice(5);
    return normalize(item.tag ?? "") !== tag;
  }
  if (lower.startsWith("tag:")) {
    return normalize(item.tag ?? "") === lower.slice(4);
  }

  // is:weapon / is:handcannon / is:armor … → substring on itemType or name
  if (lower.startsWith("is:") || lower.startsWith("-is:")) {
    const neg = lower.startsWith("-is:");
    const kind = (neg ? lower.slice(4) : lower.slice(3)).replace(/[^a-z0-9]/g, "");
    if (!kind || kind === "exotic") {
      // exotic handled above; empty kind ignore
      return true;
    }
    const hay = `${item.itemType ?? ""} ${item.name}`.toLowerCase().replace(/[^a-z0-9]+/g, "");
    // DIM-style compact tokens: handcannon vs "Hand Cannon"
    const hit =
      hay.includes(kind) ||
      hay.includes(kind.replace(/cannon$/, "cannon")) ||
      // common aliases
      (kind === "weapon" && /weapon|cannon|rifle|shotgun|bow|sword|glaive|sidearm|smg|machinegun|lmg|sniper|fusion|trace|grenade|rocket|linear/.test(hay)) ||
      (kind === "armor" && /armor|helmet|gauntlet|chest|leg|classitem|cloak|bond|mark/.test(hay));
    return neg ? !hit : hit;
  }

  // Bare free-text token → name / type / tier / tag substring
  const hay = normalize(`${item.name} ${item.itemType ?? ""} ${item.tierType ?? ""} ${item.tag ?? ""}`);
  return hay.includes(normalize(t));
}

/**
 * One OR-group is AND of space-separated atoms (DIM: space ≈ AND, `or` ≈ OR).
 */
function itemMatchesGroup(item: VaultItem, group: string): boolean {
  // Split on whitespace but keep operator tokens intact
  const atoms = group
    .split(/\s+/)
    .map((a) => a.trim())
    .filter(Boolean);
  if (atoms.length === 0) return true;
  return atoms.every((a) => itemMatchesAtom(item, a));
}

/**
 * Filter vault items by DIM-ish query for Matches tab.
 * Empty / whitespace query → all items (vault browse).
 */
export function matchVaultItems(
  items: readonly VaultItem[],
  query: string,
): VaultItem[] {
  const q = query.trim();
  if (!q) return [...items];

  // Split top-level OR groups (DIM uses " or ")
  const groups = q.split(/\s+or\s+/i).map((g) => g.trim()).filter(Boolean);
  if (groups.length === 0) return [...items];

  return items.filter((item) => groups.some((g) => itemMatchesGroup(item, g)));
}
