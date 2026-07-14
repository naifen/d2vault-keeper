/**
 * Workbench side panel UI.
 * Opened only via toolbar / browser side surface — never from Light chip.
 * Domain actions go through createWorkbenchClient — this file is the DOM adapter.
 */

import type { VaultItem } from "../inventory/index.js";
import type { TrashRecord } from "../trash/index.js";
import { TRASH_SAFE_COPY } from "../trash/index.js";
import type { AgentRecommendation } from "../agent/index.js";
import { newRequestId } from "../messaging/index.js";
import { ensureBrowser } from "../shared/webext.js";
import { visibleWindow } from "./virtual-list.js";
import { createWorkbenchClient } from "./client.js";

ensureBrowser();

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
const trashListEl = document.getElementById("trash-list");
const trashStatusEl = document.getElementById("trash-status");
const btnStage = document.getElementById("btn-stage");
const btnUnstage = document.getElementById("btn-unstage");
const btnRefreshTrash = document.getElementById("btn-refresh-trash");
const btnRepairMirror = document.getElementById("btn-repair-mirror");
const trashHelpEl = document.getElementById("trash-help");
const apiKeyInput = document.getElementById("api-key") as HTMLInputElement | null;
const btnSaveKey = document.getElementById("btn-save-key");
const intentionInput = document.getElementById("intention-input") as HTMLTextAreaElement | null;
const vaultOptIn = document.getElementById("vault-opt-in") as HTMLInputElement | null;
const btnRunAgent = document.getElementById("btn-run-agent");
const btnCancelAgent = document.getElementById("btn-cancel-agent");
const agentStatusEl = document.getElementById("agent-status");
const agentExplanationEl = document.getElementById("agent-explanation");
const agentRecsEl = document.getElementById("agent-recs");

let vaultItems: VaultItem[] = [];
let trashItems: TrashRecord[] = [];
const selectedVaultIds = new Set<string>();
const selectedTrashIds = new Set<string>();

const client = createWorkbenchClient(async (message) => browser.runtime.sendMessage(message));

type StatusState = "ok" | "err" | "idle";

function setElStatus(el: Element | null, text: string, state: StatusState = "idle"): void {
  if (!el) return;
  el.textContent = text;
  if (state === "idle") el.removeAttribute("data-state");
  else el.setAttribute("data-state", state);
}

function setStatus(text: string, state: StatusState = "idle"): void {
  setElStatus(statusEl, text, state);
}

function setVaultStatus(text: string, state: StatusState = "idle"): void {
  setElStatus(vaultStatusEl, text, state);
}

function setFilterStatus(text: string, state: StatusState = "idle"): void {
  setElStatus(filterStatusEl, text, state);
}

function setTrashStatus(text: string, state: StatusState = "idle"): void {
  setElStatus(trashStatusEl, text, state);
}

function setAgentStatus(text: string, state: StatusState = "idle"): void {
  setElStatus(agentStatusEl, text, state);
}

function renderVaultList(): void {
  if (!vaultListEl) return;
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

    const check = document.createElement("input");
    check.type = "checkbox";
    check.className = "vault-row-check";
    check.checked = selectedVaultIds.has(item.id);
    check.addEventListener("change", () => {
      if (check.checked) selectedVaultIds.add(item.id);
      else selectedVaultIds.delete(item.id);
    });

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

    row.append(check, name, meta);
    windowEl.appendChild(row);
  }

  spacer.appendChild(windowEl);
  vaultListEl.replaceChildren(spacer);
  vaultListEl.scrollTop = savedScrollTop;
}

function renderTrashList(): void {
  if (!trashListEl) return;
  trashListEl.replaceChildren();
  if (trashItems.length === 0) {
    const li = document.createElement("li");
    li.textContent = TRASH_SAFE_COPY.empty;
    li.className = "wb-muted";
    trashListEl.appendChild(li);
    return;
  }
  for (const item of trashItems) {
    const li = document.createElement("li");
    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = selectedTrashIds.has(item.id);
    check.addEventListener("change", () => {
      if (check.checked) selectedTrashIds.add(item.id);
      else selectedTrashIds.delete(item.id);
    });
    const label = document.createElement("span");
    label.textContent = item.name;
    label.title = item.id;
    const mirror = document.createElement("span");
    mirror.className = "vault-row-meta";
    mirror.textContent = `mirror:${item.mirrorStatus}`;
    li.append(check, label, mirror);
    trashListEl.appendChild(li);
  }
}

function renderRecs(recs: AgentRecommendation[]): void {
  if (!agentRecsEl) return;
  agentRecsEl.replaceChildren();
  if (recs.length === 0) {
    const li = document.createElement("li");
    li.className = "wb-muted";
    li.textContent = "No recommendations (Stage is always manual).";
    agentRecsEl.appendChild(li);
    return;
  }
  for (const r of recs) {
    const li = document.createElement("li");
    li.textContent = `${r.name}${r.reason ? ` — ${r.reason}` : ""} (Stage manually)`;
    agentRecsEl.appendChild(li);
  }
}

async function runRoundTrip(): Promise<void> {
  const token = newRequestId();
  setStatus("Round-trip in progress…");
  if (logEl) {
    logEl.hidden = false;
    logEl.textContent = `token=${token}\n…`;
  }
  const out = await client.roundTrip(token);
  if (out.ok) {
    setStatus(`Round-trip OK: ${out.hops.join(" → ")}`, "ok");
    if (logEl) logEl.textContent = JSON.stringify({ token: out.token, hops: out.hops, ok: true }, null, 2);
  } else {
    setStatus(`Round-trip incomplete (is DIM open with Light?). ${out.error}`, "err");
  }
}

