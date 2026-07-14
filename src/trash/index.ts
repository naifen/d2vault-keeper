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
  exclusionDenialReason,
  filterExcludedRecommendations,
  isExoticItem,
  isFavoriteTagged,
  mergeExclusionSubject,
  stageDenialReason,
  type ExclusionSubject,
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
export {
  createStageMirrorUseCase,
  type StageMirrorPorts,
  type StageMirrorUseCase,
  type StageOutcome,
  type UnstageOutcome,
  type RepairMirrorOutcome,
  type MirrorClearSummary,
} from "./use-case.js";
