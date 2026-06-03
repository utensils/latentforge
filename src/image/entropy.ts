/**
 * Shannon entropy for 8-bit RGBA raw pixel data.
 */
export function shannonEntropy(data: Uint8Array, width: number, height: number): number {
  const histogram = new Int32Array(256);
  const totalPixels = width * height;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const luminance = Math.round(0.299 * Number(r) + 0.587 * Number(g) + 0.114 * Number(b));
    const clampVal = Math.max(0, Math.min(255, luminance));
    if (clampVal >= 0 && clampVal < 256) {
      histogram[clampVal] = (histogram[clampVal] ?? 0) + 1;
      }
    }

  let entropy = 0;
  for (let i = 0; i < 256; i++) {
    const countVal = histogram[i];
    if (countVal === 0) continue;
    const p = countVal / totalPixels;
    entropy -= p * Math.log2(p);
      }

  return entropy;
}
