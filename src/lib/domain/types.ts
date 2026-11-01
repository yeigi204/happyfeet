/**
 * Gemeinsame Domänen-Typen (Vertrag zwischen domain, services und UI).
 * Reine Typen – keine Abhängigkeit zu DB/Next.
 */

export type CreatorPlan = "standard" | "premium";
export type VerificationStatus = "pending" | "approved" | "rejected";
export type PostVisibility = "public" | "subscribers";
export type ModerationStatus = "pending" | "approved" | "rejected" | "removed";
export type SubscriptionStatus = "pending" | "active" | "canceled" | "expired";
export type PayoutSchedule = "weekly" | "monthly";
export type ReportReason = "not_own_content" | "possible_minor" | "non_consensual" | "spam" | "other";
export type UserStatus = "active" | "banned";

/** Plattform-Einstellungen (Admin-konfigurierbar, eine Zeile in platform_settings). */
export interface PlatformSettings {
  standardFeeBps: number;
  premiumFeeBps: number;
  premiumPriceRappen: number;
  minPriceRappen: number;
  maxPriceRappen: number;
  premoderationCount: number;
  updatedAt: Date;
}

export const DEFAULT_PLATFORM_SETTINGS: Omit<PlatformSettings, "updatedAt"> = {
  standardFeeBps: 1500,
  premiumFeeBps: 500,
  premiumPriceRappen: 1900,
  minPriceRappen: 490,
  maxPriceRappen: 4990,
  premoderationCount: 5,
};

/** Der angemeldete Nutzer, wie ihn Services und UI sehen. Wird von src/server/auth/viewer.ts erzeugt. */
export interface Viewer {
  id: string;
  clerkId: string;
  email: string | null;
  handle: string | null;
  displayName: string | null;
  avatarKey: string | null;
  isAdmin: boolean;
  status: UserStatus;
  /** Onboarding (Handle, Name, Geburtsdatum, 18+) abgeschlossen */
  onboarded: boolean;
  creator: null | {
    verificationStatus: VerificationStatus;
    isPremium: boolean;
  };
}

/** Minimale Identität für reine Zugriffsentscheidungen. */
export type ViewerIdentity = Pick<Viewer, "id" | "isAdmin"> | null;
