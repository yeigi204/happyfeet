# happyfeet

Creator-Abo-Plattform für Fussbilder – zuerst für die Schweiz (CHF, Deutsch).
Fans abonnieren Creator für einen fixen Monatspreis. Creator behalten 85 % (Standard) bzw. 95 % (mit Premium-Plan).

> Dieses Repository enthält das **Grundgerüst**: lauffähig, getestet, mit simulierten Zahlungen.
> Design: [`docs/superpowers/specs/2026-11-01-happyfeet-grundgeruest-design.md`](docs/superpowers/specs/2026-11-01-happyfeet-grundgeruest-design.md) ·
> Plan: [`docs/superpowers/plans/2026-11-01-happyfeet-grundgeruest.md`](docs/superpowers/plans/2026-11-01-happyfeet-grundgeruest.md)

## Was drin ist

| Bereich | Umfang |
|---|---|
| **Fans** | Entdecken & Suche, Creator-Profile mit verpixelter Vorschau gesperrter Posts, Abo per (Test-)Checkout, Feed, Abos verwalten & kündigen, Posts melden |
| **Creator-Studio** | Bewerbung mit Prüfstatus, Posts mit 1–10 Bildern (Drag & Drop), Vorab-Prüfung der ersten Posts, Preis & Bio, Premium-Plan, Statistik (erweitert mit Premium), Guthaben & Auszahlungen |
| **Admin** | Dashboard (MRR, Umsatz 90 Tage, Abo-Entwicklung, Provisions-Mix, Warteschlangen, Top-Creator, Aktivität), Verifizierungen, Moderations-Triage per Tastatur, Nutzer sperren, Auszahlungen, Einstellungen (Provision, Preise, Vorab-Prüfung), Audit-Log, ⌘K-Befehlspalette |
| **Geschäftsregeln** | Provision 15 % / 5 % mit Premium (Snapshot pro Zahlung), Premium-Vorteile (Badge, Such-Boost, erweiterte Statistik, wöchentliche Auszahlung), Preisrahmen, Altersgrenze 18+, alles im Admin konfigurierbar |

## Stack

Next.js 16 (App Router, Server Actions) · React 19 · TypeScript · Tailwind CSS v4 · Clerk (Login) · Drizzle ORM + Postgres (Supabase) · Supabase Storage · sharp · zod · Vitest (+ PGlite für Integrationstests)

## Architektur in einem Satz

Der Browser greift **nie** direkt auf Datenbank oder Speicher zu: Seiten und Server Actions rufen Services in `src/server/services`, die jede Anfrage autorisieren; Bilder werden nur als kurzlebige, signierte URLs ausgeliefert – für gesperrte Posts ausschliesslich die beim Upload erzeugte, verpixelte Vorschau.

```
src/
  app/                 Seiten & Server Actions  ((site), (auth), studio, admin, api)
  components/          ui/ (Design-System), charts/, admin/, posts/, site/, studio/, auth/
  lib/domain/          reine Geschäftslogik (Gebühren, Zugriff, Moderation, Auszahlungen …) – vollständig getestet
  lib/format.ts        CHF mit Schweizer Apostroph, Prozent, Datum de-CH
  server/
    auth/              getViewer/require*(), Guards, Dev-Impersonation
    services/          Use-Cases inkl. Autorisierung (admin/ separat)
    db/                Drizzle-Schema & Client
    storage/           MediaStorage: supabase | local (+ Bild-Pipeline mit sharp)
    payments/          PaymentProvider: mock (austauschbar)
drizzle/               SQL-Migrationen (inkl. RLS deny-all)
scripts/               migrate, seed, grant-admin
tests/                 Integrationstests (PGlite) & Helfer
```

## Lokal starten (ohne externe Dienste)

Voraussetzungen: Node 22+, ein lokales Postgres.

```bash
npm install
cp .env.example .env.local          # Next.js liest .env.local
cp .env.example .env                # Skripte (migrate/seed) lesen .env
# in beiden: DATABASE_URL auf dein lokales Postgres setzen,
# STORAGE_DRIVER=local, PAYMENT_PROVIDER=mock, Secrets (≥ 32 Zeichen) setzen
# in .env.local zusätzlich: DEV_IMPERSONATE_CLERK_ID=seed_admin

npm run db:migrate
npm run db:seed -- --reset          # Demo-Daten: Creator, Fans, Posts, 90 Tage Zahlungen …
npm run dev                         # http://localhost:3000
```

