import "server-only";

import sharp, { type Metadata, type OutputInfo } from "sharp";

import { POST_LIMITS } from "@/lib/domain/posts";
import { ValidationError } from "@/server/errors";

export type ProcessedImage = {
  data: Buffer;
  contentType: "image/webp";
  width: number;
  height: number;
  bytes: number;
};

const ORIGINAL_MAX_EDGE = 2560;
const ORIGINAL_QUALITY = 82;
/** Auf diese Breite wird verkleinert – alles Detail darunter ist verloren. */
const PIXELATE_WIDTH = 24;
const PREVIEW_MAX_WIDTH = 480;
const PREVIEW_BLUR_SIGMA = 12;
const PREVIEW_QUALITY = 60;
/** Schutz vor Dekompressionsbomben: ~100 Megapixel reichen auch für aktuelle Smartphone-Kameras. */
const MAX_INPUT_PIXELS = 100_000_000;

type AllowedFormat = "jpeg" | "png" | "webp";

const UNSUPPORTED_MESSAGE = "Bitte lade nur JPEG-, PNG- oder WebP-Bilder hoch.";
const BROKEN_MESSAGE = "Das Bild ist beschädigt oder konnte nicht gelesen werden.";
const TOO_MANY_PIXELS_MESSAGE = "Das Bild hat zu viele Pixel (max. 100 Megapixel).";
const TOO_MANY_BYTES_MESSAGE = `Ein Bild darf höchstens ${POST_LIMITS.maxImageBytes / (1024 * 1024)} MB gross sein.`;

/** Erkennt das Format an den ersten Bytes, bevor sharp überhaupt einen Decoder startet (kein SVG, TIFF, …). */
function sniffFormat(bytes: Buffer): AllowedFormat | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "png";
  }
  if (bytes.length >= 12 && bytes.toString("latin1", 0, 4) === "RIFF" && bytes.toString("latin1", 8, 12) === "WEBP") {
    return "webp";
  }
  return null;
}

function decoder(bytes: Buffer) {
  return sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "warning" });
}

function scaledHeight(width: number, height: number, targetWidth: number): number {
  return Math.max(1, Math.round((height * targetWidth) / width));
}

async function assertSupportedImage(bytes: Buffer): Promise<void> {
  if (bytes.length > POST_LIMITS.maxImageBytes) throw new ValidationError(TOO_MANY_BYTES_MESSAGE);
  const sniffed = sniffFormat(bytes);
  if (!sniffed) throw new ValidationError(UNSUPPORTED_MESSAGE);

  let meta: Metadata;
  try {
    meta = await sharp(bytes, { limitInputPixels: false }).metadata();
  } catch {
    throw new ValidationError(BROKEN_MESSAGE);
  }
  if (meta.format !== sniffed) throw new ValidationError(UNSUPPORTED_MESSAGE);
  if (!meta.width || !meta.height) throw new ValidationError(BROKEN_MESSAGE);
  if (meta.width * meta.height > MAX_INPUT_PIXELS) throw new ValidationError(TOO_MANY_PIXELS_MESSAGE);
}

/**
 * Verarbeitet ein hochgeladenes Bild:
 * - Grösse (≤ 10 MB) und Format über den Inhalt prüfen (JPEG/PNG/WebP), sonst `ValidationError`.
 * - Original: nach EXIF ausrichten, alle Metadaten entfernen, längste Kante ≤ 2560 px, WebP q82.
 * - Vorschau: auf 24 px Breite verkleinern, auf ≤ 480 px hochskalieren und stark weichzeichnen –
 *   aus ihr lässt sich das Original nicht rekonstruieren.
 */
export async function processUpload(input: { bytes: Buffer }): Promise<{ original: ProcessedImage; preview: ProcessedImage }> {
  await assertSupportedImage(input.bytes);

  try {
    // Ohne withMetadata()/keepMetadata() entfernt sharp EXIF, XMP, IPTC und ICC (Ausgabe in sRGB).
    const original = await decoder(input.bytes)
      .rotate()
      .resize({ width: ORIGINAL_MAX_EDGE, height: ORIGINAL_MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: ORIGINAL_QUALITY })
      .toBuffer({ resolveWithObject: true });
    const { width, height } = original.info;

    const tinyWidth = Math.min(PIXELATE_WIDTH, width);
    const tiny = await sharp(original.data)
      .resize(tinyWidth, scaledHeight(width, height, tinyWidth), { fit: "fill" })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const previewWidth = Math.min(PREVIEW_MAX_WIDTH, width);
    const preview = await sharp(tiny.data, {
      raw: { width: tiny.info.width, height: tiny.info.height, channels: tiny.info.channels },
    })
      .resize(previewWidth, scaledHeight(width, height, previewWidth), { fit: "fill" })
      .blur(PREVIEW_BLUR_SIGMA)
      .webp({ quality: PREVIEW_QUALITY })
      .toBuffer({ resolveWithObject: true });

    return {
      original: toProcessed(original.data, original.info),
      preview: toProcessed(preview.data, preview.info),
    };
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError(BROKEN_MESSAGE);
  }
}

function toProcessed(data: Buffer, info: OutputInfo): ProcessedImage {
  return { data, contentType: "image/webp", width: info.width, height: info.height, bytes: data.length };
}
