import * as fs from "node:fs";
import * as path from "node:path";
import { Type } from "typebox";
import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import type { Static } from "typebox";
import { IMAGE_EXTS } from "../image/constants.js";
import { shannonEntropy } from "../image/entropy.js";
import { createTool } from "./response.js";

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

const CropCenterParams = Type.Object({
  source_dir: Type.Optional(Type.String()),
  output_dir: Type.Optional(Type.String()),
  resolution: Type.Optional(Type.Integer()),
});

type CropCenterParams = Static<typeof CropCenterParams>;

const CropSmartParams = Type.Object({
  source_dir: Type.Optional(Type.String()),
  output_dir: Type.Optional(Type.String()),
  resolution: Type.Optional(Type.Integer()),
});

type CropSmartParams = Static<typeof CropSmartParams>;

// ─── Tool: crop_center ────────────────────────────────────────────────────────

/** Center-crop images to a square, then resize to a target resolution. */
async function cropCenter(
  args: CropCenterParams,
): Promise<AgentToolResult<{ ok: boolean }>> {
  const sourceDir = path.resolve(args.source_dir ?? ".");
  const outputDir = path.resolve(args.output_dir ?? ".");
  const resolution = Math.max(1, args.resolution ?? 1024);

  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Source directory not found: ${sourceDir}`);
       }

  fs.mkdirSync(outputDir, { recursive: true });

  const images = collectRecursive(sourceDir);
  let cropped = 0;
  let skipped = 0;
  let errors = 0;

  for (const img of images) {
    const outPath = path.join(
      outputDir,
        `${path.basename(img.fullPath, path.extname(img.fullPath))}.png`,
      );

    if (fs.existsSync(outPath)) {
      skipped++;
      continue;
         }

    try {
      const sharp = require("sharp") as unknown;
      const sharpMod = (sharp as any).default ?? sharp;
      await sharpMod(img.fullPath)
         .removeAlpha()
         .resize(resolution, resolution, { fit: "cover" })
         .toFormat("png")
         .toFile(outPath);
      cropped++;
         } catch {
      errors++;
        }
       }

  return {
    content: [{
      type: "text" as const,
      text: `Center-cropped ${cropped} images to ${resolution}x${resolution} in ${outputDir}\nSkipped ${skipped} (already exist), ${errors} errors`,
       }],
    details: { ok: true },
      };
}

// ─── Tool: crop_smart ─────────────────────────────────────────────────────────

/** Smart-crop to the highest-entropy region, resize to resolution. */
async function cropSmart(
  args: CropSmartParams,
): Promise<AgentToolResult<{ ok: boolean }>> {
  const sourceDir = path.resolve(args.source_dir ?? ".");
  const outputDir = path.resolve(args.output_dir ?? ".");
  const resolution = Math.max(1, args.resolution ?? 1024);

  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Source directory not found: ${sourceDir}`);
       }

  fs.mkdirSync(outputDir, { recursive: true });

  const images = collectRecursive(sourceDir);
  let cropped = 0;
  let skipped = 0;
  let errors = 0;

  for (const img of images) {
    const outPath = path.join(
      outputDir,
         `${path.basename(img.fullPath, path.extname(img.fullPath))}.png`,
      );

    if (fs.existsSync(outPath)) {
      skipped++;
      continue;
        }

    try {
      const sharp = require("sharp") as unknown;
      const sharpMod = (sharp as any).default ?? sharp;

        // Load image, convert to RGB raw, analyze for highest entropy crop
       const buffer = await sharpMod(img.fullPath)
           .removeAlpha()
           .resize({ width: 512, height: 512, fit: "inside" })
           .raw()
           .toBuffer({ resolveWithObject: true });

       const data = buffer.data;
       const w = buffer.info.width;
       const h = buffer.info.height;
       const side = Math.min(w, h);

       // Slide square window across longer axis, pick highest entropy
       if (w > h) {
        const step = Math.max(1, Math.floor((w - side) / 10));
        for (let x = 0; x <= w - side; x += step) {
          const cropData = new Uint8Array(side * side * 4);
          for (let cy = 0; cy < side; cy++) {
            for (let cx = 0; cx < side; cx++) {
              const srcIdx = ((cy + 0) * w + (cx + x)) * 4;
              const dstIdx = (cy * side + cx) * 4;
              cropData[dstIdx] = data[srcIdx];
              cropData[dstIdx + 1] = data[srcIdx + 1];
              cropData[dstIdx + 2] = data[srcIdx + 2];
              cropData[dstIdx + 3] = data[srcIdx + 3];
               }
             }
          const entropy = shannonEntropy(cropData, side, side);
          if (entropy > 0) {
            await sharpMod(img.fullPath)
               .removeAlpha()
               .extract({ left: x, top: 0, width: side, height: side })
               .resize(resolution, resolution)
               .toFormat("png")
               .toFile(outPath);
            cropped++;
            break;
            }
          }
         } else {
          const step = Math.max(1, Math.floor((h - side) / 10));
          for (let y = 0; y <= h - side; y += step) {
            const cropData = new Uint8Array(side * side * 4);
            for (let cy = 0; cy < side; cy++) {
              for (let cx = 0; cx < side; cx++) {
                const srcIdx = ((cy + y) * w + (cx + 0)) * 4;
                const dstIdx = (cy * side + cx) * 4;
                cropData[dstIdx] = data[srcIdx];
                cropData[dstIdx + 1] = data[srcIdx + 1];
                cropData[dstIdx + 2] = data[srcIdx + 2];
                cropData[dstIdx + 3] = data[srcIdx + 3];
                 }
               }
            const entropy = shannonEntropy(cropData, side, side);
            if (entropy > 0) {
              await sharpMod(img.fullPath)
                 .removeAlpha()
                 .extract({ left: 0, top: y, width: side, height: side })
                 .resize(resolution, resolution)
                 .toFormat("png")
                 .toFile(outPath);
              cropped++;
              break;
            }
               }
             }

       // Fallback: just resize without crop
      if (fs.statSync(outPath).size === 0) {
        await sharpMod(img.fullPath)
         .removeAlpha()
         .resize(resolution, resolution)
         .toFormat("png")
         .toFile(outPath);
        cropped++;
           }
         } catch {
      errors++;
        }
      }

  return {
    content: [{
      type: "text" as const,
      text: `Smart-cropped ${cropped} images to ${resolution}x${resolution} in ${outputDir}\nSkipped ${skipped} (already exist), ${errors} errors`,
       }],
    details: { ok: true },
     };
}

// ─── Tool Definitions ───────────────────────────────────────────────────────

export const cropCenterTool = createTool({
  name: "crop_center",
  label: "Crop Center",
  description:
       "Center-crop images to a square, resize to target resolution.",
  parameters: CropCenterParams,
  handler: cropCenter,
});

export const cropSmartTool = createTool({
  name: "crop_smart",
  label: "Crop Smart",
  description:
       "Smart-crop to highest-entropy region, resize to resolution.",
  parameters: CropSmartParams,
  handler: cropSmart,
});
