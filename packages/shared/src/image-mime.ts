/** Detect image MIME from magic bytes (supports jpeg, png, webp, gif) */
export function detectImageMime(buffer: Buffer): string {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xd8) return "image/jpeg";
  if (buffer.length >= 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return "image/png";
  }
  if (buffer.length >= 4 && buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return "image/gif";
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "image/webp";
  }
  return "image/jpeg";
}

export function detectImageMimeFromBase64(base64: string): string {
  try {
    return detectImageMime(Buffer.from(base64.slice(0, 48), "base64"));
  } catch {
    return "image/jpeg";
  }
}

export function imageDataUrl(base64: string, mime?: string): string {
  const type = mime ?? detectImageMimeFromBase64(base64);
  return `data:${type};base64,${base64}`;
}
