# happyfeet Grundgerüst – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Ausführung in dieser Session:** Ultracode-Workflows in drei Wellen (W1: Tasks 2–6, W2: Tasks 7–9, W3: Tasks 10–12), danach Integration (13) und Review (14). Tasks einer Welle besitzen **disjunkte Dateien**; nichts installieren, nicht committen (der Orchestrator committet pro Welle).

**Goal:** Lauffähiges, getestetes Grundgerüst einer Creator-Abo-Plattform für Fussbilder (CH) mit Clerk-Login, Abos (Mock-Zahlung), gestaffelter Provision, Moderation und einem herausragenden Admin-Dashboard.

**Architecture:** Next.js-16-Monolith (App Router, Server Components, Server Actions). Zugriffskontrolle ausschliesslich serverseitig in `src/server/services` (Ansatz A); reine Regeln in `src/lib/domain`. Drizzle/Postgres (Supabase), private Medien mit signierten URLs, austauschbare `MediaStorage`- und `PaymentProvider`-Adapter.

**Tech Stack:** Next.js 16.4, React 19.3, TypeScript strict, Tailwind v4, Clerk v7 (+ `@clerk/localizations` deDE), Drizzle 0.45 + postgres 4 (Tests: PGlite 0.5), Supabase JS 2, sharp, zod 4, svix, Vitest 5, lucide-react, clsx.

**Spec:** `docs/superpowers/specs/2026-11-01-happyfeet-grundgeruest-design.md`

## Global Constraints

- UI-Sprache Deutsch (Schweiz), Du-Form, **kein „ß“** (immer „ss“).
- Geld als Integer in Rappen + `currency` (Default `"CHF"`); Anzeige nur via `formatChf()`.
- Provision in bps: Standard **1500**, Premium **500**, Premium-Plan-Zahlung `fee_bps = 10000`; Snapshot pro Zahlung.
- Defaults: Premium **1900** Rp./Monat, Preisrahmen **490–4990** Rp., Preise Vielfache von 10 Rp., Vorab-Prüfung **5** Posts.
- Premium-Features: Badge, Such-Boost, erweiterte Statistik, Auszahlung **wöchentlich** (Standard: **monatlich**).
- Posts: **1–10** Bilder, JPEG/PNG/WebP, ≤ **10 MB** je Bild, Caption ≤ **2000** Zeichen; Sichtbarkeit `public|subscribers`.
- Signierte Medien-URLs: TTL **300 s**; gesperrte Posts liefern **nur** `preview_key`.
- Jede Datei unter `src/server/**` beginnt mit `import "server-only";`.
- Services: `fn(viewer, input, opts?: { now?: Date })`, DB via `getDb()`, Fehler aus `src/server/errors.ts`.
- `cacheComponents` bleibt aus; Proxy-Datei heisst `src/proxy.ts`.
- Keine neuen Abhängigkeiten.

## Review Focus

1. **Leck gesperrter Inhalte**: Kein Pfad (Profil, Feed, Explore, Studio, Moderation) liefert einem Nicht-Abonnenten eine URL auf `original_key`. → Test in Task 7 (`locked posts never expose original keys`).
2. **Abgelaufenes/gekündigtes Abo**: Nach Periodenende kein Zugriff mehr; eine alte `canceled`-Zeile blockiert ein neues Abo nicht. → Test in Task 8 (`resubscribe after expiry`).
3. **Doppelte Zahlungs-Events / Doppelklick im Mock-Checkout**: genau eine Zahlung, genau eine Periodenverlängerung. → Test in Task 8 (`replayed event is idempotent`).
4. **Gesperrte Nutzer**: Gesperrter Fan kann nicht abonnieren/melden; Profil & Posts eines gesperrten Creators verschwinden für alle ausser Admin. → Tests in Task 7 und 8.
5. **Admin-Autorisierung**: Jede Admin-Funktion wirft `ForbiddenError` für Nicht-Admins; `/admin/**` antwortet Nicht-Admins mit 404. → Test in Task 9 (`every admin service rejects non-admins`).

---

### Task 1: Fundament ✅ (erledigt, Commit `a8f5758`)

Vorhanden: `src/server/db/schema.ts` (alle Tabellen), `drizzle/0000_init.sql`, `drizzle/0001_rls_and_seed_settings.sql`, `src/server/db/client.ts` (`getDb`, `setDbForTesting`, `Db`, `Tx`, `DbOrTx`), `src/server/errors.ts` (`AppError`, `AuthError`, `ForbiddenError`, `NotFoundError`, `ConflictError`, `ValidationError`, `ActionResult<T>`, `zodFieldErrors`; `toActionResult` liegt in `src/server/action-result.ts`), `src/server/services/settings.ts` (`getPlatformSettings(db?)`), `src/server/services/audit.ts` (`writeAudit(input, db?)`, `AuditAction`), `src/lib/domain/types.ts` (`Viewer`, `ViewerIdentity`, `PlatformSettings`, Enum-Typen), `tests/helpers/db.ts` (`useTestDb()`), `tests/helpers/factories.ts` (`createUser`, `createAdmin`, `createCreator`, `makePremium`, `createPost`, `createActiveSubscription`, `viewerFor`), `src/app/layout.tsx` (Font-Variablen `--font-bricolage`, `--font-geist`, `--font-geist-mono`), `src/components/providers.tsx` (`AppProviders`, Platzhalter). Lokales Postgres: `DATABASE_URL=postgres://postgres:postgres@localhost:5432/happyfeet` (Start: `service postgresql start`).

---

## Welle 1

### Task 2: Domänenlogik & Formatierung

**Files:** Create `src/lib/domain/{plans,fees,subscriptions,access,moderation,pricing,age,payouts,handles,posts,reports}.ts`, `src/lib/format.ts`; Tests daneben als `*.test.ts`.

