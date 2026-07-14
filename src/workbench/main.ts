/**
 * Workbench side panel UI — composer-first (variant C).
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
import { formatPerkHoverLine } from "./perk-display.js";
import { planAfterSuggest, type ResultsTab } from "./shell-state.js";
import { recRowsFromAgent, runStageSelection } from "./stage-selection.js";
import { matchVaultItems } from "./match-filter.js";

ensureBrowser();

const ROW_HEIGHT = 28;

const statusEl = document.getElementById("conn-status");
const logEl = document.getElementById("roundtrip-log");
const btnRoundtrip = document.getElementById("btn-roundtrip");
const vaultStatusEl = document.getElementById("vault-status");
const resultsListEl = document.getElementById("results-list");
const resultsSectionEl = document.getElementById("section-results");
const btnRefreshVault = document.getElementById("btn-refresh-vault");
const filterInput = document.getElementById("filter-input") as HTMLTextAreaElement | null;
const filterStatusEl = document.getElementById("filter-status");
const resultsStatusEl = document.getElementById("results-status");
const btnApply = document.getElementById("btn-apply-filter");
const btnClearFilter = document.getElementById("btn-clear-filter");
const btnCopyFilter = document.getElementById("btn-copy-filter");
const trashListEl = document.getElementById("trash-list");
const trashStatusEl = document.getElementById("trash-status");
const trashBodyEl = document.getElementById("trash-body");
const trashPeekLabel = document.getElementById("trash-peek-label");
const trashPeekHint = document.getElementById("trash-peek-hint");
const btnTrashToggle = document.getElementById("btn-trash-toggle");
const btnStage = document.getElementById("btn-stage");
const btnUnstage = document.getElementById("btn-unstage");
const btnRefreshTrash = document.getElementById("btn-refresh-trash");
const btnRepairMirror = document.getElementById("btn-repair-mirror");
const trashHelpEl = document.getElementById("trash-help");
const apiKeyInput = document.getElementById("api-key") as HTMLInputElement | null;
const btnSaveKey = document.getElementById("btn-save-key");
const intentionInput = document.getElementById("intention-input") as HTMLTextAreaElement | null;
const vaultOptIn = document.getElementById("vault-opt-in") as HTMLInputElement | null;
const btnSuggest = document.getElementById("btn-suggest") as HTMLButtonElement | null;
const btnCancelAgent = document.getElementById("btn-cancel-agent") as HTMLButtonElement | null;
const btnOpenSettingsCta = document.getElementById("btn-open-settings-cta");
const btnSettings = document.getElementById("btn-settings");
const btnSettingsClose = document.getElementById("btn-settings-close");
const settingsScrim = document.getElementById("settings-scrim");
const agentStatusEl = document.getElementById("agent-status");
const agentExplanationEl = document.getElementById("agent-explanation");
const tabMatches = document.getElementById("tab-matches");
const tabRecs = document.getElementById("tab-recs");

let vaultItems: VaultItem[] = [];
let trashItems: TrashRecord[] = [];
let agentRecs: AgentRecommendation[] = [];
let resultsTab: ResultsTab = "matches";
let resultsExpanded = false;
let trashExpanded = false;
let hasApiKey = false;
let agentRunning = false;
/** Monotonic token so only the latest Suggest run clears the running UI flag. */
let suggestGeneration = 0;
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
  setElStatus(statusEl, text.startsWith("Connection") ? text : `Connection: ${text}`, state);
}

function setVaultStatus(text: string, state: StatusState = "idle"): void {
  setElStatus(vaultStatusEl, text, state);
}

function setFilterStatus(text: string, state: StatusState = "idle"): void {
  setElStatus(filterStatusEl, text, state);
}

function setResultsStatus(text: string, state: StatusState = "idle"): void {
  setElStatus(resultsStatusEl, text, state);
}

function setTrashStatus(text: string, state: StatusState = "idle"): void {
  setElStatus(trashStatusEl, text, state);
}

function setAgentStatus(text: string, state: StatusState = "idle"): void {
  setElStatus(agentStatusEl, text, state);
}

function updateSuggestGating(): void {
  if (!btnSuggest) return;
  const canSuggest = hasApiKey && !agentRunning;
  btnSuggest.disabled = !canSuggest;
  btnSuggest.title = hasApiKey
    ? "Run Agent from Intention"
    : "Save an API key in Settings";
  if (btnOpenSettingsCta) {
    btnOpenSettingsCta.hidden = hasApiKey;
  }
  if (btnCancelAgent) {
    btnCancelAgent.hidden = !agentRunning;
  }
}

function openSettings(): void {
  if (settingsScrim) settingsScrim.hidden = false;
  apiKeyInput?.focus();
}

function closeSettings(): void {
  if (settingsScrim) settingsScrim.hidden = true;
  // Restore focus to Settings gear for keyboard users.
  btnSettings?.focus();
}

