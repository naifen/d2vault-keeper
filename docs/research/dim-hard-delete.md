# Research: DIM hard-delete and dismantle via logged-in session

**Issue:** [#5](https://github.com/naifen/d2vault-keeper/issues/5)  
**Branch:** `research/dim-hard-delete`  
**Scope:** Whether hard-delete/dismantle is possible through a logged-in DIM session (no separate Bungie OAuth for the extension), what APIs/UI exist, confirmations/limits/errors, and extension automation feasibility vs DOM-only prep flows.

**Standing context:** Hard delete is distinct from Stage/Trash; map preference is **DIM session only**.

---

## Summary

**Hard-delete / dismantle is not available** through DIM, the Bungie.net Destiny 2 Platform API, or any reuse of the user’s DIM-stored OAuth token.

| Claim | Result |
| --- | --- |
| Does DIM dismantle items? | **No.** README + FAQ: API does not allow it. |
| Is there a Bungie `Dismantle` / `DeleteItem` endpoint? | **No.** OpenAPI `Actions/Items/*` and official Help list have none. |
| Can an extension call Bungie with DIM’s session to hard-delete? | **No.** Session can only exercise the same non-dismantle write surface. |
| What *can* an extension do without separate OAuth? | Tag/note (DIM Sync), filter/search, transfer/lock/equip prep **if** it can drive DIM or reuse the token for those endpoints. |
| Practical vault-clean path | Stage/tag → bulk **transfer to current character** → **in-game** dismantle. |

**Implication for map / #8:** Hard-delete and auto-clean **cannot** mean API-driven permanent removal while constrained to DIM session. Product options are: (a) out-of-scope true hard-delete; (b) “prepare for in-game dismantle” (transfer + lock policy); (c) Stage/Trash only. DOM automation of the **game client** is outside DIM origin and outside this research surface.

---

## User-facing flows

### What DIM actually offers for “delete”

1. **No dismantle control** in inventory UI, bulk actions, or item popup that calls a delete/dismantle API.
2. **Workflow documented by DIM** for cleaning vault space:
   - Tag items (`tag:junk`, wishlist trashlist, `is:statlower`, etc.).
   - Bulk **Transfer Search** of junk to the **current character**.
   - User dismantles **in Destiny 2** (hold-to-dismantle / controller mapping).
3. Wiki bulk-action example: transfer junk for dismantling  
   `-is:incurrentchar tag:junk` → Current Character  
   (“easy dismantling” = in game, not in DIM).

### Confusions to avoid

| Term in product language | Reality |
| --- | --- |
| **Stage / Trash** (extension concept) | Metadata / mirror tags-notes; not Bungie inventory mutation for delete. |
| **DIM “delete” of data** | DIM Sync “Delete ALL Data” deletes **DIM settings/loadouts/tags on DIM servers**, not in-game items. |
| **“DIM deleted my item”** | FAQ: impossible via API; item is elsewhere or user dismantled in game. Exception: Dec 2021 ornament API bug (window closed; historical only). |

---

## Code paths / APIs DIM uses

### Explicit non-capability (first-party)

From DIM `README.md`:

> DIM is based on the same services used by the Destiny Companion app to move and equip items. **DIM will not be able to dismantle any of your items.**

From DIM Wiki FAQ:

- **“DIM deleted my item!”** — “It can't do that. No app can - you can only delete things in-game.”
- **“Can I delete items from DIM?”** — “No, the API Bungie provides for us does not allow deleting items.”

### Inventory **write** surface in DIM source

Primary module: `src/app/bungie-api/destiny2-api.ts` (imports from `bungie-api-ts/destiny2`).

| DIM export | Bungie operation | Effect |
| --- | --- | --- |
| `transfer` | `TransferItem` / `PullFromPostmaster` | Move vault ↔ character / postmaster |
| `equip` / `equipItems` | `EquipItem` / `EquipItems` | Equip |
| `setLockState` | `SetItemLockState` | Lock/unlock |
| `setTrackedState` | `SetQuestTrackedState` | Quest/bounty track |
| In-game loadout helpers | `EquipLoadout`, `SnapshotLoadout`, `ClearLoadout`, `UpdateLoadoutIdentifiers` | Loadout slots |
| Socket helpers (elsewhere / AWA) | `InsertSocketPlug` / `InsertSocketPlugFree` | Plugs (AWA for advanced) |

**No** function for dismantle, scrap, delete-instance, or vendor-sell-as-delete.

### Bungie Platform (primary API catalog)

Published Destiny2 item **Actions** (Help + OpenAPI `openapi.json` paths under `/Destiny2/Actions/Items/`):

- `TransferItem`
- `PullFromPostmaster`
- `EquipItem` / `EquipItems`
- `SetLockState`
- `SetTrackedState`
- `InsertSocketPlug` / `InsertSocketPlugFree`

**No** path matching dismantle / destroy / `DeleteItem` in OpenAPI path list (verified scan of `Bungie-net/api` `openapi.json`: dismantle/destroy/DeleteItem paths = **none**).

OAuth scopes that matter for inventory mutation:

- `MoveEquipDestinyItems` — move/equip/lock/track/free plugs  
- `ReadDestinyInventoryAndVault` — private inventory read  
- `AdvancedWriteActions` — AWA-gated actions (e.g. some plug inserts), **not** dismantle  

There is **no** published scope that grants item destruction.

### Session / auth DIM uses (relevant to “DIM session only”)

- Bungie OAuth tokens stored in **page `localStorage`** key `authorization` (`src/app/bungie-api/oauth-tokens.ts`): `accessToken`, optional `refreshToken`, `bungieMembershipId`.
- Authenticated calls go through `authenticatedHttpClient` → `fetchWithBungieOAuth` + DIM API key + client-side rate limiter.
- Same tokens power every Destiny2 write DIM can perform; they do not unlock undisclosed delete endpoints.

### Rate limits (DIM client-side queues)

From `src/app/bungie-api/rate-limit-config.ts` (interval ms between matching calls):

| Endpoint pattern | Interval |
| --- | --- |
| `.../Destiny2/Actions/Items/TransferItem` | **100 ms** |
| `PullFromPostmaster` | 100 ms |
| `EquipItem` / `EquipItems` | 100 ms |
| `SetLockState` | 100 ms |
| `InsertSocketPlug*` | 500 ms |
| `SetTrackedState` / loadout actions | 1000 ms |

These are **DIM client** limiters, not a dismantle batch size (there is no dismantle API). Server also returns throttle `PlatformErrorCodes` (see errors).

### Error surfaces (for allowed writes; N/A for dismantle)

`bungie-service-helper.ts` maps failures into `DimError` codes, e.g.:

- Auth: `NotLoggedIn`, `AppNotPermitted`, token expired  
- Infra: `Throttled`, `Maintenance`, `Difficulties`, `NetworkError`, `SlowResponse`  
- Game rules: `DestinyCannotPerformActionAtThisLocation`, `DestinyItemUnequippable`, uniqueness violations on transfer  

Toasts: `error-toaster.tsx` (`bungieErrorToaster`, `dimErrorToaster`).  
There is **no** dismantle-specific confirmation dialog or error path because the feature does not exist.

### Confirmations

| Action | Confirmation? |
| --- | --- |
| Hard-delete / dismantle via DIM | **None** (impossible) |
| Transfer / equip / lock | Generally **no** modal confirm for single moves; bulk transfer is user-initiated bulk action |
| Advanced plug insert (AWA) | Companion **AWA** approval flow (`awaInitializeRequest` / `awaGetActionToken`) |
| DIM Sync wipe | Explicit “Delete ALL Data from DIM Sync Servers” style confirm (metadata only) |

---

## Extension automation options (no separate Bungie OAuth)

Constraint from map: **no extension-owned Bungie OAuth** as primary auth; use **DIM session**.

### Option A — Drive DIM UI / internals (preferred for map architecture)

| Capability | Feasible without own OAuth? | Notes |
| --- | --- | --- |
| Read inventory / apply filters | Yes (content script + DIM state/DOM; see #2/#3) | Prep for clean |
| Stage Trash + Mirror tags/notes | Yes (DIM Sync / tag write path; see #4) | Not hard-delete |
| Bulk transfer “junk → current char” | **Maybe** via DIM bulk actions / internals | Still leaves dismantle to game |
| Click a “Dismantle” control in DIM | **No** — control does not exist | — |
| True hard-delete | **No** | — |

### Option B — Content script reuses DIM `localStorage` OAuth + DIM’s API key patterns

Same origin as `app.destinyitemmanager.com` can **read** `localStorage.authorization` and call `www.bungie.net/Platform/...` with `Authorization: Bearer` + `X-API-Key`.

| Capability | Feasible? |
| --- | --- |
| Call Transfer/Equip/Lock with user’s DIM token | Technically possible (same as DIM) |
| Call a dismantle endpoint | **Impossible** — endpoint absent |
| Avoid separate OAuth registration | Yes for *allowed* actions only |
| Policy / ToS / token-theft risk | High — steals/reuses DIM’s refresh token; fragile if DIM changes storage; may violate Bungie/DIM expectations |

**Does not unlock hard-delete.** Only duplicates DIM’s non-destructive write surface with more risk than calling into DIM’s own move service.

### Option C — Separate Bungie app OAuth (explicitly **out of map** as primary)

Would still hit the **same** Platform catalog: still **no** dismantle. Does not fix hard-delete; only adds auth surface area the map forbids as primary.

### Option D — DOM-only automation of Destiny **game** / Companion

Out of DIM origin; not a “DIM session” path. Not researched here as an API contract; feasibility is OS/game-client automation, not extension-on-DIM.

### Automation verdict

| Goal | Verdict |
| --- | --- |
| **Hard-delete / dismantle automation via DIM session** | **Not feasible** (API + product gap) |
| **Prep automation** (filter, stage, tag, unlock, transfer to character) | **Feasible** via DIM internals/DOM; token reuse optional and riskier |
| **DOM-only hard-delete inside DIM** | **Not feasible** (no control to drive) |
| **Auto-clean = unattended permanent removal** | **Not feasible** under current Bungie Platform |

---

## Confirmations / limits (product-facing)

| Topic | Finding |
| --- | --- |
| Hard-delete confirmation in DIM | N/A — no feature |
| Batch dismantle limit | N/A — no API |
| Transfer batch | DIM bulk transfer is sequential client-side with ~100 ms TransferItem spacing + server throttle codes |
| Location gate | Many actions require character in social space / orbit / offline (Bungie endpoint docs) |
| Locked items | In-game lock prevents dismantle; DIM **can** set lock state via API — prep only |
| Error UX for missing API | Extension must **not** promise hard-delete; surface “in-game only” if user expects dismantle |

---

## Risks

1. **Product risk:** Shipping “hard-delete” or “auto-clean” language implies API power that **does not exist**; users may believe items were destroyed when only staged/tagged/moved.  
2. **Token reuse risk:** Reading DIM `authorization` localStorage is powerful for transfer/equip abuse if compromised; still cannot dismantle, so risk is sideways (theft of move capability, refresh token).  
3. **Historical API bug (closed):** Dec 16–30 2021 ornament-on-same-armor could destroy equipped armor via plug API; documented in FAQ as only known destructive API bug; **not** a current dismantle path.  
4. **Scope creep:** Building game-client bots or companion hacks to dismantle is outside DIM session design and likely ToS-hostile.  
5. **False dependency on future Bungie endpoints:** OpenAPI has never exposed dismantle; community requests exist historically; **do not** plan product on unannounced API.

---

## Recommendations for dependent tickets

| Ticket | Implication |
| --- | --- |
| **#8 Grill: Hard-delete and auto-clean product contract** | Frame hard-delete as **not implementable** via DIM session; decide: drop, redefine as “prepare for in-game dismantle”, or accept forever-manual dismantle with Stage/Trash as max automation. |
| **#7 Stage confirmation** | Still required for Stage/Trash; no interaction with non-existent dismantle confirm. |
| **#4 Tags/notes** | Primary durable “trash” signal DIM can hold without Bungie delete. |
| **#2 / #3 Inventory + filters** | Enough to identify candidates; not enough to destroy them. |

---

## Sources

Primary only:

1. **DIM README** — dismantle disclaimer  
   https://github.com/DestinyItemManager/DIM/blob/master/README.md  
2. **DIM Wiki FAQ** — “DIM deleted my item!”, “Can I delete items from DIM?”  
   https://github.com/DestinyItemManager/DIM/wiki/FAQ  
3. **DIM Wiki Item Search Useful Queries** — transfer junk for dismantling; `is:statlower` for dismantle *candidates*  
   https://github.com/DestinyItemManager/DIM/wiki/Item-Search-Useful-Queries  
4. **DIM source `destiny2-api.ts`** — inventory write wrappers (transfer/equip/lock/track/loadouts; no dismantle)  
   https://github.com/DestinyItemManager/DIM/blob/master/src/app/bungie-api/destiny2-api.ts  
5. **DIM source `oauth-tokens.ts`** — Bungie tokens in `localStorage` key `authorization`  
   https://github.com/DestinyItemManager/DIM/blob/master/src/app/bungie-api/oauth-tokens.ts  
6. **DIM source `rate-limit-config.ts`** — client rate limits on Action endpoints  
   https://github.com/DestinyItemManager/DIM/blob/master/src/app/bungie-api/rate-limit-config.ts  
7. **DIM source `bungie-service-helper.ts`** — error mapping / auth client  
   https://github.com/DestinyItemManager/DIM/blob/master/src/app/bungie-api/bungie-service-helper.ts  
8. **Bungie.Net API index** — scopes + Destiny2 endpoint list  
   https://bungie-net.github.io/  
9. **Bungie Destiny2 service Help** — official Action descriptions/scopes  
   https://www.bungie.net/Platform/Destiny2/Help/  
10. **Bungie-net/api OpenAPI** — path inventory; no dismantle/delete-item  
    https://github.com/Bungie-net/api/blob/master/openapi.json  

---

## Answer (ticket question, compressed)

**How does DIM dismantle/delete while logged in?** It doesn’t. DIM only moves/equips/locks/tracks/plugs via Bungie Actions; dismantle is in-game only.

**What can an extension trigger without separate Bungie OAuth?** Anything the DIM session already can: inventory UI/internals, tags/notes, and (riskier) the same Bungie write endpoints via stored tokens. **Not** hard-delete.

**Confirmations / batch limits / errors:** No dismantle confirmations or batch limits. Transfer/equip use DIM’s ~100 ms client queues and standard Bungie throttle/location/auth errors.

**Automation vs DOM-only:** Hard-delete automation is **not feasible** either as API or as DOM-in-DIM. Prep automation (stage, tag, transfer to character for manual dismantle) **is** feasible.
