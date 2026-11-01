/**
 * Demo-Daten für die lokale Entwicklung – damit Admin-Dashboard, Studio und Explore lebendig aussehen.
 *
 *   npm run db:seed              legt die Daten an (verweigert, wenn schon Seed-Daten vorhanden sind)
 *   npm run db:seed -- --reset   leert vorher ALLE Tabellen und `.data/media`
 *
 * - Deterministisch: ein PRNG mit festem Seed (mulberry32) steuert alle Zufallsentscheidungen;
 *   alle Zeitpunkte sind relativ zur aktuellen Zeit verankert.
 * - Logins (Dev-Impersonation): Clerk-IDs `seed_admin`, `seed_creator_1…12`, `seed_fan_1…60`
 *   → `DEV_IMPERSONATE_CLERK_ID=seed_admin` in `.env.local`.
 * - Bilder: abstrakte, warme Platzhalter (SVG → sharp → `processUpload` → `getMediaStorage().put`).
 * - Geldflüsse wie im echten Ablauf: eine Zahlung pro Abrechnungsperiode mit Gebühren-Snapshot
 *   (Plan des Creators zum Zahlungszeitpunkt), Premium-Pläne als `premium_plan`-Zahlungen,
 *   Auszahlungen als lückenlose Kette pro Creator (wie `generateDuePayouts`).
 */
import "dotenv/config";

import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";

import { sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import sharp from "sharp";

import { feeBpsForPlan, splitPayment } from "@/lib/domain/fees";
import { addBillingMonth } from "@/lib/domain/subscriptions";
import type { CreatorPlan, PayoutSchedule, ReportReason, VerificationStatus } from "@/lib/domain/types";
import type { Db } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import {
  auditLog,
  creatorProfiles,
  payments,
  payouts,
  platformSettings,
  postMedia,
  posts,
  premiumSubscriptions,
  reports,
  subscriptions,
  users,
} from "@/server/db/schema";
import { getPlatformSettings } from "@/server/services/settings";
import { getMediaStorage } from "@/server/storage";
import { mediaKeys } from "@/server/storage/keys";

// ─── Grundlagen ───────────────────────────────────────────────────────────────

const SEED = 20261101;
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;
const NOW = new Date();
const TODAY_MS = Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), NOW.getUTCDate());
/** So weit reicht die Abo-Historie zurück (das Dashboard zeigt 90 Tage, davor entsteht der Bestand). */
const SIM_DAYS = 150;
const IMAGE_CONCURRENCY = 4;
/** Vorab-Prüfung (Standard-Einstellung): die ersten 5 Posts jedes Creators wurden geprüft. */
const PREMODERATION_COUNT = 5;
const INSERT_CHUNK = 500;

const TABLES = [
  "audit_log",
  "reports",
  "post_media",
  "posts",
  "payouts",
  "payments",
  "subscriptions",
  "premium_subscriptions",
  "creator_profiles",
  "users",
];

/** mulberry32 – kleiner, schneller PRNG mit 32-Bit-Zustand. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(SEED);
const between = (min: number, max: number) => min + rng() * (max - min);
const intBetween = (min: number, max: number) => Math.floor(between(min, max + 1));
const chance = (p: number) => rng() < p;
function pick<T>(items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}
function weightedPick<T>(items: readonly T[], weight: (item: T) => number): T | null {
  const total = items.reduce((sum, item) => sum + weight(item), 0);
  if (total <= 0) return null;
  let r = rng() * total;
  for (const item of items) {
    r -= weight(item);
    if (r <= 0) return item;
  }
  return items[items.length - 1] ?? null;
}
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);
const plus = (d: Date, ms: number) => new Date(d.getTime() + ms);
const minDate = (a: Date, b: Date) => (a.getTime() <= b.getTime() ? a : b);

function chunks<T>(rows: T[], size = INSERT_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

function translit(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function randomBirthDate(minAge: number, maxAge: number): string {
  const year = NOW.getUTCFullYear() - intBetween(minAge + 1, maxAge);
  const month = intBetween(1, 12);
  const day = intBetween(1, 28);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// ─── Besetzung ────────────────────────────────────────────────────────────────

type ArtBias = "blush" | "terracotta" | "sage" | "sand" | "gold";

type CreatorSeed = {
  handle: string;
  displayName: string;
  email: string;
  birthDate: string;
  bio: string;
  priceRappen: number;
  status: VerificationStatus;
  /** Konto angelegt (Tage zurück) */
  joinedDaysAgo: number;
  /** Bewerbung eingereicht */
  appliedDaysAgo: number;
  /** Entscheid (freigegeben/abgelehnt) */
  decidedDaysAgo?: number;
  note?: string;
  premium?: { sinceDaysAgo: number; canceledDaysAgo?: number };
  popularity: number;
  art: ArtBias[];
  /** Anzahl Posts (nur freigegebene Creator) */
  posts?: number;
};

const ADMIN = {
  clerkId: "seed_admin",
  handle: "hf_mara",
  displayName: "Mara Keller",
  email: "mara.keller@happyfeet.test",
  birthDate: "1988-04-12",
  joinedDaysAgo: 220,
};

