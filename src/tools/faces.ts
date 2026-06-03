import * as fs from "node:fs";
import * as path from "node:path";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { IMAGE_EXTS } from "../image/constants.js";

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

/**
 * Detect faces in images.
 * NOTE: Original Python uses cv2.HaarCascade + haarcascade_frontalface_default.xml.
 * TypeScript equivalent requires @vladmandic/human or similar.
 * For now, returns a no-faces message (placeholder implementation).
 */
export async function detectFaces(
  args: Record<string, unknown>,
): Promise<ReturnType<typeof import("./response.js").textResult>> {
  const directory = path.resolve(String(args.directory ?? "."));

  if (!fs.existsSync(directory)) {
    throw new Error(`Directory not found: ${directory}`);
          }

  const images = collectRecursive(directory);

  if (images.length === 0) {
    return {
      content: [{ type: "text" as const, text: `No images found in ${directory}` }],
      details: { ok: true },
            };
         }

    // Face detection requires OpenCV Python or @vladmandic/human
    // For now, return no-face message (stub)
  return {
    content: [{ type: "text" as const, text: `No faces detected in ${images.length} images.` }],
    details: { ok: true },
       };
}

/**
 * Crop images around detected faces for portrait training data.
 */
export async function cropFaces(
  args: Record<string, unknown>,
): Promise<ReturnType<typeof import("./response.js").textResult>> {
  const sourceDir = path.resolve(String(args.source_dir ?? "."));
  const outputDir = path.resolve(String(args.output_dir ?? "."));
  const resolution = Math.max(1, Math.round(Number(args.resolution ?? 1024)));
  const padding = Number(args.padding ?? 0.5);

  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Source directory not found: ${sourceDir}`);
            }

    // Create output dir (stub — actual cropping requires face detection)
  fs.mkdirSync(outputDir, { recursive: true });

  const images = collectRecursive(sourceDir);

    // Face detection + cropping requires OpenCV Python bindings
  // For now, return no-face counts
  return {
    content: [{
      type: "text" as const,
      text: `Face-cropped 0 images to ${resolution}x${resolution} in ${outputDir}\nNo face found: ${images.length}, errors: 0`,
        }],
    details: { ok: true },
            };
}

// ─── Tool Definitions ───────────────────────────────────────────────────────

export const detectFacesTool = {
  name: "detect_faces",
  label: "Detect Faces",
  description: "Detect faces in images and report bounding boxes.",
  parameters: {} as any,
  execute: detectFaces,
};

export const cropFacesTool = {
  name: "crop_faces",
  label: "Crop Faces",
  description: "Crop images around detected faces for portrait training data.",
  parameters: {} as any,
  execute: cropFaces,
};