**Interfaces – Produces:**
- `plans.ts`: `type PlanFeatures = { badge: boolean; searchBoost: boolean; advancedStats: boolean; payoutSchedule: PayoutSchedule }`; `PLAN_FEATURES: Record<CreatorPlan, PlanFeatures>`; `isPremiumActive(sub: { status: "active"|"canceled"|"expired"; currentPeriodEnd: Date } | null | undefined, now: Date): boolean`; `planOf(isPremium: boolean): CreatorPlan`.
- `fees.ts`: `feeBpsForPlan(plan: CreatorPlan, s: Pick<PlatformSettings,"standardFeeBps"|"premiumFeeBps">): number`; `splitPayment(grossRappen: number, feeBps: number): { platformFeeRappen: number; creatorNetRappen: number }` (wirft `RangeError` bei nicht-ganzzahligem/negativem Betrag oder bps ausserhalb 0–10000).
- `subscriptions.ts`: `isSubscriptionActive(sub: { status: SubscriptionStatus; currentPeriodEnd: Date | null } | null | undefined, now: Date): boolean`; `addBillingMonth(date: Date): Date` (UTC, Monatsende geklemmt).
- `access.ts`: `type PostAccessInput = { viewer: ViewerIdentity; post: { creatorId: string; visibility: PostVisibility; moderationStatus: ModerationStatus; deletedAt: Date | null }; creatorBanned: boolean }`; `isPostListed(input: PostAccessInput): boolean` (Admin/Eigentümer: alle nicht gelöschten; sonst nur `approved` & Creator nicht gesperrt); `canViewPostMedia(input: PostAccessInput & { hasActiveSubscription: boolean }): boolean`.
- `moderation.ts`: `initialModerationStatus(approvedPostCount: number, premoderationCount: number): "pending" | "approved"`.
- `pricing.ts`: `validateMonthlyPrice(rappen: number, s: Pick<PlatformSettings,"minPriceRappen"|"maxPriceRappen">): { ok: true } | { ok: false; reason: string }`.
- `age.ts`: `isAdult(birthDate: string /* YYYY-MM-DD */, now: Date): boolean` (Kalenderdatum in Europe/Zurich; 29.02.-Geborene werden in Nicht-Schaltjahren am 01.03. volljährig); `ageInYears(birthDate: string, now: Date): number`.
- `payouts.ts`: `payoutScheduleFor(plan: CreatorPlan): PayoutSchedule`; `lastPayoutBoundary(schedule, now: Date): Date` (weekly: letzter Montag 00:00 UTC ≤ now; monthly: 1. des Monats 00:00 UTC); `nextPayoutDate(schedule, now: Date): Date` (nächste Grenze > now).
- `handles.ts`: `HANDLE_PATTERN = /^[a-z0-9_]{3,24}$/`; `RESERVED_HANDLES: ReadonlySet<string>` (u. a. admin, studio, explore, feed, api, c, sign-in, sign-up, onboarding, support, happyfeet); `normalizeHandle(input: string): string` (trim, lowercase, führendes `@` weg); `validateHandle(handle: string): { ok: true } | { ok: false; reason: string }`.
- `posts.ts`: `POST_LIMITS = { minImages: 1, maxImages: 10, maxImageBytes: 10 * 1024 * 1024, allowedMimeTypes: ["image/jpeg","image/png","image/webp"], maxCaptionLength: 2000 } as const`.
- `reports.ts`: `REPORT_REASONS: Record<ReportReason, { label: string; severity: "critical" | "high" | "normal" }>` (`possible_minor`, `non_consensual` = critical; `not_own_content` = high).
- `format.ts`: `formatChf(rappen: number, opts?: { compact?: boolean }): string` (Intl `de-CH`, Währung CHF; compact = ohne Rappen); `formatNumber(n: number): string`; `formatPercentBps(bps: number): string`; `formatPercent(ratio: number, digits?: number): string`; `formatDate(d: Date): string`; `formatDateTime(d: Date): string` (Europe/Zurich); `formatRelative(d: Date, now: Date): string` („gerade eben“, „vor 5 Min.“, „vor 3 Std.“, „vor 2 Tagen“, danach Datum).

- [ ] **Step 1: Failing tests** – u. a. `splitPayment(990,1500)` → `{149, 841}`; `splitPayment(990,500)` → `{50, 940}`; `splitPayment(1000,10000)` → `{1000, 0}`; `splitPayment(10.5,1500)` wirft; `addBillingMonth(2026-01-31T10:00Z)` → `2026-02-28T10:00Z`, `(2028-01-31)` → `2028-02-29`; `isAdult("2008-11-01", 2026-11-01T12:00Z)` → true, `"2008-11-02"` → false, `"2008-02-29"` am `2026-02-28T12:00Z` → false, am `2026-03-01T12:00Z` → true; `initialModerationStatus(4,5)` → pending, `(5,5)` → approved, `(0,0)` → approved; `validateMonthlyPrice(495, …)` → nicht ok (10er-Schritte), `480` → nicht ok, `4990` → ok; `lastPayoutBoundary("weekly", 2026-11-04T10:00Z)` → `2026-11-02T00:00Z`, `nextPayoutDate("weekly", …)` → `2026-11-09T00:00Z`, monthly `2026-11-15` → `2026-11-01` / `2026-12-01`; Zugriffsmatrix (Admin, Eigentümer, Fremder × public/subscribers × approved/pending/removed × gesperrt × gelöscht); `formatChf(123450)` → `"CHF 1’234.50"` (genaue Zeichen aus Intl übernehmen und im Test fixieren), `formatPercentBps(1500)` → `"15 %"` (mit geschütztem Leerzeichen).
- [ ] **Step 2:** `npx vitest run src/lib` → FAIL. **Step 3:** implementieren. **Step 4:** → PASS, `npm run typecheck` grün.

### Task 3: Medien-Storage & Bild-Pipeline

**Files:** Create `src/server/storage/{types,index,supabase,local,memory,images,keys}.ts`, `src/app/api/media/[...key]/route.ts`; Tests `src/server/storage/*.test.ts`.

