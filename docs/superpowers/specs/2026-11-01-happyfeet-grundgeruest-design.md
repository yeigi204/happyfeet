# happyfeet – Grundgerüst (Design-Spec)

Stand: 2026-11-01 · Status: freigegeben (Ansatz A, „keine weiteren Fragen, los“)

## 1. Ziel & Kontext

happyfeet ist eine Creator-Abo-Plattform für Fussbilder (Prinzip OnlyFans). Ziel ist ein **echter Launch**, zunächst in der **Schweiz** (CHF, Deutsch). Dieses Dokument beschreibt das **Grundgerüst**: ein lauffähiges, sauber geschnittenes erstes Teilprojekt, auf dem echte Zahlungen, externe Ausweisprüfung und weitere Features aufbauen.

### Entscheidungen der Nutzerin/des Nutzers (gesagt)

| Thema | Entscheidung |
|---|---|
| Zweck | Echter Launch |
| Login | Clerk |
| Datenbank & Storage | Supabase (Postgres + Storage) |
| Markt | Schweiz (vorerst) – CHF, Deutsch |
| Monetarisierung | Nur Monats-Abo pro Creator |
| Provision | Creator mit Premium-Plan: **5 %**, ohne: **15 %** |
| Premium-Vorteile | Badge, Such-Boost, erweiterte Statistiken, wöchentliche statt monatliche Auszahlung |
| Creator-Prüfung | Prüfstatus + Admin-Freigabe jetzt; externer KYC-Anbieter später |
| Posts | 1–10 Bilder + Text, öffentlich oder nur für Abonnenten, gesperrt = verpixelte Vorschau, signierte URLs |
| Abo-Preis | Creator wählt selbst, innerhalb eines Admin-Rahmens |
| Moderation | Mischform: erste N (Default 5) Posts vorab geprüft, danach Melden + Admin-Queue |
| Architektur | **A**: Zugriffslogik serverseitig in Next.js, Browser greift nie direkt auf DB/Storage zu |
| Admin-Dashboard | soll richtig gut aussehen – kein generischer „AI-Look“ |

### Annahmen (nicht explizit gesagt, sinnvoll gesetzt)

- Premium-Preis, Provisionssätze, Preisrahmen und Vorab-Prüfzahl sind **im Admin konfigurierbar** (Defaults: Premium 19.00 CHF/Monat, 15 % / 5 %, Preisrahmen 4.90–49.90 CHF, N = 5).
- Der zum Zahlungszeitpunkt gültige Provisionssatz wird **pro Zahlung gespeichert** (Snapshot).
- Zahlungen sind im Grundgerüst **simuliert** (Mock-Provider), aber über eine austauschbare `PaymentProvider`-Schnittstelle angebunden (später CCBill/Segpay o. ä. – Stripe/PayPal erlauben solchen Content i. d. R. nicht).
- Fans geben bei der Registrierung Geburtsdatum an und bestätigen 18+; unter 18 → kein Zugang.
- Texte deutsch, aber zentral gehalten (spätere i18n); Beträge in Rappen (Integer) + Währungscode.
- `cacheComponents` von Next.js 16 ist **deaktiviert** (fast vollständig authentifizierte, dynamische App) – spätere Optimierung.
- Admin-Rechte über DB-Flag `users.is_admin`, gesetzt per Skript (`npm run admin:grant -- <email>`).

### Nicht im Grundgerüst (eigene Folgeprojekte)

Echte Zahlungsabwicklung & Auszahlungen, externer KYC-Anbieter, Videos, Pay-per-View, Trinkgeld, Direktnachrichten, automatische Bilderkennung (Hash-Matching), E-Mail-Benachrichtigungen, weitere Sprachen/Märkte.

**Vor dem Launch prüfen:** AGB von Clerk, Supabase und Hosting bzgl. Adult-/Fetisch-Content; rechtliche Prüfung (Altersnachweis, Datenschutz revDSG, AGB/Impressum, MWST).

## 2. Architektur

