import * as sharpLib from "sharp";

const sharpMod = (sharpLib as any).default ?? sharpLib;

/**
 * Compute a perceptual hash (pHash) for an image file.
 *
 * Algorithm:
 *     1. Resize to 32x32 grayscale using sharp.
 *     2. Compute 2D DCT of the 32x32 image.
 *     3. Keep the top-left 8x8 coefficients, excluding the DC coeff (0,0).
 *     4. Compute median of those 63 values.
 *     5. Generate a 64-bit hash based on whether each coeff > median.
 *
 * Returns a bigint representing the 64-bit hash.
 */
export async function phash(imagePath: string): Promise<bigint> {
  const raw = await sharpMod(imagePath)
    .grayscale()
    .resize({ width: 32, height: 32, fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const rawW = raw.info.width;
  const rawH = raw.info.height;
  const rawData = raw.data as Uint8Array;

  // Compute 2D DCT for the 32x32 grayscale image

  // Collect top-left 8x8 excluding DC (0,0)
  // For efficiency, compute DCT manually for the specific region
  const coeffs: number[] = [];
  for (let u = 0; u < 8; u++) {
    for (let v = 0; v < 8; v++) {
      if (u === 0 && v === 0) continue; // skip DC

      let sum = 0;
      for (let x = 0; x < rawW && x < 32; x++) {
        for (let y = 0; y < rawH && y < 32; y++) {
          const idx = (x * 32 + y) % rawData.length;
          const pixel = rawData[idx] ?? 0;
          const cu = u === 0 ? 1 / Math.sqrt(2) : 1;
          const cv = v === 0 ? 1 / Math.sqrt(2) : 1;
          sum +=
            pixel *
              (cu / Math.sqrt(rawW)) *
              (cv / Math.sqrt(rawH)) *
            Math.cos(((2 * x + 1) * u * Math.PI) / (2 * rawW)) *
              Math.cos(((2 * y + 1) * v * Math.PI) / (2 * rawH));
           }
         }
      coeffs.push(sum);
       }
    }

  // Compute median
  coeffs.sort((a, b) => a - b);
  const median = ((coeffs[31] ?? 0) + (coeffs[32] ?? 0)) / 2;

  // Generate 64-bit hash
  let hash: bigint = 0n;
  let idx = 1; // Skip DC (0,0), start from index 1
  for (let u = 0; u < 8; u++) {
    for (let v = 0; v < 8; v++) {
      if (u === 0 && v === 0) continue;
      const val = coeffs[idx] ?? 0;
      const bit = val >= median ? 1 : 0;
      hash |= BigInt(bit) << BigInt(63 - idx);
      idx++;
       }
    }

  return hash;
}

/**
 * Compute Hamming distance between two 64-bit hashes.
 */
export function hammingDistance(a: bigint, b: bigint): number {
  const xor = a ^ b;
  let dist = 0;
  for (let i = 0n; i < 64n; i++) {
    if ((xor >> i) & 1n) dist++;
      }
  return dist;
}