const CREATORS: CreatorSeed[] = [
  {
    handle: "zehenspiel",
    displayName: "Nina Zehnder",
    email: "nina.zehnder@example.ch",
    birthDate: "1996-07-19",
    bio: "Barfuss durch Zürich: Seeufer, Kopfsteinpflaster und frisch lackierte Nägel. Neue Sets jeden Dienstag und Freitag.",
    priceRappen: 1490,
    status: "approved",
    joinedDaysAgo: 190,
    appliedDaysAgo: 186,
    decidedDaysAgo: 184,
    premium: { sinceDaysAgo: 128 },
    popularity: 1.7,
    art: ["terracotta", "blush"],
    posts: 14,
  },
  {
    handle: "lena_barfuss",
    displayName: "Lena Baumann",
    email: "lena.baumann@example.ch",
    birthDate: "1999-03-02",
    bio: "Aare, Alpwiesen und ganz viel Sonne auf der Haut. Natürliche Fotos, ehrlich und ohne Filter – aus Bern.",
    priceRappen: 990,
    status: "approved",
    joinedDaysAgo: 175,
    appliedDaysAgo: 171,
    decidedDaysAgo: 170,
    premium: { sinceDaysAgo: 77 },
    popularity: 1.45,
    art: ["sage", "sand"],
    posts: 12,
  },
  {
    handle: "fussnote_zh",
    displayName: "Selina Frei",
    email: "selina.frei@example.ch",
    birthDate: "1993-11-23",
    bio: "Fotografin aus dem Kreis 4 mit Hang zum Detail. Studiolicht, Pastelltöne und Pediküre-Close-ups – jede Woche eine kleine Serie.",
    priceRappen: 1990,
    status: "approved",
    joinedDaysAgo: 160,
    appliedDaysAgo: 158,
    decidedDaysAgo: 155,
    premium: { sinceDaysAgo: 41 },
    popularity: 1.2,
    art: ["blush", "gold"],
    posts: 11,
  },
  {
    handle: "sohle_und_seele",
    displayName: "Mirjam Steiner",
    email: "mirjam.steiner@example.ch",
    birthDate: "1990-05-08",
    bio: "Yogalehrerin in Luzern. Sanfte Bewegungen, warme Farben und Füsse, die schon viele Wege gegangen sind.",
    priceRappen: 2490,
    status: "approved",
    joinedDaysAgo: 168,
    appliedDaysAgo: 165,
    decidedDaysAgo: 163,
    premium: { sinceDaysAgo: 104, canceledDaysAgo: 3 },
    popularity: 0.95,
    art: ["sand", "terracotta"],
    posts: 10,
  },
  {
    handle: "piedi_ticino",
    displayName: "Giulia Bernasconi",
    email: "giulia.bernasconi@example.ch",
    birthDate: "1997-09-14",
    bio: "Ciao! Sonne am Lago di Lugano, Sandalen und lange Sommerabende. Ich poste auf Deutsch und Italienisch.",
    priceRappen: 1290,
    status: "approved",
    joinedDaysAgo: 150,
    appliedDaysAgo: 148,
    decidedDaysAgo: 146,
    popularity: 1.1,
    art: ["gold", "terracotta"],
    posts: 12,
  },
  {
    handle: "alpenzehen",
    displayName: "Andrea Gerber",
    email: "andrea.gerber@example.ch",
    birthDate: "1994-01-27",
    bio: "Zwischen Bergsee und Hüttenweg im Bündnerland: Wanderpausen, kaltes Wasser und warme Wollsocken.",
    priceRappen: 790,
    status: "approved",
    joinedDaysAgo: 128,
    appliedDaysAgo: 126,
    decidedDaysAgo: 122,
    popularity: 0.8,
    art: ["sage", "blush"],
    posts: 9,
  },
  {
    handle: "pied_leman",
    displayName: "Camille Favre",
    email: "camille.favre@example.ch",
    birthDate: "1995-12-03",
    bio: "Lausanne, am Ufer des Léman. Schlichte Eleganz, roter Lack und Abendlicht – auf Deutsch und Französisch.",
    priceRappen: 1590,
    status: "approved",
    joinedDaysAgo: 38,
    appliedDaysAgo: 35,
    decidedDaysAgo: 32,
    popularity: 0.7,
    art: ["terracotta", "sand"],
  },
  {
    handle: "rheinsohle",
    displayName: "Jana Meier",
    email: "jana.meier@example.ch",
    birthDate: "2001-06-30",
    bio: "Basel am Rhein: Sommer auf dem Rheinschwimmen, Herbst im Laub. Neu hier – schön, dass du vorbeischaust!",
    priceRappen: 690,
    status: "approved",
    joinedDaysAgo: 14,
    appliedDaysAgo: 11,
    decidedDaysAgo: 9,
    popularity: 0.55,
    art: ["blush", "sage"],
  },
  {
    handle: "seefuss_luzern",
    displayName: "Sara Brunner",
    email: "sara.brunner@example.ch",
    birthDate: "1998-02-11",
    bio: "Vierwaldstättersee, Stand-up-Paddle und nackte Füsse auf warmem Holz. Freue mich auf die Freischaltung!",
    priceRappen: 990,
    status: "pending",
    joinedDaysAgo: 6,
    appliedDaysAgo: 4.2,
    popularity: 0,
    art: ["sage", "sand"],
  },
  {
    handle: "fersenglueck",
    displayName: "Noemi Huber",
    email: "noemi.huber@example.ch",
    birthDate: "2007-08-14",
    bio: "Tänzerin aus Winterthur. Spitzenschuhe aus, Füsse hoch – ehrliche Einblicke nach dem Training.",
    priceRappen: 1190,
    status: "pending",
    joinedDaysAgo: 3,
    appliedDaysAgo: 1.6,
    popularity: 0,
    art: ["blush", "gold"],
  },
  {
    handle: "zeh_und_zier",
    displayName: "Lara Schmid",
    email: "lara.schmid@example.ch",
    birthDate: "1992-10-05",
    bio: "Nail-Artistin aus St. Gallen. Jede Woche ein neues Design – von zartem Nude bis Glitzer.",
    priceRappen: 1890,
    status: "pending",
    joinedDaysAgo: 1,
    appliedDaysAgo: 0.3,
    popularity: 0,
    art: ["gold", "terracotta"],
  },
  {
    handle: "quickfeet_99",
    displayName: "Tanja Wyss",
    email: "tanja.wyss@example.ch",
    birthDate: "1991-04-21",
    bio: "Die schönsten Füsse der Schweiz!!! Jetzt abonnieren und nichts verpassen!!!",
    priceRappen: 590,
    status: "rejected",
    joinedDaysAgo: 7,
    appliedDaysAgo: 5,
    decidedDaysAgo: 3,
    note: "Die Profilbilder stammen aus einer Bilddatenbank und zeigen nicht dich. Bitte bewirb dich mit eigenen Fotos erneut.",
    popularity: 0,
    art: ["sand", "blush"],
  },
];

const FIRST_NAMES = [
  "Luca", "Noah", "Leon", "Elias", "Jonas", "Nico", "Marco", "David", "Samuel", "Simon",
  "Fabian", "Matteo", "Gian", "Reto", "Urs", "Beat", "Patrick", "Stefan", "Adrian", "Raphael",
  "Yannick", "Pascal", "Dominik", "Florian", "Tobias", "Mia", "Lea", "Sophie", "Laura", "Julia",
  "Anna", "Elena", "Nora", "Alina", "Chiara", "Livia", "Nadine", "Sandra", "Bruno", "Thomas",
  "Michael", "Daniel", "Andreas", "Martin", "Christian", "Sven", "Lars", "Janine", "Corinne", "Remo",
];
const LAST_NAMES = [
  "Müller", "Meier", "Schmid", "Keller", "Weber", "Huber", "Schneider", "Meyer", "Steiner", "Fischer",
  "Gerber", "Brunner", "Baumann", "Frei", "Zimmermann", "Moser", "Widmer", "Wyss", "Graf", "Roth",
  "Bühler", "Suter", "Kunz", "Lüthi", "Marti", "Bachmann", "Hofmann", "Kaufmann", "Egli", "Sutter",
  "Bösch", "Imhof", "Zürcher", "Aebischer", "Rüegg", "Odermatt", "Ammann", "Wenger", "Christen", "Hug",
];
const FUN_HANDLES = [
  "sohlenfan", "zehenzaehler", "barfuss_bern", "fussfreund_zh", "pedi_liebe",
  "sandalen_sami", "wanderschuh_ade", "seeufer_tom",
];