**Interfaces – Produces:**
- `types.ts`: `interface MediaStorage { put(key: string, data: Buffer, contentType: string): Promise<void>; signedUrl(key: string, expiresInSeconds: number): Promise<string>; remove(keys: string[]): Promise<void> }`.
- `index.ts`: `MEDIA_URL_TTL_SECONDS = 300`; `getMediaStorage(): MediaStorage` (`STORAGE_DRIVER`: `supabase` | `local`; `local` in Produktion → Fehler); `setMediaStorageForTesting(s: MediaStorage | null): void`; `signMediaUrl(key: string): Promise<string>`; `signMediaUrls(keys: string[]): Promise<Map<string,string>>`.
- `memory.ts`: `class InMemoryMediaStorage implements MediaStorage` (`objects: Map<string,{data,contentType}>`, `signedUrl` → `memory://<key>?exp=<unix>`).
- `local.ts`: speichert unter `.data/media/<key>`; `signedUrl` → `/api/media/<key>?exp=<unix>&sig=<hex hmac-sha256(MEDIA_SIGNING_SECRET, key+"\n"+exp)>`; `verifyLocalMediaSignature(key, exp, sig, now = new Date()): boolean` (timing-safe); `readLocalMedia(key)`.
- `supabase.ts`: Service-Role-Client, Bucket `SUPABASE_MEDIA_BUCKET` (privat), `createSignedUrl`.
- `keys.ts`: `mediaKeys(postId: string, position: number): { originalKey: string; previewKey: string }` → `posts/<postId>/<position>-<uuid>-original.webp` / `…-preview.webp`; `isSafeMediaKey(key: string): boolean` (`^[a-zA-Z0-9/_.-]+$`, kein `..`, kein führender `/`).
- `images.ts`: `processUpload(input: { bytes: Buffer }): Promise<{ original: ProcessedImage; preview: ProcessedImage }>`, `type ProcessedImage = { data: Buffer; contentType: "image/webp"; width: number; height: number; bytes: number }`. Format über `sharp().metadata()` prüfen (nicht über Dateiendung) → sonst `ValidationError`; `.rotate()`, Metadaten entfernen, längste Kante ≤ 2560, WebP q82. Vorschau: auf 24 px Breite verkleinern, dann auf ≤ 480 px Breite hochskalieren + `blur(12)` → nicht rekonstruierbar.
- Route `GET /api/media/[...key]`: nur bei `STORAGE_DRIVER=local`, sonst 404; prüft `isSafeMediaKey`, Ablauf, Signatur → 403; liefert Datei mit `Content-Type`, `Cache-Control: private, max-age=<restliche Sekunden>`, `X-Content-Type-Options: nosniff`.

- [ ] Tests zuerst: PNG (mit `sharp({create:…})` erzeugt) → WebP, Vorschau ≤ 480 px breit und ≠ Original; Text-Buffer → `ValidationError`; JPEG mit EXIF → Ausgabe ohne EXIF; Signatur: gültig / abgelaufen / manipuliert / fremder Key; `isSafeMediaKey("../etc/passwd")` → false. Dann implementieren, `npx vitest run src/server/storage` grün.

### Task 4: Zahlungs-Provider (Mock)

**Files:** Create `src/server/payments/{types,index,mock}.ts`; Test `src/server/payments/mock.test.ts`.

**Interfaces – Produces:**
- `types.ts`: `type CheckoutKind = "fan_subscription" | "premium_plan"`; `interface CheckoutRequest { kind: CheckoutKind; referenceId: string /* fan_subscription: subscriptions.id; premium_plan: creator users.id */; payerUserId: string; amountRappen: number; currency: "CHF"; description: string; successUrl: string; cancelUrl: string }`; `interface CheckoutSession { provider: string; sessionId: string; redirectUrl: string }`; `type PaymentEvent = | { type: "checkout.completed"; provider: string; eventId: string; kind: CheckoutKind; referenceId: string; payerUserId: string; providerSubscriptionRef: string; providerPaymentId: string; amountRappen: number; currency: "CHF"; occurredAt: Date } | { type: "subscription.renewed"; provider: string; eventId: string; kind: CheckoutKind; providerSubscriptionRef: string; providerPaymentId: string; amountRappen: number; currency: "CHF"; occurredAt: Date } | { type: "subscription.canceled"; provider: string; eventId: string; kind: CheckoutKind; providerSubscriptionRef: string; occurredAt: Date }`; `interface PaymentProvider { readonly name: string; createCheckout(req: CheckoutRequest): Promise<CheckoutSession>; cancelSubscription(providerSubscriptionRef: string): Promise<void>; parseWebhook(req: { headers: Headers; body: string }): Promise<PaymentEvent> }`.
- `mock.ts`: `class MockPaymentProvider implements PaymentProvider` (`name = "mock"`); Session-ID = base64url(JSON) + "." + HMAC (`PAYMENT_WEBHOOK_SECRET`), gültig 1 h, `redirectUrl = /checkout/mock/<sessionId>`; `decodeSession(sessionId: string, now?: Date): (CheckoutRequest & { expiresAt: Date }) | null`; `completedEventFor(sessionId: string, now?: Date): PaymentEvent` (deterministische `providerPaymentId = "mockpay_" + sha256(sessionId).slice(0,24)` → Doppelklick idempotent; `providerSubscriptionRef = "mocksub_" + referenceId`); `renewalEventFor(providerSubscriptionRef: string, amountRappen: number, periodIndex: number, now?: Date): PaymentEvent`; `signWebhookBody(body: string): string`; `parseWebhook` prüft Header `x-mock-signature` (timing-safe) und parst JSON (Datum als ISO-String).
- `index.ts`: `getPaymentProvider(name?: string): PaymentProvider` (`PAYMENT_PROVIDER`, Default `mock`); `getMockProvider(): MockPaymentProvider`; `setPaymentProviderForTesting(p: PaymentProvider | null): void`.

- [ ] Tests zuerst: Session-Roundtrip; manipulierte/abgelaufene Session → null; `completedEventFor` zweimal → gleiche `providerPaymentId`; Webhook mit falscher Signatur → wirft; Roundtrip `signWebhookBody` → `parseWebhook`. Dann implementieren.

### Task 5: Auth, Onboarding & Clerk-Integration

**Files:** Create `src/proxy.ts`, `src/server/auth/{viewer,guards,dev-impersonation}.ts`, `src/server/services/users.ts`, `src/app/api/webhooks/clerk/route.ts`, `src/app/(auth)/layout.tsx`, `src/app/(auth)/sign-in/[[...sign-in]]/page.tsx`, `src/app/(auth)/sign-up/[[...sign-up]]/page.tsx`, `src/app/(auth)/onboarding/{page,actions,onboarding-form}.tsx|ts`, `src/app/(auth)/banned/page.tsx`, `src/components/auth/{user-menu,auth-links}.tsx`; Modify `src/components/providers.tsx`. Tests: `src/server/auth/guards.test.ts`, `src/server/auth/dev-impersonation.test.ts`, `tests/integration/users.test.ts`.

