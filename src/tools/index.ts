import type { Static, TSchema } from "typebox";

import {
  createConfigTool,
  readConfigTool,
  updateConfigTool,
  listConfigsTool,
} from "./config.js";

import {
  searchBingTool,
  searchWikimediaTool,
  downloadImagesTool,
  downloadGalleryTool,
} from "./acquisition.js";

import {
  listImagesTool,
  getImageInfoTool,
  moveImagesTool,
  organizeImagesTool,
} from "./browse.js";

import {
  analyzeQualityTool,
  findDuplicatesTool,
  resizeImagesTool,
  writeCaptionTool,
  detectScreenshotsTool,
} from "./quality.js";

import {
  cropCenterTool,
  cropSmartTool,
} from "./crop.js";

import {
  detectFacesTool,
  cropFacesTool,
} from "./faces.js";

import {
  exportDatasetTool,
} from "./export.js";

/**
 * All custom tools exported in the same order as the Python implementation.
 * Total: 22 tools.
 */
export const ALL_TOOLS = [
  // Config
  createConfigTool,
  readConfigTool,
  updateConfigTool,
  listConfigsTool,
  // Acquisition
  searchBingTool,
  searchWikimediaTool,
  downloadImagesTool,
  downloadGalleryTool,
  // Browse
  listImagesTool,
  getImageInfoTool,
  moveImagesTool,
  organizeImagesTool,
  // Quality
  analyzeQualityTool,
  findDuplicatesTool,
  resizeImagesTool,
  writeCaptionTool,
  detectScreenshotsTool,
  // Crop
  cropCenterTool,
  cropSmartTool,
  // Faces
  detectFacesTool,
  cropFacesTool,
  // Export
  exportDatasetTool,
] as const;

/**
 * All tool names in order, for the pi SDK allowlist.
 */
export const ALL_TOOL_NAMES = ALL_TOOLS.map((tool) => tool.name);

// Re-export individual tool implementations and definitions for direct use
export {
  createConfigTool,
  readConfigTool,
  updateConfigTool,
  listConfigsTool,
};
export {
  searchBingTool,
  searchWikimediaTool,
  downloadImagesTool,
  downloadGalleryTool,
};
export {
  listImagesTool,
  getImageInfoTool,
  moveImagesTool,
  organizeImagesTool,
};
export {
  analyzeQualityTool,
  findDuplicatesTool,
  resizeImagesTool,
  writeCaptionTool,
  detectScreenshotsTool,
};
export {
  cropCenterTool,
  cropSmartTool,
};
export {
  detectFacesTool,
  cropFacesTool,
};
export {
  exportDatasetTool,
};
export type { Static, TSchema } from "typebox";