const CAPTIONS = [
  "Sonntag am See",
  "Frisch lackiert in Kirschrot",
  "Kopfsteinpflaster in der Altstadt",
  "Morgentau auf der Wiese",
  "Die Sandalen-Saison ist eröffnet",
  "Fussbad mit Lavendel und Meersalz",
  "Nach dem Lauf am Seeufer",
  "Pastell-Pediküre, Teil 2",
  "Herbstlaub und nackte Sohlen",
  "Ein Nachmittag im Spa",
  "Goldene Stunde am Rhein",
  "Wollsocken-Wetter",
  "Zehenringe aus dem Atelier",
  "Steg, Wasser, Sonne",
  "Leinen, Licht und Füsse hoch",
  "Erster Schnee auf dem Balkon",
  "Sommerabend auf der Terrasse",
  "Neue Farbe: Terracotta",
  "Barfuss im Rebberg",
  "Zwischen zwei Yoga-Stunden",
  "Sand zwischen den Zehen",
  "Close-up für Detailverliebte",
  "Studio-Serie in Creme und Rosé",
  "Hüttenpause mit Aussicht",
  "Pfingstrosen und Pediküre",
  "Regentag, Sofa, Kuschelsocken",
  "Fussmassage mit Mandelöl",
  "Wochenende am Lago",
  "Abendrot über dem Léman",
  "Spaziergang im Morgengrauen",
];

const PREMOD_REJECT_NOTE = "Auf dem zweiten Bild ist ein Gesicht erkennbar – bitte zuschneiden und erneut hochladen.";
const REMOVAL_NOTE = "Bild stammt nachweislich von einem anderen Account (Urheberrecht).";

// ─── Bilder ───────────────────────────────────────────────────────────────────

const PALETTE: Record<ArtBias | "cream", string[]> = {
  cream: ["#f7efe4", "#fbf4ea", "#f3e6d3"],
  blush: ["#f2c6bc", "#eab0a3", "#f6d5cc"],
  terracotta: ["#c8674a", "#b5553a", "#d9886a"],
  sage: ["#a9b99b", "#8ea383", "#c9d4bc"],
  sand: ["#e8d3b4", "#dcc09a"],
  gold: ["#e2b56f", "#d9a55a"],
};

/** Abstrakte, warme Komposition: Verlauf, weiche Farbflächen, eine organische Form, zwei Haarlinien. */
function artSvg(seed: number, width: number, height: number, bias: ArtBias[]): string {
  const r = mulberry32(seed);
  const pickArt = <T,>(items: readonly T[]): T => items[Math.floor(r() * items.length)];
  const f = (n: number) => n.toFixed(1);
  const groups: ArtBias[] = [...bias, ...bias, "blush", "terracotta", "sage", "sand", "gold"];

  const bgA = pickArt(PALETTE.cream);
  const bgB = pickArt([...PALETTE.sand, ...PALETTE.blush]);
  let defs = `<linearGradient id="bg" x1="${r().toFixed(2)}" y1="0" x2="${r().toFixed(2)}" y2="1"><stop offset="0" stop-color="${bgA}"/><stop offset="1" stop-color="${bgB}"/></linearGradient>`;
  let body = `<rect width="${width}" height="${height}" fill="url(#bg)"/>`;
  const scale = Math.max(width, height) / 1500;

  const blobs = 5 + Math.floor(r() * 4);
  for (let i = 0; i < blobs; i++) {
    const color = pickArt(PALETTE[pickArt(groups)]);
    const opacity = 0.45 + r() * 0.45;
    defs += `<radialGradient id="g${i}"><stop offset="0" stop-color="${color}" stop-opacity="${opacity.toFixed(2)}"/><stop offset="0.55" stop-color="${color}" stop-opacity="${(opacity * 0.55).toFixed(2)}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`;
    const cx = r() * width;
    const cy = r() * height;
    body += `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f((220 + r() * 480) * scale)}" ry="${f((200 + r() * 460) * scale)}" transform="rotate(${f(r() * 180)} ${f(cx)} ${f(cy)})" fill="url(#g${i})"/>`;
  }

  // Organische Form (geschlossener Catmull-Rom-Spline)
  const cx = width * (0.3 + r() * 0.4);
  const cy = height * (0.35 + r() * 0.35);
  // die Form richtet sich nach der kürzeren Kante (Banner, Avatare)
  const radius = (220 + r() * 160) * (Math.min(width, height) / 1200);
  const points: [number, number][] = [];
  const count = 7;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const rr = radius * (0.7 + r() * 0.6);
    points.push([cx + Math.cos(angle) * rr, cy + Math.sin(angle) * rr * 1.25]);
  }
  let d = `M${f(points[0][0])},${f(points[0][1])}`;
  for (let i = 0; i < count; i++) {
    const p0 = points[(i - 1 + count) % count];
    const p1 = points[i];
    const p2 = points[(i + 1) % count];
    const p3 = points[(i + 2) % count];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p2[0])},${f(p2[1])}`;
  }
  const formColor = pickArt([...PALETTE.terracotta, ...PALETTE.sage, ...PALETTE[bias[0]]]);
  defs += `<radialGradient id="form" cx="0.4" cy="0.35"><stop offset="0" stop-color="${formColor}" stop-opacity="0.85"/><stop offset="1" stop-color="${formColor}" stop-opacity="0.35"/></radialGradient>`;
  body += `<path d="${d}Z" fill="url(#form)"/>`;

  for (let i = 0; i < 2; i++) {
    body += `<circle cx="${f(r() * width)}" cy="${f(r() * height)}" r="${f((300 + r() * 500) * scale)}" fill="none" stroke="${pickArt(PALETTE.terracotta)}" stroke-opacity="0.28" stroke-width="2"/>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs>${defs}</defs>${body}</svg>`;
}

async function renderPng(seed: number, width: number, height: number, bias: ArtBias[]): Promise<Buffer> {
  return sharp(Buffer.from(artSvg(seed, width, height, bias))).png().toBuffer();
}

async function runPool<T>(items: T[], worker: (item: T, index: number) => Promise<void>): Promise<void> {
  let next = 0;
  const lanes = Array.from({ length: Math.min(IMAGE_CONCURRENCY, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      await worker(items[index], index);
    }
  });
  await Promise.all(lanes);
}

// ─── Datenmodell im Speicher ──────────────────────────────────────────────────

type UserRow = typeof users.$inferInsert & { id: string; createdAt: Date };
type SubscriptionRow = typeof subscriptions.$inferInsert & { id: string };
type PaymentRow = typeof payments.$inferInsert;
type PostRow = typeof posts.$inferInsert & { id: string; createdAt: Date };
type ReportRow = typeof reports.$inferInsert;
type PayoutRow = typeof payouts.$inferInsert;
type AuditRow = typeof auditLog.$inferInsert;

type Creator = CreatorSeed & {
  n: number;
  user: UserRow;
  decidedAt: Date | null;
  premiumSpan: { start: Date; end: Date } | null;
};

type Fan = { n: number; user: UserRow; weight: number; banned: boolean };

type PendingImage = { postId: string; position: number; seed: number; bias: ArtBias[] };

function onboardedUser(input: {
  clerkId: string;
  email: string;
  handle: string;
  displayName: string;
  birthDate: string;
  createdAt: Date;
  isAdmin?: boolean;
}): UserRow {
  const onboardedAt = plus(input.createdAt, intBetween(2, 15) * MINUTE);
  return {
    id: randomUUID(),
    clerkId: input.clerkId,
    email: input.email,
    handle: input.handle,
    displayName: input.displayName,
    birthDate: input.birthDate,
    ageConfirmedAt: onboardedAt,
    onboardedAt,
    isAdmin: input.isAdmin ?? false,
    status: "active",
    createdAt: input.createdAt,
    updatedAt: onboardedAt,
  };
}

function premiumAt(creator: Creator, at: Date): boolean {
  const span = creator.premiumSpan;
  return span !== null && at.getTime() >= span.start.getTime() && at.getTime() < span.end.getTime();
}

// ─── Hauptprogramm ────────────────────────────────────────────────────────────

const LOCAL_DB_HOSTS = new Set(["", "localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Der Seed legt Fake-Nutzer und -Zahlungen an und leert mit `--reset` ALLE Tabellen. Zeigt `DATABASE_URL`
 * (z. B. aus einer kopierten `.env`) auf einen fremden Server – etwa das Supabase-Projekt –, bricht er ab,
 * solange das nicht ausdrücklich mit `SEED_ALLOW_REMOTE=1` bestätigt wird.
 */
function assertSeedTarget(url: string): void {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error("DATABASE_URL ist keine gültige URL.");
  }
  if (LOCAL_DB_HOSTS.has(host) || process.env.SEED_ALLOW_REMOTE === "1") return;
  console.error(
    `✗ DATABASE_URL zeigt auf „${host}“ – kein lokaler Server. Der Seed schreibt Demo-Daten und leert mit --reset alle Tabellen.\n` +
      "  Nur wenn das wirklich gewollt ist: SEED_ALLOW_REMOTE=1 npm run db:seed …",
  );
  process.exit(1);
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Der Seed läuft nicht mit NODE_ENV=production.");
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL ist nicht gesetzt (siehe .env.example).");
  assertSeedTarget(url);
  const reset = process.argv.includes("--reset");

  const client = postgres(url, { max: 4, prepare: false, onnotice: () => {} });
  const db = drizzle(client, { schema });
  try {
    const host = new URL(url).host;
    console.log(`→ Datenbank ${host}${reset ? " (wird geleert)" : ""}`);

    if (reset) {
      await db.execute(sql.raw(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`));
      await db.execute(sql`DELETE FROM platform_settings`);
      await db.execute(sql`INSERT INTO platform_settings (id) VALUES (1)`);
      await rm(path.join(process.cwd(), ".data", "media"), { recursive: true, force: true });
      console.log("✓ Tabellen und .data/media geleert");
    } else {
      const [existing] = await db.execute<{ id: string }>(sql`select id from users where clerk_id = 'seed_admin' limit 1`);
      if (existing) {
        console.error(
          "✗ Seed-Daten sind schon vorhanden (seed_admin). Neu aufsetzen mit: npm run db:seed -- --reset",
        );
        process.exitCode = 1;
        return;
      }
    }

    const settings = await getPlatformSettings(db as unknown as Db);
    const data = buildData(settings);
    await uploadImages(data);
    await insertData(db, data);
    printSummary(data);
  } finally {
    await client.end({ timeout: 5 });
  }
}