**Interfaces – Produces:**
- `guards.ts` (rein, wirft): `assertAuthenticated(v: Viewer | null): asserts v is Viewer` (`AuthError`); `assertActive(v)` (gesperrt → `ForbiddenError("Dein Konto ist gesperrt.")`); `assertOnboarded(v)`; `assertAdmin(v)`; `assertCreator(v)` (Profil vorhanden); `assertApprovedCreator(v)`.
- `viewer.ts`: `getViewer(): Promise<Viewer | null>` (React `cache`; Clerk `auth()` → `clerkId`; legt fehlenden User lazy via `upsertUserFromClerk` an; Premium via `isPremiumActive`); `requireViewer()` → sonst `redirect("/sign-in")`; `requireOnboardedViewer()` → gesperrt: `redirect("/banned")`, nicht onboarded: `redirect("/onboarding")`; `requireCreator()` → ohne Profil `redirect("/studio/become-creator")`; `requireAdmin()` → Nicht-Admin `notFound()`.
- `dev-impersonation.ts`: `getImpersonatedClerkId(): string | null` – liefert `DEV_IMPERSONATE_CLERK_ID` nur wenn `process.env.NODE_ENV !== "production"`; ist sie in Produktion gesetzt → `throw new Error(...)`. `isDevImpersonation(): boolean`.
- `users.ts`: `upsertUserFromClerk(data: { clerkId: string; email: string | null; imageUrl?: string | null }): Promise<User>`; `deleteUserByClerkId(clerkId: string): Promise<void>`; `isHandleAvailable(handle: string): Promise<boolean>`; `completeOnboarding(viewer: Viewer, input: { handle: string; displayName: string; birthDate: string; confirmAdult: boolean }, opts?: { now?: Date }): Promise<void>` (zod; `ValidationError` mit fieldErrors bei ungültigem Handle/Name (2–40 Zeichen)/Datum/unter 18/fehlender Bestätigung; `ConflictError` wenn Handle vergeben).
- `proxy.ts`: `clerkMiddleware`; geschützte Pfade `/studio(.*)`, `/admin(.*)`, `/feed(.*)`, `/subscriptions(.*)`, `/onboarding(.*)`, `/checkout(.*)` → `auth.protect()`. Bei aktiver Dev-Impersonation: Proxy reicht durch, ohne Clerk aufzurufen.
- `providers.tsx`: `ClerkProvider` mit `localization={deDE}` (`@clerk/localizations`) und an die Design-Tokens angelehntem `appearance` (Akzent `#d7352a`); bei Dev-Impersonation ohne ClerkProvider.
- `user-menu.tsx` (Server Component): `<UserMenu />` – Clerk `<UserButton />` bzw. bei Impersonation ein Chip „Dev: @handle“. `auth-links.tsx`: `<SignInButtonLink />`, `<SignUpButtonLink />`.
- Webhook `POST /api/webhooks/clerk`: `verifyWebhook` aus `@clerk/nextjs/webhooks` (Secret `CLERK_WEBHOOK_SIGNING_SECRET`); `user.created|updated` → upsert, `user.deleted` → delete; ungültige Signatur → 400.
- Seiten: Clerk `<SignIn/>`/`<SignUp/>` zentriert; Onboarding-Formular (Handle mit `@`-Präfix, Anzeigename, Geburtsdatum, Checkbox „Ich bin mindestens 18 Jahre alt“), Fehler pro Feld, danach `redirect("/explore")`; `/banned` mit Grund. Nur Tailwind-Klassen mit den Token-Namen aus Task 6 (`bg-canvas`, `bg-surface`, `text-ink`, `text-ink-muted`, `border-line`, `bg-accent`, `text-accent-ink`, `font-display`), **keine** Imports aus `src/components/ui` (entsteht parallel).

- [ ] Tests zuerst: Guards (alle Kombinationen); Impersonation (Dev → ID, Produktion + gesetzt → wirft, Produktion ohne → null); `completeOnboarding`: unter 18 → `ValidationError` mit `fieldErrors.birthDate`, reservierter Handle → `fieldErrors.handle`, vergebener Handle → `ConflictError`, Erfolg setzt `onboardedAt`, `ageConfirmedAt`, normalisiert Handle; `upsertUserFromClerk` idempotent.

### Task 6: Design-System, Charts & Admin-Shell

**Files:** Modify `src/app/globals.css`; Create `src/components/ui/{cn,button,input,textarea,select,field,card,badge,table,empty-state,stat,kbd,avatar,premium-badge,page-header,segmented}.tsx|ts`, `src/components/charts/{types,sparkline,area-chart,bar-chart,meter,chart-legend,chart-table}.tsx|ts`, `src/components/admin/shell/{admin-shell,admin-nav,command-palette,shortcuts,ticker,queue-pill}.tsx`, `src/app/design-system/page.tsx` (nur Dev: in Produktion `notFound()`).

**Design-Richtung:** Öffentlich/Studio hell und warm („Puder & Creme“), Admin dunkel und dicht („Pediküre-Salon trifft Trading-Terminal“). Warmes Tintenschwarz, **ein** Akzent Nagellack-Rot, Haarlinien statt Schatten, Zahlen in Geist Mono (`tabular-nums`), Überschriften Bricolage Grotesque. Verboten: Lila-Verläufe, Glassmorphism, Emoji-Deko, generische SaaS-Karten mit Drop-Shadow, zentrierte Hero-Phrasen.

**Tokens (Tailwind v4 `@theme`, Namen verbindlich):** `--color-canvas`, `--color-surface`, `--color-surface-2`, `--color-line`, `--color-line-strong`, `--color-ink`, `--color-ink-muted`, `--color-ink-faint`, `--color-accent`, `--color-accent-ink`, `--color-accent-soft`, `--color-success`, `--color-warning`, `--color-danger`, `--color-premium`, `--color-series-1…4`, `--font-display` (= `var(--font-bricolage)`), `--font-sans` (= `var(--font-geist)`), `--font-mono` (= `var(--font-geist-mono)`). Hell = Default auf `:root`; Admin-Werte unter `.theme-admin` (gleiche Variablennamen, damit Primitives in beiden Welten funktionieren).
- Hell: canvas `#f7f1ea`, surface `#fffaf4`, ink `#1d1714`, accent `#d7352a`; Serien `#d7352a, #00886d, #bb7400, #734dbe` (validiert auf `#fbf7f2`).
- Admin: canvas `#0f0d0c`, surface `#171412`, surface-2 `#1f1b18`, line `#2c2622`, ink `#f3ede6`, accent `#ec5545`; Serien `#ec5545, #00ab8e, #c38300, #8e71d6` (validiert auf `#171412`, alle Checks PASS).
- Status-Farben sind reserviert (nur mit Icon + Label), nie als Serienfarbe.

