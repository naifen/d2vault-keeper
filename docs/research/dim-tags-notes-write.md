# Research: DIM tags and notes write path

**Ticket:** [#4](https://github.com/naifen/d2vault-keeper/issues/4)  
**Branch:** `research/dim-tags-notes-write`  
**Primary sources reviewed:** DestinyItemManager/DIM (`master` ~`028644e`, 2026-07-13), DestinyItemManager/dim-api (`master` ~`b55c234`, 2026-07-09), `@destinyitemmanager/dim-api-types@1.40.0`  
**Scope:** How DIM sets item tags/notes natively; whether an extension can invoke the same write path; shapes, persistence, failure modes — for hybrid Trash Mirror (extension source of truth; always Mirror into DIM).

---

## Summary

- **Tags and notes are DIM-owned data**, not Bungie.net inventory fields. They live in DIM’s Redux `dimApi` state, IndexedDB, and (if enabled) DIM Sync cloud (`api.destinyitemmanager.com`).
- **Native in-app write path:** UI → thunks `setTag` / `setNote` (or bulk equivalents) → Redux actions → `dimApi` reducer (optimistic apply + enqueue) → debounced IndexedDB save → debounced `flushUpdates` → `POST /profile` with `action: 'tag'` or `'item_hash_tag'`.
- **DIM does not expose the Redux store or tag/note actions on `window`.** There is no first-party “extension hook” for dispatch from a content script’s isolated world.
- **There is an official third-party write path:** the **DIM Sync API**, documented as open to community apps (light.gg, Destiny Recipes, D2Checklist already write tags). Same payload shapes DIM uses internally after queue flush.
- **For hybrid Trash Mirror:** prefer **DIM Sync API write** (same server path as DIM) using session credentials available on the DIM origin, or a registered DIM API app. **Live in-tab UI** will not update until DIM reloads profile data unless you also touch Redux/DOM. Fall back to **DOM automation** of the item popup only if API write is unavailable. Page-world Redux hacks are fragile and unsupported.

---

## Tag model

### Values

Canonical `TagValue` (shared client + API types):

| Value | UI role (DIM `tagConfig`) | Hotkey |
|-------|---------------------------|--------|
| `favorite` | Keep / favorite | shift+1 |
| `keep` | Keep | shift+2 |
| `junk` | Junk | shift+3 |
| `infuse` | Infusion fuel | shift+4 |
| `archive` | Archive (prefer vault) | shift+5 |

- Type: `TagValue = 'favorite' | 'keep' | 'infuse' | 'junk' | 'archive'`
- UI clear command: `TagCommand = TagValue | 'clear'` → maps to `tag: undefined` / payload `null`
- Optional extension field on annotations: `v?: TagVariant` (`PVP=1`, `PVE=2`) for keep variants; clients that ignore it still show base tag

Sources: `src/app/inventory/dim-item-info.ts` (`tagConfig`); `@destinyitemmanager/dim-api-types` `ItemAnnotation` / `TagValue`; dim-api `api/shapes/item-annotations.ts`.

### Addressing

| Kind | Key | Storage | Update action |
|------|-----|---------|---------------|
| Instanced gear | Instance id string (`item.id`) | `dimApi.profiles[accountKey].tags[itemId]` | `tag` |
| Uninstanced (shaders/mods/etc.) | Item definition `hash` | `dimApi.itemHashTags[hash]` | `item_hash_tag` |

- Account key: `` `${platformMembershipId}-d${destinyVersion}` ``
- Instanced annotations also store optional `craftedDate` (UTC epoch **seconds**) so tags survive reshape when instance id changes
- Read helpers: `getTag` / `getNotes` in `dim-item-info.ts`; selectors `itemInfosSelector`, `tagSelector`, `notesSelector`
- Items with `!item.taggable` are no-ops in `setTag` / `setNote`

### Payload shape (API / queue)

```ts
// Instanced
{ action: 'tag', payload: ItemAnnotation }
// ItemAnnotation:
//   id: string
//   tag?: TagValue | null   // null clears
//   notes?: string | null   // null clears
//   craftedDate?: number
//   v?: TagVariant

// Uninstanced
{ action: 'item_hash_tag', payload: ItemHashTag }
// ItemHashTag: { hash: number, tag?, notes?, v? }

// Cleanup deleted instances
{ action: 'tag_cleanup', payload: string[] /* item ids */ }
```

Client queue entries additionally carry `before` (rollback), `platformMembershipId`, `destinyVersion` (`ProfileUpdateWithRollback` in `src/app/dim-api/api-types.ts`). On the wire, `postUpdates` strips to `{ action, payload }` only.

---

## Notes model

- Free-text field on the same annotation object as tags (`notes?: string | null`)
- **UI max length:** `1024` (`NotesArea.maxLength`); bulk note UI reuses the same limit
- Empty / clear: `notes || null` in reducer → `null` clears; empty annotation deleted when both tag and notes gone
- Helpers beyond replace:
  - `appendNote` — append to existing (hashtag-aware `appendedToNote`)
  - `removeFromNote` — strip matching text
  - Bulk: `useBulkNote` modes `replace` | `append` | `remove`
- Notes are **not** separate from tags in the API: both use `action: 'tag'` / `'item_hash_tag'`; successive tag+note updates to the same id are **compacted** in the flush queue into one payload merge

---

## Write paths

### A. In-app UI (canonical client path)

```
ItemTagSelector.onChange / NotesArea save / bulkTagItems / bulk note
    → dispatch setTag(item, tag) | setNote(item, note) | setItemTagsBulk | …
    → setItemTag | setItemNote | setItemHashTag | setItemHashNote
    → dimApi reducer setTag/setNote helpers
         1. applyUpdateLocally (optimistic)
         2. push ProfileUpdateWithRollback to updateQueue
    → observers (installObservers):
         profile-observer: debounce 1s → IndexedDB key 'dim-api-profile'
         queue-observer:   debounce 1s → flushUpdates()
    → postUpdates → POST https://api.destinyitemmanager.com/profile
```

**Entry points (source):**

| Path | File |
|------|------|
| Preferred thunks | `src/app/inventory/actions.ts` — `setTag`, `setNote`, `appendNote`, `removeFromNote` |
| Low-level actions | same — `setItemTag`, `setItemNote`, `setItemTagsBulk`, `setItemHashTag`, `setItemHashNote`, `tagCleanup` |
| Tag UI | `src/app/item-popup/ItemTagSelector.tsx` |
| Notes UI | `src/app/item-popup/NotesArea.tsx` |
| Bulk tags | `src/app/inventory/bulk-actions.tsx` — `bulkTagItems` |
| Bulk notes | `src/app/dim-ui/useBulkNote.tsx` |
| Reducer / queue | `src/app/dim-api/reducer.ts` |
| Flush / IDB | `src/app/dim-api/actions.ts` |
| HTTP | `src/app/dim-api/dim-api.ts` — `postUpdates` |
| Auth | `src/app/dim-api/dim-api-helper.ts` |

**Reducer behavior of interest:**

- No-op if tag already equals existing (or clear when no tag)
- `itemId` of `'0'` / empty → error log; must use hash path
- Tag and note updates are **independent queue entries** that compact by id before send
- `tagCleanup` only runs after profile loaded; skips wipe when stores empty/errored (`cleanInfos`)

### B. DIM Sync API (same server write path; third-party supported)

Documented in dim-api README as **not exclusive to DIM**. Community tools already sync tags.

1. Register app → `POST /new_app` → `dimApiKey` (prod key via DIM Discord / `bhollis`)
2. User must have Bungie.net OAuth in the calling app
3. `POST /auth/token` with `{ bungieAccessToken, membershipId }` + `X-API-Key` → DIM JWT
4. `POST /profile` with:

```json
{
  "platformMembershipId": "<bungie platform membership id>",
  "destinyVersion": 2,
  "updates": [
    {
      "action": "tag",
      "payload": {
        "id": "<itemInstanceId>",
        "tag": "junk",
        "notes": "vault-keeper:trash",
        "craftedDate": 1234567890
      }
    }
  ]
}
```

Headers: `Authorization: Bearer <dimAccessToken>`, `X-API-Key: <dimApiKey>`, `Content-Type: application/json`.

Read-back: `GET /profile?platformMembershipId=…&components=tags,hashtags` (and optional `sync=` token for deltas).

**Implication for Vault Keeper:** this is the **supported “native” write path** for an external product. It is **not** Redux dispatch, but it is the same persistence surface DIM flushes to.

### C. What is *not* a write path

- Bungie.net inventory endpoints do **not** store DIM tags/notes
- Redux store is module-scoped (`export default store` in `src/app/store/store.ts`); only `window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__` is used for DevTools composition — **not** a stable external API
- No evidence of intentional `window.store` / public tag setter for extensions

---

## Persistence / sync

| Layer | What | When |
|-------|------|------|
| Redux `dimApi` | Optimistic tags/notes + `updateQueue` | Immediate on dispatch |
| IndexedDB (`idb-keyval` key `dim-api-profile`) | settings, profiles (incl. tags), `itemHashTags`, `updateQueue`, searches, globalSettings | Debounced 1s after relevant changes |
| `localStorage` `dim-api-enabled` | `apiPermissionGranted` preference | On permission change |
| `localStorage` `dimApiToken` | DIM JWT | Auth refresh |
| `localStorage` `warned-no-sync` | First-tag-without-sync warning flag | Once |
| DIM cloud Postgres (via API) | Tags/notes per platform membership | `flushUpdates` when permission + `globalSettings.dimApiEnabled` |

**DIM Sync on:** local IDB + remote queue flush; multi-device merge via bulk updates + optional sync tokens; profile GET can return full or delta (`sync` / `deletedTagsIds` / etc.).

**DIM Sync off / API disabled:** data stays local (IDB). `prepareUpdateQueue` empties queue if `apiPermissionGranted === false`. `loadDimApiData` skips remote when permission false or `dimApiEnabled` false. First local tag/note may show `Storage.DataIsLocal` / `Storage.DimSyncNotEnabled` warning (feature-flagged `warnNoSync`).

**Conflict / merge model:** client sends deltas only; server applies updates; failed individual results can reverse local apply via `before`. Compaction reduces offline backlog.

**Not durable across clear-site-data** without Sync.

---

## Extension feasibility (content script / hybrid Mirror)

Context constraints (product): Vault Keeper uses **DIM session**, no separate Bungie OAuth if avoidable; Trash is SoT; Mirror always into DIM tag/note.

### Ranking for hybrid Trash Mirror

| Approach | Invokes same write path? | Live DIM UI | Stability | Fit |
|----------|--------------------------|-------------|-----------|-----|
| **1. DIM Sync API `POST /profile`** from extension (background; host perms) using DIM page’s Bungie/DIM tokens **or** registered app credentials | **Yes — same server path** | **No** until DIM reloads profile / refresh | High (versioned API types) | **Prefer for durable Mirror** |
| **2. Page-world bridge** inject script, obtain store, `dispatch(setTag…)` | Yes — full client path | Yes | **Low** (no public store; bundler-private) | Avoid unless proven stable |
| **3. DOM automation** open item popup → tag select / notes | Indirectly (drives real UI) | Yes | Medium/low (UI churn) | **Fallback** for visible Mirror without API |
| **4. Mutate IDB / localStorage only** | Incomplete (no Redux apply; race with DIM) | No | Bad | Do not |

### Content script reality

- Extension **content scripts do not share JS heap** with DIM’s bundle → cannot import or call `setTag` directly.
- Can read **same-origin storage** for `app.destinyitemmanager.com` via page context / `chrome.scripting` + `localStorage` keys (`dimApiToken`, bungie oauth tokens — treat as secrets).
- **CORS:** browser page calls are origin-restricted; extension **background** with host permission to `api.destinyitemmanager.com` can call the API without page CORS.
- **Product auth tension:** official DIM API expects the *calling app* to have Bungie OAuth + its own `dimApiKey`. Vault Keeper currently forbids its own Bungie OAuth. Practical options:
  1. **Session piggyback:** while user is on DIM, read DIM’s tokens and call API with DIM’s app key if obtainable (fragile; may violate DIM key terms — **verify with DIM** before shipping).
  2. **Register Vault Keeper as DIM API app** with production key + optional light Bungie auth only for Sync Mirror (product decision; breaks “no Bungie OAuth” unless strictly session-reuse).
  3. **DOM / Redux-only Mirror** while DIM tab open; no cross-device Mirror without Sync.

### Recommended Mirror strategy (research conclusion)

1. **Durable Mirror:** write `tag: 'junk'` (or user-chosen tag) and/or a notes marker via **DIM Sync API** (`action: 'tag'`) — same shapes as DIM. Use `craftedDate` when available.
2. **Visible Mirror in open DIM tab:** after API write, trigger DIM inventory/profile refresh if a stable hook exists; else open popup + set tag via DOM; else accept lag until auto-refresh / user refresh.
3. **Do not** treat Redux internals as public API.
4. **Trash remains authoritative** in the extension; Mirror is best-effort projection. Reconcile on DIM read-back (`GET /profile` components `tags`).

### Suggested Mirror data convention (product, not DIM-native)

DIM has no “staged for delete” tag. Closest native signal: **`junk`**. Notes can carry a structured marker (e.g. hashtag) for filterability (`notes` hashtags already collected in DIM). Document final convention in a later decision ticket — not fixed by this research.

---

## Failure modes

| Failure | Behavior in DIM | Impact on Mirror |
|---------|-----------------|------------------|
| Item not `taggable` | `setTag`/`setNote` return without dispatch | Cannot Mirror that item |
| Sync permission denied / never granted | Local IDB only; queue discarded on flush prepare | API writes may still work if *your* token has access; **open DIM tab won’t enqueue remote** from UI path |
| Global `dimApiEnabled: false` | `flushUpdates` no-ops (returns true); no remote | Local-only DIM; extension API may also fail |
| Network error on `postUpdates` | Exponential backoff; queue retained; user toaster once; watermark reset on fail | Temporary desync; retries |
| Per-update invalid result | Reverse that update via `before`; notify `Storage.UpdateInvalid` | Local + remote diverge for that id |
| 401 DIM token | Token deleted; re-auth via Bungie token exchange | Extension must refresh token same way |
| Missing / wrong `dimApiKey` | Hard errors | Block write |
| Concurrent clients | Last flush wins per compacted object; deltas merge imperfectly | Race: user retags vs Mirror |
| Reshape changes instance id | `craftedDate` remaps on `cleanInfos` | Always send `craftedDate` when known |
| `tagCleanup` / dismantled items | Tags for missing instance ids purged | Stale Mirror ids cleaned; extension Trash should key carefully |
| Notes > 1024 | UI blocks / error label; reducer does not hard-enforce in snippet review | Cap Mirror notes ≤ 1024 |
| IDB load race with queue | On IDB load, reverse then reapply queues | Rare transient flicker |
| Page hard-refresh mid-queue | Queue persisted in IDB; flush on next load if Sync on | OK if IDB write completed |
| DOM automation | Selectors / React structure change | Brittle; keep as fallback only |
| Clearing browser storage | Local tags gone if Sync off | Data loss |

---

## Sources

### DIM client (primary)

- https://github.com/DestinyItemManager/DIM/blob/master/src/app/inventory/actions.ts — `setTag` / `setNote` / action creators / `warnNoSync`
- https://github.com/DestinyItemManager/DIM/blob/master/src/app/inventory/dim-item-info.ts — `tagConfig`, `TagValue`, `getTag`/`getNotes`, `cleanInfos`
- https://github.com/DestinyItemManager/DIM/blob/master/src/app/inventory/bulk-actions.tsx — `bulkTagItems`
- https://github.com/DestinyItemManager/DIM/blob/master/src/app/item-popup/ItemTagSelector.tsx
- https://github.com/DestinyItemManager/DIM/blob/master/src/app/item-popup/NotesArea.tsx — `maxLength = 1024`
- https://github.com/DestinyItemManager/DIM/blob/master/src/app/dim-ui/useBulkNote.tsx
- https://github.com/DestinyItemManager/DIM/blob/master/src/app/dim-api/reducer.ts — tags state, `setTag`/`setNote`, compact queue, apply/reverse
- https://github.com/DestinyItemManager/DIM/blob/master/src/app/dim-api/actions.ts — IDB observers, `flushUpdates`, backoff
- https://github.com/DestinyItemManager/DIM/blob/master/src/app/dim-api/dim-api.ts — `postUpdates`, `getDimApiProfile`
- https://github.com/DestinyItemManager/DIM/blob/master/src/app/dim-api/dim-api-helper.ts — host `api.destinyitemmanager.com`, auth headers, token exchange
- https://github.com/DestinyItemManager/DIM/blob/master/src/app/dim-api/api-types.ts — `ProfileUpdateWithRollback`
- https://github.com/DestinyItemManager/DIM/blob/master/src/app/store/store.ts — store not on `window`
- https://github.com/DestinyItemManager/DIM/blob/master/src/app/inventory/selectors.ts — tag/note selectors

### DIM API / types (primary)

- https://github.com/DestinyItemManager/dim-api/blob/master/README.md — third-party use, auth, GET/POST `/profile`, offline update model
- https://github.com/DestinyItemManager/dim-api/blob/master/api/shapes/item-annotations.ts — `TagValue`, `ItemAnnotation`, `ItemHashTag`
- `@destinyitemmanager/dim-api-types@1.40.0` — `TagUpdate`, `ItemHashTagUpdate`, `ProfileUpdateRequest`, `ProfileUpdateResult`

### Snapshots

- DIM `master` commit ~`028644e` (2026-07-13)
- dim-api `master` commit ~`b55c234` (2026-07-09)
- DIM depends on `@destinyitemmanager/dim-api-types` `^1.40.0`

---

## Open product decisions (out of scope for this ticket)

1. Mirror field: tag only (`junk`) vs notes marker vs both  
2. Whether Vault Keeper may register as a DIM API app / use Bungie tokens for Sync  
3. How to refresh open DIM UI after API Mirror writes  
4. Multi-account / D1 handling (API supports `destinyVersion`)
