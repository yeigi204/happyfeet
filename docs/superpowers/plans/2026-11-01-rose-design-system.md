# Design-System „Rosé“ – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das bestehende Design (hell „Puder & Creme“ + dunkler Admin) wird durch das abgesegnete, einheitliche Design „Rosé“ ersetzt: Hell und Dunkel, umschaltbar, für alle Bereiche, ohne Funktionsänderung.

**Architecture:** Die Token-Namen bleiben und bekommen neue Werte, mit Hell auf `:root` und Dunkel über Media-Query bzw. `data-theme`. Eine Token-Tabelle in TypeScript ist die Quelle für Tests und die Design-System-Seite, `globals.css` muss dazu passen. Die Theme-Wahl liegt in einem Cookie und wird schon serverseitig gerendert. Neue App-Shells: Seitenleiste auf dem Desktop, Tab-Leiste mobil, Admin mit derselben Struktur. Seiten mit neuer Struktur werden gezielt umgebaut, alle übrigen übernehmen den Look über die Bausteine.

**Tech Stack:** Next.js 16 (App Router, `cacheComponents` aus), React 19, Tailwind CSS v4, Clerk v7, `next/font/google` (Plus Jakarta Sans), lucide-react, Vitest 5, Playwright (vorinstalliert, nur für Screenshots).

