import { crc32, deflateSync } from "node:zlib";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { ValidationError } from "@/server/errors";

import { processUpload } from "./images";

function solid(width: number, height: number, channels: 3 | 4 = 3) {
  return sharp({
    create: { width, height, channels, background: { r: 214, g: 160, b: 130, alpha: channels === 4 ? 0.5 : 1 } },
  });
}

/** Schwarz-weisse Senkrechtstreifen à 40 px – maximaler Kontrast, viel Detail. */
function stripes(width: number, height: number) {
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      raw.fill(Math.floor(x / 40) % 2 === 0 ? 0 : 255, (y * width + x) * 3, (y * width + x) * 3 + 3);
    }
  }
  return sharp(raw, { raw: { width, height, channels: 3 } });
}

/** Minimales PNG, dessen Kopf beliebige Masse behauptet (Dekompressionsbombe ohne echte Pixel). */
function pngClaiming(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // Bittiefe
  ihdr.writeUInt8(0, 9); // Graustufen
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.alloc(16))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

async function meanStdev(data: Buffer): Promise<number> {
  const { channels } = await sharp(data).stats();
  return channels.slice(0, 3).reduce((sum, c) => sum + c.stdev, 0) / 3;
}

describe("processUpload", () => {
  it("wandelt ein PNG in WebP um und liefert Masse und Grösse", async () => {
    const bytes = await solid(800, 600).png().toBuffer();

    const { original, preview } = await processUpload({ bytes });

    expect(original.contentType).toBe("image/webp");
    expect(original).toMatchObject({ width: 800, height: 600, bytes: original.data.length });
    const meta = await sharp(original.data).metadata();
    expect(meta).toMatchObject({ format: "webp", width: 800, height: 600 });

    expect(preview.contentType).toBe("image/webp");
    expect((await sharp(preview.data).metadata()).format).toBe("webp");
    expect(preview.bytes).toBe(preview.data.length);
  });

  it("akzeptiert JPEG und WebP", async () => {
    for (const bytes of [await solid(64, 48).jpeg().toBuffer(), await solid(64, 48).webp().toBuffer()]) {
      const { original } = await processUpload({ bytes });
      expect(original).toMatchObject({ width: 64, height: 48, contentType: "image/webp" });
    }
  });

  it("begrenzt die längste Kante des Originals auf 2560 px", async () => {
    const bytes = await solid(3000, 1000).png().toBuffer();
    const { original } = await processUpload({ bytes });
    expect(original).toMatchObject({ width: 2560, height: 853 });
    expect(await sharp(original.data).metadata()).toMatchObject({ width: 2560, height: 853 });

    const tall = await processUpload({ bytes: await solid(1200, 4000).jpeg().toBuffer() });
    expect(tall.original).toMatchObject({ width: 768, height: 2560 });
  });

  it("vergrössert kleine Bilder nicht", async () => {
    const { original } = await processUpload({ bytes: await solid(300, 200).png().toBuffer() });
    expect(original).toMatchObject({ width: 300, height: 200 });
  });

  it("erzeugt eine höchstens 480 px breite Vorschau im Seitenverhältnis des Originals", async () => {
    const { original, preview } = await processUpload({ bytes: await stripes(1000, 800).png().toBuffer() });

    expect(preview.width).toBe(480);
    expect(preview.height).toBe(384);
    expect(await sharp(preview.data).metadata()).toMatchObject({ width: 480, height: 384 });
    expect(preview.data.equals(original.data)).toBe(false);
  });

  it("macht die Vorschau unkenntlich (Detail geht verloren)", async () => {
    const { original, preview } = await processUpload({ bytes: await stripes(1000, 800).png().toBuffer() });

    // Streifen: Standardabweichung ~127. Eine blosse Verkleinerung behielte die Streifen.
    expect(await meanStdev(original.data)).toBeGreaterThan(100);
    expect(await meanStdev(preview.data)).toBeLessThan(25);
  });

  it("vergrössert die Vorschau kleiner Bilder nicht über deren Breite", async () => {
    const { preview } = await processUpload({ bytes: await solid(200, 100).png().toBuffer() });
    expect(preview).toMatchObject({ width: 200, height: 100 });
  });

  it("entfernt EXIF-Metadaten", async () => {
    const bytes = await solid(120, 80)
      .jpeg()
      .withExif({ IFD0: { Copyright: "x", Artist: "Jemand" } })
      .toBuffer();
    expect((await sharp(bytes).metadata()).exif).toBeDefined(); // Vorbedingung

    const { original, preview } = await processUpload({ bytes });

    const originalMeta = await sharp(original.data).metadata();
    expect(originalMeta.exif).toBeUndefined();
    expect(originalMeta.xmp).toBeUndefined();
    expect((await sharp(preview.data).metadata()).exif).toBeUndefined();
  });

  it("richtet das Bild gemäss EXIF-Orientierung aus und entfernt die Angabe", async () => {
    // Orientierung 6 = 90° im Uhrzeigersinn drehen: 200×100 wird zu 100×200.
    const bytes = await solid(200, 100).jpeg().withMetadata({ orientation: 6 }).toBuffer();

    const { original, preview } = await processUpload({ bytes });

    expect(original).toMatchObject({ width: 100, height: 200 });
    const meta = await sharp(original.data).metadata();
    expect(meta).toMatchObject({ width: 100, height: 200 });
    expect(meta.orientation).toBeUndefined();
    expect(preview).toMatchObject({ width: 100, height: 200 });
  });

  it("behält Transparenz bei PNG mit Alphakanal", async () => {
    const { original } = await processUpload({ bytes: await solid(50, 50, 4).png().toBuffer() });
    expect((await sharp(original.data).metadata()).hasAlpha).toBe(true);
  });

  it.each([
    ["Text", () => Promise.resolve(Buffer.from("Hallo, ich bin kein Bild."))],
    ["leerer Buffer", () => Promise.resolve(Buffer.alloc(0))],
    ["GIF", () => solid(40, 40).gif().toBuffer()],
    ["TIFF", () => solid(40, 40).tiff().toBuffer()],
    [
      "SVG",
      () =>
        Promise.resolve(
          Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>'),
        ),
    ],
    ["abgeschnittenes JPEG", async () => (await solid(400, 300).jpeg().toBuffer()).subarray(0, 200)],
    ["JPEG-Kopf mit Müll", () => Promise.resolve(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("x".repeat(64))]))],
  ])("lehnt %s mit ValidationError ab", async (_label, make) => {
    const bytes = await make();
    await expect(processUpload({ bytes })).rejects.toBeInstanceOf(ValidationError);
  });

  it("lehnt Dateien über 10 MB ab, bevor sie dekodiert werden", async () => {
    const valid = await solid(10, 10).jpeg().toBuffer();
    // Gültiges JPEG + Füllbytes nach dem EOI-Marker: nur die Grösse ist das Problem.
    const tooBig = Buffer.concat([valid, Buffer.alloc(10 * 1024 * 1024 + 1 - valid.length)]);

    await expect(processUpload({ bytes: tooBig })).rejects.toThrow(/10 MB/);
    await expect(processUpload({ bytes: tooBig })).rejects.toBeInstanceOf(ValidationError);
  });

  it("lehnt Bilder mit mehr als 100 Megapixeln ab (Dekompressionsbombe)", async () => {
    const bomb = pngClaiming(20_000, 20_000);
    expect(await sharp(bomb, { limitInputPixels: false }).metadata()).toMatchObject({ width: 20_000, height: 20_000 }); // Vorbedingung

    await expect(processUpload({ bytes: bomb })).rejects.toThrow(/Megapixel/);
  });

  it("prüft den Inhalt, nicht eine angebliche Endung oder Signatur am Anfang", async () => {
    // PNG-Signatur gefolgt von GIF-Inhalt
    const gif = await solid(10, 10).gif().toBuffer();
    const fake = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), gif]);
    await expect(processUpload({ bytes: fake })).rejects.toBeInstanceOf(ValidationError);
  });
});
