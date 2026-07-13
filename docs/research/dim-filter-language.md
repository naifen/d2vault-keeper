# Research: DIM filter language and programmatic apply path

**Issue:** [#3](https://github.com/naifen/d2vault-keeper/issues/3)  
**Branch:** `research/dim-filter-language`  
**Scope:** Primary sources only — DIM source (`DestinyItemManager/DIM`) and official wiki.  
**Goal:** Enough detail for an Intention → DIM filter Agent loop (prefer internals, fall back DOM; no separate Bungie auth).

---

## Summary

DIM’s inventory search is a **custom query language** with its own lexer + AST parser (`query-parser.ts`), not a third-party grammar (no PEG.js / SQL / Lucene). Queries become boolean `ItemFilter` functions applied client-side to `DimItem`s.

**Drive path (canonical):** write a filter **string** into Redux `shell.searchQuery` via `setSearchQuery`. UI, Stream Deck, and “set filter” buttons all use that action. There is **no public HTTP filter API** and **no URL query param** that carries the search string. Inventory **dims** non-matching items (does not remove them from the DOM tree).

For an extension Agent loop: **emit valid DIM filter strings**, then **apply via DOM search box** (reliable without Redux access) or **hook `setSearchQuery` / store** if page internals are reachable. Stream Deck’s WebSocket `search` message is the only first-party external “API” shape.

---

## Grammar / operators

### Source of truth

Lazy BNF and implementation live in:

- [`src/app/search/query-parser.ts`](https://github.com/DestinyItemManager/DIM/blob/master/src/app/search/query-parser.ts) — lexer, `parseQuery`, AST, `canonicalizeQuery`
- [`src/app/search/search-filter.ts`](https://github.com/DestinyItemManager/DIM/blob/master/src/app/search/search-filter.ts) — AST → `ItemFilter`, validation, range comparators
- [`src/app/search/filter-types.ts`](https://github.com/DestinyItemManager/DIM/blob/master/src/app/search/filter-types.ts) — filter format types
- Wiki: [Item Search](https://github.com/DestinyItemManager/DIM/wiki/Item-Search)

### BNF (from source comments)

```
<query>      ::= <term> | <term> <term>
<terms>      ::= <term> { " " <term> }
<term>       ::= <string> | <filter> | <group> | <boolean>
<filter>     ::= ["-"]<filterName>:<filterValue>[<operator><number>]
<filterName> ::= known names (is, notes, perks, tag, stat, …)
<filterValue>::= <keyword> | "stat:" <statName> | <string>
<operator>   ::= "" | "=" | "<" | "<=" | ">" | ">="
<group>      ::= "(" <query> ")"
<boolean>    ::= "or" | "not" | "and"
<string>     ::= WORD | "..." | '...'
```

Lexer also accepts:

- **`/* comment */`** — leading comments name saved searches (`/* My Favorite Search */ is:handcannon`)
- **Smart quotes** normalized to ASCII
- Query lowercased before lex
- **`not:`** filter keyword normalized to `not` + `is:` (e.g. `not:maxpower` → `-is:maxpower`)

### AST node types (`QueryAST`)

| `op` | Meaning |
|------|---------|
| `and` | All operands true (n-ary) |
| `or` | Any operand true (n-ary) |
| `not` | Negate single operand |
| `filter` | `{ type: filterName, args: string }` — e.g. type=`is`, args=`weapon` |
| `noop` | Empty / error placeholder |

### Boolean / grouping semantics

| Syntax | Role | Precedence (higher binds tighter) |
|--------|------|-----------------------------------|
| whitespace between terms | **implicit `and`** | 1 (lowest) |
| `or` | disjunction | 2 |
| `and` | explicit conjunction | 3 (highest binary) |
| `-` or `not` | unary negation | atom-level |
| `( … )` | grouping | — |

**Important:** Implicit `and` is **weaker** than explicit `or`/`and`. Examples from tests:

- `is:blue is:weapon or is:armor not:maxpower` ≡ `is:blue and (is:weapon or is:armor) and -is:maxpower`
- `is:weapon and is:sniperrifle or not is:armor and modslot:arrival` ≡ `(is:weapon and is:sniperrifle) or (-is:armor and modslot:arrival)`

Bare words become free-text `keyword` filters: `cluster tracking` ≡ `"cluster" and "tracking"`.

### Comparison operators (range / stat)

`rangeStringToComparator` accepts:

| Input | Comparator |
|-------|------------|
| `55` or `=55` | `===` |
| `<55` | `<` |
| `<=55` | `<=` |
| `>55` | `>` |
| `>=55` | `>=` |

Floats allowed (`\d+(?:\.\d+)?`). Overload words (e.g. season tags, power caps) map via filter `overload` tables before numeric compare.

Stat filters use **two colons**: `stat:<statName>:<op?number>`  
e.g. `stat:range:>=50`, `basestat:total:<55`, `basestat:recovery+discipline:>=18` (`+` sum, `&` average).

### Filter formats (`FilterFormat`)

Declared per filter definition (`filter-types.ts`):

| Format | Syntax shape | Example |
|--------|--------------|---------|
| `simple` | `is:<keyword>` / `not:<keyword>` | `is:weapon`, `is:crafted` |
| `query` | `<keyword>:<suggestion>` (closed set) | `tag:favorite`, `source:lastwish` |
| `multiquery` | `<keyword>:<s>+<s>` | multi-select suggestions |
| `freeform` | `<keyword>:<anything>` | `name:"Hard Light"`, `notes:good`, `perkname:voltshot` |
| `range` | `<keyword>:<op?number|overload>` | `power:>=1800`, `season:arrival`, `year:7` |
| `stat` | `<keyword>:<stat>:<op?number>` | `stat:mobility:>20` |
| `custom` | reserved; **not wired** in matcher today | — |

Invalid filter pieces → whole query matches **no items** (`() => false`). Empty query → match-all (`stubTrue`); archive dimming is separate UI logic.

### Representative keywords (not exhaustive)

Registry assembled in [`item-search-filter.ts`](https://github.com/DestinyItemManager/DIM/blob/master/src/app/search/items/item-search-filter.ts) from modules under `search/items/search-filters/`. Live list is always **Filter Help** in-app (`FilterHelp.tsx`).

**Simple (`is:`):** `weapon`, `armor`, `equipped`, `locked`/`unlocked`, `crafted`/`shaped`, `exotic` (via rarity aliases), `dupe`, `tagged`, `hasnotes`, `maxpower`, `masterwork`, `invault`, `incurrentchar`, `inloadout`, `wishlist`, class (`titan`/`hunter`/`warlock`), damage (`arc`/`solar`/`void`/…), ammo (`primary`/`special`/`heavy`), buckets (`handcannon`, `helmet`, …), etc.

**Query / freeform:** `tag:`, `name:`/`exactname:`, `notes:`, `description:`, `perk:`/`perkname:`/`exactperk:`, `source:`, `foundry:`, `breaker:`, `inloadout:"name"`, `id:`, `hash:`, `modslot:`, `wishlistnotes:`, …

**Range:** `light`/`power`, `season`, `year`, `stack`, `weaponlevel`, `tier`, `energycapacity`, `masterwork` (also simple/query), `count`, `kills` (optional `kills:pve:>=100`).

**Stat:** `stat:`, `basestat:`; loadout helpers `maxstatloadout:`, `maxstatvalue:`, …

**Canonicalization:** `canonicalizeQuery(ast)` produces a stable string (for history/dedupe); max saveable length **2048**.

Official language summary (wiki):

> `and`, `or`, and `not` keywords… any two terms next to each other are implicitly `and`… negate with `-` or `not`… group with parentheses… ranges like `stat:range:>=50` or `power:<1900`.

---

## How filters are applied in UI / code

### Pipeline

```
user types (or dispatch setSearchQuery)
        │
        ▼
shell.searchQuery  (+ searchQueryVersion for external resets)
        │
        ▼
filterFactorySelector(query)  // makeSearchFilterFactory
  1. parseQuery(query)        // lexer → AST
  2. transformAST → ItemFilter
  3. invalid node → () => false
        │
        ▼
searchFilterSelector / filteredItemsSelector
        │
        ▼
ConnectedInventoryItem: searchHidden = allowFilter && valid && !filter(item)
  → CSS class dims non-matches (items stay in DOM)
```

Key files:

| File | Role |
|------|------|
| `src/app/search/SearchFilter.tsx` | Header search; `dispatch(setSearchQuery(query, false))` on change |
| `src/app/search/SearchBar.tsx` | Uncontrolled combobox; debounced query; syncs when `searchQueryVersion` bumps |
| `src/app/shell/actions.ts` | `setSearchQuery`, `toggleSearchQueryComponent` |
| `src/app/shell/reducer.ts` | Stores `searchQuery`, increments `searchQueryVersion` when `updateVersion=true` |
| `src/app/shell/selectors.ts` | `querySelector` → `state.shell.searchQuery` |
| `src/app/search/items/item-search-filter.ts` | `filterFactorySelector`, `searchFilterSelector`, `filteredItemsSelector`, `queryValidSelector` |
| `src/app/inventory/ConnectedInventoryItem.tsx` | Applies `searchFilter` → `searchHidden` |
| `src/app/search/FilterHelp.tsx` | Full keyword catalog UI (`/…/filter help` via header menu) |
| `src/app/dim-ui/SetFilterButton.tsx` | `dispatch(setSearchQuery(filter))` from item UI |

### UI behaviors (wiki + source)

- **Hotkeys:** `F` focus search; `Shift+F` clear + focus (`Header.tsx`).
- **Route change clears search:** `Header` dispatches `setSearchQuery('')` on path change.
- **Bulk actions / transfer search** operate on the current matching set (search menu, character tile “Transfer search…”).
- **Loadouts page** uses a separate loadout search config (`SearchType.Loadout`); inventory/optimizer/records use item filters (placeholders differ).
- **Organizer / Compare / Vendors / Records** reuse the same language with page-specific item pools.

### In-app documentation

- Search menu → **Filter help…** → `FilterHelp` table (all non-deprecated definitions + descriptions from i18n).
- Wiki [Item Search](https://github.com/DestinyItemManager/DIM/wiki/Item-Search) + [Item Search Useful Queries](https://github.com/DestinyItemManager/DIM/wiki/Item-Search-Useful-Queries).

---

## Programmatic drive options

Ranked for a browser extension Agent loop **without separate Bungie auth** (user already logged into DIM).

### 1. Redux action `setSearchQuery` (internals — preferred when reachable)

```ts
// DIM source shape (typesafe-actions)
setSearchQuery(query: string, updateVersion: boolean = true)
// → { type: 'shell/SEARCH_QUERY', payload: { query, updateVersion } }
```

| Caller | `updateVersion` | Effect |
|--------|-----------------|--------|
| `SearchFilter` typing | `false` | Updates store; SearchBar keeps local input |
| Stream Deck, SetFilterButton, Header clear | default `true` | Bumps `searchQueryVersion` → SearchBar **resets** input to query |

Also: `toggleSearchQueryComponent(component)` toggles a substring in/out of the query and bumps version.

**Extension note:** Redux store is not a public API. Access requires content-script injection into page world (e.g. hook `window` store, React fiber, or monkey-patch). Fragile across DIM builds.

### 2. Stream Deck message (external protocol, same apply path)

[`msg-handlers.ts`](https://github.com/DestinyItemManager/DIM/blob/master/src/app/stream-deck/msg-handlers.ts) `searchHandler`:

```ts
interface SearchAction {
  action: 'search';
  query: string;
  page: string;       // e.g. 'inventory'
  append?: boolean;   // append to existing query
  pullItems?: boolean;
  sendToVault?: boolean;
}
```

Search-only mode: optional page navigation via `setRouterLocation`, then `dispatch(setSearchQuery(query))`. Same handler can **evaluate** `filterFactorySelector(state)(query)` over `allItems` and move items without leaving the query in the bar.

Wiki: [Elgato Stream Deck Integration](https://github.com/DestinyItemManager/DIM/wiki/Elgato-Stream-Deck-Integration). Plugin is third-party; protocol implemented in DIM. Useful as a **shape** for intentional external control, not as something our extension must use.

### 3. DOM search box (fallback — practical for content scripts)

- Header contains `SearchFilter` → `SearchBar` with an **uncontrolled** `<input>` (downshift/combobox).
- Input changes call debounced `onQueryChanged` → `setSearchQuery(query, false)`.
- External set of the controlled store path requires **`searchQueryVersion` bump** for the input to show the new string; pure DOM value set may desync unless input events fire the combobox path.

**Recommended DOM procedure (conceptual):**

1. Ensure inventory (or target) page is active (search clears on navigation).
2. Focus header search input (`F` hotkey or focus).
3. Set value via native input value setter + `input`/`change` events so downshift’s `onInputValueChange` runs, **or** select-all + `document.execCommand`/`InputEvent` insert.
4. Wait for debounce (~store update) then observe dimmed items / match count UI.
5. Validate string offline if possible: mirror `parseAndValidateQuery` against a static keyword list (keywords churn with seasons).

DOM is stable enough for Agent loops; CSS modules hash class names, so prefer role/placeholder/structure over hashed classes.

### 4. URL / deep link

**No.** Search string is **not** in the URL. Account routes are `/{membershipId}/d{1|2}/…` (`routes.ts`). Navigating clears the query. Do not plan on shareable filter URLs.

### 5. Public HTTP / Bungie API

**No DIM filter endpoint.** Filters run entirely in the client against already-loaded inventory. Extension should not re-auth to Bungie for filter apply; use DIM’s session and inventory as source of truth.

### 6. Evaluating filters without UI

Internally: `filterFactorySelector(state)(query)` returns `(item: DimItem) => boolean`. Stream Deck `searchItems` does this. An Agent that only needs **matching item IDs** could inject the same factory if it has page-world access; otherwise apply via search bar and scrape dimmed vs visible icons (DOM-only, lossy).

---

## Gaps for Intention → DIM filter Agent loop

| Gap | Impact | Mitigation |
|-----|--------|------------|
| **Keyword surface is large and seasonal** | LLM invents invalid `is:` / `source:` / stat names → empty results | Prefer short, common terms; optional offline validate against Filter Help scrape or DIM `isFilters`/`kvFilters` dump; Agent retry on zero matches |
| **Precedence is non-obvious** | Implicit `and` vs `or` surprises | Emit explicit `and`/`or` and parentheses in Agent output; canonicalize mentally with test cases |
| **No stable external apply API** | Extension cannot call documented SDK | DOM search box or Redux hook; document fragility |
| **Debounced / uncontrolled input** | Naive `input.value = q` may not update store | Fire proper input events; or page-world `dispatch(setSearchQuery(q))` with `updateVersion=true` |
| **Route clears search** | Navigation drops filter | Re-apply after inventory load; avoid mid-loop route changes |
| **Invalid ⇒ match nothing** | Silent failure | Treat “all dimmed / zero bulk count” as parse or keyword error; repair query |
| **Loadout vs item search** | Wrong filter set on loadouts page | Stay on inventory (or records/vendors) for item Intention |
| **Quotes / locales** | Multi-word names need quotes; perk names may be non-English | Use `quoteFilterString` rules: quote if whitespace/`()`; escape `\`, `"` |
| **Comments in query** | Useful for named saved searches; not needed for apply | Optional `/* intention id */` prefix for human audit; does not affect matching of following filters |
| **No filter compile from Intention in DIM** | Agent owns NL → filter string | This research is the compile target only |
| **`custom` format unwired** | Cannot rely on custom format defs | Stick to simple/query/freeform/range/stat |
| **Power/season overloads lag seasons** | `power:pinnaclecap` etc. may lag | Prefer numeric power when precision matters |

### Suggested Agent loop contract

1. **Intention** (NL) → **filter string** (this grammar).
2. **Validate** (optional): parentheses balance, only known operators, prefer known keywords; max length 2048.
3. **Apply** on DIM inventory page via DOM or `setSearchQuery`.
4. **Observe** match feedback (item dimming / results UI / bulk action count).
5. **Repair** if zero matches or invalid: simplify terms, drop speculative keywords, re-apply.
6. Downstream actions (move/tag) are **out of scope** of this ticket (see related research).

### Minimal starter vocabulary for the Agent

```
is:weapon | is:armor | is:exotic | is:legendary | is:crafted | is:equipped
is:masterwork | is:dupe | is:tagged | is:inloadout | is:invault | is:incurrentchar
tag:favorite|keep|junk|infuse|archive|none
name:"…" | perkname:"…" | notes:…
power:>=N | weaponlevel:>=N | year:N
stat:STAT:>=N | basestat:total:>=N | basestat:recovery+discipline:>=N
( … ) | and | or | - / not
```

---

## Sources

### DIM source (primary)

| Path | What |
|------|------|
| https://github.com/DestinyItemManager/DIM/blob/master/src/app/search/query-parser.ts | Grammar BNF, lexer, AST, canonicalize |
| https://github.com/DestinyItemManager/DIM/blob/master/src/app/search/query-parser.test.ts | Equivalence / precedence cases |
| https://github.com/DestinyItemManager/DIM/blob/master/src/app/search/search-filter.ts | AST→filter, range ops, validation |
| https://github.com/DestinyItemManager/DIM/blob/master/src/app/search/filter-types.ts | Format types, `FilterDefinition` |
| https://github.com/DestinyItemManager/DIM/blob/master/src/app/search/search-config.ts | `isFilters` / `kvFilters` maps |
| https://github.com/DestinyItemManager/DIM/blob/master/src/app/search/items/item-search-filter.ts | Filter module registry, selectors |
| https://github.com/DestinyItemManager/DIM/blob/master/src/app/search/items/search-filters/* | Keyword definitions |
| https://github.com/DestinyItemManager/DIM/blob/master/src/app/search/SearchFilter.tsx | Header wiring |
| https://github.com/DestinyItemManager/DIM/blob/master/src/app/search/SearchBar.tsx | Input / version sync |
| https://github.com/DestinyItemManager/DIM/blob/master/src/app/search/FilterHelp.tsx | In-app filter docs |
| https://github.com/DestinyItemManager/DIM/blob/master/src/app/shell/actions.ts | `setSearchQuery`, `toggleSearchQueryComponent` |
| https://github.com/DestinyItemManager/DIM/blob/master/src/app/shell/reducer.ts | `searchQuery` / `searchQueryVersion` |
| https://github.com/DestinyItemManager/DIM/blob/master/src/app/shell/selectors.ts | `querySelector` |
| https://github.com/DestinyItemManager/DIM/blob/master/src/app/shell/Header.tsx | Clear on route change, hotkeys |
| https://github.com/DestinyItemManager/DIM/blob/master/src/app/inventory/ConnectedInventoryItem.tsx | Visual apply (`searchHidden`) |
| https://github.com/DestinyItemManager/DIM/blob/master/src/app/dim-ui/SetFilterButton.tsx | Programmatic set from UI |
| https://github.com/DestinyItemManager/DIM/blob/master/src/app/stream-deck/msg-handlers.ts | External search + evaluate path |
| https://github.com/DestinyItemManager/DIM/blob/master/src/app/stream-deck/interfaces.ts | `SearchAction` shape |
| https://github.com/DestinyItemManager/DIM/blob/master/src/app/routes.ts | Route shape (no search param) |

### Official wiki (primary)

| Page | What |
|------|------|
| https://github.com/DestinyItemManager/DIM/wiki/Item-Search | Language overview, stats, bulk ops, shortcuts |
| https://github.com/DestinyItemManager/DIM/wiki/Item-Search-Useful-Queries | Example queries / workflows |
| https://github.com/DestinyItemManager/DIM/wiki/Elgato-Stream-Deck-Integration | External control context |

### Not used as primary

- Third-party filter galleries / blogs (may lag or invent syntax).
- DeepWiki AI summaries (used only as navigation aid; claims verified against source above).
