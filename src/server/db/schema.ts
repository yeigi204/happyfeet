/**
 * happyfeet – Datenbankschema (Drizzle / Postgres, Supabase-kompatibel).
 *
 * Konventionen:
 * - Beträge in Rappen (integer) + `currency` (Default "CHF").
 * - Provisionssätze in Basispunkten (1500 = 15 %).
 * - Alle Zeitstempel `timestamptz`.
 * - RLS ist auf allen Tabellen aktiv (Migration 0001), ohne Policies: Zugriff nur serverseitig.
 * - Nutzer, Posts und Geldflüsse werden nie hart gelöscht (Nachweis/Buchhaltung): Fremdschlüssel auf
 *   `users`/`posts` sind `restrict`; ein gelöschtes Konto wird anonymisiert (`users.deleted_at`).
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  check,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const ts = (name: string) => timestamp(name, { withTimezone: true });

// ─── Enums ────────────────────────────────────────────────────────────────────

export const userStatus = pgEnum("user_status", ["active", "banned"]);
export const verificationStatus = pgEnum("verification_status", ["pending", "approved", "rejected"]);
export const creatorPlan = pgEnum("creator_plan", ["standard", "premium"]);
export const premiumStatus = pgEnum("premium_status", ["active", "canceled", "expired"]);
export const subscriptionStatus = pgEnum("subscription_status", ["pending", "active", "canceled", "expired"]);
export const paymentKind = pgEnum("payment_kind", ["fan_subscription", "premium_plan"]);
export const paymentStatus = pgEnum("payment_status", ["succeeded", "refunded"]);
export const payoutSchedule = pgEnum("payout_schedule", ["weekly", "monthly"]);
export const payoutStatus = pgEnum("payout_status", ["scheduled", "paid", "failed"]);
export const postVisibility = pgEnum("post_visibility", ["public", "subscribers"]);
export const moderationStatus = pgEnum("moderation_status", ["pending", "approved", "rejected", "removed"]);
export const reportReason = pgEnum("report_reason", [
  "not_own_content",
  "possible_minor",
  "non_consensual",
  "spam",
  "other",
]);
export const reportStatus = pgEnum("report_status", ["open", "resolved", "dismissed"]);

// ─── Users ────────────────────────────────────────────────────────────────────

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clerkId: text("clerk_id").notNull(),
    email: text("email"),
    /** lowercase, ^[a-z0-9_]{3,24}$ – null bis Onboarding abgeschlossen */
    handle: text("handle"),
    displayName: text("display_name"),
    avatarKey: text("avatar_key"),
    birthDate: date("birth_date", { mode: "string" }),
    ageConfirmedAt: ts("age_confirmed_at"),
    onboardedAt: ts("onboarded_at"),
    isAdmin: boolean("is_admin").notNull().default(false),
    status: userStatus("status").notNull().default("active"),
    bannedReason: text("banned_reason"),
    bannedAt: ts("banned_at"),
    /**
     * Konto in Clerk gelöscht (`user.deleted`): Die Zeile bleibt als anonymisierter Nachweis bestehen
     * (Posts, Meldungen, Zahlungen, Auszahlungen), E-Mail und Geburtsdatum sind entfernt.
     */
    deletedAt: ts("deleted_at"),
    /**
     * SHA-256 der E-Mail eines gelöschten Kontos (nur zur Missbrauchsabwehr): Ist bzw. wird das Konto
     * gesperrt, startet eine Neuanmeldung mit derselben bestätigten Adresse ebenfalls gesperrt.
     */
    deletedEmailHash: text("deleted_email_hash"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("users_clerk_id_key").on(t.clerkId),
    uniqueIndex("users_handle_key").on(t.handle),
    index("users_created_at_idx").on(t.createdAt),
    index("users_deleted_email_hash_idx")
      .on(t.deletedEmailHash)
      .where(sql`${t.deletedEmailHash} is not null`),
  ],
);

// ─── Creator ──────────────────────────────────────────────────────────────────

export const creatorProfiles = pgTable(
  "creator_profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "restrict" }),
    bio: text("bio").notNull().default(""),
    bannerKey: text("banner_key"),
    monthlyPriceRappen: integer("monthly_price_rappen").notNull(),
    currency: text("currency").notNull().default("CHF"),
    verificationStatus: verificationStatus("verification_status").notNull().default("pending"),
    verificationNote: text("verification_note"),
    verifiedAt: ts("verified_at"),
    verifiedBy: uuid("verified_by").references(() => users.id, { onDelete: "set null" }),
    /** Zeitpunkt der (letzten) Bewerbung – bestimmt die Reihenfolge der Verifizierungs-Queue. */
    appliedAt: ts("applied_at").notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("creator_profiles_verification_idx").on(t.verificationStatus, t.appliedAt),
    check("creator_price_positive", sql`${t.monthlyPriceRappen} > 0`),
  ],
);

