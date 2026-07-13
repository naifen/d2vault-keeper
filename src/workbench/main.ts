/**
 * Workbench side panel UI.
 * Opened only via toolbar / sidebar / _execute_sidebar_action — never from Light chip.
 */

import {
  createEnvelope,
  isEnvelope,
  newRequestId,
  type RoundTripResultPayload,
} from "../messaging/index.js";
import type { InventoryStatus, VaultItem } from "../inventory/index.js";
import { visibleWindow } from "./virtual-list.js";

const ROW_HEIGHT = 28;

const statusEl = document.getElementById("conn-status");
const logEl = document.getElementById("roundtrip-log");
const btn = document.getElementById("btn-roundtrip");
const vaultStatusEl = document.getElementById("vault-status");
const vaultListEl = document.getElementById("vault-list");
const btnRefresh = document.getElementById("btn-refresh-vault");
const filterInput = document.getElementById("filter-input") as HTMLInputElement | null;
const filterStatusEl = document.getElementById("filter-status");
const btnApply = document.getElementById("btn-apply-filter");
const btnClearFilter = document.getElementById("btn-clear-filter");

let vaultItems: VaultItem[] = [];

function setStatus(text: string, state: "ok" | "err" | "idle" = "idle"): void {
  if (!statusEl) return;
  statusEl.textContent = text;
  if (state === "idle") {
    statusEl.removeAttribute("data-state");
  } else {
    statusEl.setAttribute("data-state", state);
  }
}

function setVaultStatus(text: string, state: "ok" | "err" | "idle" = "idle"): void {
  if (!vaultStatusEl) return;
  vaultStatusEl.textContent = text;
  if (state === "idle") {
    vaultStatusEl.removeAttribute("data-state");
  } else {
    vaultStatusEl.setAttribute("data-state", state);
  }
}

function renderVaultList(): void {
  if (!vaultListEl) return;

  // Preserve scroll: replaceChildren resets scrollTop to 0.
  const savedScrollTop = vaultListEl.scrollTop;

  if (vaultItems.length === 0) {
    vaultListEl.replaceChildren();
    return;
  }

  const viewportHeight = vaultListEl.clientHeight || 280;
  const win = visibleWindow(savedScrollTop, viewportHeight, vaultItems.length, ROW_HEIGHT);

  const spacer = document.createElement("div");
  spacer.className = "vault-list-spacer";
  spacer.style.height = `${win.totalHeight}px`;

  const windowEl = document.createElement("div");
  windowEl.className = "vault-list-window";
  windowEl.style.top = `${win.offsetY}px`;

  for (let i = win.startIndex; i < win.endIndex; i++) {
    const item = vaultItems[i]!;
    const row = document.createElement("div");
    row.className = "vault-row";
    row.setAttribute("role", "listitem");
    row.dataset.id = item.id;

    const name = document.createElement("span");
    name.className = "vault-row-name";
    name.textContent = item.name;
    name.title = `${item.name} (${item.id})`;

    const meta = document.createElement("span");
    meta.className = "vault-row-meta";
    const bits = [
      item.tierType,
      item.itemType,
      item.power !== undefined ? `⚡${item.power}` : undefined,
      item.quantity > 1 ? `×${item.quantity}` : undefined,
    ].filter(Boolean);
    meta.textContent = bits.join(" · ") || `#${item.itemHash}`;

    row.append(name, meta);
    windowEl.appendChild(row);
  }

  spacer.appendChild(windowEl);
  vaultListEl.replaceChildren(spacer);
  vaultListEl.scrollTop = savedScrollTop;
}

async function pingBackground(): Promise<boolean> {
  try {
    const res = await browser.runtime.sendMessage(
      createEnvelope("ping", newRequestId(), { from: "workbench", at: Date.now() }),
    );
    return isEnvelope(res) && res.kind === "pong";
  } catch {
    return false;
  }
}