```
Browser ──► Next.js 16 (App Router, Server Components, Server Actions)
              │  proxy.ts (Clerk) – nur optimistische Weiterleitung
              │
              ├─ src/server/auth      getViewer(), requireViewer(), requireAdmin(), requireCreator()
              ├─ src/server/services  Use-Cases (einzige Stelle mit DB-Zugriff + Autorisierung)
              ├─ src/server/db        Drizzle-Schema + Client (postgres-js → Supabase Postgres)
              ├─ src/server/storage   MediaStorage: supabase | local (Dev)
              └─ src/server/payments  PaymentProvider: mock (später ccbill …)
src/lib/domain   reine Geschäftslogik (keine I/O) – Gebühren, Zugriff, Moderation, Auszahlungen …
```

Regeln:

1. **Nur `src/server/**` spricht mit DB/Storage/Provider** und ist mit `import "server-only"` geschützt.
2. **Autorisierung passiert in Services**, nicht (nur) in Pages. Pages rufen Services; Services prüfen den Viewer.
3. **Reine Logik in `src/lib/domain`** – deterministisch, `now` wird hineingereicht, vollständig unit-getestet.
4. Supabase: RLS auf allen Tabellen aktiv **ohne** Policies (deny-all für anon/authenticated) als zweite Verteidigungslinie; der Server nutzt die direkte Postgres-Verbindung. Storage-Bucket `media` ist **privat**.
5. Bilder werden nur über **kurzlebige signierte URLs** ausgeliefert, die der Server nach der Zugriffsprüfung erzeugt. Für gesperrte Posts wird ausschliesslich die beim Upload erzeugte **verpixelte Vorschau** (separates Objekt) signiert – das Original verlässt nie den Server ohne Berechtigung.

### Dev-Modus ohne externe Dienste

- `STORAGE_DRIVER=local` speichert Dateien unter `.data/media` und liefert sie über `/api/media/[...key]` mit HMAC-signierten, ablaufenden Tokens.
- `PAYMENT_PROVIDER=mock` simuliert Checkout (eigene Checkout-Seite) und Webhooks.
- `DEV_IMPERSONATE_CLERK_ID` (nur wenn `NODE_ENV !== "production"`, sonst harter Fehler beim Start): umgeht Clerk und meldet den Viewer als diesen Seed-User an – für lokale Entwicklung und Screenshots. In Produktion-Builds wirkungslos.
- `npm run db:seed` erzeugt Demo-Daten (Creator, Fans, Posts, Abos, Zahlungen über 90 Tage, Meldungen) damit das Admin-Dashboard lokal lebendig aussieht.

## 3. Datenmodell (Postgres / Drizzle)

Alle IDs `uuid` (defaultRandom), Zeitstempel `timestamptz`. Beträge `integer` in Rappen, `currency` `text` default `'CHF'`. Provisionssätze in Basispunkten (`bps`, 1500 = 15 %).