Mit `DEV_IMPERSONATE_CLERK_ID` läuft die App **ohne Clerk** und meldet den Seed-Nutzer an. Auf dem laufenden Dev-Server lässt sich die Identität per Cookie wechseln: `hf_dev_as=<seed_…>` bzw. `hf_dev_as=anon` (abgemeldet).

| Seed-Login | Rolle |
|---|---|
| `seed_admin` | Admin → `/admin` |
| `seed_creator_1` | Premium-Creator → `/studio` |
| `seed_creator_5` | Standard-Creator |
| `seed_creator_8` | neuer Creator, Posts in Vorab-Prüfung |
| `seed_creator_9` / `seed_creator_12` | Bewerbung offen / abgelehnt |
| `seed_fan_1` | Fan mit Abos → `/feed` |
| `seed_fan_59` | gesperrt |

Die Dev-Impersonation wirkt **nie** in Produktion: Ist die Variable dort gesetzt, startet der Server nicht (`src/instrumentation.ts`).

`/design-system` (nur Entwicklung) zeigt alle UI-Bausteine und Diagramme in beiden Welten.

## Mit echten Diensten

1. **Supabase:** Projekt anlegen, `DATABASE_URL` (Pooler-URL, Transaction-Mode) setzen, `npm run db:migrate`. Einen **privaten** Storage-Bucket `media` anlegen. `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STORAGE_DRIVER=supabase`.
2. **Clerk:** Anwendung anlegen, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` und `CLERK_SECRET_KEY` setzen. Webhook auf `https://<domain>/api/webhooks/clerk` mit den Events `user.created`, `user.updated`, `user.deleted`; Secret als `CLERK_WEBHOOK_SIGNING_SECRET`.
3. **Admin:** einmal anmelden, dann `npm run admin:grant -- <email|@handle>`.
4. `DEV_IMPERSONATE_CLERK_ID` leer lassen.

## Befehle

| Befehl | Zweck |
|---|---|
| `npm run dev` | Entwicklungsserver |
| `npm run check` | Typecheck + Lint + Tests |
| `npm test` | Vitest (Unit + Integration mit PGlite) |
| `npm run build` | Produktions-Build |
| `npm run db:generate` | Migration aus Schema-Änderung erzeugen |
| `npm run db:migrate` | Migrationen anwenden |
| `npm run db:seed -- --reset` | Demo-Daten (nur lokale Datenbanken; sonst `SEED_ALLOW_REMOTE=1`) |
| `npm run admin:grant -- <email\|@handle>` | Admin-Rechte vergeben (mit Audit-Eintrag) |

## Vor dem Launch – Checkliste

- [ ] **Zahlungsanbieter** anbinden (z. B. CCBill, Segpay – Stripe/PayPal erlauben solche Inhalte i. d. R. nicht): neuen `PaymentProvider` in `src/server/payments/` implementieren, Webhook `/api/webhooks/payments/<provider>`, `PAYMENT_PROVIDER` umstellen. Rückerstattungen/Abgleich für nicht verbuchte Zahlungen (z. B. Doppel-Checkout) definieren.
- [ ] **Ausweisprüfung** (KYC) über einen Anbieter (z. B. Veriff, Didit) statt rein manueller Freigabe.
- [ ] **Auszahlungen** automatisieren: `generateDuePayouts` per Cron auslösen und echte Überweisungen anbinden.
- [ ] **Rechtliches:** AGB, Datenschutzerklärung (revDSG), Impressum, Altersnachweis für Fans prüfen lassen, MWST.
- [ ] **Anbieter-AGB** von Clerk, Supabase und Hosting bzgl. Adult-/Fetisch-Inhalten prüfen.
- [ ] **Uploads:** Bei Hosting mit kleinem Request-Limit (z. B. Vercel ~4.5 MB) auf signierte Direkt-Uploads umstellen.
- [ ] **Clerk-Texte:** Die deutsche Clerk-Lokalisierung siezt; bei Bedarf weitere Texte auf Du anpassen.
- [ ] **Secrets** zufällig erzeugen (≥ 32 Zeichen) – Platzhalter verhindern den Serverstart in Produktion.
- [ ] Automatische Bilderkennung (Hash-Abgleich) als zusätzliche Moderationsstufe.
