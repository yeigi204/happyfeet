import { Check, Clock, ImagePlus, Lock, Plus, X } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { Logo } from "@/components/brand/logo";
import { AreaChart } from "@/components/charts/area-chart";
import { BarChart } from "@/components/charts/bar-chart";
import { Meter } from "@/components/charts/meter";
import { Sparkline } from "@/components/charts/sparkline";
import type { DatumRow, SeriesDef } from "@/components/charts/types";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { PremiumBadge } from "@/components/ui/premium-badge";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { Stat } from "@/components/ui/stat";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { SERIES, TOKENS, type TokenName } from "@/lib/design-tokens";
import { formatChf } from "@/lib/format";
import { getThemePreference } from "@/server/theme";

export const metadata: Metadata = { title: "Design-System" };

/* Deterministische Beispieldaten (gleiche Zahlen bei jedem Render). */
function series(seed: number, n: number, base: number, growth: number, noise: number): number[] {
  let s = seed;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  return Array.from({ length: n }, (_, i) => Math.max(0, Math.round(base + growth * i + (rnd() - 0.5) * noise)));
}
const START = Date.UTC(2026, 9, 3);
const day = (i: number) => new Date(START + i * 86_400_000).toISOString().slice(0, 10);
const platform = series(3, 30, 900, 12, 500);
const creator = series(7, 30, 7600, 90, 3000);
const newSubs = series(11, 30, 3, 0.05, 5);
const canceled = series(13, 30, 1, 0, 3);
const REVENUE: DatumRow[] = platform.map((p, i) => ({ date: day(i), platform: p, creator: creator[i] }));
const SUBS: DatumRow[] = newSubs.map((n, i) => ({ date: day(i), neu: n, gekuendigt: canceled[i] }));
const REVENUE_SERIES: SeriesDef[] = [
  { key: "platform", label: "Plattform", color: "series-1" },
  { key: "creator", label: "Creator", color: "series-2" },
];
const SUBS_SERIES: SeriesDef[] = [
  { key: "neu", label: "Neue Abos", color: "series-2" },
  { key: "gekuendigt", label: "Kündigungen", color: "series-1" },
];

const TOKEN_ROLES: Record<TokenName, string> = {
  canvas: "Seitenhintergrund",
  surface: "Karten, Felder",
  "surface-2": "Vertiefte Flächen",
  line: "Linien",
  "line-strong": "Feldrahmen",
  ink: "Text",
  "ink-muted": "Gedämpfter Text",
  "ink-faint": "Nebensächliches",
  accent: "Hauptaktion",
  "accent-ink": "Text auf Akzent",
  "accent-soft": "Zarte Akzentfläche",
  "accent-strong": "Akzent als Text",
  focus: "Fokusring",
  success: "Erfolg",
  "success-soft": "Erfolg, Fläche",
  warning: "Warnung",
  "warning-soft": "Warnung, Fläche",
  danger: "Fehler",
  "danger-soft": "Fehler, Fläche",
  premium: "Premium",
  "premium-soft": "Premium, Fläche",
};