- **users** – `id`, `clerk_id` (unique), `email`, `handle` (unique, lowercase, `^[a-z0-9_]{3,24}$`), `display_name`, `avatar_key`, `birth_date` (date, null bis Onboarding), `age_confirmed_at`, `onboarded_at`, `is_admin` (bool), `status` enum `active|banned`, `banned_reason`, `banned_at`, `created_at`, `updated_at`.
- **creator_profiles** – `user_id` (PK, FK users), `bio`, `banner_key`, `monthly_price_rappen`, `currency`, `verification_status` enum `pending|approved|rejected`, `verification_note`, `verified_at`, `verified_by` (FK users), `created_at`, `updated_at`.
- **premium_subscriptions** (Creator → Plattform) – `id`, `creator_id`, `status` enum `active|canceled|expired`, `price_rappen` (Snapshot), `currency`, `current_period_start`, `current_period_end`, `cancel_at_period_end`, `provider`, `provider_ref`, `created_at`, `canceled_at`. Creator ist Premium, wenn eine Zeile mit `status in (active, canceled)` und `current_period_end > now` existiert.
- **subscriptions** (Fan → Creator) – `id`, `fan_id`, `creator_id`, `status` enum `pending|active|canceled|expired`, `price_rappen` (Snapshot), `currency`, `current_period_start`, `current_period_end`, `cancel_at_period_end`, `provider`, `provider_ref`, `created_at`, `canceled_at`. Partieller Unique-Index: max. eine Zeile pro (fan, creator) mit `status in (pending, active, canceled)`. Zugriff besteht, wenn `status in (active, canceled)` und `current_period_end > now`.
- **payments** (Ledger) – `id`, `kind` enum `fan_subscription|premium_plan`, `subscription_id`, `premium_subscription_id`, `payer_id`, `creator_id` (null bei premium_plan), `gross_rappen`, `fee_bps` (Snapshot), `platform_fee_rappen`, `creator_net_rappen`, `creator_plan` enum `standard|premium` (Snapshot), `currency`, `provider`, `provider_payment_id` (unique → Idempotenz), `status` enum `succeeded|refunded`, `created_at`. Für `premium_plan`: `fee_bps = 10000`, ganzer Betrag ist Plattform-Umsatz, `creator_net = 0`.
- **payouts** – `id`, `creator_id`, `amount_rappen`, `currency`, `schedule` enum `weekly|monthly`, `period_start`, `period_end`, `status` enum `scheduled|paid|failed`, `created_at`, `paid_at`, `paid_by`.
- **posts** – `id`, `creator_id`, `caption`, `visibility` enum `public|subscribers`, `moderation_status` enum `pending|approved|rejected|removed`, `moderation_note`, `moderated_by`, `moderated_at`, `published_at`, `created_at`, `deleted_at`.
- **post_media** – `id`, `post_id`, `position`, `original_key`, `preview_key`, `width`, `height`, `mime_type`, `bytes`, `created_at`.
- **reports** – `id`, `post_id`, `reporter_id`, `reason` enum `not_own_content|possible_minor|non_consensual|spam|other`, `details`, `status` enum `open|resolved|dismissed`, `resolution_note`, `resolved_by`, `resolved_at`, `created_at`.
- **platform_settings** – genau eine Zeile (`id = 1`): `standard_fee_bps` (1500), `premium_fee_bps` (500), `premium_price_rappen` (1900), `min_price_rappen` (490), `max_price_rappen` (4990), `premoderation_count` (5), `updated_at`, `updated_by`.
- **audit_log** – `id`, `actor_id` (null = System), `action` (z. B. `creator.approved`, `post.removed`, `user.banned`, `settings.updated`, `payout.paid`), `target_type`, `target_id`, `metadata` jsonb, `created_at`.

## 4. Geschäftsregeln (`src/lib/domain`, rein & getestet)

- **Plan & Features**: `PLAN_FEATURES.standard = { badge:false, searchBoost:false, advancedStats:false, payoutSchedule:"monthly" }`, `premium = { badge:true, searchBoost:true, advancedStats:true, payoutSchedule:"weekly" }`. `isPremiumActive(sub, now)`.
- **Gebühren**: `feeBpsForPlan(plan, settings)`; `splitPayment(gross, feeBps)` → `platformFee = round(gross * bps / 10000)` (kaufmännisch), `creatorNet = gross - platformFee` (Summe exakt).
- **Zugriff**: `canViewPostMedia({ viewer, post, creatorStatus, hasActiveSubscription })` – Admin ✓; Eigentümer ✓; Post nicht `approved` oder gelöscht → ✗; Creator gesperrt → ✗; `public` → ✓; `subscribers` → nur mit aktivem Abo. `isSubscriptionActive(sub, now)`.
- **Moderation**: `initialModerationStatus(approvedPostCount, premoderationCount)` → `pending` solange `approvedPostCount < premoderationCount`, sonst `approved`. Erst freigegebene Creator dürfen posten.
- **Preis**: `validateMonthlyPrice(rappen, settings)`; Preise sind Vielfache von 10 Rappen.
- **Alter**: `isAdult(birthDate, now)` (≥ 18 Jahre, Geburtstag exakt).
- **Abrechnungsperioden**: `addBillingMonth(date)` (Monatsende-sicher, z. B. 31.01. → 28./29.02.).
- **Auszahlungen**: `payoutSchedule(plan)`, `nextPayoutDate(schedule, now)` (weekly: nächster Montag; monthly: 1. des Folgemonats), `availableBalance(netPayments, payouts)`.
- **Formatierung** (`src/lib/format.ts`): `formatChf(rappen)` → `CHF 1'234.50` (de-CH), `formatPercentBps(1500)` → `15 %`, Datums-Formatierung de-CH.

