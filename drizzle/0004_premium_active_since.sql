ALTER TABLE "premium_subscriptions" ADD COLUMN "active_since" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
-- Bestand: Strecke ab Anlage der Zeile (≈ erste Aktivierung), höchstens ab der laufenden Periode.
UPDATE "premium_subscriptions" SET "active_since" = LEAST("created_at", "current_period_start");