type SeedData = ReturnType<typeof buildData>;

function buildData(settings: { standardFeeBps: number; premiumFeeBps: number; premiumPriceRappen: number }) {
  // ── Nutzer ──
  const admin = onboardedUser({
    clerkId: ADMIN.clerkId,
    email: ADMIN.email,
    handle: ADMIN.handle,
    displayName: ADMIN.displayName,
    birthDate: ADMIN.birthDate,
    createdAt: plus(ago(ADMIN.joinedDaysAgo), 9 * HOUR),
    isAdmin: true,
  });

  const creators: Creator[] = CREATORS.map((seed, i) => {
    const user = onboardedUser({
      clerkId: `seed_creator_${i + 1}`,
      email: seed.email,
      handle: seed.handle,
      displayName: seed.displayName,
      birthDate: seed.birthDate,
      createdAt: ago(seed.joinedDaysAgo),
    });
    return {
      ...seed,
      n: i + 1,
      user,
      decidedAt: seed.decidedDaysAgo === undefined ? null : ago(seed.decidedDaysAgo),
      premiumSpan: null,
    };
  });

  const usedHandles = new Set<string>([admin.handle!, ...creators.map((c) => c.handle)]);
  const usedEmails = new Set<string>();
  const fans: Fan[] = [];
  for (let n = 1; n <= 60; n++) {
    const first = n === 1 ? "Luca" : FIRST_NAMES[(n * 7) % FIRST_NAMES.length];
    const last = n === 1 ? "Müller" : LAST_NAMES[(n * 11 + Math.floor(n / 5)) % LAST_NAMES.length];
    const funIndex = n % 6 === 1 && n > 1 ? Math.floor(n / 6) - 1 : -1;
    let handle = funIndex >= 0 && funIndex < FUN_HANDLES.length ? FUN_HANDLES[funIndex] : `${translit(first)}_${translit(last)[0]}`;
    if (usedHandles.has(handle)) handle = `${translit(first)}_${translit(last)}`.slice(0, 24);
    for (let suffix = 2; usedHandles.has(handle); suffix++) handle = `${translit(first)}_${translit(last).slice(0, 12)}${suffix}`;
    usedHandles.add(handle);
    // 20 frühe Fans bilden den Bestand, die übrigen kommen mit wachsender Rate dazu.
    const joinedDaysAgo = n <= 20 ? between(120, 168) : 3 + 117 * rng() ** 1.35;
    let email = `${translit(first)}.${translit(last)}@example.ch`;
    if (usedEmails.has(email)) email = `${translit(first)}.${translit(last)}${n}@example.ch`;
    usedEmails.add(email);
    const user = onboardedUser({
      clerkId: `seed_fan_${n}`,
      email,
      handle,
      displayName: `${first} ${last}`,
      birthDate: randomBirthDate(19, 58),
      createdAt: ago(joinedDaysAgo),
    });
    fans.push({ n, user, weight: n <= 5 ? 2.6 : 0.45 + rng() * 1.4, banned: n >= 59 });
  }
  const fan = (n: number) => fans[n - 1];
  // Gesperrte Fans (59, 60) – 58 wurde gesperrt und wieder entsperrt (nur Audit)
  Object.assign(fan(59).user, { status: "banned", bannedReason: "Spam-Nachrichten an mehrere Creator", bannedAt: ago(2.1) });
  Object.assign(fan(60).user, { status: "banned", bannedReason: "Beleidigende Kommentare in Meldungen", bannedAt: ago(6.4) });

  // ── Premium-Pläne ──
  const premiumRows: (typeof premiumSubscriptions.$inferInsert & { id: string })[] = [];
  const paymentRows: PaymentRow[] = [];
  for (const creator of creators) {
    if (!creator.premium) continue;
    const start = plus(ago(creator.premium.sinceDaysAgo), intBetween(0, 10) * HOUR);
    const periods = [start];
    while (addBillingMonth(periods[periods.length - 1]).getTime() <= NOW.getTime()) {
      periods.push(addBillingMonth(periods[periods.length - 1]));
    }
    const currentStart = periods[periods.length - 1];
    const currentEnd = addBillingMonth(currentStart);
    const canceledAt = creator.premium.canceledDaysAgo === undefined ? null : ago(creator.premium.canceledDaysAgo);
    const id = randomUUID();
    premiumRows.push({
      id,
      creatorId: creator.user.id,
      status: canceledAt ? "canceled" : "active",
      priceRappen: settings.premiumPriceRappen,
      currentPeriodStart: currentStart,
      currentPeriodEnd: currentEnd,
      cancelAtPeriodEnd: canceledAt !== null,
      provider: "mock",
      providerRef: `mocksub_${creator.user.id}`,
      createdAt: plus(start, -3 * MINUTE),
      canceledAt,
    });
    creator.premiumSpan = { start, end: currentEnd };
    periods.forEach((at, k) => {
      paymentRows.push({
        kind: "premium_plan",
        premiumSubscriptionId: id,
        payerId: creator.user.id,
        creatorId: null,
        grossRappen: settings.premiumPriceRappen,
        feeBps: 10_000,
        platformFeeRappen: settings.premiumPriceRappen,
        creatorNetRappen: 0,
        creatorPlan: null,
        provider: "mock",
        providerPaymentId: `seedpay_premium_${creator.n}_${k}`,
        createdAt: at,
      });
    });
  }

  // ── Fan-Abos über 150 Tage: Wachstum, Kündigungen, Verlängerungen ──
  const subscriptionRows: SubscriptionRow[] = [];
  const busyUntil = new Map<string, number>();
  const approved = creators.filter((c) => c.status === "approved");

  const addSubscription = (f: Fan, creator: Creator, startAt: Date, opts: { neverChurn?: boolean } = {}) => {
    const id = randomUUID();
    const periods: Date[] = [];
    let start = startAt;
    let canceledAt: Date | null = null;
    let currentEnd: Date;
    for (let k = 0; ; k++) {
      periods.push(start);
      const end = addBillingMonth(start);
      const churn = !opts.neverChurn && chance(k === 0 ? 0.2 : 0.11);
      const cancelAt = plus(start, (0.15 + rng() * 0.8) * (end.getTime() - start.getTime()));
      if (churn && cancelAt.getTime() <= NOW.getTime()) {
        canceledAt = cancelAt;
        currentEnd = end;
        break;
      }
      if (end.getTime() > NOW.getTime()) {
        currentEnd = end;
        break;
      }
      start = end;
    }
    const status = canceledAt ? (currentEnd.getTime() <= NOW.getTime() ? "expired" : "canceled") : "active";
    subscriptionRows.push({
      id,
      fanId: f.user.id,
      creatorId: creator.user.id,
      status,
      priceRappen: creator.priceRappen,
      currentPeriodStart: periods[periods.length - 1],
      currentPeriodEnd: currentEnd,
      cancelAtPeriodEnd: canceledAt !== null,
      provider: "mock",
      providerRef: `mocksub_${id}`,
      createdAt: plus(startAt, -intBetween(1, 6) * MINUTE),
      canceledAt,
    });
    periods.forEach((at, k) => {
      const plan: CreatorPlan = premiumAt(creator, at) ? "premium" : "standard";
      const feeBps = feeBpsForPlan(plan, settings);
      paymentRows.push({
        kind: "fan_subscription",
        subscriptionId: id,
        payerId: f.user.id,
        creatorId: creator.user.id,
        grossRappen: creator.priceRappen,
        feeBps,
        ...splitPayment(creator.priceRappen, feeBps),
        creatorPlan: plan,
        provider: "mock",
        providerPaymentId: `seedpay_${id}_${k}`,
        createdAt: at,
      });
    });
    busyUntil.set(`${f.n}:${creator.n}`, canceledAt ? currentEnd.getTime() : Number.POSITIVE_INFINITY);
  };

  // Luca (seed_fan_1) hat garantiert drei laufende Abos – praktisch für die Fan-Ansicht.
  addSubscription(fan(1), creators[0], plus(ago(96), 20 * HOUR), { neverChurn: true });
  addSubscription(fan(1), creators[1], plus(ago(61), 19 * HOUR), { neverChurn: true });
  addSubscription(fan(1), creators[4], plus(ago(21), 21 * HOUR), { neverChurn: true });

  // Jeder Fan schliesst pro Tag mit kleiner Wahrscheinlichkeit ein weiteres Abo ab – frisch registrierte
  // Fans besonders oft. So wächst die Nachfrage mit der Fan-Basis, und kein Creator ist "voll".
  const P_DAILY = 0.042;
  for (let d = SIM_DAYS; d >= 0; d--) {
    const dayStart = TODAY_MS - d * DAY;
    const progress = (SIM_DAYS - d) / SIM_DAYS;
    const weekday = new Date(dayStart).getUTCDay();
    const weekend = weekday === 0 || weekday === 6 ? 1.25 : 1;
    // kleiner Schub, als fussnote_zh Premium wurde (Such-Boost) – ca. vor 40 Tagen
    const promo = d <= 41 && d >= 35 ? 1.4 : 1;
    for (const f of fans) {
      // beide Zufallszahlen immer ziehen: gleiche Folge, egal welche Zweige greifen
      const at = new Date(dayStart + between(7, 23.5) * HOUR);
      const roll = rng();
      if (f.banned || f.user.createdAt.getTime() >= at.getTime() || at.getTime() > NOW.getTime() - 10 * MINUTE) {
        continue;
      }
      const daysSinceJoin = (at.getTime() - f.user.createdAt.getTime()) / DAY;
      const newcomer = daysSinceJoin < 4 ? 6 : 1;
      if (roll >= f.weight * P_DAILY * (0.6 + 0.8 * progress) * weekend * promo * newcomer) continue;
      const free = approved.filter(
        (c) =>
          c.decidedAt !== null &&
          c.decidedAt.getTime() < at.getTime() &&
          (busyUntil.get(`${f.n}:${c.n}`) ?? 0) <= at.getTime(),
      );
      const creator = weightedPick(free, (c) => c.popularity * (premiumAt(c, at) ? 1.35 : 1));
      if (creator) addSubscription(f, creator, at);
    }
  }

  // ── Posts & Medien ──
  const postRows: PostRow[] = [];
  const images: PendingImage[] = [];
  const captionPool = [...CAPTIONS];
  let imageSeed = 1;
  const nextCaption = () => {
    if (captionPool.length === 0) captionPool.push(...CAPTIONS);
    return captionPool.splice(Math.floor(rng() * captionPool.length), 1)[0];
  };
  const addPost = (
    creator: Creator,
    createdAt: Date,
    status: "approved" | "pending" | "rejected",
    opts: { premod?: boolean; note?: string } = {},
  ): PostRow => {
    const id = randomUUID();
    const moderatedAt = opts.premod || status === "rejected" ? minDate(plus(createdAt, between(2, 20) * HOUR), ago(0.05)) : null;
    const row: PostRow = {
      id,
      creatorId: creator.user.id,
      caption: nextCaption(),
      visibility: chance(0.25) ? "public" : "subscribers",
      moderationStatus: status,
      moderationNote: opts.note ?? null,
      moderatedBy: moderatedAt ? admin.id : null,
      moderatedAt,
      publishedAt: status === "approved" ? (moderatedAt ?? createdAt) : null,
      createdAt,
    };
    postRows.push(row);
    const imageCount = rng() < 0.5 ? 1 : rng() < 0.7 ? 2 : 3;
    for (let position = 0; position < imageCount; position++) {
      images.push({ postId: id, position, seed: SEED + imageSeed++ * 7919, bias: creator.art });
    }
    return row;
  };

  for (const creator of approved) {
    if (!creator.decidedAt) continue;
    if (creator.posts) {
      // etablierte Creator: die ersten 5 Posts gingen durch die Vorab-Prüfung
      const span = creator.decidedAt.getTime() + DAY;
      const times = Array.from({ length: creator.posts }, () => span + rng() * (NOW.getTime() - 0.4 * DAY - span)).sort(
        (a, b) => a - b,
      );
      times.forEach((t, i) => addPost(creator, new Date(t), "approved", { premod: i < PREMODERATION_COUNT }));
    }
  }
  // pied_leman: 4 freigegeben, 1 abgelehnt, 2 warten
  const leman = creators[6];
  for (const d of [30, 22, 12, 6.3]) addPost(leman, ago(d), "approved", { premod: true });
  const rejectedPost = addPost(leman, ago(5.4), "rejected", { note: PREMOD_REJECT_NOTE });
  rejectedPost.moderatedAt = ago(5.1);
  addPost(leman, ago(2.4), "pending");
  addPost(leman, ago(0.7), "pending");
  // rheinsohle: 1 freigegeben, 4 warten (einer schon > 72 h)
  const rhein = creators[7];
  addPost(rhein, ago(8.2), "approved", { premod: true });
  for (const d of [3.4, 1.8, 1.1, 0.2]) addPost(rhein, ago(d), "pending");

  // ── Meldungen ──
  const reportRows: ReportRow[] = [];
  const auditRows: AuditRow[] = [];
  const visiblePostsOf = (creator: Creator) =>
    postRows.filter((p) => p.creatorId === creator.user.id && p.moderationStatus === "approved");
  const reporterFor = (postId: string, at: Date, used: Set<string>) => {
    const pool = fans.filter(
      (f) => !f.banned && f.n > 1 && f.user.createdAt.getTime() < at.getTime() && !used.has(`${postId}:${f.n}`),
    );
    const f = pick(pool);
    used.add(`${postId}:${f.n}`);
    return f;
  };
  const usedReporters = new Set<string>();
  const report = (
    creator: Creator,
    postIndexFromEnd: number,
    reason: ReportReason,
    daysAgo: number,
    details: string,
    close?: { status: "resolved" | "dismissed"; daysAgo: number; note: string | null },
  ) => {
    const list = visiblePostsOf(creator);
    const post = list[Math.max(0, list.length - 1 - postIndexFromEnd)];
    // nie vor dem Post selbst
    const createdAt = minDate(
      new Date(Math.max(ago(daysAgo).getTime(), post.createdAt.getTime() + 2 * HOUR)),
      ago(0.01),
    );
    const reporter = reporterFor(post.id, createdAt, usedReporters);
    const id = randomUUID();
    reportRows.push({
      id,
      postId: post.id,
      reporterId: reporter.user.id,
      reason,
      details,
      status: close?.status ?? "open",
      resolutionNote: close?.note ?? null,
      resolvedBy: close ? admin.id : null,
      resolvedAt: close ? ago(close.daysAgo) : null,
      createdAt,
    });
    if (close) {
      auditRows.push({
        actorId: admin.id,
        action: close.status === "resolved" ? "report.resolved" : "report.dismissed",
        targetType: "report",
        targetId: id,
        metadata: { postId: post.id, reason, note: close.note },
        createdAt: ago(close.daysAgo),
      });
    }
    return post;
  };

  // 7 offene Meldungen, davon 2 kritisch
  report(creators[5], 0, "possible_minor", 0.4, "Die Person auf dem zweiten Bild wirkt sehr jung.");
  report(creators[2], 1, "non_consensual", 1.2, "Das Bild scheint in einer Badi ohne Einverständnis entstanden zu sein.");
  report(creators[1], 2, "not_own_content", 2.6, "Das gleiche Bild habe ich bei einem anderen Account auf Instagram gesehen.");
  report(creators[1], 2, "not_own_content", 1.9, "Gleiches Foto wie bei @sole.diaries – wirkt kopiert.");
  report(creators[0], 0, "spam", 0.9, "Die Caption verweist auf einen externen Shop.");
  report(creators[3], 1, "spam", 3.1, "Gleicher Post wurde mehrfach hochgeladen.");
  report(creators[4], 3, "other", 5.2, "Die Bildqualität ist sehr schlecht – wirkt wie ein Screenshot.");
  // erledigte Meldungen
  report(creators[1], 4, "spam", 6.2, "Werbung in der Caption.", { status: "dismissed", daysAgo: 6, note: "Kein Spam erkennbar." });
  report(creators[0], 3, "other", 2.3, "Gefällt mir nicht.", { status: "dismissed", daysAgo: 2.1, note: null });
  report(creators[3], 3, "not_own_content", 4, "Quelle fehlt.", {
    status: "resolved",
    daysAgo: 3.5,
    note: "Creator hat die Quelle ergänzt und die Rechte nachgewiesen.",
  });
  // entfernter Post (piedi_ticino) – zwei Meldungen wurden mit dem Entfernen gelöst
  const giulia = creators[4];
  const removedPost = visiblePostsOf(giulia)[Math.max(0, visiblePostsOf(giulia).length - 5)];
  const removedAt = ago(4.1);
  const removalReportIds: string[] = [];
  for (const daysAgo of [5.6, 4.8]) {
    const createdAt = ago(daysAgo);
    const reporter = reporterFor(removedPost.id, createdAt, usedReporters);
    const id = randomUUID();
    removalReportIds.push(id);
    reportRows.push({
      id,
      postId: removedPost.id,
      reporterId: reporter.user.id,
      reason: "not_own_content",
      details: "Dieses Bild gehört einer Fotografin aus Bern – ich kenne das Original.",
      status: "resolved",
      resolutionNote: REMOVAL_NOTE,
      resolvedBy: admin.id,
      resolvedAt: removedAt,
      createdAt,
    });
  }
  Object.assign(removedPost, {
    moderationStatus: "removed",
    moderationNote: REMOVAL_NOTE,
    moderatedBy: admin.id,
    moderatedAt: removedAt,
  });
  auditRows.push({
    actorId: admin.id,
    action: "post.removed",
    targetType: "post",
    targetId: removedPost.id,
    metadata: {
      creatorId: giulia.user.id,
      note: REMOVAL_NOTE,
      previousStatus: "approved",
      resolvedReports: removalReportIds.length,
      reportIds: removalReportIds,
    },
    createdAt: removedAt,
  });

  // ── Auszahlungen: täglicher "Cron" ab der ersten Zahlung, Kette ohne Lücken ──
  const payoutRows: PayoutRow[] = [];
  for (const creator of approved) {
    const earnings = paymentRows
      .filter((p) => p.kind === "fan_subscription" && p.creatorId === creator.user.id)
      .map((p) => ({ at: (p.createdAt as Date).getTime(), net: p.creatorNetRappen }))
      .sort((a, b) => a.at - b.at);
    if (earnings.length === 0) continue;
    const firstAt = earnings[0].at;
    let periodStart = firstAt;
    for (let boundary = Math.floor(firstAt / DAY) * DAY + DAY; boundary <= TODAY_MS; boundary += DAY) {
      const date = new Date(boundary);
      const schedule: PayoutSchedule = premiumAt(creator, date) ? "weekly" : "monthly";
      const isBoundary = schedule === "weekly" ? date.getUTCDay() === 1 : date.getUTCDate() === 1;
      if (!isBoundary || boundary <= periodStart) continue;
      const amount = earnings.filter((e) => e.at >= periodStart && e.at < boundary).reduce((s, e) => s + e.net, 0);
      if (amount <= 0) continue;
      const createdAt = minDate(new Date(boundary + 5 * MINUTE), NOW);
      const paidAt = new Date(boundary + (schedule === "weekly" ? 7 : 3) * DAY + 10 * HOUR);
      const paid = paidAt.getTime() <= NOW.getTime();
      payoutRows.push({
        creatorId: creator.user.id,
        amountRappen: amount,
        schedule,
        periodStart: new Date(periodStart),
        periodEnd: date,
        status: paid ? "paid" : "scheduled",
        createdAt,
        paidAt: paid ? paidAt : null,
        paidBy: paid ? admin.id : null,
      });
      periodStart = boundary;
    }
  }

  // ── Profile ──
  const profileRows: (typeof creatorProfiles.$inferInsert)[] = creators.map((c) => {
    const appliedAt = ago(c.appliedDaysAgo);
    return {
      userId: c.user.id,
      bio: c.bio,
      monthlyPriceRappen: c.priceRappen,
      verificationStatus: c.status,
      verificationNote: c.note ?? null,
      verifiedAt: c.decidedAt,
      verifiedBy: c.decidedAt ? admin.id : null,
      appliedAt,
      createdAt: appliedAt,
      updatedAt: c.decidedAt ?? appliedAt,
    };
  });

  // ── Audit (jüngste Tage) ──
  const audit = (
    action: string,
    actorId: string | null,
    at: Date,
    target?: { type: string; id?: string },
    metadata: Record<string, unknown> = {},
  ) => auditRows.push({ actorId, action, targetType: target?.type ?? null, targetId: target?.id ?? null, metadata, createdAt: at });
  for (const c of creators.filter((x) => x.appliedDaysAgo <= 14)) {
    audit("creator.applied", c.user.id, ago(c.appliedDaysAgo), { type: "creator", id: c.user.id }, {
      monthlyPriceRappen: c.priceRappen,
      reapplied: false,
    });
    if (c.decidedAt) {
      audit(c.status === "approved" ? "creator.approved" : "creator.rejected", admin.id, c.decidedAt, {
        type: "creator",
        id: c.user.id,
      }, { note: c.note ?? null });
    }
  }
  for (const post of postRows) {
    if (!post.moderatedAt || post.moderatedAt.getTime() < ago(14).getTime()) continue;
    if (post.moderationStatus === "approved") {
      audit("post.approved", admin.id, post.moderatedAt, { type: "post", id: post.id }, { creatorId: post.creatorId, note: null });
    } else if (post.moderationStatus === "rejected") {
      audit("post.rejected", admin.id, post.moderatedAt, { type: "post", id: post.id }, {
        creatorId: post.creatorId,
        note: post.moderationNote,
      });
    }
  }
  const banAudit = (f: Fan, reason: string, at: Date) =>
    audit("user.banned", admin.id, at, { type: "user", id: f.user.id }, { reason, handle: f.user.handle });
  banAudit(fan(59), fan(59).user.bannedReason!, ago(2.1));
  banAudit(fan(60), fan(60).user.bannedReason!, ago(6.4));
  banAudit(fan(58), "Verdacht auf Fake-Account", ago(7.2));
  audit("user.unbanned", admin.id, ago(5.3), { type: "user", id: fan(58).user.id }, {
    previousReason: "Verdacht auf Fake-Account",
    handle: fan(58).user.handle,
  });
  const settingsChangedAt = ago(6.6);
  audit("settings.updated", admin.id, settingsChangedAt, { type: "settings", id: "1" }, {
    before: { premoderationCount: 3 },
    after: { premoderationCount: PREMODERATION_COUNT },
    changed: ["premoderationCount"],
  });
  const mirjam = creators[3];
  const mirjamPremium = premiumRows.find((p) => p.creatorId === mirjam.user.id);
  if (mirjamPremium?.canceledAt) {
    audit("premium.canceled", mirjam.user.id, mirjamPremium.canceledAt, { type: "premium", id: mirjamPremium.id });
  }
  // Auszahlungsläufe und bezahlte Auszahlungen der letzten zwei Wochen
  const runs = new Map<number, { created: number; totalRappen: number }>();
  for (const p of payoutRows) {
    const at = (p.periodEnd as Date).getTime();
    if (at < ago(14).getTime()) continue;
    const run = runs.get(at) ?? { created: 0, totalRappen: 0 };
    run.created += 1;
    run.totalRappen += p.amountRappen;
    runs.set(at, run);
  }
  for (const [at, run] of runs) {
    audit("payouts.generated", null, minDate(new Date(at + 5 * MINUTE), NOW), { type: "payout" }, {
      ...run,
      at: new Date(at + 5 * MINUTE).toISOString(),
    });
  }
  payoutRows.forEach((p) => {
    if (p.status !== "paid" || !p.paidAt || p.paidAt.getTime() < ago(14).getTime()) return;
    p.id = randomUUID();
    audit("payout.paid", admin.id, p.paidAt, { type: "payout", id: p.id }, {
      creatorId: p.creatorId,
      amountRappen: p.amountRappen,
      periodStart: (p.periodStart as Date).toISOString(),
      periodEnd: (p.periodEnd as Date).toISOString(),
    });
  });
  // Abo-Ereignisse der letzten 36 Stunden (wie sie die Zahlungs-Events schreiben)
  const recent = ago(1.5).getTime();
  for (const sub of subscriptionRows) {
    const first = paymentRows.find((p) => p.subscriptionId === sub.id && p.providerPaymentId.endsWith("_0"));
    if (first && (first.createdAt as Date).getTime() >= recent) {
      audit("subscription.activated", sub.fanId, first.createdAt as Date, { type: "subscription", id: sub.id }, {
        creatorId: sub.creatorId,
        grossRappen: first.grossRappen,
        feeBps: first.feeBps,
      });
    }
    if (sub.canceledAt && sub.canceledAt.getTime() >= recent) {
      audit("subscription.canceled", sub.fanId, sub.canceledAt, { type: "subscription", id: sub.id }, {
        creatorId: sub.creatorId,
        source: "fan",
      });
    }
  }
  return {
    admin,
    creators,
    fans,
    profileRows,
    premiumRows,
    subscriptionRows,
    paymentRows,
    postRows,
    images,
    mediaRows: [] as (typeof postMedia.$inferInsert)[],
    reportRows,
    payoutRows,
    auditRows,
    settingsChangedAt,
  };
}