## 5. Use-Cases (`src/server/services`)

- **Users/Auth**: Clerk-Webhook (`user.created|updated|deleted`, Svix-Signatur) synchronisiert `users`; `getViewer()` legt fehlende User beim ersten Request lazy an (Fallback falls Webhook fehlt). `completeOnboarding({ handle, displayName, birthDate, confirmAdult })` – lehnt < 18 ab. Gesperrte User → Sperrseite.
- **Creator**: `applyAsCreator()` (Profil mit `pending`), `updateCreatorProfile({ bio, monthlyPriceRappen })`, `listCreatorsForExplore({ query })` (nur `approved` + aktiv; Premium-Boost: Premium zuerst, dann nach Abonnentenzahl), `getCreatorPage(handle, viewer)`.
- **Posts**: `createPost({ caption, visibility, files })` – nur `approved` Creator; validiert 1–10 Bilder (JPEG/PNG/WebP, ≤ 15 MB); `sharp`: EXIF entfernen, Original normalisieren, verpixelte Vorschau (klein + starker Blur) erzeugen; Moderationsstatus nach Regel. `listPostsForCreatorPage(creatorId, viewer)` liefert pro Post entweder signierte Original-URLs oder Vorschau-URLs + `locked: true`. `getFeed(viewer)` – Posts abonnierter Creator. `deletePost` (soft).
- **Abos**: `startSubscriptionCheckout(creatorId)` → Provider-Checkout-URL; `handlePaymentEvent(event)` (idempotent über `provider_payment_id`): `checkout.completed` → Abo aktiv + Zahlung mit Gebühren-Snapshot; `subscription.renewed` → Periode verlängern + Zahlung; `subscription.canceled` → `cancel_at_period_end`. `cancelSubscription(id)`. `listMySubscriptions()`.
- **Premium**: `startPremiumCheckout()`, `cancelPremium()`; Zahlungen landen als `premium_plan` im Ledger.
- **Meldungen**: `reportPost({ postId, reason, details })` (eine offene Meldung pro User & Post).
- **Auszahlungen**: `generateDuePayouts(now)` erzeugt `scheduled` Payouts je nach Plan-Rhythmus aus dem verfügbaren Guthaben; `markPayoutPaid(id)` (Admin).
- **Statistiken (Studio)**: Basis (aktive Abonnenten, Einnahmen dieser Monat, Guthaben, nächste Auszahlung) für alle; erweitert (Einnahmen 90 Tage pro Tag, Neu-Abos vs. Kündigungen, Churn) nur Premium.
- **Admin** (alle mit `requireAdmin()` und Audit-Log-Eintrag): Dashboard-Kennzahlen, Verifizierungs-Queue (freigeben/ablehnen + Notiz), Moderations-Queue (vorab-Posts freigeben/ablehnen, Meldungen lösen/verwerfen, Post entfernen), Nutzer suchen/sperren/entsperren, Auszahlungen generieren/als bezahlt markieren, Einstellungen ändern (validiert: Sätze 0–5000 bps, min ≤ max, …), Audit-Log ansehen.

## 6. Oberflächen & Routen (UI deutsch)

