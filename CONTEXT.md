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
Full side-panel UI: Intention, filters, results, Trash.
_Avoid_: popup, options page

**Intention**:
Natural-language instruction for find/stage (e.g. handcannons missing certain perks).
_Avoid_: prompt, query (unqualified)

**Agent loop**:
LLM multi-step that turns Intention into draft DIM filter(s), explanation, and optional Stage recommendations. Never auto-Stages.
_Avoid_: chatbot, autonomous cleaner

**DIM filter**:
A string in DIM's native inventory search language, applied via DIM search (DOM/Redux).
_Avoid_: SQL, Lucene query

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
