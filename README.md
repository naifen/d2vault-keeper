# Vault Keeper

Firefox MV3 extension companion for [Destiny Item Manager](https://www.destinyitemmanager.com/). Helps Guardians stage vault gear for **in-game** dismantle — never claims API/game delete.

Domain glossary: [`CONTEXT.md`](./CONTEXT.md).

## Requirements

- Node.js 20+
- Firefox 121+ (for temporary add-on load)

## Develop

```bash
npm install
npm test
npm run build
```

### Load temporary add-on

1. `npm run build`
2. Firefox → `about:debugging` → **This Firefox** → **Load Temporary Add-on…**
3. Select `dist/manifest.json`
4. Open DIM (`app.destinyitemmanager.com`), log in
5. Confirm the **VK** Light chip on the page (status only — does not open Workbench)
6. Open Workbench via toolbar button or sidebar (`_execute_sidebar_action`)

Optional package zip: `npm run package` → `artifacts/vault-keeper.zip`.

## Architecture (MVP seams)

| Module | Role |
|--------|------|
| `background` | Event page; message hub; no long polling |
| `content` (Light) | On-page chip + dim-bridge host |
| `workbench` | Side panel UI |
| `messaging` | Typed envelopes Workbench ↔ background ↔ Light |
| `inventory` | Vault read from DIM IDB (later) |
| `trash` | Local Stage SoT (later) |
| `agent` | BYO Intention → filters (later) |

## Permissions

- `storage` — Trash + settings
- Host: `destinyitemmanager.com` only

No Bungie OAuth. No auto-Stage. No in-extension dismantle.