- **Öffentlich**: `/` (Landing), `/explore` (Creator-Liste mit Suche, Premium-Badge/-Boost), `/c/[handle]` (Profil, Posts, gesperrte Vorschau, Abo-Button, Melden), `/sign-in`, `/sign-up` (Clerk), `/onboarding` (Pflicht nach Login: Handle, Name, Geburtsdatum, 18+), `/banned`.
- **Fan**: `/feed`, `/subscriptions`, `/checkout/mock/[sessionId]` (simulierte Zahlung).
- **Studio** (`/studio`): Übersicht (Basis- bzw. erweiterte Statistik), `become-creator`, `posts`, `posts/new`, `settings` (Preis, Bio), `premium` (Upgrade/Kündigen, Vorteile), `payouts`.
- **Admin** (`/admin`): Dashboard, `verifications`, `moderation`, `users`, `payouts`, `settings`, `audit`.
- **API**: `/api/webhooks/clerk`, `/api/webhooks/payments/[provider]`, `/api/media/[...key]` (nur local-Driver).

## 7. Design

Zwei Welten, eine Marke:

- **Öffentlich/Studio**: hell, warm („Puder & Creme“), grosszügig, editorial – Bilder im Mittelpunkt.
- **Admin**: dunkel, dicht, präzise – „Pediküre-Salon trifft Trading-Terminal“. Warmes Tintenschwarz statt Neutralgrau, ein einziger kräftiger Akzent in **Nagellack-Rot**, Zahlen in Monospace mit Schweizer Tausender-Apostroph (`CHF 12'480.00`), Haarlinien statt Schatten, keine Glassmorphism-/Lila-Verläufe/Emoji-Deko.
- Typografie: **Bricolage Grotesque** (Display), **Geist** (UI), **Geist Mono** (Zahlen, tabellarisch).
- Admin-Highlights: KPI-Ticker-Leiste, grosse MRR-Kennzahl mit Sparkline, 90-Tage-Umsatz (Plattform vs. Creator) als Fläche, Abo-Wachstum, Warteschlangen-Karten mit Alter des ältesten Eintrags (Dringlichkeit), Aktivitäts-Feed aus dem Audit-Log, Top-Creator-Tabelle, Premium-Anteil.
- Admin-Bedienung: **⌘K-Befehlspalette** (Navigation + Nutzer-Suche), Tastatur-Kürzel (`g d`, `g m`, …), Moderations-Triage per Tastatur (`j`/`k` navigieren, `a` freigeben, `r` ablehnen).
- Charts: eigene, schlanke SVG-Komponenten (keine schwere Chart-Lib), barrierearm (Titel/Beschreibung, Tabellen-Fallback), konsistente Farbrollen.

## 8. Fehlerbehandlung

- Services werfen typisierte Fehler (`AuthError`, `ForbiddenError`, `NotFoundError`, `ValidationError`, `ConflictError`); Server Actions übersetzen sie in `{ ok: false, error, fieldErrors? }` für Formulare; Pages nutzen `notFound()`/`redirect()`.
- Eingaben werden mit **zod** validiert (Server Actions, Webhooks, Settings).
- Webhooks: Signaturprüfung (Svix für Clerk; HMAC für Mock-Provider), Idempotenz über eindeutige Provider-IDs.
- Uploads: harte Limits (Anzahl, Grösse, MIME via `sharp`-Metadaten, nicht nur Dateiendung).

## 9. Tests & Qualität

- **Vitest**: Unit-Tests für `src/lib/domain` und `src/lib/format`; Integrationstests für Services gegen **PGlite** (In-Memory-Postgres mit den echten Drizzle-Migrationen) – Schwerpunkt Zugriffskontrolle, Gebühren-Snapshot, Idempotenz, Moderationsregel, Auszahlungen, Admin-Autorisierung.
- `tsc --noEmit`, `eslint`, `next build` müssen grün sein.
- Visuelle Prüfung: Playwright-Screenshots der Admin-Seiten im Dev-Modus mit Seed-Daten.

## 10. Konfiguration (`.env.example`)

`DATABASE_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_MEDIA_BUCKET=media`, `STORAGE_DRIVER=supabase|local`, `MEDIA_SIGNING_SECRET`, `PAYMENT_PROVIDER=mock`, `PAYMENT_WEBHOOK_SECRET`, `APP_URL`, `DEV_IMPERSONATE_CLERK_ID` (nur Dev).
