import {
  createBrowserTrashStorage,
  loadTrash,
  saveTrash,
  stageItems,
  unstageItems,
  type StageCandidate,
  type TrashState,
} from "../trash/index.js";
import { createEnvelope, type Envelope } from "../messaging/index.js";

const storage = createBrowserTrashStorage();

export async function handleTrashGet(requestId: string): Promise<Envelope> {
  const state = await loadTrash(storage);
  return createEnvelope("trash-result", requestId, {
    ok: true,
    action: "get",
    state,
  });
}

export async function handleTrashStage(
  requestId: string,
  candidates: StageCandidate[],
): Promise<Envelope> {
  const current = await loadTrash(storage);
  const { state, result } = stageItems(current, candidates);
  await saveTrash(storage, state);
  return createEnvelope("trash-result", requestId, {
    ok: true,
    action: "stage",
    state,
    result,
  });
}

export async function handleTrashUnstage(
  requestId: string,
  ids: string[],
): Promise<Envelope> {
  const current = await loadTrash(storage);
  const { state, removed } = unstageItems(current, ids);
  await saveTrash(storage, state);
  return createEnvelope("trash-result", requestId, {
    ok: true,
    action: "unstage",
    state,
    removed,
  });
}

export type { TrashState };
