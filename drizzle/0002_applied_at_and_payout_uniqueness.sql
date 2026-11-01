DROP INDEX "creator_profiles_verification_idx";--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD COLUMN "applied_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
-- Bestehende Profile: offene Bewerbungen ab letzter Änderung, entschiedene ab Erstellung.
UPDATE "creator_profiles" SET "applied_at" = CASE WHEN "verification_status" = 'pending' THEN "updated_at" ELSE "created_at" END;--> statement-breakpoint
CREATE UNIQUE INDEX "payouts_one_per_period" ON "payouts" USING btree ("creator_id","period_end") WHERE "payouts"."status" <> 'failed';--> statement-breakpoint
CREATE INDEX "creator_profiles_verification_idx" ON "creator_profiles" USING btree ("verification_status","applied_at");