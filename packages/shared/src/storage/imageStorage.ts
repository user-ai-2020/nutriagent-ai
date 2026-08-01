import fs from "fs/promises";
import path from "path";

/** GCS signed URLs for personal meal photos — 15–60 min only (never long-lived). */
export const MEAL_IMAGE_SIGNED_URL_MIN_SECONDS = 15 * 60;
export const MEAL_IMAGE_SIGNED_URL_MAX_SECONDS = 60 * 60;
export const MEAL_IMAGE_SIGNED_URL_DEFAULT_SECONDS = 30 * 60;

export function resolveMealImageSignedUrlTtl(requested?: number): number {
  const fromEnv = Number(process.env.MEAL_IMAGE_SIGNED_URL_TTL_SECONDS);
  const base =
    requested ??
    (Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : MEAL_IMAGE_SIGNED_URL_DEFAULT_SECONDS);
  return Math.min(
    MEAL_IMAGE_SIGNED_URL_MAX_SECONDS,
    Math.max(MEAL_IMAGE_SIGNED_URL_MIN_SECONDS, Math.round(base))
  );
}

export interface ImageStorage {
  upload(buffer: Buffer, key: string): Promise<{ url: string }>;
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
  download(key: string): Promise<Buffer>;
}

export interface ImageStorageConfig {
  provider: "local" | "gcs";
  localBasePath?: string;
  publicBaseUrl?: string;
  gcsBucket?: string;
}

function assertSafeKey(key: string): void {
  if (!key || key.includes("..") || path.isAbsolute(key)) {
    throw new Error("Invalid storage key");
  }
}

class LocalImageStorage implements ImageStorage {
  constructor(
    private readonly basePath: string,
    private readonly publicBaseUrl: string
  ) {}

  private resolvePath(key: string): string {
    assertSafeKey(key);
    const fullPath = path.join(this.basePath, key);
    const normalizedBase = path.resolve(this.basePath);
    const normalizedFull = path.resolve(fullPath);
    if (!normalizedFull.startsWith(normalizedBase)) {
      throw new Error("Invalid storage key path");
    }
    return fullPath;
  }

  async upload(buffer: Buffer, key: string): Promise<{ url: string }> {
    const fullPath = this.resolvePath(key);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, buffer);
    return { url: `${this.publicBaseUrl}/meal-images/${key.replace(/\\/g, "/")}` };
  }

  async getSignedUrl(key: string): Promise<string> {
    assertSafeKey(key);
    return `${this.publicBaseUrl}/meal-images/${key.replace(/\\/g, "/")}`;
  }

  async download(key: string): Promise<Buffer> {
    return fs.readFile(this.resolvePath(key));
  }
}

class GcsImageStorage implements ImageStorage {
  private clientPromise: Promise<import("@google-cloud/storage").Storage> | null = null;

  constructor(
    private readonly bucketName: string,
    private readonly publicBaseUrl?: string
  ) {}

  private async getClient() {
    if (!this.clientPromise) {
      this.clientPromise = import("@google-cloud/storage").then(({ Storage }) => new Storage());
    }
    return this.clientPromise;
  }

  async upload(buffer: Buffer, key: string): Promise<{ url: string }> {
    assertSafeKey(key);
    const storage = await this.getClient();
    const file = storage.bucket(this.bucketName).file(key);
    await file.save(buffer, {
      contentType: "image/jpeg",
      resumable: false,
      metadata: { cacheControl: "private, max-age=0" },
    });
    return { url: await this.getSignedUrl(key) };
  }

  async getSignedUrl(key: string, expiresInSeconds?: number): Promise<string> {
    assertSafeKey(key);
    const ttl = resolveMealImageSignedUrlTtl(expiresInSeconds);
    const storage = await this.getClient();
    const file = storage.bucket(this.bucketName).file(key);
    const [url] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + ttl * 1000,
    });
    return url;
  }

  async download(key: string): Promise<Buffer> {
    assertSafeKey(key);
    const storage = await this.getClient();
    const [buffer] = await storage.bucket(this.bucketName).file(key).download();
    return buffer;
  }
}

export function createImageStorage(config?: Partial<ImageStorageConfig>): ImageStorage {
  const provider = config?.provider ?? (process.env.MEAL_IMAGE_STORAGE === "gcs" ? "gcs" : "local");
  const publicBaseUrl =
    config?.publicBaseUrl ?? process.env.MEAL_IMAGE_PUBLIC_BASE_URL ?? "http://localhost:3000";

  if (provider === "gcs") {
    const bucket = config?.gcsBucket ?? process.env.GCS_MEAL_IMAGES_BUCKET;
    if (!bucket) {
      throw new Error("GCS_MEAL_IMAGES_BUCKET is required when MEAL_IMAGE_STORAGE=gcs");
    }
    return new GcsImageStorage(bucket, publicBaseUrl);
  }

  const localBasePath =
    config?.localBasePath ??
    process.env.MEAL_IMAGE_STORAGE_PATH ??
    path.join(process.cwd(), "storage", "meal-images");

  return new LocalImageStorage(localBasePath, publicBaseUrl);
}

export function mealImageStorageKey(userId: number, imageId: string): string {
  return `users/${userId}/images/${imageId}.jpg`;
}