/** Premium-Plan eines Creators (Creator zahlt die Plattform). */
export const premiumSubscriptions = pgTable(
  "premium_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: premiumStatus("status").notNull().default("active"),
    priceRappen: integer("price_rappen").notNull(),
    currency: text("currency").notNull().default("CHF"),
    currentPeriodStart: ts("current_period_start").notNull(),
    currentPeriodEnd: ts("current_period_end").notNull(),
    /**
     * Beginn der laufenden, ununterbrochenen Premium-Strecke (Aktivierung bzw. Reaktivierung;
     * Verlängerungen ändern ihn nicht). Verspätete Zahlungs-Events von davor gelten nicht als Premium.
     */
    activeSince: ts("active_since").notNull().defaultNow(),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    provider: text("provider").notNull(),
    providerRef: text("provider_ref"),
    createdAt: createdAt(),
    canceledAt: ts("canceled_at"),
  },
  (t) => [
    index("premium_creator_idx").on(t.creatorId, t.currentPeriodEnd),
    uniqueIndex("premium_provider_ref_key").on(t.provider, t.providerRef),
  ],
);

// ─── Abos (Fan → Creator) ─────────────────────────────────────────────────────

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fanId: uuid("fan_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: subscriptionStatus("status").notNull().default("pending"),
    priceRappen: integer("price_rappen").notNull(),
    currency: text("currency").notNull().default("CHF"),
    currentPeriodStart: ts("current_period_start"),
    currentPeriodEnd: ts("current_period_end"),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    provider: text("provider").notNull(),
    providerRef: text("provider_ref"),
    createdAt: createdAt(),
    canceledAt: ts("canceled_at"),
  },
  (t) => [
    // max. ein "lebendes" Abo pro Fan & Creator
    uniqueIndex("subscriptions_one_live_per_pair")
      .on(t.fanId, t.creatorId)
      .where(sql`${t.status} in ('pending', 'active', 'canceled')`),
    uniqueIndex("subscriptions_provider_ref_key").on(t.provider, t.providerRef),
    index("subscriptions_creator_idx").on(t.creatorId, t.status),
    index("subscriptions_fan_idx").on(t.fanId, t.status),
    check("subscriptions_not_self", sql`${t.fanId} <> ${t.creatorId}`),
  ],
);

// ─── Zahlungen (Ledger) ───────────────────────────────────────────────────────

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: paymentKind("kind").notNull(),
    subscriptionId: uuid("subscription_id").references(() => subscriptions.id, { onDelete: "set null" }),
    premiumSubscriptionId: uuid("premium_subscription_id").references(() => premiumSubscriptions.id, {
      onDelete: "set null",
    }),
    payerId: uuid("payer_id").references(() => users.id, { onDelete: "restrict" }),
    /** Empfänger-Creator; null bei premium_plan */
    creatorId: uuid("creator_id").references(() => users.id, { onDelete: "restrict" }),
    grossRappen: integer("gross_rappen").notNull(),
    /** Snapshot des gültigen Satzes (premium_plan: 10000) */
    feeBps: integer("fee_bps").notNull(),
    platformFeeRappen: integer("platform_fee_rappen").notNull(),
    creatorNetRappen: integer("creator_net_rappen").notNull(),
    /** Snapshot des Creator-Plans zum Zahlungszeitpunkt */
    creatorPlan: creatorPlan("creator_plan"),
    currency: text("currency").notNull().default("CHF"),
    provider: text("provider").notNull(),
    providerPaymentId: text("provider_payment_id").notNull(),
    status: paymentStatus("status").notNull().default("succeeded"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("payments_provider_payment_key").on(t.provider, t.providerPaymentId),
    index("payments_created_at_idx").on(t.createdAt),
    index("payments_creator_idx").on(t.creatorId, t.createdAt),
    check("payments_split_sums", sql`${t.platformFeeRappen} + ${t.creatorNetRappen} = ${t.grossRappen}`),
  ],
);

