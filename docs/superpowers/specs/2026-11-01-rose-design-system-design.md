# happyfeet – Design-System „Rosé“ (Design-Spec)

Stand: 2026-11-01 · Status: Entwurf zur Freigabe

Freigegebene Vorschauen (Referenz für jede visuelle Frage):
- Richtungsvergleich: https://claude.ai/artifact/DVEFo9K9Vb6FKCYjQNgWFo (gewählt: **B · Rosé**)
- Ausführliche Vorschau: https://claude.ai/artifact/7zcYr84A8U9GBSWgCHwiAk (mit „Ja“ abgesegnet)
- Quelle der Vorschau (für exakte Masse und Werte): `docs/superpowers/specs/assets/2026-11-01-rose-preview.html`

## 1. Ziel

Das bisherige Design („Puder & Creme“ öffentlich, „Trading-Terminal“ im Admin) wird durch **ein** einheitliches, cleanes App-Design ersetzt: viel Weiss, die Bilder stehen im Vordergrund, Beerenrot als einziger Akzent, grosse Rundungen, sanfte Schatten. Es gilt für alle Bereiche (öffentlich, Fan, Studio, Admin), in **Hell und Dunkel**.

### Entscheidungen der Nutzerin/des Nutzers (gesagt)

| Thema | Entscheidung |
|---|---|
| Richtung | Cleaner App-Look (wie Instagram/Fanvue), Variante **B · Rosé** |
| Umfang | Alles einheitlich: Öffentlich, Fan, Studio **und Admin** |
| Modi | Hell **und** Dunkel, umschaltbar oder nach Systemeinstellung |
| Freigabe | Ausführliche Vorschau mit „Ja“ abgesegnet |

### Annahmen (gesetzt, aus der Vorschau abgeleitet)

- **Funktionen und Texte bleiben gleich.** Es ist ein reiner Design-Umbau: keine neuen Features, keine Änderungen an Services, Datenbank oder Geschäftsregeln.
- Elemente aus der Vorschau ohne Funktion im Grundgerüst entfallen: **keine Glocke/Benachrichtigungen**.
- Die Admin-**Ticker-Leiste entfällt**. Die Kennzahlen stehen im Dashboard als KPI-Karten.
- Der Feed bekommt oben eine Reihe **„Deine Creator“**: Avatare der abonnierten Creator mit Link zum Profil. Die Daten kommen aus dem bestehenden `listMySubscriptions`.
- Die Theme-Wahl wird pro Browser in einem Cookie gespeichert (siehe 4.3), nicht im Nutzerkonto.
- Keine neuen npm-Pakete.

## 2. Ansätze

1. **Tokens neu belegen, Bausteine und Shells überarbeiten (gewählt).** Die bestehenden Token-Namen (`canvas`, `surface`, `ink`, `accent` …) bleiben und bekommen die Rosé-Werte in Hell und Dunkel. Die UI-Bausteine, die App-Shells (Seitenleiste und Tab-Leiste) und die Seiten mit neuer Struktur werden gezielt umgebaut. Das ändert am wenigsten Code, weil Farben und Rundungen schon heute fast überall über Tokens laufen (rund 1’000 Token-Klassen, 144 Radius-Klassen über `rounded-control`/`rounded-card`).
2. Tokens umbenennen, passend zu den Namen der Vorschau (`bg`, `sunken`, `fg` …). Das ergibt sauberere Namen, fasst aber jede Datei an und bringt dem Nutzer nichts.
3. Alle Seiten von Grund auf nach der Vorschau neu bauen. Das trifft die Vorschau am genauesten, ist aber das grösste Risiko für Regressionen.

## 3. Grundlagen

### 3.1 Farb-Tokens (Tailwind v4, `src/app/globals.css`)

Die Namen bleiben, die Werte ändern sich. Hell steht auf `:root`, Dunkel kommt über das Theme-Schema (4.3).