async function applyFilter(): Promise<void> {
  const query = filterInput?.value ?? "";
  setFilterStatus("Applying…");
  const out = await client.applyFilter(query);
  if (out.ok) setFilterStatus(`Applied to DIM: ${out.query || "(empty)"}`, "ok");
  else setFilterStatus(out.error, "err");
}

async function clearFilter(): Promise<void> {
  setFilterStatus("Clearing…");
  const out = await client.clearFilter();
  if (out.ok) {
    if (filterInput) filterInput.value = "";
    setFilterStatus("Cleared DIM search", "ok");
  } else {
    setFilterStatus(out.error, "err");
  }
}

async function loadVault(): Promise<void> {
  setVaultStatus("Loading vault…");
  const out = await client.loadVault();
  if (!out.ok) {
    vaultItems = [];
    setVaultStatus(`Vault error: ${out.error}`, "err");
    renderVaultList();
    return;
  }
  vaultItems = out.items;
  if (out.status.state === "ok") {
    setVaultStatus(`Vault: ${out.items.length} items (membership ${out.status.membershipId})`, "ok");
  } else if (out.status.state === "empty" || out.status.state === "error") {
    setVaultStatus(out.status.message, "err");
  }
  renderVaultList();
}

async function loadTrash(): Promise<void> {
  const out = await client.loadTrash();
  if (!out.ok) {
    setTrashStatus(out.error, "err");
    return;
  }
  trashItems = out.items;
  selectedTrashIds.clear();
  setTrashStatus(`Trash: ${trashItems.length} staged (not deleted from Destiny)`, "ok");
  renderTrashList();
}

async function stageSelected(): Promise<void> {
  // No confirmation modal — Stage is intentional and reversible via Unstage.
  const out = await client.stage(vaultItems, selectedVaultIds);
  if (!out.ok) {
    setTrashStatus(out.error, "err");
    return;
  }
  trashItems = out.items;
  selectedVaultIds.clear();
  let msg = TRASH_SAFE_COPY.stagedOk(out.staged.length);
  if (out.denied.length) {
    msg += ` Denied ${out.denied.length} (exotic/favorite/already).`;
  }
  setTrashStatus(msg, out.staged.length > 0 ? "ok" : "err");
  renderTrashList();
  renderVaultList();
}

async function unstageSelected(): Promise<void> {
  const out = await client.unstage([...selectedTrashIds]);
  if (!out.ok) {
    setTrashStatus(out.error, "err");
    return;
  }
  trashItems = out.items;
  selectedTrashIds.clear();
  setTrashStatus(`Unstaged ${out.removed.length}. Still not a Destiny delete.`, "ok");
  renderTrashList();
}

async function saveApiKey(): Promise<void> {
  const out = await client.saveApiKey(apiKeyInput?.value ?? "");
  if (out.ok) {
    setAgentStatus("API key saved in extension storage (not logged)", "ok");
    if (apiKeyInput) {
      apiKeyInput.value = "";
      apiKeyInput.placeholder = "•••••••• (saved)";
    }
  } else {
    setAgentStatus(out.error, "err");
  }
}

async function runAgentLoop(): Promise<void> {
  setAgentStatus("Running agent…");
  const out = await client.runAgent({
    intention: intentionInput?.value ?? "",
    vaultContextOptIn: vaultOptIn?.checked === true,
    vaultItems,
  });
  if (!out.ok) {
    setAgentStatus(out.error === "cancelled" ? "Agent cancelled" : out.error, "err");
    return;
  }
  const result = out.result;
  if (filterInput && result.filters[0]) {
    filterInput.value = result.filters.join(" ");
  }
  if (agentExplanationEl) {
    agentExplanationEl.textContent = result.explanation || "—";
  }
  renderRecs(result.recommendations);
  setAgentStatus(
    `Agent done — ${result.filters.length} filter(s), ${result.recommendations.length} rec(s). Stage is manual.`,
    "ok",
  );
}

async function cancelAgent(): Promise<void> {
  await client.cancelAgent();
  setAgentStatus("Cancel requested", "err");
}

async function repairMirror(): Promise<void> {
  const out = await client.repairMirror();
  if (!out.ok) {
    setTrashStatus(out.error, "err");
    return;
  }
  trashItems = out.items;
  setTrashStatus(
    `Repair Mirror: ${out.repaired.length} row(s) attempted (Trash never rolled back)`,
    "ok",
  );
  renderTrashList();
}

async function init(): Promise<void> {
  if (trashHelpEl) trashHelpEl.textContent = TRASH_SAFE_COPY.sectionHelp;

  const ok = await client.ping();
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
  btnStage?.addEventListener("click", () => {
    void stageSelected();
  });
  btnUnstage?.addEventListener("click", () => {
    void unstageSelected();
  });
  btnRefreshTrash?.addEventListener("click", () => {
    void loadTrash();
  });
  btnSaveKey?.addEventListener("click", () => {
    void saveApiKey();
  });
  btnRunAgent?.addEventListener("click", () => {
    void runAgentLoop();
  });
  btnCancelAgent?.addEventListener("click", () => {
    void cancelAgent();
  });
  btnRepairMirror?.addEventListener("click", () => {
    void repairMirror();
  });
  vaultListEl?.addEventListener(
    "scroll",
    () => {
      renderVaultList();
    },
    { passive: true },
  );

  // Refresh only while Workbench is focused (no background pollers / no closed-sidebar timers).
  window.addEventListener("focus", () => {
    void loadVault();
    void loadTrash();
  });
  window.addEventListener("pagehide", () => {
    selectedVaultIds.clear();
    selectedTrashIds.clear();
  });

  void loadVault();
  void loadTrash();
}

void init();
