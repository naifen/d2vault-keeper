/**
 * Re-export vault → Stage projectors (implementation lives in inventory/project).
 * Workbench call sites may import here or from inventory directly.
 */

export {
  toStageCandidate,
  selectedStageCandidates,
} from "../inventory/project.js";
