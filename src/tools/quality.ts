import * as fs from "node:fs";
import * as path from "node:path";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { IMAGE_EXTS } from "../image/constants.js";
import { readImageMetadata } from "../image/metadata.js";
import { phash, hammingDistance } from "../image/phash.js";
import { isScreenshot } from "../image/screenshot.js";

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

// ─── Tool: analyze_quality ────────────────────────────────────────────────────

/**
 * Analyze resolution distribution, file sizes, and format stats.
 */
export async function analyzeQuality(
  args: Record<string, unknown>,
): Promise<ReturnType<typeof import("./response.js").textResult>> {
  const directory = path.resolve(String(args.directory ?? "."));
  if (!fs.existsSync(directory)) {
      throw new Error("Directory not found: " + directory);
        }

  const images = collectRecursive(directory);
  if (images.length === 0) {
      return {
          content: [{ type: "text" as const, text: "No images found in " + directory }],
          details: { ok: true },
          };
      }

  const sizeBuckets: Record<string, number> = {
      "excellent_500kb+": 0,
      "good_100_500kb": 0,
      "ok_50_100kb": 0,
      "small_10_50kb": 0,
      "tiny_under_10kb": 0,
      };
  const resolutionBuckets: Record<string, number> = {
      "1024+": 0,
      "512_1024": 0,
      "256_512": 0,
      "under_256": 0,
       };
  const formats: Record<string, number> = {};
  let totalSizeBytes = 0;
  const widths: number[] = [];
  const heights: number[] = [];

  for (const img of images) {
      try {
          const stat = fs.statSync(img.fullPath);
          const sizeKb = stat.size / 1024;
          totalSizeBytes += stat.size;
          const ext = path.extname(img.fullPath).toLowerCase();
          const fv = formats[ext] ?? 0; formats[ext] = fv + 1;

          if (sizeKb >= 500) sizeBuckets["excellent_500kb+"] = (sizeBuckets["excellent_500kb+"] || 0) + 1;
          else if (sizeKb >= 100) sizeBuckets["good_100_500kb"] = (sizeBuckets["good_100_500kb"] || 0) + 1;
          else if (sizeKb >= 50) sizeBuckets["ok_50_100kb"] = (sizeBuckets["ok_50_100kb"] || 0) + 1;
          else if (sizeKb >= 10) sizeBuckets["small_10_50kb"] = (sizeBuckets["small_10_50kb"] || 0) + 1;
          else sizeBuckets["tiny_under_10kb"] = (sizeBuckets["tiny_under_10kb"] || 0) + 1;

          const meta = await readImageMetadata(img.fullPath);
          const w = meta.width ?? 0;
          const h = meta.height ?? 0;
          if (w > 0 && h > 0) {
              widths.push(w);
              heights.push(h);
              const minDim = Math.min(w, h);
              if (minDim >= 1024) resolutionBuckets["1024+"] = (resolutionBuckets["1024+"] || 0) + 1;
              else if (minDim >= 512) resolutionBuckets["512_1024"] = (resolutionBuckets["512_1024"] || 0) + 1;
              else if (minDim >= 256) resolutionBuckets["256_512"] = (resolutionBuckets["256_512"] || 0) + 1;
              else resolutionBuckets["under_256"] = (resolutionBuckets["under_256"] || 0) + 1;
               }
             } catch {
                 // Skip unreadable images
                 }
               }

  const stats: Record<string, unknown> = {
      total: images.length,
      formats,
      size_buckets: sizeBuckets,
      resolution_buckets: resolutionBuckets,
      total_size_mb: Math.round(totalSizeBytes / (1024 * 1024) * 10) / 10,
       };

  if (widths.length > 0) {
      stats.avg_width = Math.round(widths.reduce((a, b) => a + b, 0) / widths.length);
      stats.avg_height = Math.round(heights.reduce((a, b) => a + b, 0) / heights.length);
      stats.min_resolution = Math.min(...widths) + "x" + Math.min(...heights);
      stats.max_resolution = Math.max(...widths) + "x" + Math.max(...heights);
          }

  return {
      content: [{ type: "text" as const, text: JSON.stringify(stats, null, 2) }],
      details: { ok: true },
          };
        }

