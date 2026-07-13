# Packaging — temporary Firefox add-on

## Commands

```bash
npm install
npm test
npm run typecheck
npm run build          # → dist/
npm run package        # → artifacts/vault-keeper.zip (optional)
```

## Load temporary add-on

1. `npm run build`
2. Firefox → `about:debugging#/runtime/this-firefox`
3. **Load Temporary Add-on…**
4. Choose **`dist/manifest.json`** (not the zip, unless you unzip first)

Temporary add-ons unload when Firefox restarts — re-load after restart.

## Smoke checks after load

- No console errors on `app.destinyitemmanager.com`
- Light chip `VK` visible
- Workbench opens from toolbar/sidebar
- Permissions: `storage` + DIM hosts + OpenRouter (agent); no Bungie OAuth identity permission

## Permissions (MVP)

| Permission | Why |
|------------|-----|
| `storage` | Trash SoT + agent settings |
| `*://*.destinyitemmanager.com/*` | Light, IDB, dim-bridge |
| `https://openrouter.ai/*` | Default BYO agent host |
| optional `https://*/*` | Custom OpenRouter-compatible base URL |
