import * as sharpLib from "sharp";

const sharp: any = sharpLib.default ?? sharpLib;

export interface ImageMetadata {
  width?: number;
  height?: number;
  format?: string;
  space?: string;
  channels?: number;
}

/**
 * Helper: convert input to something sharp understands.
 * Accepts string (path), Buffer, or generic ArrayBufferView.
 */
function normalizeInput(input: string | Buffer | ArrayBufferView): string | Buffer {
  if (typeof input === "string") return input;
  if (Buffer.isBuffer(input)) return input;
  if (input instanceof ArrayBuffer) return Buffer.from(input);
  return Buffer.from((input as ArrayBufferView).buffer, (input as ArrayBufferView).byteOffset, (input as ArrayBufferView).byteLength);
}

/**
 * Read basic metadata from an image file path or buffer.
 */
export async function readImageMetadata(input: string | Buffer | Uint8Array): Promise<ImageMetadata> {
  const meta = await sharp(input).metadata();
  return {
    width: meta.width ?? undefined,
    height: meta.height ?? undefined,
    format: meta.format ?? undefined,
    space: meta.space ?? undefined,
    channels: meta.channels ?? undefined,
  };
}

/**
 * Load image as RGB raw buffer.
 */
export async function loadRgbRaw(input: string | Buffer | Uint8Array): Promise<{ data: Buffer; width: number; height: number; channels: 3 }> {
  const result = await sharp(input).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return {
    data: result.data,
    width: result.info.width,
    height: result.info.height,
    channels: 3 as const,
  };
}