async function uploadImages(data: SeedData): Promise<void> {
  const { processUpload } = await import("@/server/storage/images");
  const storage = getMediaStorage();
  const started = Date.now();
  let done = 0;

  await runPool(data.images, async (image) => {
    const png = await renderPng(image.seed, 1200, 1500, image.bias);
    const { original, preview } = await processUpload({ bytes: png });
    const { originalKey, previewKey } = mediaKeys(image.postId, image.position);
    await storage.put(originalKey, original.data, original.contentType);
    await storage.put(previewKey, preview.data, preview.contentType);
    data.mediaRows.push({
      postId: image.postId,
      position: image.position,
      originalKey,
      previewKey,
      width: original.width,
      height: original.height,
      mimeType: original.contentType,
      bytes: original.bytes,
      createdAt: data.postRows.find((p) => p.id === image.postId)?.createdAt,
    });
    done += 1;
    if (done % 25 === 0) console.log(`  … ${done}/${data.images.length} Bilder`);
  });

  // Avatare (alle Creator) und Banner (freigegebene Creator)
  await runPool(data.creators, async (creator, i) => {
    const avatarKey = `avatars/${creator.user.id}/${randomUUID()}.webp`;
    const avatar = await sharp(await renderPng(SEED * 3 + i, 480, 480, creator.art)).webp({ quality: 82 }).toBuffer();
    await storage.put(avatarKey, avatar, "image/webp");
    creator.user.avatarKey = avatarKey;
    if (creator.status === "approved") {
      const bannerKey = `banners/${creator.user.id}/${randomUUID()}.webp`;
      const banner = await sharp(await renderPng(SEED * 5 + i, 1600, 560, creator.art)).webp({ quality: 80 }).toBuffer();
      await storage.put(bannerKey, banner, "image/webp");
      const profile = data.profileRows.find((p) => p.userId === creator.user.id);
      if (profile) profile.bannerKey = bannerKey;
    }
  });
  console.log(`✓ ${data.images.length} Post-Bilder + ${data.creators.length} Avatare in ${((Date.now() - started) / 1000).toFixed(1)} s`);
}