function setResultsExpanded(open: boolean): void {
  resultsExpanded = open;
  if (resultsSectionEl) {
    resultsSectionEl.setAttribute("data-collapsed", open ? "false" : "true");
  }
}

function setResultsTab(tab: ResultsTab): void {
  resultsTab = tab;
  tabMatches?.setAttribute("aria-selected", tab === "matches" ? "true" : "false");
  tabRecs?.setAttribute("aria-selected", tab === "recs" ? "true" : "false");
  renderResultsList();
}

function currentResultRows(): Array<VaultItem & { reason?: string }> {
  if (resultsTab === "recs") {
    return recRowsFromAgent(agentRecs, vaultItems);
  }
  // Matches: vault hits for the current DIM filter card (best-effort local eval).
  return matchVaultItems(vaultItems, filterInput?.value ?? "");
}

function rowTitle(item: VaultItem & { reason?: string }, perkLine: string): string {
  const bits = [item.name, perkLine];
  if (item.reason) bits.push(item.reason);
  bits.push(item.id);
  return bits.join(" — ");
}

function matchesEmptyMessage(): string {
  if (!resultsExpanded) {
    return "Results collapsed — Suggest or refresh vault to expand.";
  }
  if (vaultItems.length === 0) {
    return "No vault items loaded. Refresh vault or open DIM logged in.";
  }
  const q = (filterInput?.value ?? "").trim();
  if (q) {
    return "No Matches for this filter in the vault cache (best-effort local eval).";
  }
  return "No vault matches. Refresh vault or Suggest.";
}

function renderResultsList(): void {
  if (!resultsListEl) return;
  const savedScrollTop = resultsListEl.scrollTop;
  const focusedId =
    document.activeElement instanceof HTMLElement
      ? document.activeElement.closest(".vault-row")?.getAttribute("data-id") ?? null
      : null;
  const rows = currentResultRows();

  if (rows.length === 0) {
    resultsListEl.replaceChildren();
    const empty = document.createElement("div");
    empty.className = "vault-list-empty";
    empty.textContent =
      resultsTab === "recs"
        ? "No recommendations (Stage is always manual)."
        : matchesEmptyMessage();
    resultsListEl.appendChild(empty);
    return;
  }

  const viewportHeight = resultsListEl.clientHeight || 220;
  const win = visibleWindow(savedScrollTop, viewportHeight, rows.length, ROW_HEIGHT);

  const spacer = document.createElement("div");
  spacer.className = "vault-list-spacer";
  spacer.style.height = `${win.totalHeight}px`;

  const windowEl = document.createElement("div");
  windowEl.className = "vault-list-window";
  windowEl.style.top = `${win.offsetY}px`;

  let restoreFocusEl: HTMLElement | null = null;

  for (let i = win.startIndex; i < win.endIndex; i++) {
    const item = rows[i]!;
    const row = document.createElement("div");
    row.className = "vault-row";
    row.setAttribute("role", "listitem");
    row.dataset.id = item.id;
    row.tabIndex = 0;
    const perkLine = formatPerkHoverLine(item.perks);
    const title = rowTitle(item, perkLine);
    row.title = title;
    row.setAttribute("aria-label", title);
    row.setAttribute("aria-description", perkLine);

    const check = document.createElement("input");
    check.type = "checkbox";
    check.className = "vault-row-check";
    check.checked = selectedVaultIds.has(item.id);
    check.setAttribute("aria-label", `Select ${item.name}`);
    check.addEventListener("change", () => {
      if (check.checked) selectedVaultIds.add(item.id);
      else selectedVaultIds.delete(item.id);
    });

    const name = document.createElement("span");
    name.className = "vault-row-name";
    name.textContent = item.name;

    const meta = document.createElement("span");
    meta.className = "vault-row-meta";
    const bits = [
      item.tierType,
      item.itemType,
      item.power !== undefined ? `⚡${item.power}` : undefined,
      item.quantity > 1 ? `×${item.quantity}` : undefined,
      item.reason,
    ].filter(Boolean);
    meta.textContent = bits.join(" · ") || `#${item.itemHash}`;

    const perkTip = document.createElement("span");
    perkTip.className = "vault-row-perks";
    perkTip.textContent = perkLine;
    perkTip.setAttribute("aria-hidden", "true");

    row.append(check, name, meta, perkTip);
    if (focusedId && item.id === focusedId) restoreFocusEl = row;
    windowEl.appendChild(row);
  }

  spacer.appendChild(windowEl);
  resultsListEl.replaceChildren(spacer);
  resultsListEl.scrollTop = savedScrollTop;
  restoreFocusEl?.focus({ preventScroll: true });
}

