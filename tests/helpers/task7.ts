/**
 * Test-Helfer für Task 7 (Creator-, Post-, Melde- und Feed-Services).
 */
import { asc, inArray } from "drizzle-orm";
import sharp from "sharp";

import type { Db } from "@/server/db/client";
import { postMedia, type PostMedia } from "@/server/db/schema";
import { InMemoryMediaStorage } from "@/server/storage/memory";

export type UploadFile = { bytes: Buffer; name: string; type: string };

/** Kleines, echtes Bild (einfarbig) – schnell genug für viele Uploads pro Test. */
export async function testImage(
  opts: { width?: number; height?: number; format?: "png" | "jpeg" | "webp" } = {},
): Promise<Buffer> {
  const { width = 64, height = 48, format = "png" } = opts;
  return sharp({ create: { width, height, channels: 3, background: { r: 214, g: 140, b: 120 } } })
    .toFormat(format)
    .toBuffer();
}

/** `n` Upload-Dateien (PNG), wie sie aus einem Formular kommen. */
export async function imageFiles(n: number): Promise<UploadFile[]> {
  const bytes = await testImage();
  return Array.from({ length: n }, (_, i) => ({ bytes, name: `fuss-${i + 1}.png`, type: "image/png" }));
}

export async function mediaRowsOf(db: Db, postIds: string[]): Promise<PostMedia[]> {
  if (postIds.length === 0) return [];
  return db.select().from(postMedia).where(inArray(postMedia.postId, postIds)).orderBy(asc(postMedia.position));
}

/** Speicher, der beim n-ten `put` ausfällt (für Aufräum-Tests). */
export class FailingMediaStorage extends InMemoryMediaStorage {
  puts = 0;
  constructor(private readonly failOnPut: number) {
    super();
  }

  override async put(key: string, data: Buffer, contentType: string): Promise<void> {
    this.puts += 1;
    if (this.puts >= this.failOnPut) throw new Error("Speicher nicht erreichbar");
    return super.put(key, data, contentType);
  }
}