async function insertData(db: PostgresJsDatabase<typeof schema>, data: SeedData): Promise<void> {
  await db.transaction(async (tx) => {
    const allUsers = [data.admin, ...data.creators.map((c) => c.user), ...data.fans.map((f) => f.user)];
    for (const part of chunks(allUsers)) await tx.insert(users).values(part);
    await tx.insert(creatorProfiles).values(data.profileRows);
    if (data.premiumRows.length > 0) await tx.insert(premiumSubscriptions).values(data.premiumRows);
    for (const part of chunks(data.subscriptionRows)) await tx.insert(subscriptions).values(part);
    for (const part of chunks(data.paymentRows)) await tx.insert(payments).values(part);
    for (const part of chunks(data.postRows)) await tx.insert(posts).values(part);
    for (const part of chunks(data.mediaRows)) await tx.insert(postMedia).values(part);
    for (const part of chunks(data.reportRows)) await tx.insert(reports).values(part);
    for (const part of chunks(data.payoutRows)) await tx.insert(payouts).values(part);
    await tx
      .update(platformSettings)
      .set({ premoderationCount: PREMODERATION_COUNT, updatedAt: data.settingsChangedAt, updatedBy: data.admin.id })
      .where(sql`${platformSettings.id} = 1`);
    for (const part of chunks(data.auditRows)) await tx.insert(auditLog).values(part);
  });
}

