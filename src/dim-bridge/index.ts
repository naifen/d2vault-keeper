export type { ApplyFilterResult, DimBridge, SearchInputLocator } from "./types.js";
export { createDimBridge } from "./bridge.js";
export { findDimSearchInput, setNativeInputValue, defaultSearchLocator } from "./dom-search.js";
export {
  createSoftFailTagHooks,
  createMirrorBridgeFromHooks,
  createMessagingMirrorBridge,
  type TagDomHooks,
} from "./tags.js";
export { mutateDimApiProfileTag } from "../dim-api-profile/index.js";
export { createIdbTagHooks, createBrowserIdbTagHooks } from "./idb-tags.js";
