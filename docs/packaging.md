# Packaging — temporary add-on (Firefox + Chromium)

## Commands

```bash
npm install
npm test
npm run typecheck
npm run build          # → dist/firefox/ + dist/chromium/
npm run package        # → artifacts/vault-keeper-{firefox,chromium}.zip
```

Dual-target build: one source tree, two loadable packages (Firefox event page + sidebar; Chromium service worker + side panel).

## Load — Firefox

1. `npm run build`
2. Firefox → `about:debugging#/runtime/this-firefox`
3. **Load Temporary Add-on…**
4. Choose **`dist/firefox/manifest.json`**

Temporary add-ons unload when Firefox restarts — re-load after restart.

## Load — Chrome

1. `npm run build`
2. Chrome → `chrome://extensions`
3. Enable **Developer mode**
4. **Load unpacked** → select the **`dist/chromium/`** directory (folder containing `manifest.json`)

## Load — Microsoft Edge

1. `npm run build`
2. Edge → `edge://extensions`
3. Enable **Developer mode**
4. **Load unpacked** → select **`dist/chromium/`**

The Chromium package is shared for Chrome and Edge (same MV3 service worker + Side Panel shell).

## Smoke checks after load

- No console errors on `app.destinyitemmanager.com`
- Light chip `VK` visible (status only — does **not** open Workbench)
- Workbench opens from toolbar action (Firefox: sidebar; Chromium: side panel)
- Permissions: `storage` + DIM hosts + OpenRouter (agent); Chromium also `sidePanel`; no Bungie OAuth identity permission

## Permissions (MVP)

| Permission | Why | Targets |
|------------|-----|---------|
| `storage` | Trash SoT + agent settings | All |
| `sidePanel` | Chromium Workbench surface | Chromium only |
| `*://*.destinyitemmanager.com/*` | Light, IDB, dim-bridge | All |
| `https://openrouter.ai/*` | Default BYO agent host | All |
| optional `https://*/*` | Custom OpenRouter-compatible base URL | All |
