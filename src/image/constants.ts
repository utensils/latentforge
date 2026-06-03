import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Supported image file extensions.
 */
export const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

/**
 * Check if a path looks like an image file.
 */
export function isImagePath(input: string | Buffer): boolean {
  if (Buffer.isBuffer(input)) return false;
  const ext = input.slice(input.lastIndexOf(".")).toLowerCase();
  return IMAGE_EXTS.has(ext);
}

/**
 * Infer file extension from content-type header and URL.
 */
export function extensionFromContentTypeOrUrl(
  contentType: string,
  url: string,
): ".jpg" | ".png" | ".webp" {
  const mime = contentType.toLowerCase();
  const urlLower = url.toLowerCase();
  if (mime.includes("png") || urlLower.endsWith(".png")) {
    return ".png";
    }
  if (mime.includes("webp") || urlLower.endsWith(".webp")) {
    return ".webp";
    }
  return ".jpg";
}