**Spec:** `docs/superpowers/specs/2026-11-01-rose-design-system-design.md`. Visuelle Referenz mit exakten Massen: `docs/superpowers/specs/assets/2026-11-01-rose-preview.html` (identisch mit https://claude.ai/artifact/7zcYr84A8U9GBSWgCHwiAk).

## Global Constraints

- Funktionen, Texte, Routen, Services und Datenbank bleiben unverändert. Es ist ein reiner Design-Umbau.
- Keine neuen npm-Pakete (auch kein `@clerk/themes`).
- Token-Namen bleiben: `canvas`, `surface`, `surface-2`, `line`, `line-strong`, `ink`, `ink-muted`, `ink-faint`, `accent`, `accent-ink`, `accent-soft`, `accent-strong`, `focus`, `success`, `warning`, `danger`, `premium`, `premium-soft`, `series-1…4`, `on-series-1…4`. Neu: `success-soft`, `warning-soft`, `danger-soft`, `--radius-panel`, `--shadow-sm|md|lg`.
- Werte exakt aus Spec 3.1 und 3.2. Mindestkontrast 4.5 : 1 für alle in Spec 7 genannten Paare, in beiden Modi.
- Dark-Mode-Schema: Hell auf `:root`; `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {…} }`; `:root[data-theme="dark"] {…}`; `color-scheme` folgt.
- Schrift ausschliesslich Plus Jakarta Sans. `font-num` = Plus Jakarta Sans mit `tabular-nums`. `--font-mono` bleibt System-Monospace.
- Formen: `--radius-control` 14 px, `--radius-card` 22 px, `--radius-panel` 28 px. Buttons, Badges und Segment-Schalter als Pille.
- UI-Texte Deutsch (Schweiz), Du-Form, kein „ß“. Geld nur über `formatChf()`.
- Signierte Medien weiterhin als `<img>` bzw. `SignedImg`, nie über `next/image`.
- `.theme-admin` existiert danach nirgends mehr.
- Next.js 16 und Clerk v7: vor der Nutzung die Doku in `node_modules/next/dist/docs/` bzw. die Typen in `node_modules/@clerk/nextjs/dist/types/` lesen.

## Review Focus

1. **Aufblitzen und Hydration beim Theme:** Bei Cookie `dark` rendert der Server `data-theme="dark"`. Ohne Cookie fehlt das Attribut, und es darf keine Hydration-Warnung entstehen. Test in Task 2 (`themeAttribute`) und Prüfung im Browser in Task 13.
2. **Manipulierter oder ungültiger Cookie** (`hf_theme=hacker`, leer, 5 kB lang) gilt als „Auto“. Test in Task 2 (`parseThemePreference rejects unknown values`).
3. **Fixe Tab-Leiste verdeckt Inhalte** (letzter Post, Formular-Buttons) auf dem Handy, auch mit Safe-Area. Test in Task 6 (`main reserves space for the tab bar`) und Screenshots in Task 13.
4. **Navigation nach Rolle:** Gast ohne Tab-Leiste; gesperrter Nutzer nur „Entdecken“ und „Sperre“; Plus-Button nur für freigegebene Creator; Admin-Link nur für aktive Admins. Test in Task 6 (`navItemsFor` / `canPost`).
5. **Lesbarkeit im Dunkelmodus:** Status-Badges, Chart-Texte und Clerk-Karten. Kontrast-Test in Task 1, visuelle Prüfung der Clerk-Seiten in Task 8 und 13.

---

### Task 1: Tokens, Theme-CSS und Schrift

**Files:**
- Create: `src/lib/design-tokens.ts`, `src/lib/design-tokens.test.ts`
- Modify: `src/app/globals.css` (komplett neu), `src/app/layout.tsx` (Fonts, `themeColor`), alle `*.tsx` unter `src/` (Ersetzung `font-mono` → `font-num`)

**Interfaces – Produces:**
- `export type TokenName = "canvas" | "surface" | … | "danger-soft"` (alle Namen aus Spec 3.1)
- `export const TOKENS: { light: Record<TokenName, string>; dark: Record<TokenName, string> }`
- `export const SERIES: { light: [string, string, string, string]; dark: [string, string, string, string] }` sowie `ON_SERIES` (gleiche Form)
- `export function contrastRatio(a: string, b: string): number` (WCAG 2.1, Hex `#rrggbb`)
- `export const CONTRAST_PAIRS: ReadonlyArray<readonly [fg: TokenName, bg: TokenName]>` (die Paare aus Spec 7)
- CSS-Utilities: `font-num`, `eyebrow` (neu gestaltet), Theme-Variablen `--color-*`, `--radius-control|card|panel`, `--shadow-sm|md|lg`
- Font-CSS-Variable aus dem Root-Layout: `--font-jakarta`

- [ ] **Step 1: Failing tests** in `src/lib/design-tokens.test.ts`:
  - `contrastRatio("#ffffff", "#c2185b")` ≈ 5.87 (±0.01) und `contrastRatio("#000000", "#ffffff")` = 21.
  - `every contrast pair meets 4.5:1 in light and dark`: Schleife über `CONTRAST_PAIRS` × `["light", "dark"]`, erwartet `contrastRatio(TOKENS[m][fg], TOKENS[m][bg]) >= 4.5`.
  - `globals.css stays in sync with design-tokens.ts`: liest `src/app/globals.css` als Text und prüft für jedes Token, dass `--color-<name>: <hell>` im `:root`-Block und `--color-<name>: <dunkel>` im `[data-theme="dark"]`-Block vorkommt (Grossschreibung ignorieren). Ebenso für `series-*` und `on-series-*`.
  - `globals.css has no .theme-admin and declares the clerk layer`: erwartet kein `.theme-admin` und den Text `@layer theme, base, clerk, components, utilities;`.
- [ ] **Step 2:** `npx vitest run src/lib/design-tokens.test.ts` → FAIL (Modul fehlt).
- [ ] **Step 3:** `design-tokens.ts` mit den Werten aus Spec 3.1 und 3.2 schreiben. `ON_SERIES` hell: `#ffffff, #ffffff, #1a1013, #ffffff`; dunkel: viermal `#1a1013`.
- [ ] **Step 4:** `globals.css` neu schreiben:
  - Layer-Reihenfolge, dann `@import "tailwindcss"`.
  - `@theme` (nicht `static`) mit allen `--color-*`-, Radius- und Schatten-Variablen in den Hell-Werten. `--font-display` und `--font-sans` = `var(--font-jakarta), ui-sans-serif, system-ui, sans-serif`.
  - Dunkel-Blöcke nach dem Schema aus den Global Constraints.
  - `@utility font-num` (Jakarta + `font-variant-numeric: tabular-nums`) und `@utility eyebrow` (12 px, 700, uppercase, 0.1 em, `ink-muted`).
  - Base-Stile: `body` mit `canvas` und `ink`, `::selection` mit Akzent, `:focus-visible` mit 2 px Outline in `--color-focus`.
  - Reduced-Motion-Regeln und `scrollbar-none` übernehmen.
  - Schatten: hell wie in der Vorschau (`--shadow-md: 0 1px 2px rgba(30,20,24,.04), 0 10px 30px rgba(194,24,91,.08)`), dunkel `none` bzw. `0 24px 60px rgba(0,0,0,.45)` für `lg`.
- [ ] **Step 5:** `src/app/layout.tsx`: `Plus_Jakarta_Sans` aus `next/font/google` (`weight: ["400","500","600","700","800"]`, `style: ["normal","italic"]`, `variable: "--font-jakarta"`) ersetzt Bricolage, Geist und Geist Mono. `viewport.themeColor`: hell `#fffbfa`, dunkel `#171113`.
- [ ] **Step 6:** Ersetzung `font-mono` → `font-num` in `src/**/*.tsx` und `src/**/*.ts` (ausser `src/lib/design-tokens*`). Danach liefert `grep -rn "font-mono" src` nur noch Treffer, die bewusst technische IDs zeigen. Jede verbleibende Stelle bekommt einen Kommentar.
- [ ] **Step 7:** `npx vitest run src/lib/design-tokens.test.ts` → PASS. `npm run typecheck` → grün.
- [ ] **Step 8: Commit** `Rosé: Design-Tokens hell/dunkel, Plus Jakarta Sans, font-num`

### Task 2: Theme-Wahl (Cookie, Root-Layout, ThemeToggle)

**Files:**
- Create: `src/lib/theme.ts`, `src/lib/theme.test.ts`, `src/server/theme.ts`, `src/components/theme/theme-toggle.tsx`
- Modify: `src/app/layout.tsx`

**Interfaces – Produces:**
- `export type ThemePreference = "light" | "dark" | "system"`
- `export const THEME_COOKIE = "hf_theme"`
- `export function parseThemePreference(value: string | undefined): ThemePreference`
- `export function themeAttribute(pref: ThemePreference): "light" | "dark" | undefined` (für `<html data-theme>`)
- `export function themeCookieValue(pref: ThemePreference): string`: Cookie-String für `document.cookie`. Bei `"system"` ein löschendes Cookie (`Max-Age=0`), sonst `hf_theme=<v>; Path=/; Max-Age=31536000; SameSite=Lax`.
- `src/server/theme.ts`: `export async function getThemePreference(): Promise<ThemePreference>` (`import "server-only"`, liest `cookies()`)
- `ThemeToggle({ value, className, variant = "segmented" | "compact" }: { value: ThemePreference; className?: string; variant?: "segmented" | "compact" })`. Client-Komponente: drei Optionen „Hell“, „Dunkel“, „Auto“ mit Sonne-, Mond- und Monitor-Icon. Setzt Cookie und `document.documentElement` sofort. `compact` zeigt nur Icons, mit `aria-label`.

- [ ] **Step 1: Failing tests** in `src/lib/theme.test.ts`:
  - `parseThemePreference("light")` → `"light"`, `("dark")` → `"dark"`, `(undefined)` → `"system"`.
  - `parseThemePreference rejects unknown values`: `("hacker")`, `("")`, `("DARK ")`, `("x".repeat(5000))` → jeweils `"system"`.
  - `themeAttribute("system")` → `undefined`, `("dark")` → `"dark"`.
  - `themeCookieValue("dark")` enthält `hf_theme=dark`, `Max-Age=31536000` und `SameSite=Lax`. `themeCookieValue("system")` enthält `Max-Age=0`.
- [ ] **Step 2:** `npx vitest run src/lib/theme.test.ts` → FAIL.
- [ ] **Step 3:** `src/lib/theme.ts` und `src/server/theme.ts` implementieren.
- [ ] **Step 4:** Root-Layout async machen. Es liest `getThemePreference()` und setzt `data-theme={themeAttribute(pref)}` auf `<html>`. `suppressHydrationWarning` an `<html>` und `<body>` bleibt.
- [ ] **Step 5:** `ThemeToggle` implementieren, gestaltet wie der Segment-Schalter der Vorschau. `aria-pressed` pro Option, per Tastatur bedienbar.
- [ ] **Step 6:** `npx vitest run src/lib/theme.test.ts` → PASS. `npm run typecheck` → grün.
- [ ] **Step 7: Commit** `Rosé: Theme-Wahl per Cookie, serverseitig gerendert, ThemeToggle`

### Task 3: UI-Bausteine

**Files:**
- Modify: `src/components/ui/{button,input,textarea,select,field,badge,premium-badge,card,stat,avatar,segmented,table,empty-state,page-header,kbd}.tsx`, `src/components/ui/ui.test.ts`

**Interfaces – Produces (neue Props, bestehende bleiben):**
- `Stat`: `variant?: "default" | "hero"`. `hero` bekommt `bg-accent` und `text-accent-ink`, Delta und Label in `accent-ink`.
- `Avatar`: `ring?: boolean`. Akzentring: äussere Fläche `bg-accent` mit 2.5 px Innenabstand, Bild mit 2.5 px Rand in `surface`.
- `Badge` (Töne unverändert): `success`, `warning` und `danger` nutzen die `*-soft`-Fläche mit Text in der Statusfarbe. `premium` nutzt `accent-soft` mit `accent-strong`. Alle als Pille.
- `buttonClasses`: Pillenform (`rounded-full`). Varianten nach Spec 4.2. Grössen: `sm` h-8 px-3.5 13 px, `md` h-10 px-[18px] 14 px, `lg` h-12 px-[22px] 15 px. Schrift 700.

- [ ] **Step 1: Tests anpassen bzw. ergänzen** in `ui.test.ts`:
  - `buttonClasses()` enthält `rounded-full`. `buttonClasses({ variant: "secondary" })` enthält `bg-surface-2`. `"danger"` enthält `bg-danger-soft` und `text-danger`.
  - Gerendert mit `renderToStaticMarkup`: `<Stat variant="hero" …>` enthält `bg-accent`; `<Avatar ring name="Nina Zehnder" />` enthält `bg-accent`; `<Badge tone="success">` enthält `bg-success-soft`.
  - Veraltete Erwartungen (alte Radien und Farbklassen) entfernen.
- [ ] **Step 2:** `npx vitest run src/components/ui` → FAIL.
- [ ] **Step 3:** Bausteine nach Spec 4.2 und Vorschau-Abschnitt „Bausteine“ umbauen:
  - Inputs: Radius `control`, Fokus `border-focus` mit `ring-4 ring-surface-2`, Fehler `border-danger` mit `ring-4 ring-danger-soft`.
  - `Card`: `rounded-card border-line shadow-[var(--shadow-sm)]`.
  - `EmptyState`: gestrichelter Rahmen `line-strong`, Icon-Kachel `bg-accent-soft text-accent-strong`.
  - `PageHeader`: Titel 34/800, Laufweite -0.035 em.
- [ ] **Step 4:** `npx vitest run src/components/ui` → PASS. `npm run typecheck && npx eslint src/components/ui` → grün.
- [ ] **Step 5: Commit** `Rosé: UI-Bausteine (Pillen-Buttons, Felder, Badges, Hero-Stat, Avatar-Ring)`

### Task 4: Charts und Admin-Bausteine

**Files:**
- Modify: `src/components/charts/{chart-frame,area-chart,bar-chart,meter,sparkline,chart-legend,chart-table}.tsx`, `src/components/charts/charts.test.ts`, `src/components/admin/{toast,action-dialog,urgency-badge,skeleton}.tsx`, `src/components/admin/moderation/severity-badge.tsx`, `src/components/admin/lib/admin-lib.test.ts` (nur falls Klassen geprüft werden)

**Interfaces:** keine neuen. Charts lesen Farben weiter über `var(--color-series-N)` und `var(--color-on-series-N)`.

- [ ] **Step 1: Tests anpassen** in `charts.test.ts`:
  - Gerendertes `AreaChart` enthält `var(--color-series-1)` und `var(--color-series-2)` sowie für das Gitter `var(--color-line)`.
  - Kein Hex-Literal im SVG-Markup (`/#[0-9a-f]{6}/i` matcht nicht).
- [ ] **Step 2:** `npx vitest run src/components/charts` → FAIL, falls etwas Hartkodiertes übrig ist. Sonst ist der Test sofort grün.
- [ ] **Step 3:** Chart-Rahmen und Tooltip auf Rosé umstellen: Karten-Look, Achsentext `ink-muted` in 11 px `font-num`, Tooltip mit `surface`, `line` und `shadow-md`.
  - `Toast`: invertiert (`bg-ink text-canvas`, Aktion `text-accent-soft`).
  - `ActionDialog`: `rounded-[var(--radius-panel)]` mit `shadow-lg`.
  - `UrgencyBadge` und `SeverityBadge` über die `Badge`-Töne aus Task 3.
- [ ] **Step 4:** `npx vitest run src/components/charts src/components/admin` → PASS.
- [ ] **Step 5: Commit** `Rosé: Charts und Admin-Bausteine`

### Task 5: Logo und Favicon

**Files:**
- Create: `src/components/brand/logo.tsx`, `src/components/brand/logo.test.ts`, `src/app/icon.svg`
- Modify: alle Importe von `@/components/site/wordmark`
- Delete: `src/components/site/wordmark.tsx`

**Interfaces – Produces:**
- `Logo({ href = "/", size = "md", withWordmark = true, className }: { href?: string | null; size?: "sm" | "md"; withWordmark?: boolean; className?: string })`
- Ohne `href` (bzw. `href={null}`) wird ein `<span>` statt eines Links gerendert.
- Die Bildmarke ist ein Inline-SVG: abgerundetes Quadrat in `fill: var(--color-accent)`, drei Zehenpunkte und Ballen in `var(--color-accent-ink)`. Grösse 30 px (`md`) bzw. 26 px (`sm`), Radius 10 px.

- [ ] **Step 1: Failing test:**
  - `renderToStaticMarkup(<Logo />)` enthält `href="/"`, den Text `happyfeet` und `aria-hidden="true"` auf dem SVG.
  - `<Logo href={null} withWordmark={false} />` enthält kein `<a` und ein `aria-label="happyfeet"`.
- [ ] **Step 2:** Test → FAIL.
- [ ] **Step 3:** `Logo` implementieren, die Marke als `icon.svg` mit festen Farben (`#c2185b` / `#ffffff`) ablegen. `Wordmark`-Verwendungen umstellen: Site-Header bzw. die neue Shell, Auth-Layout, Admin-Marke, Fehlerseiten.
- [ ] **Step 4:** Test → PASS. `npm run typecheck` → grün.
- [ ] **Step 5: Commit** `Rosé: neues Logo und Favicon`

### Task 6: App-Shell für Fan-Bereich und Studio

**Files:**
- Create: `src/components/shell/{nav-items.ts,nav-items.test.ts,app-shell.tsx,sidebar.tsx,tab-bar.tsx,mobile-top-bar.tsx,guest-nav.tsx}`
- Modify: `src/app/(site)/layout.tsx`, `src/app/studio/layout.tsx`, `src/components/studio/{studio-bar,studio-nav}.tsx`, `src/components/site/site-footer.tsx` (mit `ThemeToggle` für Gäste)
- Delete (nachdem kein Import mehr übrig ist): `src/components/site/site-header.tsx`, `src/components/site/site-nav.tsx`

**Interfaces:**
- Consumes: `Logo` (Task 5), `ThemeToggle` und `getThemePreference` (Task 2), `UserMenu`, `SignInButtonLink`, `SignUpButtonLink` (bestehend), `getViewer` (bestehend).
- Produces:
  - `export type ShellNavItem = { href: string; label: string; icon: "feed" | "explore" | "subs" | "studio" | "admin" | "banned" }`
  - `export function navItemsFor(viewer: Viewer | null): ShellNavItem[]`, reine Funktion:
    - Gast → `[]`, die Gast-Navigation ist separat.
    - Gesperrt → Entdecken und Sperre.
    - Aktiv → Feed, Entdecken, Abos, Studio, plus Admin bei aktivem Admin.
  - `export function canPost(viewer: Viewer | null): boolean`, wahr nur für aktive Viewer mit `creator.verificationStatus === "approved"`.
  - `export const SHELL_MAIN_CLASSES: string`: Klassen für `<main>` bei sichtbarer Tab-Leiste. Enthält `pb-[calc(76px+env(safe-area-inset-bottom))]` und `lg:pb-0`.
  - `AppShell({ children }: { children: ReactNode })`, async Server Component:
    - Gast: `GuestNav` oben, Inhalt, `SiteFooter` mit `ThemeToggle`.
    - Angemeldet: ab `lg` die `Sidebar` links (236 px), darunter `MobileTopBar` und `TabBar`. Dazu der Skip-Link.
  - `Sidebar({ items, canPost, viewer, theme })` und `TabBar({ items, canPost })`: Client-Komponenten, aktiver Punkt über `usePathname()`. Die Tab-Leiste zeigt Feed, Entdecken, Abos und Studio, in der Mitte das Plus (nur bei `canPost`), mit Link auf `/studio/posts/new`.

- [ ] **Step 1: Failing tests** in `nav-items.test.ts` (mit `Viewer`-Objekten aus einer kleinen lokalen Factory):
  - Gast → `[]`, `canPost(null)` → false.
  - Gesperrt → Labels `["Entdecken", "Sperre"]`.
  - Fan → `["Feed", "Entdecken", "Abos", "Studio"]`, `canPost` → false.
  - Freigegebener Creator → `canPost` → true. Pending oder abgelehnter Creator → false. Gesperrter, freigegebener Creator → false.
  - Aktiver Admin → enthält `"Admin"`. Gesperrter Admin → nicht.
  - `main reserves space for the tab bar`: `SHELL_MAIN_CLASSES` enthält `safe-area-inset-bottom` und `lg:pb-0`.
- [ ] **Step 2:** `npx vitest run src/components/shell` → FAIL.
- [ ] **Step 3:** `nav-items.ts`, dann die Komponenten nach Spec 4.4 und der Vorschau („Creator-Profil (Desktop)“ für die Seitenleiste, Telefon-Screens für die Tab-Leiste) bauen.
  - Seitenleiste unten: Benutzer-Chip mit `UserMenu` und `ThemeToggle variant="compact"`.
  - `MobileTopBar`: Logo links, rechts `UserMenu` und daneben `ThemeToggle variant="compact"`, damit die Theme-Wahl auch mobil erreichbar ist.
  - Die Tab-Leiste ist `fixed bottom-0` mit `padding-bottom: env(safe-area-inset-bottom)` und halbtransparentem `canvas` mit Blur.
- [ ] **Step 4:** `(site)/layout.tsx` und `studio/layout.tsx` auf `AppShell` umstellen.
  - Das Studio behält die `StatusBanner`.
  - `StudioBar`/`StudioNav` werden zu Pillen-Tabs (aktiv: `bg-ink text-canvas`), wie im Vorschau-Abschnitt „Creator-Studio“.
- [ ] **Step 5:** `npx vitest run src/components/shell` → PASS. `npm run typecheck && npm run lint` → grün. `grep -rn "site-header\|site-nav" src` liefert keine Treffer mehr.
- [ ] **Step 6: Commit** `Rosé: App-Shell mit Seitenleiste, mobiler Tab-Leiste und Gast-Navigation`

### Task 7: Admin-Shell

**Files:**
- Modify: `src/components/admin/shell/{admin-shell,admin-nav,command-palette,queue-pill,shortcuts}.tsx`, `src/components/admin/shell/shell.test.ts`, `src/app/admin/layout.tsx`
- Delete: `src/components/admin/shell/ticker.tsx`

**Interfaces:**
- Consumes: `Logo` (Task 5), `ThemeToggle` und `getThemePreference` (Task 2).
- Produces: `AdminShellProps = { children: ReactNode; counts: AdminCounts; quickSearch?: QuickSearch; activeHref?: string; theme: ThemePreference }`. Das Feld `ticker` entfällt. `ADMIN_NAV`, `isNavActive`, `openCommandPalette`, `resolveShortcut` und `filterCommands` bleiben unverändert.

- [ ] **Step 1: Tests anpassen** in `shell.test.ts`:
  - Gerendertes `AdminShell` enthält kein `theme-admin`.
  - Die Navigation enthält die Gruppen „Übersicht“, „Warteschlangen“ und „Verwaltung“ sowie den Zähler für Verifizierungen.
  - Bestehende Tests für `resolveShortcut`, `filterCommands` und `isSafeHref` bleiben unverändert grün.
- [ ] **Step 2:** `npx vitest run src/components/admin/shell` → FAIL.
- [ ] **Step 3:** Shell nach dem Vorschau-Abschnitt „Admin-Dashboard“ umbauen:
  - Seitenleiste (Logo, Badge „Admin“, Gruppen-Überschriften, Navigationspunkte mit Zähler-Badges `bg-accent text-accent-ink`, Benutzer-Chip unten).
  - Obere Leiste mit `CommandPaletteTrigger` als Suchpille („Nutzer, Creator, Befehle“ mit `⌘K`) und `ThemeToggle variant="compact"`.
  - Mobil: obere Leiste mit Menü-Schublade für die Navigation.
  - `CommandPalette`: Radius `panel`, `shadow-lg`.
  - Ticker samt Berechnung im Admin-Layout entfernen.
- [ ] **Step 4:** `npx vitest run src/components/admin` → PASS. `npm run typecheck && npm run lint` → grün. `grep -rn "theme-admin\|Ticker" src` liefert keine Treffer.
- [ ] **Step 5: Commit** `Rosé: Admin-Shell hell/dunkel mit Seitenleiste, Ticker entfernt`

### Task 8: Clerk und Auth-Seiten

**Files:**
- Modify: `src/components/providers.tsx`, `src/components/providers.test.ts`, `src/app/(auth)/layout.tsx`, `src/app/(auth)/{sign-in,sign-up,onboarding,banned}/**`

**Interfaces:**
- Consumes: Layer `clerk` (Task 1), `Logo` (Task 5), `ThemeToggle` (Task 2).
- Produces: `clerkAppearance` mit `cssLayerName: "clerk"`. `elements` enthalten nur Token-Klassen und keine `!`-Präfixe. `variables` nur noch als Fallback: `colorPrimary: "#c2185b"`, `borderRadius: "14px"`, `fontFamily: "var(--font-jakarta)"`.

- [ ] **Step 1: Tests anpassen** in `providers.test.ts`:
  - `clerkAppearance.cssLayerName` ist `"clerk"`.
  - `JSON.stringify(clerkAppearance.elements)` enthält kein `"!`.
  - `clerkAppearance.variables.colorPrimary` ist `"#c2185b"`.
- [ ] **Step 2:** Test → FAIL.
- [ ] **Step 3:** Appearance anpassen. Auth-Layout mit `Logo`, zentrierter Karte (`rounded-[var(--radius-panel)]`, `shadow-lg`) und `ThemeToggle` unten. Onboarding- und Sperr-Seite über die Bausteine aus Task 3.
- [ ] **Step 4:** Test → PASS. `npm run typecheck` → grün.
- [ ] **Step 5: Commit** `Rosé: Clerk-Appearance über Tokens (cssLayerName), Auth-Seiten`

### Task 9: Öffentliche Seiten und Fan-Bereich

**Files:**
- Modify: `src/app/(site)/page.tsx`, `src/app/(site)/explore/page.tsx`, `src/app/(site)/feed/page.tsx`, `src/app/(site)/c/[handle]/page.tsx`, `src/app/(site)/subscriptions/page.tsx`, `src/app/(site)/checkout/mock/[sessionId]/page.tsx`, `src/app/not-found.tsx`, `src/app/error.tsx`, `src/components/site/{creator-card,profile-avatar,toe-gallery,skeletons,error-panel,container}.tsx`, `src/components/posts/{post-card,post-gallery,locked-overlay,subscribe-button,report-dialog}.tsx`
- Create: `src/components/site/followed-creators.tsx`

**Interfaces:**
- Consumes: Bausteine (Task 3), `AppShell` (Task 6), `listMySubscriptions` (bestehend, `src/server/services/subscriptions.ts`).
- Produces: `FollowedCreators({ items }: { items: { handle: string; displayName: string; avatarUrl: string | null }[] })`. Horizontale, scrollbare Reihe aus Avataren mit Ring, die auf `/c/<handle>` verlinken. Ohne Einträge wird nichts gerendert.

- [ ] **Step 1: Failing test** `src/components/site/followed-creators.test.ts`:
  - Mit zwei Einträgen enthält das Markup `href="/c/zehenspiel"` und `href="/c/lena_barfuss"`.
  - Mit `[]` ist das Markup leer (`""`).
- [ ] **Step 2:** Test → FAIL. **Step 3:** `FollowedCreators` implementieren. **Step 4:** Test → PASS.
- [ ] **Step 5:** Seiten nach Spec 4.6 und den Vorschau-Abschnitten „Startseite“, „Mobil“ und „Creator-Profil (Desktop)“ umbauen. Datenquellen und Server Actions bleiben unverändert.
  - Der Feed rendert `FollowedCreators` aus `listMySubscriptions` (nur `active`).
  - Post-Karten mit Kopf, Medien 4:5, Punkten bei mehreren Bildern und Bildtext.
  - Gesperrte Medien mit Blur und Schloss in der Mitte.
  - Das Profil bekommt Banner (`panel`), Avatar mit Ring, klebendes Abo-Panel rechts ab `lg`, mobil den Button unter der Bio.
- [ ] **Step 6:** `npm run typecheck && npm run lint && npx vitest run src/components` → grün.
- [ ] **Step 7: Commit** `Rosé: Startseite, Entdecken, Feed, Creator-Profil und Fan-Seiten`

### Task 10: Studio-Seiten

**Files:**
- Modify: `src/app/studio/(creator)/(overview)/page.tsx`, `src/app/studio/(creator)/posts/**`, `src/app/studio/(creator)/{settings,premium,payouts}/page.tsx`, `src/app/studio/become-creator/page.tsx`, `src/components/studio/{stat-grid,new-post-form,post-tile,premium-teaser,premium-actions,earnings-preview,creator-profile-form,status-banner,studio-skeletons,confirm-action-button}.tsx`

**Interfaces:** Consumes `Stat variant="hero"` (Task 3) und die Charts (Task 4). Keine neuen Exporte.

- [ ] **Step 1:** Prüfen, ob `studio-helpers.test.ts` Klassen erwartet. Wenn ja, die Erwartungen auf die neuen Klassen anpassen. Lauf → FAIL bzw. sofort grün.
- [ ] **Step 2:** Übersicht wie im Vorschau-Abschnitt „Creator-Studio“:
  - Die erste Kennzahl „Netto diesen Monat“ als `Stat variant="hero"`.
  - Zwei Charts in Karten.
  - Für Standard-Creator der Premium-Hinweisstreifen (`bg-accent-soft text-accent-strong`).
- [ ] **Step 3:** Neuer Post wie im Vorschau-Telefon „Neuer Post“:
  - Kachel-Raster mit gestrichelter „Hinzufügen“-Kachel.
  - Sichtbarkeit als zwei auswählbare Karten. Die gewählte bekommt `border-accent bg-accent-soft` und ein Häkchen.
  - Hinweis zur Vorab-Prüfung als Warn-Badge.
  - Validierung, Limits und die Server Action bleiben unverändert.
- [ ] **Step 4:** Die übrigen Studio-Seiten nur über Bausteine angleichen.
- [ ] **Step 5:** `npm run typecheck && npm run lint && npx vitest run src/components/studio` → grün.
- [ ] **Step 6: Commit** `Rosé: Studio-Seiten`

### Task 11: Admin-Seiten

**Files:**
- Modify: `src/app/admin/{page,loading,error}.tsx`, `src/app/admin/{verifications,moderation,users,payouts,settings,audit}/page.tsx`, `src/components/admin/{dashboard,moderation,verifications,users,payouts,settings,audit}/**`

**Interfaces:** Consumes Admin-Shell (Task 7), Bausteine (Task 3) und Charts (Task 4). Keine neuen Exporte.

- [ ] **Step 1:** Prüfen, ob `describe.test.ts` oder `admin-lib.test.ts` Klassen erwarten. Wenn ja, anpassen, Lauf → FAIL bzw. sofort grün.
- [ ] **Step 2:** Dashboard wie im Vorschau-Abschnitt „Admin-Dashboard“:
  - KPI-Reihe mit `Stat variant="hero"` für MRR.
  - Umsatz-Chart (Serie 1 Plattform, 2 Creator).
  - Warteschlangen-Karte (Icon-Kachel, Titel, Badge, Zahl rechts).
  - Top-Creator-Tabelle mit Sparkline.
  - Chart Neue Abos gegen Kündigungen.
- [ ] **Step 3:** Moderation dreispaltig wie im Vorschau-Abschnitt „Admin: Moderation“:
  - Liste links, aktives Element mit `bg-surface-2` und Akzent-Innenkante.
  - Bild mit Aktionsleiste und `Kbd`.
  - Detail-Spalte mit Fortschritt der Vorab-Prüfung als Pillen-Balken.
  - Tastatur-Logik, optimistische Updates und Actions bleiben unverändert.
- [ ] **Step 4:** Verifizierungen, Nutzer, Auszahlungen, Einstellungen und Audit-Log über Bausteine angleichen.
- [ ] **Step 5:** `npm run typecheck && npm run lint && npx vitest run src/components/admin` → grün.
- [ ] **Step 6: Commit** `Rosé: Admin-Seiten`

### Task 12: Design-System-Seite

**Files:**
- Modify: `src/app/design-system/page.tsx` (neu aufbauen), `src/app/design-system/page.test.ts`

**Interfaces:** Consumes `TOKENS`, `SERIES` (Task 1), `ThemeToggle` (Task 2), alle Bausteine und Charts.

- [ ] **Step 1: Test anpassen** in `page.test.ts`:
  - Die Seite rendert für jedes `TokenName` aus `TOKENS.light` eine Zeile mit dem Namen und beiden Werten.
  - Sie enthält `ThemeToggle`.
  - In Produktion folgt weiter `notFound()`.
- [ ] **Step 2:** Test → FAIL.
- [ ] **Step 3:** Seite wie die Vorschau-Abschnitte „Grundlagen“ und „Bausteine“ aufbauen, nur mit echten Komponenten aus `src/components/**` und mit Werten aus `design-tokens.ts`.
- [ ] **Step 4:** Test → PASS.
- [ ] **Step 5: Commit** `Rosé: Design-System-Seite`

### Task 13: Verifikation und Feinschliff

**Files:** Nachbesserungen nur in den Dateien der Tasks 1–12, dazu `README.md` (Abschnitt „Design“: Rosé, Hell/Dunkel, `/design-system`).

- [ ] **Step 1:** `npm run check` → alle Tests grün, Typecheck und Lint sauber.
- [ ] **Step 2:** Produktions-Build mit Dummy-Clerk-Key, so wie zuvor:
  `DEV_IMPERSONATE_CLERK_ID= NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_ZXhhbXBsZS5jbGVyay5hY2NvdW50cy5kZXYk CLERK_SECRET_KEY=sk_test_dummydummydummydummy npx next build`
  Erwartet: Build erfolgreich, keine Warnungen.
- [ ] **Step 3:** Lokales Postgres starten (`service postgresql start`), dann `npm run db:seed -- --reset` und den Dev-Server auf Port 3000.
  - Smoke-Test aller Routen pro Rolle per Cookie `hf_dev_as`. Erwartet: keine 5xx, keine Konsolenfehler, keine Hydration-Warnungen.
  - Die erwarteten 404 gelten weiter: unbekannter Handle, `/admin` für Nicht-Admins.
- [ ] **Step 4:** Playwright-Screenshots in Hell und Dunkel (Cookie `hf_theme`) bei 1440 × 900 und 390 × 844, jeweils:
  - Startseite, Entdecken, Feed, Creator-Profil (Gast und Abonnent), Neuer Post
  - Studio-Übersicht (Premium und Standard)
  - Admin-Dashboard, Moderation
  - Anmelden, Onboarding

  Mit der Vorschau vergleichen. Prüfen, dass bei 390 px keine horizontale Scrollbar entsteht und die Tab-Leiste keine Inhalte verdeckt.
- [ ] **Step 5:** Gefundene Abweichungen beheben, dann Step 1 wiederholen.
- [ ] **Step 6:** README ergänzen. **Commit** `Rosé: Verifikation, Feinschliff, README`, danach Push auf `claude/gifted-cerf-l6ktty`.
