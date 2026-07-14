export type { ApplyFilterResult, DimBridge, SearchInputLocator } from "./types.js";
export { createDimBridge } from "./bridge.js";
export { findDimSearchInput, setNativeInputValue, defaultSearchLocator } from "./dom-search.js";
export { createMessagingMirrorBridge } from "./tags.js";
export { mutateDimApiProfileTag } from "../dim-api-profile/index.js";
export {
  createIdbMirrorBridge,
  createBrowserIdbMirrorBridge,
  type IdbMirrorBridgeOptions,
} from "./idb-tags.js";
