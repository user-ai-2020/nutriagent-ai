import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import sharp from "sharp";
import { processMealImage } from "./image-processing";
import { parseQuantityGrams } from "./portion-estimate";
import { createImageStorage, mealImageStorageKey } from "./storage/imageStorage";

describe("processMealImage", () => {
  it("resizes large images to max 512px and returns stable hash", async () => {
    const input = await sharp({
      create: { width: 1200, height: 800, channels: 3, background: { r: 200, g: 100, b: 50 } },
    })
      .jpeg()
      .toBuffer();

    const first = await processMealImage(input);
    const second = await processMealImage(input);

    assert.ok(first.width <= 512);
    assert.ok(first.height <= 512);
    assert.equal(first.mimeType, "image/jpeg");
    assert.ok(first.fileSizeBytes > 0);
    assert.equal(first.contentHash, second.contentHash);
    assert.equal(first.contentHash.length, 64);
  });
});

describe("local image storage", () => {
  it("uploads and downloads meal images by key", async () => {
    const basePath = await fs.mkdtemp(path.join(os.tmpdir(), "nutri-meal-images-"));
    const storage = createImageStorage({
      provider: "local",
      localBasePath: basePath,
      publicBaseUrl: "http://localhost:3000",
    });

    const buffer = Buffer.from("fake-jpeg-bytes");
    const key = mealImageStorageKey(42, "img_test123");
    const uploaded = await storage.upload(buffer, key);
    assert.match(uploaded.url, /\/meal-images\/users\/42\/images\/img_test123\.jpg$/);

    const signed = await storage.getSignedUrl(key);
    assert.equal(signed, uploaded.url);

    const downloaded = await storage.download(key);
    assert.deepEqual(downloaded, buffer);
  });
});

describe("parseQuantityGrams", () => {
  it("does not treat the trailing g in serving as grams", () => {
    assert.equal(parseQuantityGrams("1 serving", "penne pasta with tomato sauce"), 280);
  });
});
