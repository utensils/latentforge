import * as sharpLib from "sharp";
import { readImageMetadata } from "./metadata.js";
import { shannonEntropy } from "./entropy.js";

export interface ScreenshotResult {
  isScreenshot: boolean;
  reason: string;
}

const sharpMod = (sharpLib as any).default ?? sharpLib;

/**
 * Detect if an image is likely a social media screenshot or text-only post.
 *
 * Returns { isScreenshot, reason }.
 *
 * Rules:
 *    - entropy < 3.5 => likely text on solid background
 *    - dominant solid background (>70%) and entropy < 5.0 => screenshot
 *    - phone-shaped (aspect < 0.6), entropy < 5.5, height > 1000 => screenshot
 */
export async function isScreenshot(
  input: string | Buffer | NodeJS.ArrayBufferView,
): Promise<ScreenshotResult> {
  let metaW = 0;
  let metaH = 0;
  try {
    const meta = await readImageMetadata(input);
    metaW = meta.width ?? 0;
    metaH = meta.height ?? 0;
      } catch {
      // Use defaults
         }

  let entropy = 99;

  try {
    const buffer = await sharpMod(input)
         .resize({ width: 512, height: 512, fit: "inside" })
         .removeAlpha()
         .raw()
         .toBuffer({ resolveWithObject: true });
    entropy = shannonEntropy(buffer.data, buffer.info.width, buffer.info.height);
         } catch {
      entropy = 99;
        }

       // entropy < 3.5 => likely text on solid background
  if (entropy < 3.5) {
    return {
      isScreenshot: true,
      reason: "very low entropy (" + entropy.toFixed(1) + ") -- likely text on solid background",
        };
         }

    // Check for dominant solid background
  try {
    const buffer = await sharpMod(input)
         .removeAlpha()
         .raw()
         .toBuffer({ resolveWithObject: true });
    const data = buffer.data;
    const totalW = buffer.info.width;
    const totalH = buffer.info.height;
    const total = totalW * totalH;

    if (total > 0) {
      let nearWhite = 0;
      let nearBlack = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i] ?? 0;
        const g = data[i + 1] ?? 0;
        const b = data[i + 2] ?? 0;
        if (r > 240 && g > 240 && b > 240) nearWhite++;
        if (r < 15 && g < 15 && b < 15) nearBlack++;
           }
      const bgRatio = Math.max(nearWhite, nearBlack) / total;
      if (bgRatio > 0.7 && entropy < 5.0) {
        return {
            isScreenshot: true,
          reason:
            "solid background (" +
            (bgRatio * 100).toFixed(0) +
             "%) with low entropy (" +
            entropy.toFixed(1) +
             ")",
           };
            }
           }
         } catch {
           // Skip
            }

   // Check for phone screenshot aspect ratios
  const aspect = metaH > 0 ? metaW / metaH : 1;
  if (aspect < 0.6 && entropy < 5.5 && metaH > 1000) {
    return {
      isScreenshot: true,
      reason:
          "phone-shaped (" +
         metaW +
           "x" +
          metaH +
           ", ratio " +
          aspect.toFixed(2) +
           ") with low entropy (" +
          entropy.toFixed(1) +
           ")",
           };
          }

  return { isScreenshot: false, reason: "" };
}