export const payouts = pgTable(
  "payouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    amountRappen: integer("amount_rappen").notNull(),
    currency: text("currency").notNull().default("CHF"),
    schedule: payoutSchedule("schedule").notNull(),
    periodStart: ts("period_start").notNull(),
    periodEnd: ts("period_end").notNull(),
    status: payoutStatus("status").notNull().default("scheduled"),
    createdAt: createdAt(),
    paidAt: ts("paid_at"),
    paidBy: uuid("paid_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [
    index("payouts_creator_idx").on(t.creatorId, t.createdAt),
    index("payouts_status_idx").on(t.status),
    // Dieselbe Periode eines Creators darf nie doppelt ausbezahlt werden (fehlgeschlagene zählen nicht).
    uniqueIndex("payouts_one_per_period")
      .on(t.creatorId, t.periodEnd)
      .where(sql`${t.status} <> 'failed'`),
    check("payouts_amount_positive", sql`${t.amountRappen} > 0`),
  ],
);

// ─── Posts ────────────────────────────────────────────────────────────────────

export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    caption: text("caption").notNull().default(""),
    visibility: postVisibility("visibility").notNull().default("subscribers"),
    moderationStatus: moderationStatus("moderation_status").notNull().default("pending"),
    moderationNote: text("moderation_note"),
    moderatedBy: uuid("moderated_by").references(() => users.id, { onDelete: "set null" }),
    moderatedAt: ts("moderated_at"),
    publishedAt: ts("published_at"),
    createdAt: createdAt(),
    deletedAt: ts("deleted_at"),
  },
  (t) => [
    index("posts_creator_idx").on(t.creatorId, t.createdAt),
    index("posts_moderation_idx").on(t.moderationStatus, t.createdAt),
  ],
);

export const postMedia = pgTable(
  "post_media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "restrict" }),
    position: integer("position").notNull(),
    originalKey: text("original_key").notNull(),
    previewKey: text("preview_key").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    mimeType: text("mime_type").notNull(),
    bytes: integer("bytes").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("post_media_position_key").on(t.postId, t.position)],
);

// ─── Meldungen ────────────────────────────────────────────────────────────────

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "restrict" }),
    reporterId: uuid("reporter_id").references(() => users.id, { onDelete: "set null" }),
    reason: reportReason("reason").notNull(),
    details: text("details").notNull().default(""),
    status: reportStatus("status").notNull().default("open"),
    resolutionNote: text("resolution_note"),
    resolvedBy: uuid("resolved_by").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: ts("resolved_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("reports_status_idx").on(t.status, t.createdAt),
    uniqueIndex("reports_one_open_per_reporter")
      .on(t.postId, t.reporterId)
      .where(sql`${t.status} = 'open'`),
  ],
);

// ─── Plattform-Einstellungen (genau eine Zeile, id = 1) ───────────────────────

export const platformSettings = pgTable(
  "platform_settings",
  {
    id: integer("id").primaryKey().default(1),
    standardFeeBps: integer("standard_fee_bps").notNull().default(1500),
    premiumFeeBps: integer("premium_fee_bps").notNull().default(500),
    premiumPriceRappen: integer("premium_price_rappen").notNull().default(1900),
    minPriceRappen: integer("min_price_rappen").notNull().default(490),
    maxPriceRappen: integer("max_price_rappen").notNull().default(4990),
    premoderationCount: integer("premoderation_count").notNull().default(5),
    updatedAt: updatedAt(),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [
    check("platform_settings_singleton", sql`${t.id} = 1`),
    check("platform_settings_price_range", sql`${t.minPriceRappen} > 0 and ${t.minPriceRappen} <= ${t.maxPriceRappen}`),
  ],
);

// ─── Audit-Log ────────────────────────────────────────────────────────────────

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** null = System */
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("audit_log_created_at_idx").on(t.createdAt)],
);

// ─── Typen ────────────────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type CreatorProfile = typeof creatorProfiles.$inferSelect;
export type PremiumSubscription = typeof premiumSubscriptions.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Payout = typeof payouts.$inferSelect;
export type Post = typeof posts.$inferSelect;
export type PostMedia = typeof postMedia.$inferSelect;
export type Report = typeof reports.$inferSelect;
export type PlatformSettingsRow = typeof platformSettings.$inferSelect;
export type AuditLogEntry = typeof auditLog.$inferSelect;

export type CreatorPlan = (typeof creatorPlan.enumValues)[number];
export type PostVisibility = (typeof postVisibility.enumValues)[number];
export type ModerationStatus = (typeof moderationStatus.enumValues)[number];
export type ReportReason = (typeof reportReason.enumValues)[number];
export type PayoutScheduleValue = (typeof payoutSchedule.enumValues)[number];
