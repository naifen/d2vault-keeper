# Research: DIM inventory read surface for content scripts

**Issue:** [#2](https://github.com/naifen/d2vault-keeper/issues/2)  
**Branch:** `research/dim-inventory-read`  
**Scope:** Firefox-first browser extension content script on already-open DIM; vault items only as DIM surfaces them; no separate Bungie OAuth in the extension.  
**Primary sources:** DestinyItemManager/DIM GitHub source (master @ research time, release tag context 8.133.0). No third-party blogs.

---

## Summary

DIM has **no public inventory API** for extensions. Inventory lives in an **internal Redux store** (`state.inventory.stores`), built from a cached **Bungie `DestinyProfileResponse`** plus the Destiny 2 manifest. The Redux store is **not** attached to `window`.

For a content script that must reuse the logged-in DIM session, the **best practical surface is IndexedDB**: DIM writes the raw profile under key `profile-${membershipId}` in the default `keyval-store` / `keyval` database. That cache is the same data DIM uses for vault/character stores, including vault items derived from `profileInventory`.

Secondary signals: `BroadcastChannel('dim')` for *invalidation only* (not payloads), page-world React/Redux fishing (fragile), fetch hooking (fragile timing), DOM scrape (incomplete properties). Stream Deck is a local WebSocket control surface, not a full inventory export.

**Stable enough for product:** IDB profile key shape + vault semantics (`isVault` / `id === 'vault'`).  
**Fragile:** Redux/React fiber access, CSS-module class names, DOM-only property extraction, undocumented Stream Deck protocol details.

---

## Approaches ranked

### 1. IndexedDB profile cache (recommended)

**What:** Read the Bungie profile JSON DIM already cached after login/refresh.

| Fact | Source |
|------|--------|
| Profile cache key | `` `profile-${account.membershipId}` `` in `loadProfile` |
| Read/write via | `get` / `set` from `app/storage/idb-keyval` |
| IDB DB / store names | Constructor defaults: db `keyval-store`, object store `keyval` |
| Membership id hint | `localStorage['dim-last-membership-id']` (and destiny version) |
| Accounts list | IDB key `accounts` (`DestinyAccount[]`) |

Evidence:

```219:248:https://github.com/DestinyItemManager/DIM/blob/master/src/app/inventory/d2-stores.ts
const cachedProfileKey = `profile-${account.membershipId}`;
// ...
cachedProfileResponse = await get<DestinyProfileResponse>(cachedProfileKey);
// ...
if (firstTime) {
  return { profile: cachedProfileResponse, live: false };
}
```

```304:306:https://github.com/DestinyItemManager/DIM/blob/master/src/app/inventory/d2-stores.ts
await set(cachedProfileKey, remoteProfileResponse);
dispatch(profileLoaded({ profile: remoteProfileResponse, live: true }));
```

```3:15:https://github.com/DestinyItemManager/DIM/blob/master/src/app/storage/idb-keyval.ts
constructor(
  dbName = 'keyval-store',
  readonly storeName = 'keyval',
) { ... }
```

```82:86:https://github.com/DestinyItemManager/DIM/blob/master/src/app/accounts/platforms.ts
localStorage.setItem('dim-last-membership-id', account.membershipId);
localStorage.setItem('dim-last-destiny-version', account.destinyVersion.toString());
```

**How vault items appear in that profile (DIM’s processing):**

```100:121:https://github.com/DestinyItemManager/DIM/blob/master/src/app/inventory/store/d2-store-factory.ts
function processVault(...): DimStore {
  const store = makeVault(); // id: 'vault', isVault: true
  for (const i of profileInventory) {
    const bucket = buckets.byHash[i.bucketHash];
    // items that cannot be stored in the vault, and are therefore *in* a vault
    if (bucket && !bucket.vaultBucket && bucket.hash !== BucketHashes.SpecialOrders) {
      items.push(i);
    }
  }
  store.items = processItems(...);
}
```

```195:218:https://github.com/DestinyItemManager/DIM/blob/master/src/app/inventory/store/d2-store-factory.ts
function makeVault(): DimStore {
  return {
    destinyVersion: 2,
    id: 'vault',
    isVault: true,
    // ...
    items: [],
  };
}
```

Profile components requested (what IDB therefore tends to hold after a full load):

```74:107:https://github.com/DestinyItemManager/DIM/blob/master/src/app/bungie-api/destiny2-api.ts
export function getStores(platform: DestinyAccount): Promise<DestinyProfileResponse> {
  const components = [
    DestinyComponentType.Profiles,
    DestinyComponentType.ProfileInventories,
    DestinyComponentType.ProfileCurrencies,
    DestinyComponentType.Characters,
    DestinyComponentType.CharacterInventories,
    DestinyComponentType.CharacterProgressions,
    DestinyComponentType.CharacterEquipment,
    DestinyComponentType.ItemInstances,
    DestinyComponentType.ItemObjectives,
    DestinyComponentType.ItemSockets,
    DestinyComponentType.ItemCommonData,
    // ... plugs, records, metrics, loadouts, etc.
  ];
  return getProfile(platform, ...components);
}
```

**Content-script practicality (Firefox):**

- Content scripts share the page origin for **DOM**, **localStorage**, and **IndexedDB** (same-origin IDB as `app.destinyitemmanager.com` / beta host). No need for page JS heap access to read IDB.
- Resolve membership: `localStorage.getItem('dim-last-membership-id')` → open IDB → `get('profile-' + id)`.
- Optional: list keys matching `/^profile-/` if last-membership is missing.
- **Does not** re-auth to Bungie; reuses data DIM already fetched with the user’s DIM OAuth session.

**Gap vs full `DimItem`:**

- IDB holds **raw** `DestinyProfileResponse`, not enriched `DimItem` (sockets summary, power, rarity labels, tags, etc.).
- Tags/notes are **not** in the profile cache; they live in DIM Sync / `dimApi` state (separate IDB key `dim-api-profile` and remote DIM API)—out of scope for “vault inventory” unless product later wants annotations.
- Full `DimItem` parity requires reimplementing `buildStores` + manifest tables (`d2-manifest-*` IDB keys via `manifest-service-json.ts`). Prefer minimal: instance id, hash, quantity, bucketHash, instance/socket components from profile.

**Stability:** Medium–high for key names and profile shape (Bungie API + long-lived DIM cache pattern). Still an **internal cache**, not a supported extension API—keys can change without notice.

---

### 2. Redux inventory state (complete, but not exported)

**What DIM actually uses at runtime:**

```25:47:https://github.com/DestinyItemManager/DIM/blob/master/src/app/inventory/reducer.ts
export interface InventoryState {
  readonly stores: DimStore[];
  readonly currencies: AccountCurrency[];
  readonly live: boolean;
  readonly profileResponse?: DestinyProfileResponse;
  readonly profileError?: Error;
  readonly mockProfileData?: DestinyProfileResponse;
}
```

Selectors of interest:

```33:34:https://github.com/DestinyItemManager/DIM/blob/master/src/app/inventory/selectors.ts
export const storesSelector = (state: RootState) => state.inventory.stores;
```

```103:104:https://github.com/DestinyItemManager/DIM/blob/master/src/app/inventory/selectors.ts
export const vaultSelector = (state: RootState) => getVault(storesSelector(state));
```

```22:26:https://github.com/DestinyItemManager/DIM/blob/master/src/app/inventory/stores-helpers.ts
export const getVault = (stores: readonly DimStore[]): DimStore | undefined =>
  stores.find((s) => s.isVault);
```

`DimItem` / `DimStore` field definitions:  
- https://github.com/DestinyItemManager/DIM/blob/master/src/app/inventory/item-types.ts  
- https://github.com/DestinyItemManager/DIM/blob/master/src/app/inventory/store-types.ts  

**Why content scripts cannot just `window.store`:**

```23:35:https://github.com/DestinyItemManager/DIM/blob/master/src/app/store/store.ts
const store = createStore<RootState, any>(
  allReducers,
  composeEnhancers(applyMiddleware(observerMiddleware, thunk)),
);
// ...
export default store;
```

- Store is a **module export only**, wired via React-Redux `<Provider store={store}>` in `Root.tsx` / `Index.tsx`.
- `Window` augmentation in `store.ts` only documents `__REDUX_DEVTOOLS_EXTENSION_COMPOSE__`.
- `global.d.ts` `Window` only adds mock-profile / SW fields—**no** inventory store global.
- Redux DevTools config **excludes** inventory from sanitized state (`inventory: '<<EXCLUDED>>'`), so DevTools is a poor dump path for inventory.

**Ways to still reach Redux (all page-world, all fragile):**

1. **Inject a page script** (isolated worlds block direct access) and walk **React fiber** from a known DOM node up to `ReactReduxContext` / Provider → `store.getState().inventory`.
2. Early injection wrapping module load (not viable once DIM is already running).
3. No first-party custom event or `postMessage` inventory export found.

**Stability:** Low. Depends on React internals, bundling, and Provider structure. Highest fidelity if it works (`DimItem[]` as DIM sees them).

---

### 3. `BroadcastChannel('dim')` — invalidation only

```5:25:https://github.com/DestinyItemManager/DIM/blob/master/src/app/inventory/cross-tab.ts
export const crossTabChannel =
  'BroadcastChannel' in globalThis ? new BroadcastChannel('dim') : undefined;

export interface StoreUpdatedMessage {
  type: 'stores-updated';
}

export interface ItemMovedMessage {
  type: 'item-moved';
  itemHash: number;
  itemId: string;
  itemLocation: BucketHashes;
  sourceId: string;
  targetId: string;
  equip: boolean;
  amount: number;
}
```

- Fired after store load (`notifyOtherTabsStoreUpdated`) and on item moves.
- **No full inventory payload.**
- Use: subscribe → re-read IDB profile (or re-probe Redux) when `stores-updated` / relevant `item-moved` arrives.
- Channel name `'dim'` is a short string—stable while cross-tab feature exists, but still internal.

**Stability:** Medium for “when to refresh”; useless alone as inventory source.

---

### 4. Network interception (fetch hook in page world)

DIM loads inventory via authenticated Bungie profile calls (`getStores` → `getProfile` with OAuth bearer from `localStorage['authorization']`).

OAuth token storage:

```32:39:https://github.com/DestinyItemManager/DIM/blob/master/src/app/bungie-api/oauth-tokens.ts
const localStorageKey = 'authorization';
export function getToken(): Tokens | null {
  const tokenString = localStorage.getItem(localStorageKey);
  return tokenString ? (JSON.parse(tokenString) as Tokens) : null;
}
```

**Options:**

| Option | Notes |
|--------|--------|
| Hook `window.fetch` in page script | Capture live profile JSON; good for freshness; must inject early or patch after load and wait for next refresh |
| Reuse `authorization` + call Bungie yourself | **Separate Bungie API usage** even without new OAuth UI; needs API key / client credentials story; conflicts with “prefer DIM internals, no separate Bungie auth” product stance |

**Stability:** Fetch URL/components can change; token shape can change; using DIM’s client secret embedded in their build is not a supported integration model.

---

### 5. DOM structure (fallback, incomplete)

Inventory page: `src/app/inventory-page/` (`DesktopStores`, `StoreBuckets`, `StoreInventoryItem`).

Item tile DOM (`InventoryItem.tsx`):

```154:166:https://github.com/DestinyItemManager/DIM/blob/master/src/app/inventory/InventoryItem.tsx
return (
  <div
    id={item.index}
    onClick={...}
    title={`${item.name}\n${subtitle}${savedNotes}`}
    className={itemStyles}  // includes global class 'item'
    ref={ref}
  >
```

- Stable-ish globals: class `item`, wrapper `item-drag-container`, layout classes `store-row` / `store-cell` / `store-header` (`Stores.scss`).
- `id` = `item.index` → for instanced items equals **instance id** (`createItemIndex` returns `item.id` when not `"0"`).
- `title` = name + type (or engram power) + optional notes—not hash, not bucket, not stats.
- Drag type / React DnD carry the real `DimItem` only in page JS, not as HTML attributes.
- **No `data-hash` / `data-item-id` attributes** in source reviewed.
- Most styling is **CSS modules** (hashed class names)—do not key off those.
- Vault column: last store in desktop grid (`getVault`); header uses vault tile (`CharacterTile` vault branch). Identifying vault purely from DOM is layout-heuristic (last column / vault emblem), not a stable `data-store="vault"`.

**Stability:** Low for product-grade inventory. Useful only as last-resort presence/name check.

---

### 6. Stream Deck integration (not the read path)

DIM has a first-party **Elgato Stream Deck** bridge (`src/app/stream-deck/`), lazy-loaded WebSocket control. It pushes **summaries** (vault *count*, currencies, equipped item indices, inventory counters for consumables-like buckets)—not a full vault item property dump for third parties.

```48:60:https://github.com/DestinyItemManager/DIM/blob/master/src/app/stream-deck/util/packager.ts
export function vault(state: RootState) {
  const vault = vaultSelector(state);
  // ...
  return {
    vault: vault.items.length,
    shards: ...,
    glimmer: ...,
    brightDust: ...,
  };
}
```

**Not recommended** as Vault Keeper’s inventory read surface.

---

### 7. Custom events / module exports / public docs

| Surface | Finding |
|---------|---------|
| Custom DOM events for inventory | None found as public inventory API |
| `window.enableMockProfile` | Dev-only mock profile flag (`global.d.ts`) |
| Observable buses (`showItemPopup$`, `locateItem$`) | Module-private |
| Official extension inventory API / docs | Not present in DIM `docs/` (CONTRIBUTING, etc.) |

---

## Stability notes

| Surface | Stability | Completeness | Auth / session |
|---------|-----------|--------------|----------------|
| IDB `profile-${membershipId}` | Medium–high (internal but long-lived) | High raw components; not `DimItem` | Uses DIM’s already-fetched session data |
| Redux `inventory.stores` / vault | N/A exported; access path low | Full `DimItem` | In-page only |
| `BroadcastChannel('dim')` | Medium | Signals only | n/a |
| Fetch intercept / re-call Bungie | Medium–low | Full profile | OAuth tokens in LS; re-call = extra Bungie use |
| DOM `.item` / titles | Low | Name/type/instance id at best | n/a |
| Stream Deck | Internal protocol | Summary metrics | Local WS |

**Vault definition (canonical for this product):**  
Items on the `DimStore` with `isVault === true` and `id === 'vault'`, i.e. what `vaultSelector` returns—not “every item that could be vaulted,” and not character-held gear.

**Account-wide buckets** (mods, consumables, etc.) are assigned to the **current character** in `processCharacter`, not the vault store—match DIM’s model if “vault only” is strict.

**Freshness:** IDB can be stale until DIM refreshes; listen for `stores-updated` and/or poll `responseMintedTimestamp` on the cached profile. First paint may be IDB-only (`firstTime` path in `d2-stores.ts`).

**Firefox content script model:**

1. Prefer **direct IDB + localStorage** from the content script (same origin as DIM).
2. Only inject a page script if you need Redux `DimItem` objects or live fetch hooks.
3. Bridge page → content via `window.postMessage` / `CustomEvent` **you** define (DIM does not provide one).

---

## Implications for Vault Keeper

1. **Primary design:** On DIM hosts, content script reads `dim-last-membership-id` → IDB `keyval-store` / `keyval` → `profile-${id}` → filter vault the same way as `processVault` (profile inventory items whose bucket has no `vaultBucket`, excluding Special Orders). Optionally map instance components for power/energy/sockets without full manifest.
2. **Refresh:** Subscribe to `BroadcastChannel('dim')` for `stores-updated` / `item-moved`; re-read IDB. Optionally observe IDB if needed (no first-party DIM helper).
3. **Do not** depend on `window.store`, Redux DevTools inventory dumps, or CSS-module selectors.
4. **Avoid** implementing separate Bungie OAuth; avoid calling Bungie with lifted DIM tokens unless product later accepts that risk and ToS implications.
5. **If full `DimItem` parity is required later:** either fragile React-fiber Redux read, or reimplement a thin subset of `buildStores` + selected manifest tables from IDB—not DOM.
6. **Tags/notes** are a different store (DIM Sync); not part of vault inventory surface unless scoped later.
7. **Expect breakage** on DIM major refactors of cache keys; pin defensive checks (missing key, empty stores, schema sniff) and version logging (`DIM v…` console line from `Index.tsx`).

---

## Sources

### DIM source (primary)

| Topic | Path |
|-------|------|
| Redux store creation | https://github.com/DestinyItemManager/DIM/blob/master/src/app/store/store.ts |
| Root Provider | https://github.com/DestinyItemManager/DIM/blob/master/src/app/Root.tsx |
| App entry / observers | https://github.com/DestinyItemManager/DIM/blob/master/src/Index.tsx |
| Inventory reducer | https://github.com/DestinyItemManager/DIM/blob/master/src/app/inventory/reducer.ts |
| Inventory selectors | https://github.com/DestinyItemManager/DIM/blob/master/src/app/inventory/selectors.ts |
| Store helpers (`getVault`) | https://github.com/DestinyItemManager/DIM/blob/master/src/app/inventory/stores-helpers.ts |
| D2 store/vault factory | https://github.com/DestinyItemManager/DIM/blob/master/src/app/inventory/store/d2-store-factory.ts |
| Load stores + IDB profile cache | https://github.com/DestinyItemManager/DIM/blob/master/src/app/inventory/d2-stores.ts |
| Profile API components | https://github.com/DestinyItemManager/DIM/blob/master/src/app/bungie-api/destiny2-api.ts |
| OAuth tokens in localStorage | https://github.com/DestinyItemManager/DIM/blob/master/src/app/bungie-api/oauth-tokens.ts |
| IDB keyval wrapper | https://github.com/DestinyItemManager/DIM/blob/master/src/app/storage/idb-keyval.ts |
| Accounts + last membership | https://github.com/DestinyItemManager/DIM/blob/master/src/app/accounts/platforms.ts |
| Cross-tab channel | https://github.com/DestinyItemManager/DIM/blob/master/src/app/inventory/cross-tab.ts |
| Item / store types | `item-types.ts`, `store-types.ts` under `src/app/inventory/` |
| Item DOM | https://github.com/DestinyItemManager/DIM/blob/master/src/app/inventory/InventoryItem.tsx |
| Drag wrapper | https://github.com/DestinyItemManager/DIM/blob/master/src/app/inventory/DraggableInventoryItem.tsx |
| Desktop inventory layout | https://github.com/DestinyItemManager/DIM/blob/master/src/app/inventory-page/DesktopStores.tsx |
| Store layout CSS | https://github.com/DestinyItemManager/DIM/blob/master/src/app/inventory-page/Stores.scss |
| Item index ids | https://github.com/DestinyItemManager/DIM/blob/master/src/app/inventory/store/item-index.ts |
| Stream Deck packager | https://github.com/DestinyItemManager/DIM/blob/master/src/app/stream-deck/util/packager.ts |
| Window globals | https://github.com/DestinyItemManager/DIM/blob/master/src/global.d.ts |
| Manifest IDB keys | https://github.com/DestinyItemManager/DIM/blob/master/src/app/manifest/manifest-service-json.ts |

### Explicit non-findings

- No documented “extension inventory API” in DIM’s `docs/` tree.
- No inventory payload on `BroadcastChannel`.
- No stable `data-*` item attributes for scraping full properties.

### Research limits

- Inspected **published source** on GitHub `master`, not a live browser session.
- CSS module hashes and React fiber field names were not runtime-probed; classified fragile by construction.
- Exact production host list (`app.destinyitemmanager.com` vs beta) is deployment config; match extension `matches` to whatever host the user runs.