| Token | Rolle | Hell | Dunkel |
|---|---|---|---|
| `canvas` | Seitenhintergrund | `#fffbfa` | `#171113` |
| `surface` | Karten, Felder | `#ffffff` | `#20181b` |
| `surface-2` | vertiefte Flächen, Sekundär-Buttons | `#fbf1f0` | `#2a2024` |
| `line` | Linien, Rahmen | `#f1e3e1` | `#33282c` |
| `line-strong` | Feldrahmen, Trenner | `#e6d2cf` | `#44363b` |
| `ink` | Text | `#1e1418` | `#f7eef1` |
| `ink-muted` | gedämpfter Text | `#7a6670` | `#b39ca6` |
| `ink-faint` | Platzhalter, Achsen | `#826d77` | `#9a858e` |
| `accent` | Hauptaktion | `#c2185b` | `#f06a9c` |
| `accent-ink` | Text auf Akzent | `#ffffff` | `#1a1013` |
| `accent-soft` | zarte Akzentfläche (Premium-Badge, Auswahl) | `#fce4ec` | `#3b1a27` |
| `accent-strong` | Akzent als Text | `#ad1452` | `#f58bb2` |
| `focus` | Fokusring | `#1e1418` | `#f7eef1` |
| `success` / `success-soft` | Status | `#1a7d4c` / `#e3f4ea` | `#4cc38a` / `#16301f` |
| `warning` / `warning-soft` | Status | `#985b00` / `#fdf0dc` | `#e7a94a` / `#33250f` |
| `danger` / `danger-soft` | Status, Fehler | `#c62828` / `#fde7e7` | `#ff7b7b` / `#3a1717` |
| `premium` / `premium-soft` | Premium | = `accent-strong` / `accent-soft` | = `accent-strong` / `accent-soft` |

Die Tokens `success-soft`, `warning-soft` und `danger-soft` kommen neu dazu. `ink-faint`, `success` und `warning` sind im Hellmodus leicht dunkler als in der Vorschau. So erreichen kleine Texte auf `canvas` und `surface` und Status-Text auf der eigenen `*-soft`-Fläche mindestens 4.5 : 1. Ein Test sichert das ab (siehe 7). `ink-faint` ist nur für nebensächliche Angaben gedacht, nicht auf `surface-2`.

### 3.2 Diagrammfarben (dataviz-Validator: alle Prüfungen PASS)

| Serie | Hell (auf `#ffffff`) | Dunkel (auf `#20181b`) | Text darauf (`on-series-*`) |
|---|---|---|---|
| 1 · Beere | `#ae1967` | `#dc5b92` | Hell: weiss · Dunkel: `#1a1013` |
| 2 · Blau | `#1f74bf` | `#4790d8` | Hell: weiss · Dunkel: `#1a1013` |
| 3 · Bernstein | `#c37f00` | `#c38824` | `#1a1013` |
| 4 · Violett | `#6d41a9` | `#9470cd` | Hell: weiss · Dunkel: `#1a1013` |

Die Reihenfolge ist fest. Charts mit zwei Serien nutzen 1 und 2: Plattform gegen Creator, Neue Abos gegen Kündigungen. Status-Farben werden nie als Serienfarbe verwendet.

### 3.3 Schrift

- **Plus Jakarta Sans** (Google Fonts über `next/font`, Gewichte 400–800, dazu kursiv 500 für Akzentwörter in grossen Titeln) ersetzt Bricolage Grotesque, Geist und Geist Mono.
- `--font-display` und `--font-sans` zeigen beide auf Plus Jakarta Sans. Display-Titel: 800, Laufweite -0.035 bis -0.045 em.
- Neue Utility `font-num`: Plus Jakarta Sans mit `font-variant-numeric: tabular-nums`. Alle heutigen `font-mono`-Verwendungen (Zahlen, Beträge, Labels, 192 Stellen) wechseln per Ersetzung zu `font-num`. `--font-mono` bleibt eine echte System-Monospace für seltene technische Angaben wie IDs.
- `eyebrow`-Utility neu: 12 px, Gewicht 700, Grossbuchstaben, Laufweite 0.1 em, Farbe `ink-muted`.
- Schriftgrössen: Display 56/800 · Seitentitel 34/800 · Abschnitt 22/800 · Text 15/400 (Zeilenhöhe 1.55) · Klein 13/600 · Kennzahl 30/800.

