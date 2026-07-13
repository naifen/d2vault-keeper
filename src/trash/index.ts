export type {
  TrashRecord,
  TrashState,
  StageCandidate,
  StageResult,
  StageDenialReason,
  MirrorStatus,
} from "./types.js";
export { TRASH_STORAGE_KEY } from "./types.js";
export {
  canStageDefault,
  isExoticItem,
  isFavoriteTagged,
  stageDenialReason,
} from "./exclusions.js";
export { emptyTrashState, parseTrash, serializeTrash } from "./serializer.js";
export {
  loadTrash,
  saveTrash,
  stageItems,
  unstageItems,
  TRASH_SAFE_COPY,
  type TrashStorage,
} from "./store.js";
export { createBrowserTrashStorage } from "./browser-storage.js";