**Interfaces – Produces:**
- `cn(...classes: ClassValue[]): string` (clsx).
- `Button` (`variant: "primary"|"secondary"|"ghost"|"danger"`, `size: "sm"|"md"|"lg"`, `asChild?` nicht nötig – stattdessen `ButtonLink` mit `href`), `Input`, `Textarea`, `Select`, `Field({ label, hint?, error?, children })`, `Card({ title?, action?, children, className? })`, `Badge({ tone: "neutral"|"accent"|"success"|"warning"|"danger"|"premium" })`, `Table/THead/TBody/TR/TH/TD` (`numeric?: boolean` → rechtsbündig, mono), `EmptyState({ title, description?, action? })`, `Stat({ label, value, delta?: { value: string; direction: "up"|"down"|"flat"; good?: boolean }, hint?, children? })`, `Kbd`, `Avatar({ name, src?, size? })`, `PremiumBadge`, `PageHeader({ title, description?, actions? })`, `Segmented` (Link-basierte Tabs: `items: { href, label, count? }[]`, `active`).
- `charts/types.ts`: `type SeriesColor = "series-1"|"series-2"|"series-3"|"series-4"`; `type SeriesDef = { key: string; label: string; color: SeriesColor }`; `type DatumRow = { date: string /* YYYY-MM-DD */ } & Record<string, number | string>`; `type ValueFormat = "chf" | "number" | "percent"`.
- `Sparkline({ values: number[]; color?: SeriesColor; label: string })` (rein SVG, server-fähig).
- `AreaChart({ data: DatumRow[]; series: SeriesDef[]; stacked?: boolean; format: ValueFormat; title: string; height?: number })` – Client; Crosshair + Tooltip, Legende, Achsen dezent, `<ChartTable>`-Umschalter.
- `BarChart({ data: DatumRow[]; series: SeriesDef[]; mode?: "grouped" | "diverging"; format: ValueFormat; title: string; height?: number })` – Client; diverging = erste Serie nach oben, zweite nach unten (z. B. Neu-Abos vs. Kündigungen).
- `Meter({ parts: { label: string; value: number; color: SeriesColor }[]; format: ValueFormat; title: string })`.
- `AdminShell({ children, counts: { verifications: number; moderation: number; reports: number }, ticker: TickerItem[], quickSearch?: (q: string) => Promise<{ id: string; label: string; sublabel?: string; href: string }[]> })` – setzt `.theme-admin`; linke Navigationsleiste (Dashboard `/admin`, Verifizierungen `/admin/verifications`, Moderation `/admin/moderation`, Nutzer `/admin/users`, Auszahlungen `/admin/payouts`, Einstellungen `/admin/settings`, Audit-Log `/admin/audit`) mit Zählern; Ticker-Leiste oben; ⌘K-Palette; Kürzel `g d|v|m|u|p|s|a`, `?` zeigt Hilfe. `TickerItem = { label: string; value: string; delta?: string; direction?: "up"|"down"|"flat" }`.
- Charts nach dem dataviz-Skill (`/tmp/claude-0/bundled-skills/2.1.316/547c060745d96b459130bcba213bed74/dataviz/` – `references/marks-and-anatomy.md`, `interaction.md`, `anti-patterns.md`): 2px-Linien, 4px gerundete Balkenenden an der Basislinie, 2px Lücken, Legende ab 2 Serien, Tooltip, Tabellen-Alternative, keine Doppelachsen.

- [ ] `/design-system` zeigt alle Primitives und Charts mit Mock-Daten in hell **und** in `.theme-admin`; Playwright-Screenshot (Chromium vorinstalliert, `require('playwright')`) beider Bereiche ansehen und nachbessern; `npm run typecheck` und `npm run lint` grün.

---

## Welle 2 (benötigt Welle 1)

### Task 7: Creator-, Post-, Melde- und Feed-Services

**Files:** Create `src/server/services/{creators,posts,reports,media-urls}.ts`; Tests `tests/integration/{creators,posts,reports}.test.ts` (mit `setMediaStorageForTesting(new InMemoryMediaStorage())`).

**Interfaces – Consumes:** Tasks 2, 3, 5 (`guards`). **Produces:**
- `type CreatorCard = { userId: string; handle: string; displayName: string; avatarUrl: string | null; bio: string; monthlyPriceRappen: number; isPremium: boolean; subscriberCount: number; postCount: number }`.
- `type MediaView = { id: string; url: string; width: number; height: number; isPreview: boolean }`.
- `type PostView = { id: string; caption: string; visibility: PostVisibility; moderationStatus: ModerationStatus; moderationNote: string | null; createdAt: Date; publishedAt: Date | null; locked: boolean; mediaCount: number; media: MediaView[]; creator: { userId: string; handle: string; displayName: string; avatarUrl: string | null; isPremium: boolean } }`.
- `creators.ts`: `applyAsCreator(viewer, input: { bio: string; monthlyPriceRappen: number }, opts?)`; `updateCreatorProfile(viewer, input: { bio?: string; monthlyPriceRappen?: number }, opts?)`; `getMyCreatorProfile(viewer): Promise<CreatorProfile | null>`; `listCreatorsForExplore(viewer: Viewer | null, input?: { query?: string; limit?: number }, opts?): Promise<CreatorCard[]>` (nur approved & aktiv; Reihenfolge Premium → Abonnenten ↓ → neueste); `getCreatorPage(viewer: Viewer | null, handle: string, opts?): Promise<CreatorPageData | null>` mit `CreatorPageData = { creator: CreatorCard; viewerRelation: { isOwner: boolean; isSubscribed: boolean; subscription: { id: string; currentPeriodEnd: Date; cancelAtPeriodEnd: boolean } | null }; posts: PostView[] }` (null: unbekannt, nicht approved – ausser Eigentümer/Admin –, gesperrt).
- `posts.ts`: `createPost(viewer, input: { caption: string; visibility: PostVisibility; files: { bytes: Buffer; name: string; type: string }[] }, opts?): Promise<{ postId: string; moderationStatus: "pending" | "approved" }>` (nur approved Creator; bei Fehler hochgeladene Objekte entfernen); `listCreatorPosts(viewer: Viewer | null, creatorId: string, opts?): Promise<PostView[]>`; `getFeed(viewer, input?: { limit?: number; before?: Date }, opts?): Promise<PostView[]>`; `listMyPosts(viewer, opts?): Promise<PostView[]>`; `deletePost(viewer, postId, opts?)` (Eigentümer; soft).
- `reports.ts`: `reportPost(viewer, input: { postId: string; reason: ReportReason; details?: string }, opts?)` (onboarded, aktiv, nicht eigener Post, Post für Viewer gelistet; doppelt offen → `ConflictError`).
- `media-urls.ts`: `mediaViewsFor(rows: PostMedia[], locked: boolean): Promise<MediaView[]>` – die **einzige** Stelle, die für Posts URLs signiert.