### 3.4 Formen und Tiefe

| Token | Wert | Verwendung |
|---|---|---|
| `--radius-control` | 14 px | Felder, Kacheln, Listenelemente |
| `--radius-card` | 22 px | Karten |
| `--radius-panel` (neu) | 28 px | grosse Flächen, Dialoge, Banner |
| Pille (`rounded-full`) | – | Buttons, Badges, Segment-Schalter, Suche |
| `--shadow-sm` / `--shadow-md` / `--shadow-lg` (neu) | siehe Vorschau | Karten / hervorgehobene Karten und Posts / Dialoge und Overlays. Im Dunkelmodus praktisch keine Schatten, dort trennen die Flächen. |

## 4. Architektur

### 4.1 Tokens und Theme-CSS

- Tokens werden in `@theme` als Variablen definiert, die sich zur Laufzeit überschreiben lassen. Das bisherige `@theme static` mit `.theme-admin` entfällt.
- Theme-Schema in `globals.css`:
  - `:root` enthält die Hell-Werte.
  - `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { …Dunkel… } }` greift bei „Auto“.
  - `:root[data-theme="dark"] { …Dunkel… }` greift bei expliziter Wahl.
  - `color-scheme` folgt dem jeweiligen Modus.
- `.theme-admin` wird überall entfernt. Admin folgt dem globalen Theme.

### 4.2 Bausteine (`src/components/ui`, `src/components/charts`)

Die Prop-Schnittstellen bleiben, nur das Aussehen ändert sich:

| Baustein | Änderung |
|---|---|
| `Button`/`ButtonLink` | Pillenform. Varianten `primary`, `secondary` (`surface-2`), `ghost` (Rahmen `line-strong`), `danger` (`danger-soft` mit `danger`-Text). Grössen sm/md/lg wie in der Vorschau. |
| `Input`, `Textarea`, `Select` | Radius `control`. Fokus mit Rahmen `focus` und 4 px Ring `surface-2`. Fehler mit Rahmen `danger` und Ring `danger-soft`. |
| `Badge`, `PremiumBadge` | Pille, Status mit `*-soft`-Fläche und Icon. Premium: `accent-soft` mit `accent-strong` und Funken-Icon. |
| `Card` | Radius `card`, Rahmen `line`, `shadow-sm` |
| `Stat` | neue Variante `hero`: Akzentfläche mit `accent-ink`-Text, für die wichtigste Kennzahl pro Seite |
| `Avatar` | neue Option `ring`: Akzentring mit 2.5 px Abstand |
| `Segmented` | Pillen-Schalter auf `surface-2` |
| `Table` | Kopf in 12/600 `ink-muted`, Haarlinien |
| `EmptyState` | gestrichelter Rahmen, Icon-Kachel auf `accent-soft` |
| Toast | invertiert (`ink`-Fläche, `canvas`-Text) |
| `ActionDialog` | Radius `panel`, `shadow-lg` |

Charts: Gitter `line`, Achsentext `ink-muted`, Serienfarben nach 3.2. Tooltip, Legende und Tabellen-Umschalter bleiben.

### 4.3 Theme-Wahl (Hell / Dunkel / Auto)

- Cookie `hf_theme` mit dem Wert `light` oder `dark`. Fehlt der Cookie, gilt „Auto“, also die Systemeinstellung.
- Reine Funktion `parseThemePreference(value: string | undefined): "light" | "dark" | "system"` in `src/lib/theme.ts`, mit Tests.
- Das Root-Layout liest den Cookie (`cookies()`) und setzt `data-theme` auf `<html>` nur bei `light` oder `dark`. So rendert schon der Server den richtigen Modus und es gibt kein Aufblitzen. Die Seiten sind bereits dynamisch, das ändert also nichts an der Auslieferung.
- Client-Komponente `ThemeToggle` (Hell / Dunkel / Auto): setzt den Cookie (1 Jahr, `SameSite=Lax`, `path=/`) und das Attribut sofort, ohne Neuladen.
- Platzierung:
  - Benutzer-Bereich der Seitenleiste
  - mobiles Menü
  - Admin-Seitenleiste
  - Fusszeile für abgemeldete Besucher
