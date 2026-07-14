# D2 Vault Keeper

Browser extension that helps Guardians intelligently clean a Destiny 2 vault through Destiny Item Manager (DIM), without separate Bungie OAuth and without claiming API dismantle.

## Language

**Vault Keeper**:
The browser extension product in this repo. Sits alongside DIM; does not replace it.
_Avoid_: DIM plugin, vault manager app, cleaner bot

**DIM session**:
The user's already-authenticated Destiny Item Manager tab/session. All inventory and Mirror work reuses this session; v1 registers no Bungie/DIM API app.
_Avoid_: Bungie login, extension OAuth

**Vault item**:
An inventory item instance in the Destiny vault as DIM surfaces it (vault store id `vault`).
_Avoid_: loot, gear (unqualified), character inventory

**Light trigger**:
Minimal on-page chip/badge on DIM. Does not open the Workbench (browser user-gesture rules).
_Avoid_: floating action button (unless that form is chosen)

**Workbench**:
Full side surface UI in composer-first order: Intention + Suggest, then DIM filter, Results, and Trash (Trash as peek/expand panel on the Workbench, not a separate browser window).
_Avoid_: popup, options page, DIM plugin UI

**Intention**:
Natural-language instruction for find/stage (e.g. handcannons missing certain perks). Primary text entry near the top of the Workbench (composer-first).
_Avoid_: prompt, query (unqualified)

**Selection filter**:
A DIM filter string built from the Guardian's explicit multi-select in Results so the query card matches exactly those Vault items (typically instance `id:` terms). Written when Stage selected runs; does not replace Stage itself.
_Avoid_: auto filter, magic query

**Suggest**:
Workbench control that runs the Agent loop from the current Intention. Never Stages or Applies by itself.
_Avoid_: run chatbot, auto-clean, dismantle

**Apply**:
Workbench control that writes the current DIM filter string into the open DIM session search.
_Avoid_: execute query, run search (unqualified)

**Agent loop**:
LLM multi-step that turns Intention into draft DIM filter(s), explanation, and optional Stage recommendations. Never auto-Stages.
_Avoid_: chatbot, autonomous cleaner

**DIM filter**:
A string in DIM's native inventory search language, applied via DIM search (DOM/Redux) or copied for paste.
_Avoid_: SQL, Lucene query

**Results**:
Workbench list of Vault items under consideration, with two views: Matches (cached vault hits for the current DIM filter) and Recs (agent Stage recommendations). Stage is always explicit multi-select.
_Avoid_: search results (ambiguous with DIM), dismantle list

**Stage**:
Add a Vault item to Trash without confirmation modal. Not game deletion.
_Avoid_: delete, dismantle

**Unstage**:
Remove an item from Trash; clear Mirror tag only if Vault Keeper applied it.
_Avoid_: restore (ambiguous), undelete

**Trash**:
Extension-owned staged set in `storage.local` — source of truth for staged state.
_Avoid_: recycle bin, deleted items

**Mirror**:
Best-effort DIM built-in **`junk`** tag so staged items show in DIM (`tag:junk`). Not cloud Sync in v1.
_Avoid_: DIM Sync (v1), custom tag namespace

**In-game dismantle**:
Only way items permanently leave Destiny; happens in the game client, never via Vault Keeper.
_Avoid_: hard-delete (as extension feature)

**Prep**:
Optional future manual help for in-game dismantle (transfer/equip). Out of v1 core path unless a ticket says otherwise.
_Avoid_: auto-clean

**Favorite exclusion**:
Items with DIM tag `favorite` are never auto-recommended or default-staged.
_Avoid_: protected (vague)

**Exotic exclusion**:
Exotic items are never default-staged or auto-recommended.
_Avoid_: legendary exclusion
