import { describe, expect, it } from "vitest";

import { POST_LIMITS } from "@/lib/domain/posts";

import { parseChfInput, rappenToChfInput } from "./price";
import { formatMegabytes, moveItem, screenFiles, type UploadCandidate } from "./upload-rules";

describe("parseChfInput", () => {
  it.each([
    ["9.90", 990],
    ["9,90", 990],
    ["9.9", 990],
    ["12", 1200],
    ["12.-", 1200],
    ["12.–", 1200],
    ["CHF 14.90", 1490],
    ["Fr. 7.50", 750],
    ["  4.90 ", 490],
    ["1’490", 149_000],
    ["0.05", 5],
  ])("%s → %i Rappen", (input, expected) => {
    expect(parseChfInput(input)).toBe(expected);
  });

  it.each(["", "abc", "9.999", "-5", "9..9", "1e3", "12 CHF 3", "9.90.1"])("lehnt %j ab", (input) => {
    expect(parseChfInput(input)).toBeNull();
  });

  it("rechnet ohne Rundungsfehler", () => {
    for (let rappen = 0; rappen <= 5000; rappen += 10) {
      expect(parseChfInput(rappenToChfInput(rappen))).toBe(rappen);
    }
  });
});

describe("rappenToChfInput", () => {
  it("formatiert für das Eingabefeld", () => {
    expect(rappenToChfInput(990)).toBe("9.90");
    expect(rappenToChfInput(1200)).toBe("12.00");
    expect(rappenToChfInput(5)).toBe("0.05");
  });

  it("ungültige Werte ergeben ein leeres Feld", () => {
    expect(rappenToChfInput(-1)).toBe("");
    expect(rappenToChfInput(9.5)).toBe("");
  });
});

const file = (name: string, overrides: Partial<UploadCandidate> = {}): UploadCandidate => ({
  name,
  size: 1024 * 1024,
  type: "image/jpeg",
  lastModified: 1,
  ...overrides,
});

describe("screenFiles", () => {
  it("nimmt JPEG, PNG und WebP an", () => {
    const incoming = [file("a.jpg"), file("b.png", { type: "image/png" }), file("c.webp", { type: "image/webp" })];
    const { accepted, rejected } = screenFiles(incoming, []);
    expect(accepted).toHaveLength(3);
    expect(rejected).toEqual([]);
  });

  it("lehnt falsche Formate, zu grosse, leere und doppelte Dateien mit Grund ab", () => {
    const existing = [file("schon.jpg")];
    const { accepted, rejected } = screenFiles(
      [
        file("anim.gif", { type: "image/gif" }),
        file("riesig.jpg", { size: POST_LIMITS.maxImageBytes + 1 }),
        file("leer.jpg", { size: 0 }),
        file("schon.jpg"),
        file("ok.jpg", { lastModified: 2 }),
      ],
      existing,
    );
    expect(accepted.map((f) => f.name)).toEqual(["ok.jpg"]);
    expect(rejected.map((r) => r.name)).toEqual(["anim.gif", "riesig.jpg", "leer.jpg", "schon.jpg"]);
    expect(rejected[0].reason).toContain("JPEG");
    expect(rejected[1].reason).toContain("10 MB");
  });

  it("genau 10 MB sind erlaubt", () => {
    expect(screenFiles([file("grenze.jpg", { size: POST_LIMITS.maxImageBytes })], []).accepted).toHaveLength(1);
  });

  it("begrenzt auf die Höchstzahl inklusive bereits gewählter Bilder", () => {
    const existing = Array.from({ length: POST_LIMITS.maxImages - 2 }, (_, i) => file(`e${i}.jpg`, { lastModified: 100 + i }));
    const incoming = Array.from({ length: 4 }, (_, i) => file(`n${i}.jpg`, { lastModified: 200 + i }));
    const { accepted, rejected } = screenFiles(incoming, existing);
    expect(accepted.map((f) => f.name)).toEqual(["n0.jpg", "n1.jpg"]);
    expect(rejected.map((r) => r.name)).toEqual(["n2.jpg", "n3.jpg"]);
    expect(rejected[0].reason).toContain(String(POST_LIMITS.maxImages));
  });
});

describe("formatMegabytes", () => {
  it("zeigt KB unter einem Megabyte, sonst MB mit einer Nachkommastelle", () => {
    expect(formatMegabytes(24_615)).toBe("24 KB");
    expect(formatMegabytes(200)).toBe("1 KB");
    expect(formatMegabytes(4.25 * 1024 * 1024)).toBe("4.3 MB");
    expect(formatMegabytes(12 * 1024 * 1024)).toBe("12 MB");
  });
});

describe("moveItem", () => {
  it("verschiebt nach vorne und hinten", () => {
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveItem(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
  });

  it("ignoriert ungültige Indizes und verändert das Original nicht", () => {
    const items = ["a", "b"];
    expect(moveItem(items, 0, 5)).toEqual(["a", "b"]);
    expect(moveItem(items, -1, 0)).toEqual(["a", "b"]);
    expect(items).toEqual(["a", "b"]);
  });
});