- `viewport.themeColor` im Root-Layout: hell `#fffbfa`, dunkel `#171113`.

### 4.4 App-Shells

- **Angemeldet, Desktop (ab 1024 px):** Seitenleiste links, 236 px breit.
  - Oben: Logo, darunter Feed, Entdecken, Abos und Studio.
  - Für freigegebene Creator ein Button „Neuer Post“. Für Admins ein Link zum Admin.
  - Unten: Benutzer-Chip mit `UserMenu` und `ThemeToggle`.
  - Der Inhalt hat eine maximale Breite und die Abstände aus der Vorschau.
- **Angemeldet, mobil (unter 1024 px):**
  - Oben eine Leiste mit Logo und Benutzermenü.
  - Unten eine fixe Tab-Leiste: Feed, Entdecken, Abos, Studio. In der Mitte ein Plus-Button für „Neuer Post“, nur für freigegebene Creator.
  - Die Tab-Leiste berücksichtigt den unteren Safe-Area-Abstand.
- **Abgemeldet:** obere Navigation mit Logo, Entdecken, Für Creator, Anmelden und Konto erstellen, wie auf der Startseite der Vorschau. Keine Tab-Leiste.
- **Studio:** läuft innerhalb der Shell. Die Unternavigation (Übersicht, Posts, Einstellungen, Premium, Auszahlungen) wird als Pillen-Tabs dargestellt. Status-Banner bei offener oder abgelehnter Bewerbung bleiben.
- **Admin:**
  - Dieselbe Seitenleisten-Struktur mit einem „Admin“-Badge und Abschnitten (Übersicht, Warteschlangen mit Zählern, Verwaltung).
  - Oben eine Leiste mit ⌘K-Suche (`command-palette`, neu gestaltet) und `ThemeToggle`.
  - Mobil: obere Leiste mit Menü-Schublade.
  - Tastaturkürzel und Befehlspalette bleiben unverändert.
- **Gesperrte Nutzer:** sehen in der Navigation wie bisher nur Entdecken und Sperre.

### 4.5 Logo

- Neue Komponente `Logo`, sie ersetzt das bisherige `Wordmark`.
- Bildmarke: beerenrotes, abgerundetes Quadrat mit stilisiertem Fussabdruck (drei Zehenpunkte und Ballen) in `accent-ink`, als Inline-SVG.
- Wortmarke „happyfeet“ in Plus Jakarta Sans 800.
- Dazu `src/app/icon.svg` als Favicon mit derselben Marke.

### 4.6 Seiten mit neuer Struktur (sonst nur über Bausteine und Shell)

| Seite | Neu |
|---|---|
| Startseite | Hero mit Titel und kursivem Akzentwort, Collage aus Creator-Karten, zwei Karten „Für Fans“ und „Für Creator“ (Creator-Karte als Akzentfläche), Raster „Beliebt diese Woche“, schlichte Fusszeile |
| Entdecken | Creator-Karten mit Banner, Avatar, Name, Premium-Badge und Preis pro Monat |
| Feed | Reihe „Deine Creator“, Post-Karten (Kopf, Medien 4:5 mit Punkten bei mehreren Bildern, Bildtext), gesperrte Posts mit verpixeltem Bild und Schloss in der Mitte |
| Creator-Profil | Banner mit Radius `panel`, Avatar mit Ring über dem Banner, Name mit Prüf- und Premium-Badge, Kennzahlen, Pillen-Tabs, Raster, rechts ein klebendes Abo-Panel. Mobil steht der Abo-Button unter der Bio. |
| Neuer Post | Kachel-Raster mit „Hinzufügen“-Kachel, Sichtbarkeit als zwei auswählbare Karten, Hinweis zur Vorab-Prüfung als Warn-Badge |
| Studio-Übersicht | KPI-Reihe mit Hero-Kachel „Netto diesen Monat“, zwei Charts, Premium-Hinweisstreifen für Standard-Creator |
| Admin-Dashboard | KPI-Reihe mit Hero-Kachel „MRR“, Umsatz-Chart, Warteschlangen-Karte, Top-Creator-Tabelle mit Sparklines, Chart Neue Abos gegen Kündigungen |
| Admin-Moderation | drei Spalten: Liste, grosses Bild mit Aktionsleiste und Tastaturkürzeln, Detail-Spalte mit Fortschritt der Vorab-Prüfung |

