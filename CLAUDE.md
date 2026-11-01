@AGENTS.md

# happyfeet – Projektregeln

Creator-Abo-Plattform für Fussbilder (Schweiz, CHF, Deutsch). Spec: `docs/superpowers/specs/2026-11-01-happyfeet-grundgeruest-design.md` – bei Unklarheiten gilt die Spec.

## Stack
Next.js 16 (App Router, **`cacheComponents` aus**, `src/proxy.ts` statt middleware), React 19, TypeScript strict, Tailwind CSS v4, Clerk v7 (`@clerk/nextjs`), Drizzle ORM (postgres-js; Tests: PGlite), Supabase Storage, zod v4, sharp, Vitest 5.
Next.js 16 und Clerk v7 weichen von älterem Wissen ab: vor Nutzung die Doku in `node_modules/next/dist/docs/` bzw. die Typen in `node_modules/@clerk/nextjs/dist/types/` lesen.

## Architektur (Ansatz A)
- `src/lib/domain/**` – reine Geschäftslogik, keine I/O, `now` wird übergeben. Gemeinsame Typen: `src/lib/domain/types.ts`.
- `src/lib/format.ts` – Formatierung (CHF mit Schweizer Apostroph, Prozent, Datum de-CH).
- `src/server/**` – einzige Schicht mit DB/Storage/Provider-Zugriff; jede Datei beginnt mit `import "server-only";`.
  - `db/schema.ts`, `db/client.ts` (`getDb()`, Typen `Db`, `DbOrTx`).
  - `auth/viewer.ts` – `getViewer()`, `requireViewer()`, `requireOnboardedViewer()`, `requireCreator()`, `requireAdmin()`.
  - `services/*.ts` – Use-Cases. **Autorisierung passiert hier.** Signatur-Konvention: `fn(viewer: Viewer, input, opts?: { now?: Date })`; DB via `getDb()`; erwartbare Fehler aus `src/server/errors.ts` werfen.
  - `storage/` (`MediaStorage`), `payments/` (`PaymentProvider`).
- `src/app/**` – Pages (Server Components) rufen Services; Mutationen über Server Actions in `actions.ts` (`"use server"`), Ergebnis via `toActionResult()` aus `src/server/action-result.ts`, danach `revalidatePath()`.
- Browser greift nie direkt auf DB/Storage zu. Bilder nur über signierte, kurzlebige URLs aus dem Server.

## Konventionen
- UI-Texte **Deutsch (Schweiz)**: kein „ß“, immer „ss“ (z. B. „Fussbilder“, „Grösse“). Du-Form.
- Geld: Integer in **Rappen** + Währungscode; Anzeige nur über `formatChf()`. Provision in Basispunkten (bps).
- Validierung mit zod (Server Actions, Webhooks, Einstellungen).
- Keine neuen npm-Pakete installieren, ausser es ist unvermeidbar (dann im Ergebnis vermerken).
- Komponenten: Server Components by default; `"use client"` nur wo Interaktion nötig ist.
- Design-Tokens und UI-Primitives aus `src/app/globals.css` bzw. `src/components/ui/` verwenden, keine Ad-hoc-Farben.

## Befehle
- `npm run typecheck` · `npm run lint` · `npm test` (Vitest; Integrationstests mit PGlite via `tests/helpers/db.ts` + `tests/helpers/factories.ts`)
- `npm run db:generate` (nach Schema-Änderung) · `npm run db:migrate` · `npm run db:seed` · `npm run admin:grant -- <email>`
- Skripte laufen mit `tsx --conditions=react-server`, damit sie Module mit `server-only` importieren können.