- [ ] Tests zuerst: `locked posts never expose original keys` (Fremder, abgelaufenes Abo, Feed, Explore) · Abonnent bekommt Original · pending-Post nur für Eigentümer/Admin · gesperrter Creator → `getCreatorPage` null für Fremde · Vorab-Prüfung: Posts 1–5 pending (bei 0 freigegebenen), nach 5 Freigaben approved · `createPost` für pending Creator → `ForbiddenError` · 11 Bilder / 0 Bilder → `ValidationError` · Explore-Reihenfolge Premium zuerst · doppelte Meldung → `ConflictError` · gesperrter Fan meldet → `ForbiddenError`.

### Task 8: Abos, Premium, Zahlungs-Events, Auszahlungen, Studio-Statistik

**Files:** Create `src/server/services/{subscriptions,premium,payment-events,payouts,studio-stats}.ts`, `src/app/api/webhooks/payments/[provider]/route.ts`; Tests `tests/integration/{subscriptions,premium,payment-events,payouts,studio-stats}.test.ts`.

**Interfaces – Consumes:** Tasks 2, 4, 5. **Produces:**
- `subscriptions.ts`: `startSubscriptionCheckout(viewer, input: { creatorId: string }, opts?: { now?: Date; appUrl?: string }): Promise<{ redirectUrl: string }>` (nicht selbst, Creator approved & aktiv, schon aktiv → `ConflictError`; abgelaufene `canceled`-Zeilen vorher auf `expired`; vorhandene `pending`-Zeile wiederverwenden; Preis-Snapshot = aktueller Creator-Preis); `cancelSubscription(viewer, subscriptionId, opts?)` (nur eigener Fan; `cancel_at_period_end = true`, `status = "canceled"`; Zugriff bis Periodenende); `listMySubscriptions(viewer, opts?): Promise<MySubscription[]>` mit `MySubscription = { id: string; creator: { userId: string; handle: string; displayName: string; avatarUrl: string | null }; status: SubscriptionStatus; priceRappen: number; currentPeriodEnd: Date | null; cancelAtPeriodEnd: boolean; active: boolean }`.
- `premium.ts`: `getPremiumStatus(viewer, opts?): Promise<{ isPremium: boolean; currentPeriodEnd: Date | null; cancelAtPeriodEnd: boolean; priceRappen: number; standardFeeBps: number; premiumFeeBps: number }>`; `startPremiumCheckout(viewer, opts?): Promise<{ redirectUrl: string }>` (nur approved Creator, nicht bereits Premium); `cancelPremium(viewer, opts?)`.
- `payment-events.ts`: `handlePaymentEvent(event: PaymentEvent, opts?): Promise<{ applied: boolean }>` (eine Transaktion; Idempotenz über `(provider, provider_payment_id)` bzw. bei `canceled` über Zustand); `completeMockCheckout(viewer, sessionId: string, opts?): Promise<{ kind: CheckoutKind; creatorHandle: string | null }>` (Session muss `payerUserId === viewer.id` haben).
- `payouts.ts`: `generateDuePayouts(actor: Viewer | null, opts?): Promise<{ created: number; totalRappen: number }>` (Admin oder System = null); `markPayoutPaid(admin: Viewer, payoutId: string, opts?)`; `getCreatorBalance(viewer, opts?): Promise<{ availableRappen: number; scheduledRappen: number; paidRappen: number; schedule: PayoutSchedule; nextPayoutDate: Date }>`; `listCreatorPayouts(viewer, opts?): Promise<Payout[]>`.
- `studio-stats.ts`: `getStudioStats(viewer, opts?): Promise<StudioStats>` mit `StudioStats = { plan: CreatorPlan; basic: { activeSubscribers: number; netThisMonthRappen: number; grossThisMonthRappen: number; postCount: number; pendingPostCount: number; balance: Awaited<ReturnType<typeof getCreatorBalance>> }; advanced: null | { mrrRappen: number; churnRate30d: number; daily: { date: string; netRappen: number; newSubs: number; canceledSubs: number }[] /* 90 Tage, lückenlos */ } }` (advanced nur Premium).
- Webhook `POST /api/webhooks/payments/[provider]`: `getPaymentProvider(provider).parseWebhook` → `handlePaymentEvent`; Signaturfehler → 400; unbekannter Provider → 404.

- [ ] Tests zuerst: Checkout legt pending an / nutzt pending wieder · Abschluss aktiviert (Periode +1 Monat) + Zahlung 15 % (Standard) bzw. 5 % (Premium) · `replayed event is idempotent` · Verlängerung verlängert ab `current_period_end` und nutzt **aktuellen** Satz; alte Zahlung unverändert nach Settings-Änderung · Kündigung: Zugriff bis Periodenende, danach nicht · `resubscribe after expiry` · Selbst-Abo → `ValidationError`/`ForbiddenError` · gesperrter Fan → `ForbiddenError` · fremde Mock-Session → `ForbiddenError` · Premium-Zahlung: `fee_bps 10000`, `creator_net 0` · Payouts: Premium wöchentlich, Standard monatlich, keine doppelte Auszahlung derselben Periode · `advanced` null für Standard, 90 Tage für Premium.

### Task 9: Admin-Services, Seed & Admin-Skript

**Files:** Create `src/server/services/admin/{dashboard,verifications,moderation,users,settings,payouts,audit}.ts`, `scripts/seed.ts`, `scripts/grant-admin.ts`; Tests `tests/integration/admin/*.test.ts`.