Alle übrigen Seiten bekommen den neuen Look ohne Strukturänderung über Bausteine und Shell: Abos, Mock-Checkout, Onboarding, Anmelden und Registrieren, Sperre, Fehler- und 404-Seiten sowie die restlichen Admin-Seiten (Verifizierungen, Nutzer, Auszahlungen, Einstellungen, Audit-Log).

### 4.7 Clerk

- Kein `@clerk/themes`, also keine neue Abhängigkeit.
- `appearance.cssLayerName = "clerk"`. In `globals.css` wird die Layer-Reihenfolge `@layer theme, base, clerk, components, utilities;` gesetzt. Dadurch greifen die Token-Klassen in `appearance.elements` ohne `!`-Modifikatoren.
- Die Farben laufen über Token-Klassen wie `bg-surface`, `text-ink` und `border-line`. Damit folgen sie automatisch Hell und Dunkel.
- `variables.colorPrimary` bekommt den hellen Akzent nur als Fallback.

### 4.8 Design-System-Seite

- `/design-system` (nur in der Entwicklung) wird nach Rosé neu aufgebaut: Tokens, Schrift, Formen, alle Bausteine und Charts, mit `ThemeToggle`.
- Sie ist die lebende Referenz im Code. Die Vorschau-Datei liegt nur als Archiv unter `docs/`.

## 5. Datenfluss

Bis auf die Theme-Wahl ist das Design rein serverseitig gerendert.

1. Cookie `hf_theme`
2. Root-Layout setzt `data-theme`
3. CSS-Variablen schalten um
4. `ThemeToggle` ändert Cookie und Attribut live

Keine Services und keine DB-Änderungen.

## 6. Fehlerbehandlung

- Ungültige Cookie-Werte gelten als „Auto“ (`parseThemePreference`).
- Kann der Cookie nicht gesetzt werden, zum Beispiel weil Cookies blockiert sind, wirkt die Wahl nur bis zum Neuladen. Danach gilt die Systemeinstellung.

## 7. Tests & Qualität

- **Unit:**
  - `parseThemePreference`
  - Kontrast-Test für die Token-Paare, jeweils mindestens 4.5 : 1 in beiden Modi: `ink`, `ink-muted` und `ink-faint` auf `canvas` und `surface`; `accent-ink` auf `accent`; `accent-strong`, `success`, `warning` und `danger` auf `canvas` und auf ihrer `*-soft`-Fläche. Die Werte liest der Test aus einer gemeinsamen Token-Tabelle `src/lib/design-tokens.ts`, aus der auch die Design-System-Seite liest.
  - Bestehende UI-, Chart- und Shell-Tests werden an die neuen Klassen und Werte angepasst.
- **Unverändert grün:** `npm run check`, `npm run build`, Smoke-Test aller Routen pro Rolle.
- **Visuell:** Playwright-Screenshots aller Hauptseiten in Hell und Dunkel bei 1440 px und 390 px, Vergleich mit der Vorschau. Keine horizontale Scrollbar bei 390 px, keine Hydration-Warnungen.

## 8. Nicht im Umfang

- Neue Funktionen (Benachrichtigungen, Likes, Kommentare, Stories)
- Speicherung der Theme-Wahl im Konto
- Eigene Illustrationen oder Fotos (Platzhalterbilder bleiben)