function printSummary(data: SeedData): void {
  const active = data.subscriptionRows.filter(
    (s) => (s.status === "active" || s.status === "canceled") && (s.currentPeriodEnd as Date).getTime() > NOW.getTime(),
  ).length;
  const premium = data.creators.filter((c) => c.premiumSpan && premiumAt(c, NOW)).length;
  const pendingPosts = data.postRows.filter((p) => p.moderationStatus === "pending").length;
  const openReports = data.reportRows.filter((r) => r.status === "open");
  const critical = openReports.filter((r) => r.reason === "possible_minor" || r.reason === "non_consensual").length;
  const scheduled = data.payoutRows.filter((p) => p.status === "scheduled").length;
  const fanPayments = data.paymentRows.filter((p) => p.kind === "fan_subscription").length;

  console.log(`
✓ Seed fertig (Zeitanker ${NOW.toISOString()})
  Nutzer:       1 Admin · ${data.creators.length} Creator (${data.creators.filter((c) => c.status === "approved").length} freigegeben, ${premium} Premium, ${data.creators.filter((c) => c.status === "pending").length} offen, ${data.creators.filter((c) => c.status === "rejected").length} abgelehnt) · ${data.fans.length} Fans
  Abos:         ${data.subscriptionRows.length} gesamt, ${active} mit Zugriff
  Zahlungen:    ${data.paymentRows.length} (${fanPayments} Fan-Abos, ${data.paymentRows.length - fanPayments} Premium-Pläne)
  Posts:        ${data.postRows.length} (${pendingPosts} in Vorab-Prüfung) · ${data.mediaRows.length} Bilder
  Meldungen:    ${openReports.length} offen (${critical} kritisch)
  Auszahlungen: ${data.payoutRows.length} (${scheduled} geplant)
  Audit:        ${data.auditRows.length} Einträge

Dev-Logins – in .env.local setzen: DEV_IMPERSONATE_CLERK_ID=<Clerk-ID>
  seed_admin        @${data.admin.handle}   Admin
  seed_creator_1    @${data.creators[0].handle}   Premium-Creator
  seed_creator_5    @${data.creators[4].handle}   Standard-Creator
  seed_creator_8    @${data.creators[7].handle}   neu, Posts in Vorab-Prüfung
  seed_creator_9    @${data.creators[8].handle}   Bewerbung offen
  seed_creator_12   @${data.creators[11].handle}   Bewerbung abgelehnt
  seed_fan_1        @${data.fans[0].user.handle}   Fan mit 3 Abos
  seed_fan_59       @${data.fans[58].user.handle}   gesperrt
`);
}

main().catch((error) => {
  console.error("✗ Seed fehlgeschlagen:", error);
  process.exit(1);
});
