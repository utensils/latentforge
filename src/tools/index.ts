import type { ToolDefinition } from "@mariozechner/pi-coding-agent";

import {
  createConfigTool,
  readConfigTool,
  updateConfigTool,
  listConfigsTool,
} from "./config.js";

import {
  searchBingTool as searchBingToolDef,
  searchWikimediaTool as searchWikimediaToolDef,
  downloadImagesTool as downloadImagesToolDef,
  downloadGalleryTool as downloadGalleryToolDef,
} from "./acquisition.js";

import {
  listImagesTool as listImagesToolDef,
  getImageInfoTool as getImageInfoToolDef,
  moveImagesTool as moveImagesToolDef,
  organizeImagesTool,
} from "./browse.js";

import {
  analyzeQualityTool as analyzeQualityToolDef,
  findDuplicatesTool as findDuplicatesToolDef,
  resizeImagesTool as resizeImagesToolDef,
  writeCaptionTool as writeCaptionToolDef,
  detectScreenshotsTool as detectScreenshotsToolDef,
} from "./quality.js";

import {
  cropCenterTool as cropCenterToolDef,
  cropSmartTool as cropSmartToolDef,
} from "./crop.js";

import {
  detectFacesTool as detectFacesToolDef,
  cropFacesTool as cropFacesToolDef,
} from "./faces.js";

import {
  exportDatasetTool as exportDatasetToolDef,
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
  searchBingToolDef,
  searchWikimediaToolDef,
  downloadImagesToolDef,
  downloadGalleryToolDef,
    // Dataset management
  listImagesToolDef,
  getImageInfoToolDef,
  moveImagesToolDef,
    // Quality & curation
  analyzeQualityToolDef,
  findDuplicatesToolDef,
  resizeImagesToolDef,
  writeCaptionToolDef,
  detectScreenshotsToolDef,
    // Cropping
  cropCenterToolDef,
  cropSmartToolDef,
    // Faces
  detectFacesToolDef,
  cropFacesToolDef,
    // Export
  exportDatasetToolDef,
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
  searchBingToolDef,
  searchWikimediaToolDef,
  downloadImagesToolDef,
  downloadGalleryToolDef,
};
export {
  listImagesToolDef,
  getImageInfoToolDef,
  moveImagesToolDef,
  organizeImagesTool,
};
export {
  analyzeQualityToolDef,
  findDuplicatesToolDef,
  resizeImagesToolDef,
  writeCaptionToolDef,
  detectScreenshotsToolDef,
};
export {
  cropCenterToolDef,
  cropSmartToolDef,
};
export {
  detectFacesToolDef,
  cropFacesToolDef,
};
export {
  exportDatasetToolDef,
};