function Section({ id, eyebrow, title, description, children }: { id: string; eyebrow: string; title: string; description?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="grid gap-6 border-t border-line py-12">
      <div className="max-w-2xl">
        <p className="eyebrow">{eyebrow}</p>
        <h2 id={`${id}-h`} className="mt-1.5 font-display text-[28px] leading-tight font-extrabold tracking-[-0.03em] text-ink">
          {title}
        </h2>
        {description ? <p className="mt-1.5 text-[15px] text-ink-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** Nur in der Entwicklung: lebende Referenz des Design-Systems „Rosé“ (Tokens aus src/lib/design-tokens.ts). */
export default async function DesignSystemPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const theme = await getThemePreference();

  return (
    <main className="mx-auto max-w-[1240px] px-4 pb-20 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4 py-6">
        <Logo />
        <ThemeToggle value={theme} />
      </header>

      <div className="max-w-3xl py-10">
        <p className="eyebrow">Nur in der Entwicklung sichtbar</p>
        <h1 className="mt-3 font-display text-[44px] leading-[1] font-extrabold tracking-[-0.045em] text-ink sm:text-[56px]">
          Design-System <em className="font-medium text-accent-strong">Rosé</em>
        </h1>
        <p className="mt-4 text-[16px] leading-relaxed text-ink-muted">
          Ein Design für Fans, Creator und Admin, in Hell und Dunkel. Bilder zuerst, ein Akzent, grosse Rundungen. Mit dem Schalter oben
          wechselst du den Modus – „Auto“ folgt deinem System.
        </p>
      </div>

      <Section id="farben" eyebrow="01 · Grundlagen" title="Farben" description="Gleiche Token-Namen in beiden Modi. Die Fläche zeigt den aktuellen Modus.">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3">
          {(Object.keys(TOKENS.light) as TokenName[]).map((name) => (
            <div key={name} className="grid gap-2 rounded-control border border-line bg-surface p-2.5">
              <span aria-hidden className="h-14 rounded-[10px] border border-line" style={{ background: `var(--color-${name})` }} />
              <span className="text-[13px] font-bold text-ink">{name}</span>
              <span className="text-xs text-ink-muted">{TOKEN_ROLES[name]}</span>
              <span className="flex flex-wrap justify-between gap-1 font-mono text-[11px] text-ink-muted">
                <span>☀ {TOKENS.light[name]}</span>
                <span>☾ {TOKENS.dark[name]}</span>
              </span>
            </div>
          ))}
          <div className="grid gap-2 rounded-control border border-line bg-surface p-2.5">
            <span aria-hidden className="grid h-14 grid-cols-4 overflow-hidden rounded-[10px]">
              {[1, 2, 3, 4].map((i) => (
                <span key={i} style={{ background: `var(--color-series-${i})` }} />
              ))}
            </span>
            <span className="text-[13px] font-bold text-ink">series-1 … 4</span>
            <span className="text-xs text-ink-muted">Diagramme (validiert, Reihenfolge fest)</span>
            <span className="font-mono text-[11px] text-ink-muted">☀ {SERIES.light.join(" ")}</span>
            <span className="font-mono text-[11px] text-ink-muted">☾ {SERIES.dark.join(" ")}</span>
          </div>
        </div>
      </Section>

      <Section id="schrift" eyebrow="02 · Grundlagen" title="Schrift" description="Plus Jakarta Sans für alles. Zahlen mit gleich breiten Ziffern (font-num).">
        <Card flush>
          <div className="divide-y divide-line">
            {[
              ["Display · 56/800", <span key="d" className="font-display text-[48px] leading-none font-extrabold tracking-[-0.045em]">Fussbilder, <em className="font-medium text-accent-strong">direkt.</em></span>],
              ["Seitentitel · 34/800", <span key="t" className="font-display text-[32px] leading-tight font-extrabold tracking-[-0.035em]">Dein Studio</span>],
              ["Abschnitt · 22/800", <span key="a" className="font-display text-[22px] font-extrabold tracking-[-0.025em]">Neue Abos diese Woche</span>],
              ["Text · 15/400", <span key="x" className="text-[15px]">Gesperrte Posts siehst du als verpixelte Vorschau, bis du abonnierst.</span>],
              ["Klein · 13/600", <span key="k" className="text-[13px] font-semibold text-ink-muted">Monatlich kündbar · Zugang bis Periodenende</span>],
              ["Kennzahl · 30/800", <span key="z" className="font-num text-[30px] font-extrabold tracking-[-0.035em]">{formatChf(373850)}</span>],
            ].map(([label, sample]) => (
              <div key={label as string} className="grid gap-1 px-5 py-4 sm:grid-cols-[170px_minmax(0,1fr)] sm:items-baseline sm:gap-4">
                <span className="font-mono text-[11px] text-ink-muted">{label}</span>
                <div className="min-w-0 text-ink">{sample}</div>
              </div>
            ))}
          </div>
        </Card>
      </Section>

      <Section id="formen" eyebrow="03 · Grundlagen" title="Formen" description="Grosse Rundungen, sanfte Schatten im Hellmodus, Pillen für Aktionen.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ["rounded-panel", "Fläche · 28 px", ""],
            ["rounded-card", "Karte · 22 px", ""],
            ["rounded-control", "Feld · 14 px", ""],
            ["rounded-full", "Pille", ""],
            ["rounded-card", "Schatten md", "shadow-md border-transparent"],
            ["rounded-card", "Schatten lg", "shadow-lg border-transparent"],
          ].map(([radius, label, extra]) => (
            <div key={label} className={`grid h-24 place-items-center border border-line bg-surface p-3 text-center text-[13px] font-semibold text-ink ${radius} ${extra}`}>
              {label}
            </div>
          ))}
        </div>
      </Section>

      <Section id="bausteine" eyebrow="04 · Bausteine" title="Bausteine" description="Dieselben Bausteine im Fan-Bereich, im Studio und im Admin.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Card title="Buttons">
            <div className="grid gap-3">
              <div className="flex flex-wrap gap-2">
                <Button variant="primary">Abonnieren</Button>
                <Button variant="secondary">Später</Button>
                <Button variant="ghost">Abbrechen</Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="danger">
                  <X aria-hidden /> Entfernen
                </Button>
                <Button variant="primary" disabled>
                  Gesperrt
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="primary" size="sm">
                  <Plus aria-hidden /> Neuer Post
                </Button>
                <Button variant="primary" size="lg">
                  Konto erstellen
                </Button>
              </div>
            </div>
          </Card>
          <Card title="Eingaben">
            <div className="grid gap-4">
              <Field label="Handle" hint="3–24 Zeichen, nur Kleinbuchstaben, Zahlen und _">
                <Input defaultValue="nina_zehnder" />
              </Field>
              <Field label="Monatspreis" error="Bitte in 10-Rappen-Schritten, zum Beispiel 4.90 oder 5.00.">
                <Input defaultValue="4.95" inputMode="decimal" />
              </Field>
            </div>
          </Card>
          <Card title="Auswahl">
            <div className="grid gap-4">
              <Field label="Grund">
                <Select defaultValue="spam">
                  <option value="spam">Spam</option>
                  <option value="minor">Möglicherweise minderjährig</option>
                </Select>
              </Field>
              <Segmented
                label="Sichtbarkeit"
                active="#abo"
                items={[
                  { href: "#public", label: "Öffentlich" },
                  { href: "#abo", label: "Nur Abonnenten", count: 7 },
                ]}
              />
              <Field label="Bildtext">
                <Textarea rows={2} defaultValue="Sonntag am See – frisch lackiert in Kirschrot." />
              </Field>
            </div>
          </Card>
          <Card title="Badges & Avatare">
            <div className="grid gap-4">
              <div className="flex flex-wrap gap-2">
                <PremiumBadge />
                <Badge tone="success">Aktiv</Badge>
                <Badge tone="warning">In Prüfung</Badge>
                <Badge tone="danger">Gesperrt</Badge>
                <Badge icon={<Lock aria-hidden />}>Nur Abonnenten</Badge>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Avatar ring name="Nina Zehnder" size="xl" />
                <Avatar ring name="Lena Baumann" size="lg" />
                <Avatar name="Luca Müller" size="md" />
                <Avatar name="Reto Bühler" size="sm" />
                <span className="flex gap-1">
                  <Kbd>⌘</Kbd>
                  <Kbd>K</Kbd>
                </span>
              </div>
            </div>
          </Card>
          <Card title="Kennzahlen">
            <div className="grid gap-3">
              <Stat variant="hero" label="MRR · Fan-Abos" value={formatChf(373850)} delta={{ value: "+37.9 %", direction: "up" }} hint="ggü. Vormonat" />
              <Stat
                className="rounded-card border border-line p-5"
                label="Aktive Abos"
                value="270"
                delta={{ value: "+88", direction: "up" }}
                hint="30 T"
              >
                <Sparkline values={newSubs} label="Neue Abos, 30 Tage" color="series-1" />
              </Stat>
            </div>
          </Card>
          <Card title="Leerer Zustand">
            <EmptyState
              title="Noch keine Posts"
              description="Lade deine ersten Bilder hoch. Die ersten fünf Posts prüfen wir vorab."
              action={
                <Button variant="primary" size="sm">
                  <ImagePlus aria-hidden /> Ersten Post erstellen
                </Button>
              }
            />
          </Card>
        </div>

        <Card title="Tabelle" flush>
          <Table>
            <THead>
              <TR>
                <TH>Creator</TH>
                <TH>Status</TH>
                <TH numeric>Abos</TH>
                <TH numeric>Netto 30 T</TH>
              </TR>
            </THead>
            <TBody>
              {[
                ["Nina Zehnder", "zehenspiel", true, 44, 62260],
                ["Lena Baumann", "lena_barfuss", true, 38, 35720],
                ["Giulia Bernasconi", "piedi_ticino", false, 27, 29610],
              ].map(([name, handle, premium, subs, net]) => (
                <TR key={handle as string}>
                  <TD>
                    <span className="flex items-center gap-2.5">
                      <Avatar name={name as string} size="sm" />
                      <span className="min-w-0">
                        <span className="block truncate font-bold">{name}</span>
                        <span className="block truncate text-xs text-ink-muted">@{handle}</span>
                      </span>
                    </span>
                  </TD>
                  <TD>{premium ? <PremiumBadge /> : <Badge>Standard</Badge>}</TD>
                  <TD numeric>{subs as number}</TD>
                  <TD numeric>{formatChf(net as number)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>

        <div className="flex flex-wrap gap-3">
          <p className="inline-flex items-center gap-2 rounded-control bg-ink px-3.5 py-3 text-sm font-semibold text-canvas shadow-lg">
            <Check aria-hidden className="size-4" /> Post eingereicht – wir prüfen ihn meist innert eines Tages.
          </p>
          <p className="inline-flex items-center gap-2 rounded-control bg-warning-soft px-3.5 py-3 text-sm font-semibold text-warning">
            <Clock aria-hidden className="size-4" /> Deine ersten 5 Posts prüfen wir vorab.
          </p>
        </div>
      </Section>

      <Section id="diagramme" eyebrow="05 · Bausteine" title="Diagramme" description="Serienfarben aus den Tokens, Legende ab zwei Serien, Tooltip und Tabelle.">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <AreaChart data={REVENUE} series={REVENUE_SERIES} stacked format="chf" title="Umsatz · 30 Tage" />
          </Card>
          <Card>
            <BarChart data={SUBS} series={SUBS_SERIES} mode="diverging" format="number" title="Neue Abos vs. Kündigungen · 30 Tage" />
          </Card>
          <Card>
            <Meter
              title="Provisions-Mix · 30 T"
              format="chf"
              parts={[
                { label: "Standard-Provision (15 %)", value: 404201, color: "series-1" },
                { label: "Premium-Provision (5 %)", value: 114005, color: "series-2" },
                { label: "Premium-Pläne", value: 77900, color: "series-3" },
              ]}
            />
          </Card>
        </div>
      </Section>
    </main>
  );
}
