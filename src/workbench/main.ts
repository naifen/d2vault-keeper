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

const statusEl = document.getElementById("conn-status");
const logEl = document.getElementById("roundtrip-log");
const btn = document.getElementById("btn-roundtrip");

function setStatus(text: string, state: "ok" | "err" | "idle" = "idle"): void {
  if (!statusEl) return;
  statusEl.textContent = text;
  if (state === "idle") {
    statusEl.removeAttribute("data-state");
  } else {
    statusEl.setAttribute("data-state", state);
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

async function init(): Promise<void> {
  const ok = await pingBackground();
  setStatus(ok ? "Background connected" : "Background not reachable", ok ? "ok" : "err");
  btn?.addEventListener("click", () => {
    void runRoundTrip();
  });
}

void init();
