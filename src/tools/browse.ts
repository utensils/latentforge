import * as fs from "node:fs";
import * as path from "node:path";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { IMAGE_EXTS } from "../image/constants.js";
import { readImageMetadata } from "../image/metadata.js";

// ─── Utility: collect all images recursively ──────────────────────────────────

function collectImages(dir: string): Array<{ fullPath: string }> {
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
  results.sort((a, b) => a.fullPath.localeCompare(b.fullPath));
  return results;
}

// ─── Tool: list_images ────────────────────────────────────────────────────────

/** List images with metadata (path, size, resolution). */
export async function listImages(
  args: Record<string, unknown>,
): Promise<ReturnType<typeof import("./response.js").textResult>> {
  const directory = path.resolve(String(args.directory ?? "."));

  if (!fs.existsSync(directory)) {
    throw new Error("Directory not found: " + directory);
    }

  const images = collectImages(directory);
  if (images.length === 0) {
    return {
      content: [{ type: "text" as const, text: "No images found in " + directory }],
      details: { ok: true },
       };
     }

  const lines: string[] = [
    "Found " + images.length + " images in " + directory + ":\n",
      ];
  for (const img of images) {
    try {
      const stat = fs.statSync(img.fullPath);
      const size_kb = Math.round(stat.size / 1024);
      const meta = await readImageMetadata(img.fullPath);
      const resolution =
          meta.width && meta.height
           ? meta.width + "x" + meta.height
         : "??x??";
      lines.push("       " + img.fullPath + "    " + resolution + "     " + size_kb + "KB");
       } catch {
      const stat = fs.statSync(img.fullPath);
      const size_kb = Math.round(stat.size / 1024);
      lines.push("       " + img.fullPath + "    ??x??     " + size_kb + "KB");
        }
       }

  return {
    content: [{ type: "text" as const, text: lines.join("\n") }],
    details: { ok: true },
      };
}

// ─── Tool: get_image_info ─────────────────────────────────────────────────────

/** Get detailed info for a single image file. */
export async function getImageInfo(
  args: Record<string, unknown>,
): Promise<ReturnType<typeof import("./response.js").textResult>> {
  const imgPath = path.resolve(String(args.path ?? ""));

  if (!fs.existsSync(imgPath)) {
    throw new Error("Image not found: " + imgPath);
      }

  const stat = fs.statSync(imgPath);
  const info: Record<string, unknown> = {
      path: imgPath,
      size_bytes: stat.size,
      size_kb: Math.round(stat.size / 1024),
        };

  try {
    const meta = await readImageMetadata(imgPath);
    info.width = meta.width;
    info.height = meta.height;
    info.format = meta.format;
    info.mode = meta.space;
       } catch (err) {
    info.error = (err as Error).message;
     }

    // Check for caption sidecar (.txt file adjacent to image)
  const captionPath = imgPath.replace(/\.(jpg|jpeg|png|webp)$/i, ".txt");
  if (fs.existsSync(captionPath)) {
    info.caption = fs.readFileSync(captionPath, "utf-8").trim();
      }

  return {
    content: [{ type: "text" as const, text: JSON.stringify(info, null, 2) }],
    details: { ok: true },
        };
}

// ─── Tool: move_images ────────────────────────────────────────────────────────

/** Move images and captions to a destination directory. */
export async function moveImages(
  args: Record<string, unknown>,
): Promise<ReturnType<typeof import("./response.js").textResult>> {
  let pathsStr = String(args.paths ?? "");
  let paths: string[];
  try {
    paths = (JSON.parse(pathsStr) as string[]).filter(Boolean);
      } catch {
    paths = pathsStr.split("\n").map((p: string) => p.trim()).filter((p: string) => p.length > 0);
     }

  const destDir = path.resolve(String(args.destination ?? "."));
  fs.mkdirSync(destDir, { recursive: true });

  let moved = 0;
  let errors = 0;

  for (const relPath of paths) {
    const srcPath = path.resolve(relPath);
    if (!fs.existsSync(srcPath)) {
      errors++;
      continue;
        }

    const destPath = path.join(destDir, path.basename(srcPath));
    fs.renameSync(srcPath, destPath);
    moved++;

     // Also move caption sidecar if it exists
    const captionPath = srcPath.replace(/\.(jpg|jpeg|png|webp)$/i, ".txt");
    if (fs.existsSync(captionPath)) {
      fs.renameSync(captionPath, path.join(destDir, path.basename(captionPath)));
       }
       }

  return {
    content: [
      { type: "text" as const, text: "Moved " + moved + " images to " + destDir + " (" + errors + " errors)" },
        ],
    details: { ok: true },
        };
}