// ─── Tool: find_duplicates ────────────────────────────────────────────────────

/**
 * Find perceptual hash (pHash) duplicate image pairs in a directory.
 */
export async function findDuplicates(
  args: Record<string, unknown>,
): Promise<ReturnType<typeof import("./response.js").textResult>> {
  const directory = path.resolve(String(args.directory ?? "."));
  const threshold = Math.max(0, Math.min(32, Math.round(Number(args.threshold ?? 8))));
  if (!fs.existsSync(directory)) {
      throw new Error("Directory not found: " + directory);
        }

  const images = collectRecursive(directory);
  const hashes: Array<{ path: string; hash: bigint }> = [];
  for (const img of images) {
      try {
          const hash = await phash(img.fullPath);
          hashes.push({ path: img.fullPath, hash });
           } catch {
               // Skip unreadable images
               }
             }

  const pairs: Array<{ file1: string; file2: string; distance: number }> = [];
  for (let i = 0; i < hashes.length; i++) {
      for (let j = i + 1; j < hashes.length; j++) {
        const hi = hashes[i];
        const hj = hashes[j];
        if (!hi || !hj) continue;
          const dist = hammingDistance(hi.hash, hj.hash);
          if (dist <= threshold) {
              pairs.push({
                  file1: hi.path,
                  file2: hj.path,
                  distance: dist,
                   });
                   }
                 }
               }

  if (pairs.length === 0) {
      return {
          content: [{
              type: "text" as const,
              text: "No duplicates found (threshold=" + threshold + ") among " + hashes.length + " images.",
              }],
          details: { ok: true },
              };
              }

  const lines: string[] = [
       "Found " + pairs.length + " duplicate pairs (threshold=" + threshold + "):\n",
       ...pairs.map((d) => "       distance=" + d.distance + ": " + d.file1 + " <-> " + d.file2),
         ];

  return {
       content: [{ type: "text" as const, text: lines.join("\n") }],
       details: { ok: true },
        };
      }

// ─── Tool: resize_images ──────────────────────────────────────────────────────

/** Batch resize images to a training resolution. */
export async function resizeImages(
  args: Record<string, unknown>,
): Promise<ReturnType<typeof import("./response.js").textResult>> {
  const sourceDir = path.resolve(String(args.source_dir ?? "."));
  const outputDir = path.resolve(String(args.output_dir ?? "."));
  const resolution = Math.max(1, Math.round(Number(args.resolution ?? 1024)));
  if (!fs.existsSync(sourceDir)) {
      throw new Error("Source directory not found: " + sourceDir);
        }
  fs.mkdirSync(outputDir, { recursive: true });

  const images = collectRecursive(sourceDir);
  let resized = 0;
  let skipped = 0;
  let errors = 0;

  for (const img of images) {
      const outName = path.basename(path.dirname(img.fullPath)) +
          "_" +
          path.basename(img.fullPath, path.extname(img.fullPath)) +
          ".png";
      const outPath = path.join(outputDir, outName);
      if (fs.existsSync(outPath)) {
          skipped++;
          continue;
           }
      try {
          const sharp = require("sharp") as any;
          const sharpMod = sharp.default ?? sharp;
          const source = sharpMod(img.fullPath).removeAlpha();
          await source.resize(resolution, resolution).toFormat("png").toFile(outPath);
          resized++;
           } catch {
          errors++;
           }
          }

  return {
      content: [{
          type: "text" as const,
          text: "Resized " + resized + " images to " + resolution + "x" + resolution +
              " in " + outputDir + "\nSkipped " + skipped + " (already exist), " + errors + " errors",
           }],
      details: { ok: true },
           };
        }

// ─── Tool: write_caption ──────────────────────────────────────────────────────

