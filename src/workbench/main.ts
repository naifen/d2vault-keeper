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
import type { StageCandidate, TrashRecord, TrashState } from "../trash/index.js";
import { TRASH_SAFE_COPY } from "../trash/index.js";
import type { AgentRecommendation, AgentResult } from "../agent/index.js";
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
    const res = await browser.runtime.sendMessage(createEnvelope("filter-clear", newRequestId()));
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

async function loadTrash(): Promise<void> {
  try {
    const res = await browser.runtime.sendMessage(createEnvelope("trash-get", newRequestId()));
    if (!isEnvelope(res) || res.kind !== "trash-result") {
      setTrashStatus("Trash load failed", "err");
      return;
    }
    const payload = res.payload as { state?: TrashState };
    trashItems = payload.state?.items ?? [];
    selectedTrashIds.clear();
    setTrashStatus(`Trash: ${trashItems.length} staged (not deleted from Destiny)`, "ok");
    renderTrashList();
  } catch (err) {
    setTrashStatus(`Trash error: ${String(err)}`, "err");
  }
}

async function stageSelected(): Promise<void> {
  // No confirmation modal — Stage is intentional and reversible via Unstage.
  const candidates: StageCandidate[] = vaultItems
    .filter((v) => selectedVaultIds.has(v.id))
    .map((v) => {
      const c: StageCandidate = {
        id: v.id,
        itemHash: v.itemHash,
        name: v.name,
      };
      if (v.tierType !== undefined) c.tierType = v.tierType;
      if (v.itemType !== undefined) c.itemType = v.itemType;
      if (v.isExotic !== undefined) c.isExotic = v.isExotic;
      if (v.tag !== undefined) c.tag = v.tag;
      return c;
    });
  if (candidates.length === 0) {
    setTrashStatus("Select vault items to stage", "err");
    return;
  }
  try {
    const res = await browser.runtime.sendMessage(
      createEnvelope("trash-stage", newRequestId(), { candidates }),
    );
    if (!isEnvelope(res) || res.kind !== "trash-result") {
      setTrashStatus("Stage failed", "err");
      return;
    }
    const payload = res.payload as {
      state?: TrashState;
      result?: { staged: TrashRecord[]; denied: Array<{ id: string; reason: string }> };
    };
    trashItems = payload.state?.items ?? [];
    selectedVaultIds.clear();
    const stagedN = payload.result?.staged.length ?? 0;
    const denied = payload.result?.denied ?? [];
    let msg = TRASH_SAFE_COPY.stagedOk(stagedN);
    if (denied.length) {
      msg += ` Denied ${denied.length} (exotic/favorite/already).`;
    }
    setTrashStatus(msg, stagedN > 0 ? "ok" : "err");
    renderTrashList();
    renderVaultList();
  } catch (err) {
    setTrashStatus(`Stage error: ${String(err)}`, "err");
  }
}

async function unstageSelected(): Promise<void> {
  const ids = [...selectedTrashIds];
  if (ids.length === 0) {
    setTrashStatus("Select Trash items to unstage", "err");
    return;
  }
  try {
    const res = await browser.runtime.sendMessage(
      createEnvelope("trash-unstage", newRequestId(), { ids }),
    );
    if (!isEnvelope(res) || res.kind !== "trash-result") {
      setTrashStatus("Unstage failed", "err");
      return;
    }
    const payload = res.payload as { state?: TrashState; removed?: TrashRecord[] };
    trashItems = payload.state?.items ?? [];
    selectedTrashIds.clear();
    setTrashStatus(`Unstaged ${payload.removed?.length ?? 0}. Still not a Destiny delete.`, "ok");
    renderTrashList();
  } catch (err) {
    setTrashStatus(`Unstage error: ${String(err)}`, "err");
  }
}

function setAgentStatus(text: string, state: StatusState = "idle"): void {
  setElStatus(agentStatusEl, text, state);
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

async function saveApiKey(): Promise<void> {
  const apiKey = (apiKeyInput?.value ?? "").trim();
  // Empty field after mask clear must not wipe the stored key.
  if (!apiKey || apiKey === "••••••••") {
    setAgentStatus("Enter a new API key to update (empty save ignored)", "err");
    return;
  }
  const res = await browser.runtime.sendMessage(
    createEnvelope("agent-settings-set", newRequestId(), { apiKey }),
  );
  if (isEnvelope(res) && res.kind === "agent-settings-result") {
    setAgentStatus("API key saved in extension storage (not logged)", "ok");
    if (apiKeyInput) {
      apiKeyInput.value = "";
      apiKeyInput.placeholder = "•••••••• (saved)";
    }
  } else {
    setAgentStatus("Failed to save API key", "err");
  }
}

async function runAgentLoop(): Promise<void> {
  const intention = intentionInput?.value ?? "";
  const optIn = vaultOptIn?.checked === true;
  setAgentStatus("Running agent…");
  // Vault dump only when checkbox opt-in for this run.
  const vaultSlice = optIn
    ? vaultItems.slice(0, 200).map((v) => {
        const row: {
          id: string;
          itemHash: number;
          name: string;
          tierType?: string;
          tag?: string;
        } = { id: v.id, itemHash: v.itemHash, name: v.name };
        if (v.tierType !== undefined) row.tierType = v.tierType;
        if (v.tag !== undefined) row.tag = v.tag;
        return row;
      })
    : undefined;

  try {
    const payload: {
      intention: string;
      vaultContextOptIn: boolean;
      vaultSlice?: typeof vaultSlice;
    } = {
      intention,
      vaultContextOptIn: optIn,
    };
    if (optIn && vaultSlice) payload.vaultSlice = vaultSlice;

    const res = await browser.runtime.sendMessage(
      createEnvelope("agent-run", newRequestId(), payload),
    );
    if (!isEnvelope(res) || res.kind !== "agent-result") {
      setAgentStatus("Agent failed: bad response", "err");
      return;
    }
    const body = res.payload as {
      ok?: boolean;
      cancelled?: boolean;
      error?: string;
      result?: AgentResult;
    };
    if (body.cancelled) {
      setAgentStatus("Agent cancelled", "err");
      return;
    }
    if (!body.ok || !body.result) {
      setAgentStatus(body.error ?? "Agent failed", "err");
      return;
    }
    const result = body.result;
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
  } catch (err) {
    setAgentStatus(`Agent error: ${String(err)}`, "err");
  }
}

async function cancelAgent(): Promise<void> {
  await browser.runtime.sendMessage(createEnvelope("agent-cancel", newRequestId()));
  setAgentStatus("Cancel requested", "err");
}

async function init(): Promise<void> {
  if (trashHelpEl) trashHelpEl.textContent = TRASH_SAFE_COPY.sectionHelp;

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
    void (async () => {
      try {
        const res = await browser.runtime.sendMessage(
          createEnvelope("trash-repair-mirror", newRequestId()),
        );
        if (!isEnvelope(res) || res.kind !== "trash-result") {
          setTrashStatus("Repair Mirror failed", "err");
          return;
        }
        const payload = res.payload as { state?: TrashState; repaired?: TrashRecord[] };
        trashItems = payload.state?.items ?? [];
        setTrashStatus(
          `Repair Mirror: ${payload.repaired?.length ?? 0} row(s) attempted (Trash never rolled back)`,
          "ok",
        );
        renderTrashList();
      } catch (err) {
        setTrashStatus(`Repair error: ${String(err)}`, "err");
      }
    })();
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