function updateTrashPeek(): void {
  if (trashPeekLabel) trashPeekLabel.textContent = `Trash · ${trashItems.length}`;
  if (trashPeekHint) trashPeekHint.textContent = trashExpanded ? "Collapse" : "Expand";
  if (btnTrashToggle) btnTrashToggle.setAttribute("aria-expanded", trashExpanded ? "true" : "false");
  if (trashBodyEl) trashBodyEl.hidden = !trashExpanded;
}

function renderTrashList(): void {
  if (!trashListEl) return;
  trashListEl.replaceChildren();
  if (trashItems.length === 0) {
    const li = document.createElement("li");
    li.textContent = TRASH_SAFE_COPY.empty;
    li.className = "wb-muted";
    trashListEl.appendChild(li);
    updateTrashPeek();
    return;
  }
  for (const item of trashItems) {
    const li = document.createElement("li");
    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = selectedTrashIds.has(item.id);
    check.setAttribute("aria-label", `Select staged ${item.name}`);
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
  updateTrashPeek();
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
  if (out.ok) {
    setFilterStatus(`Applied to DIM: ${out.query || "(empty)"}`, "ok");
    setResultsExpanded(true);
    if (resultsTab === "matches") renderResultsList();
  } else {
    setFilterStatus(out.error, "err");
  }
}

async function clearFilter(): Promise<void> {
  setFilterStatus("Clearing…");
  const out = await client.clearFilter();
  if (out.ok) {
    if (filterInput) filterInput.value = "";
    setFilterStatus("Cleared DIM search", "ok");
    if (resultsTab === "matches") renderResultsList();
  } else {
    setFilterStatus(out.error, "err");
  }
}

async function copyFilter(): Promise<void> {
  const text = filterInput?.value ?? "";
  try {
    await navigator.clipboard.writeText(text);
    setFilterStatus(text ? "Copied filter to clipboard" : "Copied (empty)", "ok");
  } catch {
    // Fallback for restricted clipboard
    if (filterInput) {
      filterInput.focus();
      filterInput.select();
    }
    setFilterStatus("Select filter text and copy manually", "err");
  }
}

async function loadVault(): Promise<void> {
  setVaultStatus("Loading vault…");
  const out = await client.loadVault();
  if (!out.ok) {
    vaultItems = [];
    setVaultStatus(`Vault error: ${out.error}`, "err");
    renderResultsList();
    return;
  }
  vaultItems = out.items;
  if (out.status.state === "ok") {
    setVaultStatus(`Vault: ${out.items.length} items (membership ${out.status.membershipId})`, "ok");
    if (out.items.length > 0) setResultsExpanded(true);
  } else if (out.status.state === "empty" || out.status.state === "error") {
    setVaultStatus(out.status.message, "err");
  }
  renderResultsList();
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
  // Snapshot selection before clear. Deep module owns pool + filter + stage order.
  // Does NOT auto-Apply the Selection filter to DIM.
  const selectedSnapshot = new Set(selectedVaultIds);
  const outcome = await runStageSelection(
    {
      vaultItems,
      recommendations: agentRecs,
      selectedIds: selectedSnapshot,
    },
    (pool, ids) => client.stage(pool, ids),
  );
  const out = outcome.stage;
  if (!out.ok) {
    setTrashStatus(out.error, "err");
    setResultsStatus(out.error, "err");
    return;
  }

  if (outcome.selectionFilter !== null && filterInput) {
    filterInput.value = outcome.selectionFilter;
    setFilterStatus(
      outcome.selectionFilter
        ? "Selection filter updated (not applied to DIM — click Apply)"
        : "Selection had no instance ids for id: filter",
      "ok",
    );
  }

  trashItems = out.items;
  selectedVaultIds.clear();
  let msg = TRASH_SAFE_COPY.stagedOk(out.staged.length);
  if (out.denied.length) {
    msg += ` Denied ${out.denied.length} (exotic/favorite/already).`;
  }
  setTrashStatus(msg, out.staged.length > 0 ? "ok" : "err");
  setResultsStatus(msg, out.staged.length > 0 ? "ok" : "err");
  renderTrashList();
  renderResultsList();
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
    hasApiKey = true;
    updateSuggestGating();
    setAgentStatus("API key saved in extension storage (not logged)", "ok");
    if (apiKeyInput) {
      apiKeyInput.value = "";
      apiKeyInput.placeholder = "•••••••• (saved)";
    }
  } else {
    setAgentStatus(out.error, "err");
  }
}

async function loadSettings(): Promise<void> {
  const out = await client.loadSettings();
  if (out.ok) {
    hasApiKey = out.hasKey;
    if (hasApiKey && apiKeyInput) {
      apiKeyInput.placeholder = "•••••••• (saved)";
    }
  }
  updateSuggestGating();
}

/**
 * Suggest: run agent, fill filter + explanation, open Results (Recs if any else Matches).
 * Never auto-Applies or auto-Stages.
 */