/** Write a .txt caption file next to an image. */
export async function writeCaption(
  args: Record<string, unknown>,
): Promise<ReturnType<typeof import("./response.js").textResult>> {
  const imgPath = path.resolve(String(args.image_path ?? ""));
  if (!fs.existsSync(imgPath)) {
      throw new Error("Image not found: " + imgPath);
         }

  const captionPath = imgPath.replace(/\.(jpg|jpeg|png|webp)$/i, ".txt");
  const caption = String(args.caption ?? "");
  fs.writeFileSync(captionPath, caption);

  return {
      content: [
          {
              type: "text" as const,
              text: "Wrote caption to " + captionPath + ":\n" + caption,
               },
              ],
      details: { ok: true },
          };
      }

// ─── Tool: detect_screenshots ─────────────────────────────────────────────────

/** Detect and optionally auto-reject social media screenshots and text-only posts. */
export async function detectScreenshots(
  args: Record<string, unknown>,
): Promise<ReturnType<typeof import("./response.js").textResult>> {
  const directory = path.resolve(String(args.directory ?? "."));
  const autoReject = String(args.auto_reject ?? "false").toLowerCase() === "true";
  if (!fs.existsSync(directory)) {
      throw new Error("Directory not found: " + directory);
         }

  const images = collectRecursive(directory);
  if (images.length === 0) {
      return {
          content: [{ type: "text" as const, text: "No images found in " + directory }],
          details: { ok: true },
              };
              }

  const detected: Array<{ path: string; reason: string }> = [];
  for (const img of images) {
      try {
          const data = fs.readFileSync(img.fullPath);
          const result = await isScreenshot(data);
          if (result.isScreenshot) {
              detected.push({ path: img.fullPath, reason: result.reason });
                  }
                  } catch {
                      // Skip unreadable images
                       }
                      }

  if (detected.length === 0) {
      return {
          content: [
              {
                  type: "text" as const,
                  text: "No screenshots detected among " + images.length + " images.",
                  }],
              details: { ok: true },
                  };
                  }

  let moved = 0;
  if (autoReject) {
      const rejectedDir = path.join(directory, "rejected");
      fs.mkdirSync(rejectedDir, { recursive: true });
      for (const img of detected) {
          const target = path.join(rejectedDir, path.basename(img.path));
          fs.renameSync(img.path, target);
          moved++;

           // Move caption sidecar if it exists
          const captionPath = img.path.replace(/\.(jpg|jpeg|png|webp)$/i, ".txt");
          if (fs.existsSync(captionPath)) {
              fs.renameSync(captionPath, path.join(rejectedDir, path.basename(captionPath)));
                  }
              }
            }

  const lines: string[] = [
       "Found " +
           detected.length +
           " likely screenshots among " +
           images.length +
           " images:\n",
       ...detected.map((d) =>
           "       " +
               path.basename(d.path) +
                   ": " +
               d.reason +
                   (autoReject ? " [REJECTED]" : ""),
           ),
            ];

  if (autoReject) {
      lines.push("\nMoved " + moved + " images to " + directory + "/rejected/");
          }

  return {
      content: [{ type: "text" as const, text: lines.join("\n") }],
      details: { ok: true },
        };
      }

// ─── Tool Definitions ───────────────────────────────────────────────────────

export const analyzeQualityTool = {
  name: "analyze_quality",
  label: "Analyze Quality",
  description: "Analyze resolution distribution, file sizes, and format stats for images in a directory.",
  parameters: {} as any,
  execute: analyzeQuality,
};

export const findDuplicatesTool = {
  name: "find_duplicates",
  label: "Find Duplicates",
  description: "Find perceptual hash (pHash) duplicate image pairs in a directory.",
  parameters: {} as any,
  execute: findDuplicates,
};

export const resizeImagesTool = {
  name: "resize_images",
  label: "Resize Images",
  description: "Batch resize images to a training resolution.",
  parameters: {} as any,
  execute: resizeImages,
};

export const writeCaptionTool = {
  name: "write_caption",
  label: "Write Caption",
  description: "Write a .txt caption file next to an image.",
  parameters: {} as any,
  execute: writeCaption,
};

export const detectScreenshotsTool = {
  name: "detect_screenshots",
  label: "Detect Screenshots",
  description: "Detect and optionally auto-reject social media screenshots and text-only posts.",
  parameters: {} as any,
  execute: detectScreenshots,
};
