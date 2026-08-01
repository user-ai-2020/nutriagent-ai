import crypto from "crypto";
import sharp from "sharp";

export interface ProcessedMealImage {
  buffer: Buffer;
  width: number;
  height: number;
  fileSizeBytes: number;
  contentHash: string;
  mimeType: "image/jpeg";
}

const MAX_EDGE_PX = 512;
const DEFAULT_JPEG_QUALITY = 78;

/** Resize to max 512px on long edge, convert to JPEG, compute sha256 for dedup. */
export async function processMealImage(
  input: Buffer,
  quality = DEFAULT_JPEG_QUALITY
): Promise<ProcessedMealImage> {
  const meta = await sharp(input).metadata();
  const width = meta.width ?? MAX_EDGE_PX;
  const height = meta.height ?? MAX_EDGE_PX;

  const resizeOptions =
    width >= height
      ? { width: Math.min(width, MAX_EDGE_PX), height: undefined as number | undefined }
      : { width: undefined as number | undefined, height: Math.min(height, MAX_EDGE_PX) };

  const buffer = await sharp(input)
    .rotate()
    .resize({
      ...resizeOptions,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();

  const outputMeta = await sharp(buffer).metadata();
  const contentHash = crypto.createHash("sha256").update(buffer).digest("hex");

  return {
    buffer,
    width: outputMeta.width ?? MAX_EDGE_PX,
    height: outputMeta.height ?? MAX_EDGE_PX,
    fileSizeBytes: buffer.length,
    contentHash,
    mimeType: "image/jpeg",
  };
}
