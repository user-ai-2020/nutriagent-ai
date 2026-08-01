/**
 * Resizes an image file to a maximum width/height while maintaining aspect ratio,
 * outputting a compressed JPEG blob.
 */
export async function resizeImage(file: File, maxWidth = 1200, quality = 0.8): Promise<Blob> {
  if (!file.type.startsWith("image/")) return file;

  // Use createImageBitmap for fast, off-main-thread image decoding
  const bitmap = await createImageBitmap(file);
  let width = bitmap.width;
  let height = bitmap.height;

  if (width > maxWidth || height > maxWidth) {
    if (width > height) {
      height = Math.round((height * maxWidth) / width);
      width = maxWidth;
    } else {
      width = Math.round((width * maxWidth) / height);
      height = maxWidth;
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;

  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        resolve(blob ?? file);
      },
      "image/jpeg",
      quality
    );
  });
}
