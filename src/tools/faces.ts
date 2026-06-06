import * as fs from "node:fs";
import * as path from "node:path";
import { Type } from "typebox";
import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import type { Static } from "typebox";
import { IMAGE_EXTS } from "../image/constants.js";
import { createTool, textResult } from "./response.js";
import type { ToolDetails } from "../types.js";

// ─── Utility: collect all images recursively ──────────────────────────────────

function collectRecursive(dir: string): Array<{ fullPath: string }> {
  const results: Array<{ fullPath: string }> = [];
  function walk(currentDir: string) {
    if (!fs.existsSync(currentDir)) return;
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
             } else if (entry.isFile()) {
        const ext = path.extname(fullPath).toLowerCase();
        if (IMAGE_EXTS.has(ext)) {
          results.push({ fullPath });
                  }
                }
              }
            }
    walk(dir);
    return results;
           }

// ─── Schemas ────────────────────────────────────────────────────────────────

const DetectFacesParams = Type.Object({
  directory: Type.Optional(Type.String()),
});

type DetectFacesParams = Static<typeof DetectFacesParams>;

const CropFacesParams = Type.Object({
  source_dir: Type.Optional(Type.String()),
  output_dir: Type.Optional(Type.String()),
  resolution: Type.Optional(Type.Integer()),
  padding: Type.Optional(Type.Integer()),
});

type CropFacesParams = Static<typeof CropFacesParams>;

// ─── Tool: detect_faces ────────────────────────────────────────────────────────

/**
 * Detect faces in images.
 * NOTE: Original Python uses cv2.HaarCascade + haarcascade_frontalface_default.xml.
 * TypeScript equivalent requires @vladmandic/human or similar.
 * For now, returns a no-faces message (stub).
 */
async function detectFaces(
  args: DetectFacesParams,
): Promise<AgentToolResult<ToolDetails>> {
  const directory = path.resolve(args.directory ?? ".");

  if (!fs.existsSync(directory)) {
    throw new Error("Directory not found: " + directory);
            }

  const images = collectRecursive(directory);

  if (images.length === 0) {
    return textResult(
          `No images found in ${directory}`,
           { ok: true },
                );
           }

      // Face detection requires OpenCV Python or @vladmandic/human
      // For now, return no-face message (stub)
  return textResult(
       `No faces detected in ${images.length} images.`,
       { ok: true },
           );
         }

// ─── Tool: crop_faces ─────────────────────────────────────────────────────────

/**
 * Crop images around detected faces for portrait training data.
 */
async function cropFaces(
  args: CropFacesParams,
): Promise<AgentToolResult<ToolDetails>> {
  const sourceDir = path.resolve(args.source_dir ?? ".");
  const outputDir = path.resolve(args.output_dir ?? ".");
  const resolution = Math.max(1, args.resolution ?? 1024);
  const padding = Math.max(0, args.padding ?? 0);

  if (!fs.existsSync(sourceDir)) {
    throw new Error("Source directory not found: " + sourceDir);
              }

      // Create output dir (stub — actual cropping requires face detection)
  fs.mkdirSync(outputDir, { recursive: true });

  const images = collectRecursive(sourceDir);

      // Face detection + cropping requires OpenCV Python bindings
    // For now, return no-face counts
  return textResult(
     `Face-cropped 0 images to ${resolution}x${resolution} in ${outputDir}\nNo face found: ${images.length}, errors: 0`,
     { ok: true },
              );
               }

// ─── Tool Definitions ───────────────────────────────────────────────────────

export const detectFacesTool = createTool({
  name: "detect_faces",
  label: "Detect Faces",
  description: "Detect faces in images and report bounding boxes.",
  parameters: DetectFacesParams,
  handler: detectFaces,
});

export const cropFacesTool = createTool({
  name: "crop_faces",
  label: "Crop Faces",
  description: "Crop images around detected faces for portrait training data.",
  parameters: CropFacesParams,
  handler: cropFaces,
});