**Interfaces – Consumes:** Tasks 2, 3, 5, 8 (`generateDuePayouts`, `markPayoutPaid`). **Produces:** (alle beginnen mit `assertAdmin(admin)`, alle Mutationen schreiben `writeAudit`)
- `dashboard.ts`: `getAdminDashboard(admin, opts?): Promise<AdminDashboard>`; `AdminDashboard = { kpis: { mrrRappen: number; mrrDeltaPct: number | null; platformMrrRappen: number; platformRevenue30dRappen: number; platformRevenueDeltaPct: number | null; grossVolume30dRappen: number; activeSubscriptions: number; activeSubscriptionsDelta30d: number; creatorsApproved: number; creatorsPending: number; creatorsPremium: number; fans: number; premiumSharePct: number }; revenueDaily: { date: string; platformFeeRappen: number; creatorNetRappen: number }[] /* 90, lückenlos */; subscriptionsDaily: { date: string; newSubs: number; canceledSubs: number; active: number }[] /* 90 */; feeMix30d: { standardFeesRappen: number; premiumFeesRappen: number; premiumPlansRappen: number }; queues: { verifications: { count: number; oldestAt: Date | null }; premoderation: { count: number; oldestAt: Date | null }; reports: { count: number; criticalCount: number; oldestAt: Date | null }; payoutsScheduled: { count: number; totalRappen: number } }; topCreators: { userId: string; handle: string; displayName: string; isPremium: boolean; activeSubscribers: number; gross30dRappen: number; net30dRappen: number }[] /* max 8 */; activity: AuditFeedItem[] /* 12 */ }`. MRR = Summe `price_rappen` aktiver, nicht kündigender Fan-Abos; `platformMrrRappen` = deren erwartete Provision (aktueller Plan) + aktive, nicht kündigende Premium-Pläne.
- `audit.ts`: `type AuditFeedItem = { id: string; action: string; actor: { id: string; handle: string | null; displayName: string | null } | null; targetType: string | null; targetId: string | null; metadata: Record<string, unknown>; createdAt: Date }`; `listAuditLog(admin, input?: { limit?: number; before?: Date; action?: string }): Promise<AuditFeedItem[]>`.
- `verifications.ts`: `listVerificationQueue(admin, input?: { status?: VerificationStatus }): Promise<VerificationItem[]>` mit `VerificationItem = { userId; handle; displayName; email; birthDate; age: number; bio; monthlyPriceRappen; appliedAt: Date; status: VerificationStatus; note: string | null; verifiedAt: Date | null }`; `approveCreator(admin, userId, note?: string, opts?)`; `rejectCreator(admin, userId, note: string, opts?)` (Notiz Pflicht).
- `moderation.ts`: `listModerationQueue(admin, opts?): Promise<{ pendingPosts: ModerationPost[]; openReports: ModerationReport[] }>` mit `ModerationPost = { id; caption; visibility; moderationStatus; createdAt: Date; creator: { userId; handle; displayName; isPremium: boolean; approvedPostCount: number }; media: { id: string; url: string; width: number; height: number }[] /* Original, signiert */ }`, `ModerationReport = { id; reason: ReportReason; severity: "critical"|"high"|"normal"; details: string; createdAt: Date; reporter: { handle: string | null } | null; openReportsOnPost: number; post: ModerationPost }` (Reports: critical zuerst, dann älteste); `approvePost(admin, postId, opts?)`; `rejectPost(admin, postId, note: string, opts?)`; `removePost(admin, postId, note: string, opts?)` (löst alle offenen Meldungen dazu); `resolveReport(admin, reportId, note?: string, opts?)`; `dismissReport(admin, reportId, note?: string, opts?)`.
- `users.ts`: `searchUsers(admin, input?: { query?: string; filter?: "all"|"creators"|"admins"|"banned"; limit?: number; offset?: number }): Promise<{ items: AdminUserRow[]; total: number }>` mit `AdminUserRow = { id; handle; displayName; email; createdAt: Date; status: UserStatus; isAdmin: boolean; creator: { verificationStatus: VerificationStatus; isPremium: boolean; activeSubscribers: number } | null; activeSubscriptions: number }`; `banUser(admin, userId, reason: string, opts?)` (nicht sich selbst, keine Admins → `ForbiddenError`); `unbanUser(admin, userId, opts?)`; `quickSearch(admin, q: string): Promise<{ id: string; label: string; sublabel?: string; href: string }[]>` (max 8; href `/admin/users?q=<handle>`).
- `settings.ts`: `updatePlatformSettings(admin, input: Partial<Omit<PlatformSettings, "updatedAt">>, opts?): Promise<PlatformSettings>` (zod: Sätze ganzzahlig 0–5000; Premium-Preis 100–100000; min/max Vielfache von 10, 100 ≤ min ≤ max; Vorab-Prüfung 0–50; Audit mit `before`/`after`).
- `payouts.ts`: `listPayouts(admin, input?: { status?: "scheduled"|"paid"|"failed" }): Promise<AdminPayoutRow[]>` mit `AdminPayoutRow = { id; creator: { userId; handle; displayName; isPremium: boolean }; amountRappen; schedule; periodStart: Date; periodEnd: Date; status; createdAt: Date; paidAt: Date | null }`; Re-Exports `generateDuePayouts`, `markPayoutPaid` aus Task 8.
- `scripts/seed.ts` (`npm run db:seed [-- --reset]`): verweigert bei vorhandenem `seed_admin` ohne `--reset`; legt `seed_admin` (Admin, Clerk-ID `seed_admin`), 12 Creator `seed_creator_1…12` (8 approved – davon 4 Premium –, 3 pending, 1 rejected), 60 Fans `seed_fan_1…60` an; Posts mit per sharp erzeugten, abstrakten Platzhalterbildern (warme Verläufe, keine Fotos) über `processUpload` + `getMediaStorage()`; Abos/Zahlungen/Kündigungen über 90 Tage mit Wachstum (Gebühren via `splitPayment`/`feeBpsForPlan`); 6 Posts in Vorab-Prüfung; 7 offene Meldungen (2 critical); Auszahlungen (paid + scheduled); Audit-Einträge. Endet mit Übersicht der Logins.
- `scripts/grant-admin.ts` (`npm run admin:grant -- <email|handle>`).