// ─── Tool: organize_images ────────────────────────────────────────────────────

/** Auto-sort images by filename prefix into category directories. */
export async function organizeImages(
  args: Record<string, unknown>,
): Promise<ReturnType<typeof import("./response.js").textResult>> {
  const baseDir = path.resolve(String(args.base_dir ?? "."));
  const configObj = path.resolve(String(args.config_path ?? ""));
  const yaml = (await import("yaml")).default;

  if (!fs.existsSync(configObj)) {
    throw new Error("Config not found: " + configObj);
      }

  const yamlText = fs.readFileSync(configObj, "utf-8");
  const config = yaml.parse(yamlText) as Record<string, unknown>;
  const categories = (config.categories as Record<string, string>) ?? {};
  const searchQueries = (config.search_queries as Record<string, string[]>) ?? {};
  const wikimediaQueries = config.wikimedia_queries as Array<{ prefix: string }> | undefined;

  const prefixMap: Record<string, string> = {};
  for (const [cat, queries] of Object.entries(searchQueries)) {
    for (const q of queries) {
      const prefix = q
          .toLowerCase()
         .replace(/[^a-z0-9]+/g, "_")
         .slice(0, 40)
         .replace(/^_+|_+$/, "");
      prefixMap[prefix] = cat;
      }
    }
  if (wikimediaQueries) {
    for (const wq of wikimediaQueries) {
      prefixMap[wq.prefix] = "band_photos";
       }
     }

    // Create category directories
  for (const cat of Object.keys(categories)) {
    fs.mkdirSync(path.join(baseDir, cat), { recursive: true });
      }

    // Only move images directly in base_dir (not nested)
  const entries = fs.readdirSync(baseDir, { withFileTypes: true });
  const moved: Record<string, number> = {};
  let total = 0;

  for (const entry of entries) {
    if (entry.isDirectory()) continue;

    const ext = path.extname(entry.name).toLowerCase();
    if (!IMAGE_EXTS.has(ext)) continue;

    const srcPath = path.join(baseDir, entry.name);
    const stem = path.basename(entry.name, ext);

    let targetCat = "uncategorized";
    for (const [prefix, cat] of Object.entries(prefixMap)) {
      if (stem.toLowerCase().startsWith(prefix)) {
        targetCat = cat;
        break;
          }
         }

    fs.mkdirSync(path.join(baseDir, targetCat), { recursive: true });
    fs.renameSync(srcPath, path.join(baseDir, targetCat, entry.name));
    moved[targetCat] = (moved[targetCat] ?? 0) + 1;
    total++;
      }

  const lines: string[] = ["Organization complete:"];
  for (const cat of Object.keys(moved).sort()) {
    lines.push("       " + cat.padEnd(20) + " " + moved[cat] + " images");
      }
  lines.push("       " + "\u2500".repeat(30));
  lines.push("       " + "TOTAL".padEnd(20) + " " + total + " images");

  return {
    content: [{ type: "text" as const, text: lines.join("\n") }],
    details: { ok: true },
        };
}

// ─── Tool Definitions ───────────────────────────────────────────────────────

export const listImagesTool = {
  name: "list_images",
  label: "List Images",
  description: "List images with metadata (path, size, resolution).",
  parameters: {} as any,
  execute: listImages,
};

export const getImageInfoTool = {
  name: "get_image_info",
  label: "Get Image Info",
  description: "Get detailed info (resolution, size, format) for a single image file.",
  parameters: {} as any,
  execute: getImageInfo,
};

export const moveImagesTool = {
  name: "move_images",
  label: "Move Images",
  description: "Move images and their captions to a destination directory.",
  parameters: {} as any,
  execute: moveImages,
};

export const organizeImagesTool = {
  name: "organize_images",
  label: "Organize Images",
  description: "Auto-sort images by filename prefix into category directories.",
  parameters: {} as any,
  execute: organizeImages,
};
