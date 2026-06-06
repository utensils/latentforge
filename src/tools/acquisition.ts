import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import * as cheerio from "cheerio";
import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import type { Static } from "typebox";
import { Type } from "typebox";
import { IMAGE_EXTS } from "../image/constants.js";
import { mkdirs } from "../util/fs.js";
import { isScreenshot } from "../image/screenshot.js";
import { extensionFromContentTypeOrUrl } from "../image/constants.js";
import { createTool, textResult } from "./response.js";
import type { ToolDetails } from "../types.js";

const HEADERS = {
     "User-Agent":
         "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      };

// ─── Utility: Bing image search ───────────────────────────────────────────────

async function searchBingHtml(url: string, count: number): Promise<string[]> {
  const resp = await fetch(url, {
       headers: HEADERS,
      signal: AbortSignal.timeout(15000),
         });

  if (!resp.ok) return [];
  const html = await resp.text();
  const $ = cheerio.load(html);

  const urls: string[] = [];
    $("a[class='iusc']").each((_i: number, el: any) => {
      const m = $(el).attr("m");
      if (m) {
          try {
              const data = JSON.parse(m) as { murl?: string };
              if (data.murl) urls.push(data.murl);
                } catch {
                    // skip
                }
           }
        });

  if (urls.length === 0) {
        $("img").each((_i: number, el: any) => {
          const src = $(el).attr("src");
          if (src && src.startsWith("http") && !src.includes("bing")) {
              urls.push(src);
                }
            });
        }

  return urls.slice(0, count);
}

// ─── Schemas ────────────────────────────────────────────────────────────────

const SearchBingParams = Type.Object({
  query: Type.String(),
  count: Type.Optional(Type.Integer()),
});

type SearchBingParams = Static<typeof SearchBingParams>;

const SearchWikimediaParams = Type.Object({
  query: Type.String(),
  limit: Type.Optional(Type.Integer()),
});

type SearchWikimediaParams = Static<typeof SearchWikimediaParams>;

const DownloadImagesParams = Type.Object({
  urls: Type.String(),
  output_dir: Type.Optional(Type.String()),
  prefix: Type.Optional(Type.String()),
});

type DownloadImagesParams = Static<typeof DownloadImagesParams>;

const DownloadGalleryParams = Type.Object({
  url: Type.String(),
  output_dir: Type.Optional(Type.String()),
  prefix: Type.Optional(Type.String()),
  min_size: Type.Optional(Type.Integer()),
});

type DownloadGalleryParams = Static<typeof DownloadGalleryParams>;

// ─── Tool Implementations ───────────────────────────────────────────────────

async function searchBing(
  args: SearchBingParams,
): Promise<AgentToolResult<ToolDetails>> {
  const query = args.query;
  const count = Math.max(1, Math.min(100, args.count ?? 20));

  const searchUrl =
        "https://www.bing.com/images/search?q=" +
      encodeURIComponent(query) +
        "&first=1&count=" +
      count +
        "&qft=+filterui:imagesize-large";

  let urls: string[] = [];
  try {
      urls = await searchBingHtml(searchUrl, count);
        } catch (err) {
    throw new Error("Bing search failed: " + err);
         }

  urls = urls.slice(0, count);
  const text = "Found " + urls.length + " image URLs for '" + query + "':\n" + urls.join("\n");

  return {
      content: [{ type: "text", text }],
      details: { ok: true, query, count: urls.length },
        };
        }

async function searchWikimedia(
   args: SearchWikimediaParams,
): Promise<AgentToolResult<ToolDetails>> {
  const query = args.query;
  const limit = Math.max(1, Math.min(100, args.limit ?? 50));

  const searchParams = new URLSearchParams({
       action: "query",
       list: "search",
      srsearch: query,
       srnamespace: "6",
      srlimit: String(limit),
        format: "json",
          });

  let titles: string[] = [];
  try {
      const resp = await fetch(
                "https://commons.wikimedia.org/w/api.php?" + searchParams,
                {
              headers: { "User-Agent": "LatentForge/1.0 (dataset collection)" },
              signal: AbortSignal.timeout(15000),
                  },
                );
          const data = await resp.json() as {
              query?: { search?: Array<{ title: string }> };
                };
      titles = data.query?.search?.map((s) => s.title) ?? [];
        } catch (err) {
      return textResult(
           "Wikimedia search failed: " + err,
            { ok: false },
             );
        }

  const results: Array<{ url: string; width: number; height: number }> = [];

    // Batch imageinfo API calls in groups of 20
  for (let i = 0; i < titles.length; i += 20) {
      const batch = titles.slice(i, i + 20);

      try {
          const params = new URLSearchParams({
              action: "query",
              titles: batch.join("|"),
              prop: "imageinfo",
              iiprop: "url|size|mime",
              format: "json",
                });

          const resp = await fetch(
                "https://commons.wikimedia.org/w/api.php?" + params,
                {
                  headers: { "User-Agent": "LatentForge/1.0 (dataset collection)" },
                  signal: AbortSignal.timeout(15000),
                    },
                );
          const data = await resp.json() as {
              query?: { pages?: Record<string, { imageinfo?: Array<{ url: string; width: number; height: number; mime: string }> }> };
                };

          const pages = data.query?.pages ?? {};
          for (const page of Object.values(pages)) {
              const info = (page as any)?.imageinfo?.[0];
              if (!info) continue;
              const url = info.url ?? "";
              const mime = info.mime ?? "";
              const w = info.width ?? 0;
              const h = info.height ?? 0;

              if (url && (mime.includes("jpeg") || mime.includes("png")) && w >= 400 && h >= 400) {
                  results.push({ url, width: w, height: h });
                    }
                }
            } catch {
                // Skip failed batches
                }

            // Sleep 500ms between batches
          await new Promise((r) => setTimeout(r, 500));
            }

  const lines: string[] = ["Found " + results.length + " images for '" + query + ":'"];
  for (const r of results) {
      lines.push("       " + r.width + "x" + r.height + " \u2014 " + r.url);
        }

  return {
      content: [{ type: "text", text: lines.join("\n") }],
      details: { ok: true, query, count: results.length },
        };
        }

async function downloadImages(
  args: DownloadImagesParams,
): Promise<AgentToolResult<ToolDetails>> {
  const urlsStr = args.urls;
  const outputDir = args.output_dir ?? ".";
  const prefix = args.prefix ?? "img";

  let urls: string[];
  try {
    urls = (JSON.parse(urlsStr) as string[]).filter(Boolean);
        } catch {
    urls = urlsStr
            .split("\n")
            .map((u: string) => u.trim())
            .filter((u: string) => u.length > 0);
        }

  mkdirs(outputDir);
  fs.mkdirSync(outputDir, { recursive: true });

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;
  let screenshots = 0;

  for (const url of urls) {
      try {
          const resp = await fetch(url, {
              headers: HEADERS,
              signal: AbortSignal.timeout(15000),
                });

          if (resp.status !== 200) {
              failed++;
              continue;
                }

          const data = await resp.arrayBuffer();
          const buf = Buffer.from(data);

          if (buf.length < 10000) {
              skipped++;
              continue;
                }

            // MD5 hash for dedup
          const fileHash = crypto
                .createHash("md5")
                .update(buf)
                .digest("hex")
                .slice(0, 12);

            // Check if file with this hash already exists
          const existing = fs.readdirSync(outputDir).filter((f) => f.includes(fileHash));
          if (existing.length > 0) {
              skipped++;
              continue;
                }

            // Screenshot detection
          try {
              const ssResult = await isScreenshot(buf);
              if (ssResult.isScreenshot) {
                  screenshots++;
                  continue;
                    }
                } catch {
                    // No screenshot detection, proceed
                    }

            // Infer extension
          const contentType = resp.headers.get("content-type") ?? "";
          const ext = extensionFromContentTypeOrUrl(contentType, url);

          const filename = prefix + "_" + fileHash + ext;
          fs.writeFileSync(path.join(outputDir, filename), buf);
          downloaded++;
            } catch {
          failed++;
            }
            }

  let msg = "Download complete: " + downloaded + " saved, " + skipped + " skipped (dup/small), " + failed + " failed";
  if (screenshots > 0) {
      msg += ", " + screenshots + " rejected (screenshot/text)";
        }
  msg += "\nDirectory: " + outputDir;

  return {
      content: [{ type: "text", text: msg }],
      details: {
          ok: true,
          downloaded,
          skipped,
          failed,
          screenshots,
          output_dir: outputDir,
            },
        };
        }

async function downloadGallery(
  args: DownloadGalleryParams,
): Promise<AgentToolResult<ToolDetails>> {
  const url = args.url;
  const outputDir = args.output_dir ?? ".";
  const prefix = args.prefix ?? "gdl";
  const minSize = Math.max(0, args.min_size ?? 10000);

    // Check gallery-dl exists
  try {
      require("child_process").execSync("which gallery-dl", { stdio: "ignore" });
        } catch {
      return textResult(
            "gallery-dl not found. Install it or enter the nix devshell.",
             { ok: false },
              );
        }

  mkdirs(outputDir);
  fs.mkdirSync(outputDir, { recursive: true });

  const tmp = path.join(outputDir, ".gdl_tmp");
  fs.mkdirSync(tmp, { recursive: true });

  let downloaded = 0;
  let skipped = 0;
  let smallSize = 0;
  let screenshotCount = 0;

  try {
      const child = require("child_process");
      child.execSync(
            "gallery-dl --dest '" + tmp + "' --no-mtime '" + url + "'",
            { stdio: "pipe", timeout: 120000, encoding: "utf-8" },
            );
        } catch {
            // Continue processing even if gallery-dl failed
            }

    // Walk temp directory for downloaded images
  if (fs.existsSync(tmp)) {
      const walkDir = (dirPath: string) => {
          const entries = fs.readdirSync(dirPath, { withFileTypes: true });
          for (const entry of entries) {
              const fullPath = path.join(dirPath, entry.name);
              if (entry.isDirectory()) {
                  walkDir(fullPath);
                    } else if (entry.isFile()) {
                  const data = fs.readFileSync(fullPath);
                    // Min size check
                  if (data.length < minSize) {
                      smallSize++;
                      fs.unlinkSync(fullPath);
                      continue;
                        }

                        // MD5 dedup
                      const fileHash = crypto
                            .createHash("md5")
                            .update(data)
                            .digest("hex")
                            .slice(0, 12);
                      const existing = fs.readdirSync(outputDir).filter((f) => f.includes(fileHash));
                      if (existing.length > 0) {
                          skipped++;
                          fs.unlinkSync(fullPath);
                          continue;
                            }

                            // Screenshot detection
                          try {
                              const ssResult = isScreenshotSync(data);
                              if (ssResult) {
                                  screenshotCount++;
                                  fs.unlinkSync(fullPath);
                                  continue;
                                    }
                                } catch {
                                    // No detection, proceed
                                    }

                                    // Move to output dir
                                  const ext = path.extname(entry.name).toLowerCase();
                                  const filename = prefix + "_" + fileHash + ext;
                                  fs.renameSync(fullPath, path.join(outputDir, filename));
                                  downloaded++;
                                    }
                                }
                            };

      walkDir(tmp);
        }

    // Clean up temp dir
  try {
      const { rmRec } = require("../util/fs.js");
      rmRec(path.join(tmp));
        } catch {
            // best effort
            }

  let msg = "gallery-dl: " + downloaded + " saved, " + skipped + " skipped (dup), " + smallSize + " skipped (small)";
  if (screenshotCount > 0) {
      msg += ", " + screenshotCount + " rejected (screenshot/text)";
        }
  msg += "\nDirectory: " + outputDir;

  return {
      content: [{ type: "text", text: msg }],
      details: {
          ok: true,
          downloaded,
          skipped,
          screenshots: screenshotCount,
          output_dir: outputDir,
            },
        };
        }

function isScreenshotSync(data: Buffer): boolean {
  return false; // Placeholder — full implementation would call async isScreenshot
}

// ─── Tool Definitions ───────────────────────────────────────────────────────

export const searchBingTool = createTool({
  name: "search_bing",
  label: "Search Bing",
  description: "Search Bing Images and return URLs for a query.",
  parameters: SearchBingParams,
  handler: searchBing,
});

export const searchWikimediaTool = createTool({
  name: "search_wikimedia",
  label: "Search Wikimedia",
  description: "Search Wikimedia Commons for CC-licensed images.",
  parameters: SearchWikimediaParams,
  handler: searchWikimedia,
});

export const downloadImagesTool = createTool({
  name: "download_images",
  label: "Download Images",
  description:
      "Download a list of image URLs to a category directory with MD5 deduplication.",
  parameters: DownloadImagesParams,
  handler: downloadImages,
});

export const downloadGalleryTool = createTool({
  name: "download_gallery",
  label: "Download Gallery",
  description:
      "Download images from a URL using gallery-dl (supports 80+ sites).",
  parameters: DownloadGalleryParams,
  handler: downloadGallery,
});