- [ ] Tests zuerst: `every admin service rejects non-admins` (Schleife über alle exportierten Funktionen) · approve/reject setzt Status + Audit · `rejectCreator` ohne Notiz → `ValidationError` · `removePost` löst Meldungen · Sperre: Selbst/Admin → `ForbiddenError` · Settings-Validierung (min > max, 10er-Schritte) + Audit · Dashboard auf kleinem Fixture: MRR, Plattform-Umsatz, `revenueDaily.length === 90`, Warteschlangen-Zähler · Seed läuft gegen lokales Postgres (`npm run db:seed -- --reset`).

---

## Welle 3 (benötigt Welle 2)

### Task 10: Admin-Oberfläche

**Files:** Create `src/app/admin/layout.tsx`, `src/app/admin/{page,actions}.tsx|ts`, `src/app/admin/{verifications,moderation,users,payouts,settings,audit}/page.tsx` (+ jeweils `actions.ts` und Client-Komponenten), `src/components/admin/**` (ausser `shell/`).

- Layout: `requireAdmin()`; `AdminShell` mit Zählern aus `getAdminDashboard().queues` (bzw. schlanker Zähl-Query) und Ticker (MRR, Plattform-Umsatz 30 T, aktive Abos, offene Meldungen); `quickSearch` als Server Action.
- Dashboard: Hero-Kennzahl MRR + Sparkline, KPI-Reihe, gestapelte Fläche „Umsatz 90 Tage“ (Plattform vs. Creator), Diverging-Bars „Neu-Abos vs. Kündigungen“, Meter „Provisions-Mix“, Warteschlangen-Karten mit Alter des ältesten Eintrags (Dringlichkeit ab 24 h / 72 h mit Icon + Label), Top-Creator-Tabelle, Aktivitäts-Feed (Audit-Aktionen deutsch beschriftet).
- Verifizierungen: Tabs pending/approved/rejected, Karte je Antrag (Alter berechnet, Preis, Bio), Freigeben / Ablehnen mit Pflichtnotiz.
- Moderation: Tabs „Vorab-Prüfung“ / „Meldungen“; Triage-Ansicht: Liste links, grosse Bildvorschau rechts; Tastatur `j`/`k`, `a` freigeben, `r` ablehnen (Notiz-Dialog), `x` entfernen; optimistische Updates.
- Nutzer: Suche + Filter, Tabelle, Sperren (Grund Pflicht) / Entsperren.
- Auszahlungen: „Fällige erzeugen“, Liste nach Status, „Als bezahlt markieren“.
- Einstellungen: Formular mit Live-Beispielrechnung („Bei 9.90 CHF erhält ein Standard-Creator 8.41 CHF, Premium 9.40 CHF“).
- Audit-Log: chronologisch, Filter nach Aktion.
- [ ] Playwright-Screenshots aller Admin-Seiten (Dev-Impersonation `seed_admin`, Seed-Daten), ansehen, nachbessern.

### Task 11: Öffentliche Seiten & Fan-Bereich

**Files:** Create `src/app/(site)/layout.tsx`, `src/app/(site)/page.tsx` (ersetzt Platzhalter), `src/app/(site)/explore/page.tsx`, `src/app/(site)/c/[handle]/{page,actions}.tsx|ts`, `src/app/(site)/feed/page.tsx`, `src/app/(site)/subscriptions/{page,actions}.tsx|ts`, `src/app/(site)/checkout/mock/[sessionId]/{page,actions}.tsx|ts`, `src/app/not-found.tsx`, `src/components/site/{site-header,site-footer}.tsx`, `src/components/posts/{post-card,post-gallery,locked-overlay,report-dialog,subscribe-button}.tsx`.

**Produces:** `SiteHeader()` (Server Component; Logo, Entdecken, Feed, Abos, Studio, Admin-Link nur für Admins, `UserMenu`) – wird von Task 12 importiert.
- Landing (editorial, warm; erklärt Fans & Creator; CTA), Explore (Suche, Karten mit Premium-Badge), Creator-Profil (Banner, Avatar, Preis, Abo-Button/Status, Posts; gesperrte Posts mit verpixelter Vorschau + „Abonnieren für CHF X/Monat“; Melden-Dialog), Feed, Abos (Kündigen), Mock-Checkout (deutlich als Testzahlung markiert; „Zahlung simulieren“ → `completeMockCheckout`).

### Task 12: Creator-Studio

**Files:** Create `src/app/studio/layout.tsx`, `src/app/studio/{page,actions}.tsx|ts`, `src/app/studio/{become-creator,posts,posts/new,settings,premium,payouts}/page.tsx` (+ `actions.ts`, Client-Formulare), `src/components/studio/**`.
- Layout: `SiteHeader` + Studio-Navigation; Übersicht mit Basis-Statistik für alle, erweiterte Charts (`AreaChart`, `BarChart`) nur Premium, sonst Teaser auf Premium; Bewerbung (Bio, Preis im Admin-Rahmen, Hinweis auf Prüfung); Status-Banner bei pending/rejected; neuer Post (Drag & Drop, Vorschau, Sichtbarkeit, Limits, Hinweis auf Vorab-Prüfung); Post-Liste mit Moderationsstatus; Einstellungen (Preis, Bio); Premium (Vorteile-Vergleich, Upgrade/Kündigen, Rechenbeispiel); Auszahlungen (Guthaben, Rhythmus, nächste Auszahlung, Historie).

---

## Abschluss

### Task 13: Integration & visuelle Verifikation
- [ ] `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` grün (Build ohne Clerk-Keys: Dev-Impersonation ist im Build inaktiv – Build darf nicht an fehlenden Keys scheitern).
- [ ] Lokales Postgres + `npm run db:migrate` + `npm run db:seed -- --reset`, `next dev` mit `DEV_IMPERSONATE_CLERK_ID=seed_admin|seed_creator_1|seed_fan_1`; Playwright-Screenshots aller Hauptseiten; Design-Kritik gegen die Design-Richtung; Fixes.
- [ ] README (deutsch): Setup (Clerk, Supabase, Env), Befehle, Architektur, Launch-Checkliste.

### Task 14: Review & Härtung
- [ ] Unabhängige Reviews (Sicherheit/Zugriff, Korrektheit Zahlungen/Gebühren, Next.js/Clerk-Integration), Befunde adversarial verifizieren, bestätigte Befunde mit Test fixen.