async function runSuggest(): Promise<void> {
  if (!hasApiKey) {
    setAgentStatus("API key required — open Settings", "err");
    openSettings();
    return;
  }
  if (agentRunning) {
    setAgentStatus("Agent already running — Cancel or wait", "err");
    return;
  }
  const gen = ++suggestGeneration;
  agentRunning = true;
  updateSuggestGating();
  setAgentStatus("Running agent…");
  const out = await client.runAgent({
    intention: intentionInput?.value ?? "",
    vaultContextOptIn: vaultOptIn?.checked === true,
    vaultItems,
  });
  // Only the latest generation owns the running flag (guards Cancel / double Enter).
  if (gen === suggestGeneration) {
    agentRunning = false;
    updateSuggestGating();
  }

  if (!out.ok) {
    if (gen === suggestGeneration) {
      setAgentStatus(out.error === "cancelled" ? "Agent cancelled" : out.error, "err");
    }
    return;
  }
  if (gen !== suggestGeneration) return;

  // Pure shell plan — do not Apply to DIM; do not Stage.
  const plan = planAfterSuggest(out.result);
  if (filterInput) {
    filterInput.value = plan.filterText;
  }
  if (agentExplanationEl) {
    agentExplanationEl.textContent = plan.explanation;
  }
  agentRecs = plan.recommendations;
  setResultsExpanded(true);
  setResultsTab(plan.resultsTab);
  setAgentStatus(
    `Suggest done — ${out.result.filters.length} filter(s), ${plan.recommendations.length} rec(s). Stage and Apply are manual.`,
    "ok",
  );
}

async function cancelAgent(): Promise<void> {
  suggestGeneration += 1;
  agentRunning = false;
  updateSuggestGating();
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
  updateTrashPeek();
  updateSuggestGating();

  const ok = await client.ping();
  setStatus(ok ? "Background connected" : "Background not reachable", ok ? "ok" : "err");
  await loadSettings();

  btnRoundtrip?.addEventListener("click", () => {
    void runRoundTrip();
  });
  btnRefreshVault?.addEventListener("click", () => {
    void loadVault();
  });
  btnApply?.addEventListener("click", () => {
    void applyFilter();
  });
  btnClearFilter?.addEventListener("click", () => {
    void clearFilter();
  });
  btnCopyFilter?.addEventListener("click", () => {
    void copyFilter();
  });
  filterInput?.addEventListener("keydown", (e) => {
    // Ignore IME composition Enter (keyCode 229) so CJK confirm does not Apply.
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      void applyFilter();
    }
  });
  // Keep Matches list in sync with the editable filter card.
  filterInput?.addEventListener("input", () => {
    if (resultsTab === "matches") renderResultsList();
  });
  // Enter Suggests; Shift+Enter newline (skip IME composition confirm).
  intentionInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      void runSuggest();
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
  btnSuggest?.addEventListener("click", () => {
    void runSuggest();
  });
  btnCancelAgent?.addEventListener("click", () => {
    void cancelAgent();
  });
  btnRepairMirror?.addEventListener("click", () => {
    void repairMirror();
  });
  btnSettings?.addEventListener("click", () => openSettings());
  btnSettingsClose?.addEventListener("click", () => closeSettings());
  btnOpenSettingsCta?.addEventListener("click", () => openSettings());
  settingsScrim?.addEventListener("click", (e) => {
    if (e.target === settingsScrim) closeSettings();
  });
  // Simple focus trap while Settings is open (Tab cycles within sheet).
  settingsScrim?.addEventListener("keydown", (e) => {
    if (e.key !== "Tab" || !settingsScrim || settingsScrim.hidden) return;
    const sheet = document.getElementById("settings-sheet");
    if (!sheet) return;
    const focusable = [
      ...sheet.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    ].filter((el) => !el.hasAttribute("hidden") && el.offsetParent !== null);
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });
  btnTrashToggle?.addEventListener("click", () => {
    trashExpanded = !trashExpanded;
    updateTrashPeek();
  });
  tabMatches?.addEventListener("click", () => setResultsTab("matches"));
  tabRecs?.addEventListener("click", () => setResultsTab("recs"));
  resultsListEl?.addEventListener(
    "scroll",
    () => {
      renderResultsList();
    },
    { passive: true },
  );

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && settingsScrim && !settingsScrim.hidden) {
      closeSettings();
    }
  });

  // Refresh only while Workbench is focused (no background pollers / no closed-sidebar timers).
  window.addEventListener("focus", () => {
    void loadVault();
    void loadTrash();
    void loadSettings();
  });
  window.addEventListener("pagehide", () => {
    selectedVaultIds.clear();
    selectedTrashIds.clear();
  });

  void loadVault();
  void loadTrash();
}

void init();