async function runRoundTrip(): Promise<void> {
  const token = newRequestId();
  setStatus("Round-trip in progress…");
  if (logEl) {
    logEl.hidden = false;
    logEl.textContent = `token=${token}\n…`;
  }

  try {
    const res = await browser.runtime.sendMessage(
      createEnvelope("roundtrip", newRequestId(), { token, hop: "workbench" }),
    );
    if (!isEnvelope(res) || res.kind !== "roundtrip-result") {
      setStatus("Round-trip failed: bad response", "err");
      if (logEl) logEl.textContent = JSON.stringify(res, null, 2);
      return;
    }
    const payload = res.payload as RoundTripResultPayload | undefined;
    if (payload?.ok && payload.token === token) {
      setStatus(`Round-trip OK: ${payload.hops.join(" → ")}`, "ok");
    } else {
      setStatus(
        `Round-trip incomplete (is DIM open with Light?). hops=${payload?.hops?.join(" → ") ?? "?"}`,
        "err",
      );
    }
    if (logEl) logEl.textContent = JSON.stringify(payload, null, 2);
  } catch (err) {
    setStatus(`Round-trip error: ${String(err)}`, "err");
  }
}

function setFilterStatus(text: string, state: "ok" | "err" | "idle" = "idle"): void {
  if (!filterStatusEl) return;
  filterStatusEl.textContent = text;
  if (state === "idle") filterStatusEl.removeAttribute("data-state");
  else filterStatusEl.setAttribute("data-state", state);
}

async function applyFilter(): Promise<void> {
  const query = filterInput?.value ?? "";
  setFilterStatus("Applying…");
  try {
    const res = await browser.runtime.sendMessage(
      createEnvelope("filter-apply", newRequestId(), { query }),
    );
    if (!isEnvelope(res) || res.kind !== "filter-result") {
      setFilterStatus("Apply failed: bad response", "err");
      return;
    }
    const payload = res.payload as { ok?: boolean; applied?: boolean; error?: string; query?: string };
    if (payload?.ok && payload.applied) {
      setFilterStatus(`Applied to DIM: ${payload.query || "(empty)"}`, "ok");
    } else {
      setFilterStatus(payload?.error ?? "Apply failed", "err");
    }
  } catch (err) {
    setFilterStatus(`Apply error: ${String(err)}`, "err");
  }
}

async function clearFilter(): Promise<void> {
  setFilterStatus("Clearing…");
  try {
    const res = await browser.runtime.sendMessage(
      createEnvelope("filter-clear", newRequestId()),
    );
    if (!isEnvelope(res) || res.kind !== "filter-result") {
      setFilterStatus("Clear failed: bad response", "err");
      return;
    }
    const payload = res.payload as { ok?: boolean; applied?: boolean; error?: string };
    if (payload?.ok && payload.applied) {
      if (filterInput) filterInput.value = "";
      setFilterStatus("Cleared DIM search", "ok");
    } else {
      setFilterStatus(payload?.error ?? "Clear failed", "err");
    }
  } catch (err) {
    setFilterStatus(`Clear error: ${String(err)}`, "err");
  }
}

async function loadVault(): Promise<void> {
  setVaultStatus("Loading vault…");
  try {
    const res = await browser.runtime.sendMessage(createEnvelope("vault-get", newRequestId()));
    if (!isEnvelope(res) || res.kind !== "vault-result") {
      setVaultStatus("Vault load failed: bad response", "err");
      vaultItems = [];
      renderVaultList();
      return;
    }
    const status = res.payload as InventoryStatus;
    if (status.state === "ok") {
      vaultItems = status.items;
      setVaultStatus(`Vault: ${status.items.length} items (membership ${status.membershipId})`, "ok");
    } else if (status.state === "empty") {
      vaultItems = [];
      setVaultStatus(status.message, "err");
    } else {
      vaultItems = [];
      setVaultStatus(status.message, "err");
    }
    renderVaultList();
  } catch (err) {
    vaultItems = [];
    setVaultStatus(`Vault error: ${String(err)}`, "err");
    renderVaultList();
  }
}

async function init(): Promise<void> {
  const ok = await pingBackground();
  setStatus(ok ? "Background connected" : "Background not reachable", ok ? "ok" : "err");
  btn?.addEventListener("click", () => {
    void runRoundTrip();
  });
  btnRefresh?.addEventListener("click", () => {
    void loadVault();
  });
  btnApply?.addEventListener("click", () => {
    void applyFilter();
  });
  btnClearFilter?.addEventListener("click", () => {
    void clearFilter();
  });
  filterInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void applyFilter();
    }
  });
  vaultListEl?.addEventListener("scroll", () => {
    renderVaultList();
  }, { passive: true });

  // Refresh on tab focus (no background pollers).
  window.addEventListener("focus", () => {
    void loadVault();
  });

  void loadVault();
}

void init();
