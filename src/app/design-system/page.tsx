import { ArrowRight, BadgeCheck, Ban, Check, Flag, Gem, Settings2, ShieldCheck, Wallet, X, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { AdminShell } from "@/components/admin/shell/admin-shell";
import type { QuickSearchResult } from "@/components/admin/shell/command-palette";
import type { TickerItem } from "@/components/admin/shell/ticker";
import { AreaChart } from "@/components/charts/area-chart";
import { BarChart } from "@/components/charts/bar-chart";
import { ChartLegend } from "@/components/charts/chart-legend";
import { ChartTable } from "@/components/charts/chart-table";
import { Meter } from "@/components/charts/meter";
import { Sparkline } from "@/components/charts/sparkline";
import type { DatumRow, SeriesDef } from "@/components/charts/types";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { PageHeader } from "@/components/ui/page-header";
import { PremiumBadge } from "@/components/ui/premium-badge";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { Stat } from "@/components/ui/stat";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatChf, formatNumber, formatPercent, formatPercentBps, formatRelative } from "@/lib/format";

export const metadata: Metadata = { title: "Design-System" };

/* ────────────────────────────────────────────────────────────────────────────
 * Mock-Daten (deterministisch – gleiche Zahlen bei jedem Render)
 * ──────────────────────────────────────────────────────────────────────────── */

const NOW = new Date("2026-11-01T13:05:00Z"); // 14:05 in Zürich
const DAY_MS = 86_400_000;

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function lastDays(n: number): string[] {
  const end = Date.UTC(2026, 10, 1);
  return Array.from({ length: n }, (_, i) => new Date(end - (n - 1 - i) * DAY_MS).toISOString().slice(0, 10));
}

const isWeekend = (date: string) => [0, 5, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay());
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const pct = (now: number, before: number) => (before === 0 ? 0 : now / before - 1);
const signedPct = (ratio: number) => `${ratio >= 0 ? "+" : ""}${formatPercent(ratio, 1)}`;
const signed = (n: number) => `${n >= 0 ? "+" : ""}${formatNumber(n)}`;

function buildPlatform() {
  const r = rng(20261101);
  const dates = lastDays(90);
  const revenue = dates.map((date, i) => {
    const t = i / (dates.length - 1);
    const gross = Math.round((104_000 + 68_000 * t ** 1.2) * (isWeekend(date) ? 1.12 : 0.95) * (0.92 + r() * 0.16));
    const feeBps = 1270 - Math.round(t * 70); // mehr Premium-Creator → tieferer Mischsatz
    const platformFeeRappen = Math.round((gross * feeBps) / 10_000);
    return { date, platformFeeRappen, creatorNetRappen: gross - platformFeeRappen };
  });

  let active = 4_190;
  const subs = dates.map((date, i) => {
    const t = i / (dates.length - 1);
    const newSubs = Math.round((16 + 14 * t) * (0.7 + r() * 0.6) * (isWeekend(date) ? 1.18 : 1));
    const canceledSubs = Math.round((6 + 3 * t) * (0.5 + r() * 1));
    active += newSubs - canceledSubs;
    return { date, newSubs, canceledSubs, active };
  });

  const mrr = subs.map((s) => Math.round((s.active * 981) / 10) * 10);
  const fees = revenue.map((d) => d.platformFeeRappen);
  const gross = revenue.map((d) => d.platformFeeRappen + d.creatorNetRappen);
  const platform30 = sum(fees.slice(-30));
  const premiumPlans = 41 * 1900;
  const standardFees = Math.round((platform30 - premiumPlans) * 0.78);

  return {
    revenue: revenue as DatumRow[],
    subs: subs.map(({ date, newSubs, canceledSubs }) => ({ date, newSubs, canceledSubs })) as DatumRow[],
    mrrSeries: mrr,
    kpis: {
      mrr: mrr[mrr.length - 1],
      mrrDelta: pct(mrr[mrr.length - 1], mrr[mrr.length - 31]),
      platform30,
      platformDelta: pct(platform30, sum(fees.slice(-60, -30))),
      gross30: sum(gross.slice(-30)),
      grossDelta: pct(sum(gross.slice(-30)), sum(gross.slice(-60, -30))),
      activeSubs: subs[subs.length - 1].active,
      activeDelta: subs[subs.length - 1].active - subs[subs.length - 31].active,
      newToday: subs[subs.length - 1].newSubs,
      canceledToday: subs[subs.length - 1].canceledSubs,
      platformMrr: Math.round(mrr[mrr.length - 1] * 0.118) + premiumPlans,
      cancelingShare: 0.034,
      creatorsApproved: 148,
      creatorsPending: 3,
      creatorsPremium: 41,
      fans: 3_207,
    },
    feeMix: { standardFees, premiumFees: platform30 - premiumPlans - standardFees, premiumPlans },
  };
}

const CREATORS = [
  { name: "Lena Brunner", handle: "lena_barfuss", premium: true, subs: 612, price: 990 },
  { name: "Mira Keller", handle: "zehenspiel", premium: true, subs: 498, price: 1290 },
  { name: "Noemi Graf", handle: "sohle_und_seele", premium: false, subs: 455, price: 890 },
  { name: "Jana Meier", handle: "fussnote_zh", premium: true, subs: 391, price: 1490 },
  { name: "Sofia Rossi", handle: "piedi_ticino", premium: false, subs: 344, price: 990 },
  { name: "Elin Huber", handle: "pedi_bern", premium: true, subs: 287, price: 790 },
  { name: "Lara Fischer", handle: "barfuss_basel", premium: false, subs: 241, price: 1190 },
  { name: "Aline Weber", handle: "fersengeld", premium: false, subs: 198, price: 690 },
].map((c, i) => {
  const r = rng(77 + i);
  const gross30 = c.subs * c.price;
  return {
    ...c,
    gross30,
    net30: gross30 - Math.round((gross30 * (c.premium ? 500 : 1500)) / 10_000),
    trend: Array.from({ length: 30 }, (_, d) => c.subs * (0.86 + (d / 29) * 0.14) * (0.97 + r() * 0.06)),
  };
});

const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

type Activity = { at: Date; icon: LucideIcon; tone: "neutral" | "success" | "danger" | "accent"; text: ReactNode };
const ACTIVITY: Activity[] = [
  { at: minutesAgo(3), icon: Check, tone: "success", text: <>Post von <b>@zehenspiel</b> freigegeben</> },
  { at: minutesAgo(11), icon: Flag, tone: "accent", text: <>Meldung zu <b>@piedi_ticino</b> verworfen · kein Verstoss</> },
  { at: minutesAgo(26), icon: BadgeCheck, tone: "success", text: <><b>@fersengeld</b> als Creator freigegeben</> },
  { at: minutesAgo(48), icon: Wallet, tone: "neutral", text: <>Auszahlung {formatChf(120_435)} an <b>@lena_barfuss</b> bezahlt</> },
  { at: minutesAgo(95), icon: Ban, tone: "danger", text: <><b>@gratis_bilder_93</b> gesperrt · Spam</> },
  { at: minutesAgo(140), icon: X, tone: "danger", text: <>Post von <b>@pedi_bern</b> abgelehnt · fremdes Bild</> },
  { at: minutesAgo(310), icon: Settings2, tone: "neutral", text: <>Vorab-Prüfung von 5 auf 6 Posts erhöht</> },
  { at: minutesAgo(1_460), icon: Wallet, tone: "neutral", text: <>4 Auszahlungen erzeugt · {formatChf(693_010)}</> },
];

const QUICK_SEARCH_POOL: QuickSearchResult[] = [
  ...CREATORS.map((c) => ({ id: c.handle, label: c.name, sublabel: `@${c.handle}`, href: `/admin/users?q=${c.handle}` })),
  { id: "fan_1", label: "Marco Bianchi", sublabel: "@marco_b", href: "/admin/users?q=marco_b" },
  { id: "fan_2", label: "Reto Zürcher", sublabel: "@reto_zh", href: "/admin/users?q=reto_zh" },
];

async function demoQuickSearch(q: string): Promise<QuickSearchResult[]> {
  "use server";
  const needle = q.trim().toLowerCase().replace(/^@/, "");
  return QUICK_SEARCH_POOL.filter((u) => u.label.toLowerCase().includes(needle) || u.id.includes(needle)).slice(0, 8);
}

/* Creator-Sicht (helle Welt): Lena, 90 Tage */
function buildCreator() {
  const r = rng(612);
  const dates = lastDays(90);
  const net = dates.map((date, i) => ({
    date,
    net: Math.round((15_400 + 5_200 * (i / 89)) * (isWeekend(date) ? 1.1 : 0.96) * (0.85 + r() * 0.3)),
  }));
  const split = lastDays(30).map((date) => {
    const gross = Math.round((19_800 + r() * 5_000) / 10) * 10;
    return { date, creator: gross - Math.round(gross * 0.05), platform: Math.round(gross * 0.05) };
  });
  const subs = lastDays(30).map((date) => ({ date, newSubs: Math.round(1 + r() * 5), canceled: Math.round(r() * 2.6) }));
  const sources = ["2026-09-21", "2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"].map((date, i) => ({
    date,
    explore: Math.round(9 + i * 1.6 + r() * 4),
    profile: Math.round(6 + i * 0.8 + r() * 3),
    search: Math.round(3 + i * 0.9 + r() * 3),
    direct: Math.round(2 + r() * 3),
  }));
  return { net: net as DatumRow[], split: split as DatumRow[], subs: subs as DatumRow[], sources: sources as DatumRow[] };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Seite
 * ──────────────────────────────────────────────────────────────────────────── */

const SECTIONS = [
  ["farben", "Farben"],
  ["typografie", "Typografie"],
  ["bedienelemente", "Bedienelemente"],
  ["auszeichnung", "Auszeichnung"],
  ["kennzahlen", "Kennzahlen"],
  ["diagramme", "Diagramme"],
  ["tabellen", "Tabellen"],
  ["leer", "Leere Zustände"],
  ["admin", "Admin"],
] as const;

export default function DesignSystemPage() {
  if (process.env.NODE_ENV === "production") notFound();

  const platform = buildPlatform();
  const creator = buildCreator();

  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <div className="mx-auto max-w-[1240px] px-4 sm:px-8">
        <div className="flex h-14 items-center justify-between border-b border-line">
          <span className="flex items-center gap-2">
            <NailMark />
            <span className="font-display text-lg font-extrabold tracking-[-0.05em]">happyfeet</span>
          </span>
          <span className="font-mono text-[11px] text-ink-faint">Design-System · v1 · 01.11.2026</span>
        </div>

        <header className="grid gap-10 py-14 sm:py-20 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-end">
          <div>
            <p className="eyebrow">Nur in der Entwicklung sichtbar</p>
            <h1 className="mt-6 font-display text-[54px] leading-[0.86] font-extrabold tracking-[-0.06em] sm:text-[104px]">
              Puder, Creme
              <br />
              <span className="text-accent">&amp;</span> Nagellack.
            </h1>
            <p className="mt-7 max-w-[34rem] text-[17px] leading-relaxed text-ink-muted">
              Zwei Welten, eine Marke. Hell und warm für Fans und Creator, dunkel und dicht für den Admin. Jeder Baustein auf einer Seite – mit
              realistischen Daten in CHF.
            </p>
          </div>
          <nav aria-label="Abschnitte" className="grid grid-cols-2 gap-x-6 gap-y-2 border-t border-line pt-4 font-mono text-[12px] lg:grid-cols-1">
            {SECTIONS.map(([id, label], i) => (
              <a key={id} href={`#${id}`} className="group flex items-baseline gap-3 text-ink-muted hover:text-ink">
                <span className="text-ink-faint tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                <span className="border-b border-transparent group-hover:border-accent">{label}</span>
              </a>
            ))}
          </nav>
        </header>

        <Section id="farben" n={1} title="Farben" lead="Gleiche Token-Namen in beiden Welten. Serienfarben sind auf der jeweiligen Fläche validiert – Reihenfolge nie ändern.">
          <div className="grid gap-4 xl:grid-cols-2">
            <SwatchPanel world="hell" />
            <div className="theme-admin rounded-card">
              <SwatchPanel world="admin" />
            </div>
          </div>
        </Section>

        <Section id="typografie" n={2} title="Typografie" lead="Bricolage Grotesque für Überschriften mit Haltung, Geist für die Oberfläche, Geist Mono für jede Zahl.">
          <TypeSpecimen />
        </Section>

        <Section id="bedienelemente" n={3} title="Bedienelemente" lead="Ein Akzent pro Ansicht. Fokus ist immer sichtbar: 2px Nagellack-Rot.">
          <Controls />
        </Section>

        <Section id="auszeichnung" n={4} title="Auszeichnung" lead="Status nie nur über Farbe: jeder Ton bringt sein Icon mit.">
          <Marks />
        </Section>

        <Section id="kennzahlen" n={5} title="Kennzahlen" lead="Label, Wert, Veränderung, Trend. Die Richtung färbt nur, wenn klar ist, ob sie gut ist.">
          <div className="grid gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
            <StatCell>
              <Stat label="Aktive Abonnenten" value="612" delta={{ value: "+23", direction: "up" }} hint="seit 1. Okt">
                <Sparkline values={CREATORS[0].trend} label="Abonnenten, 30 Tage" />
              </Stat>
            </StatCell>
            <StatCell>
              <Stat label="Netto im November" value={formatChf(512_040)} delta={{ value: "+6.8 %", direction: "up" }} hint="vs. Oktober">
                <Sparkline values={creator.net.slice(-30).map((d) => Number(d.net))} color="series-2" label="Netto pro Tag, 30 Tage" />
              </Stat>
            </StatCell>
            <StatCell>
              <Stat label="Kündigungsrate 30 T" value={formatPercent(0.031, 1)} delta={{ value: "-0.4 Pp.", direction: "down", good: true }} hint="tiefer ist besser" />
            </StatCell>
            <StatCell>
              <Stat label="Nächste Auszahlung" value={formatChf(120_435)} delta={{ value: "wöchentlich", direction: "flat" }} hint="Mo, 2. Nov" />
            </StatCell>
          </div>
        </Section>

        <Section id="diagramme" n={6} title="Diagramme" lead="Handgezeichnetes SVG: 2px-Linien, 4px gerundete Balkenenden, Haarlinien-Raster, Crosshair mit Tooltip, Tabelle als Zwilling. Mit Pfeiltasten bedienbar.">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="lg:col-span-2">
              <AreaChart data={creator.net} series={[{ key: "net", label: "Netto", color: "series-1" }]} format="chf" title="Netto-Einnahmen · 90 Tage" height={280} />
            </Card>
            <Card>
              <AreaChart
                data={creator.split}
                series={[
                  { key: "platform", label: "Provision", color: "series-1" },
                  { key: "creator", label: "Creator", color: "series-2" },
                ]}
                stacked
                format="chf"
                title="Brutto nach Anteil · 30 Tage"
              />
            </Card>
            <Card>
              <BarChart
                data={creator.subs}
                series={[
                  { key: "newSubs", label: "Neue Abos", color: "series-2" },
                  { key: "canceled", label: "Kündigungen", color: "series-1" },
                ]}
                mode="diverging"
                format="number"
                title="Neue Abos vs. Kündigungen · 30 Tage"
              />
            </Card>
            <Card>
              <BarChart data={creator.sources} series={SOURCE_SERIES} format="number" title="Neue Fans nach Herkunft · Wochen" />
            </Card>
            <Card>
              <div className="grid gap-8">
                <Meter
                  title="Wohin ein Abo-Franken geht"
                  format="chf"
                  parts={[
                    { label: "Creator (Standard, 85 %)", value: 841, color: "series-2" },
                    { label: "Plattform-Provision", value: 149, color: "series-1" },
                  ]}
                />
                <div>
                  <p className="eyebrow mb-3">Sparklines</p>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
                    {(["series-1", "series-2", "series-3", "series-4"] as const).map((c, i) => (
                      <div key={c}>
                        <Sparkline values={CREATORS[i + 1].trend} color={c} label={`Trend ${CREATORS[i + 1].name}`} />
                        <p className="mt-1.5 font-mono text-[11px] text-ink-faint">{c}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
            <Card title="Tabellen-Zwilling & Legende" className="lg:col-span-2" flush>
              <div className="border-b border-line px-4 py-3">
                <ChartLegend series={SOURCE_SERIES} />
              </div>
              <ChartTable data={creator.sources.slice(-3)} series={SOURCE_SERIES} format="number" caption="Neue Fans nach Herkunft" total />
            </Card>
          </div>
        </Section>

        <Section id="tabellen" n={7} title="Tabellen" lead="Zahlen rechtsbündig in Mono, Haarlinien zwischen Zeilen, Kopf in Versalien.">
          <PaymentsTable />
        </Section>

        <Section id="leer" n={8} title="Leere Zustände" lead="Linksbündig, ruhig, mit einem nächsten Schritt.">
          <div className="grid gap-4">
            <EmptyState
              title="Noch keine Posts"
              description="Lade deine ersten Bilder hoch. Die ersten fünf Posts prüfen wir vorab – meist innert eines Tages."
              action={
                <ButtonLink href="#" variant="primary" size="sm">
                  Ersten Post erstellen
                </ButtonLink>
              }
            />
            <PageHeader
              eyebrow="Studio · Seitenkopf"
              title="Deine Posts"
              description="Alles, was du veröffentlicht hast – mit Prüfstatus."
              actions={
                <>
                  <Segmented
                    items={[
                      { href: "#alle", label: "Alle", count: 42 },
                      { href: "#pruefung", label: "In Prüfung", count: 2 },
                      { href: "#abgelehnt", label: "Abgelehnt", count: 1 },
                    ]}
                    active="#alle"
                  />
                  <ButtonLink href="#" variant="primary" size="sm">
                    Neuer Post
                  </ButtonLink>
                </>
              }
            />
          </div>
        </Section>

        <section id="admin" aria-labelledby="admin-title" className="grid gap-4 border-t border-line pt-12 pb-8 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-12 lg:pt-16">
          <SectionHeading id="admin" n={9} title="Admin" />
          <p className="max-w-2xl text-sm text-ink-muted lg:pt-9">
            Dieselben Bausteine unter <code className="font-mono text-[13px] text-ink">.theme-admin</code>: warmes Tintenschwarz, Haarlinien, ein
            einziger Akzent. Kürzel sind live – probier <Kbd>⌘</Kbd>
            <Kbd>K</Kbd> oder <Kbd>?</Kbd>.
          </p>
        </section>
      </div>

      <div className="border-y border-line">
        <AdminShell
          counts={{ verifications: platform.kpis.creatorsPending, moderation: 6, reports: 7 }}
          ticker={tickerFor(platform.kpis)}
          quickSearch={demoQuickSearch}
          activeHref="/admin"
        >
          <AdminDashboardMock platform={platform} />
        </AdminShell>
      </div>
      <p className="mx-auto max-w-[1240px] px-4 py-10 font-mono text-[11px] text-ink-faint sm:px-8">Ende · happyfeet Design-System</p>
    </div>
  );
}

const SOURCE_SERIES: SeriesDef[] = [
  { key: "explore", label: "Entdecken", color: "series-1" },
  { key: "profile", label: "Profil-Link", color: "series-2" },
  { key: "search", label: "Suche", color: "series-3" },
  { key: "direct", label: "Direkt", color: "series-4" },
];

/* ──────────────────────────────────────────────────────────────────────────── */

function NailMark({ className }: { className?: string }) {
  return <span aria-hidden className={cn("block h-[15px] w-3 rounded-[50%_50%_42%_42%/62%_62%_38%_38%] bg-accent", className)} />;
}

function SectionHeading({ id, n, title, lead }: { id: string; n: number; title: string; lead?: string }) {
  return (
    <div className="lg:sticky lg:top-8 lg:self-start">
      <p className="flex items-center gap-2 font-mono text-[11px] text-ink-faint tabular-nums">
        <span aria-hidden className="size-1.5 rounded-full bg-accent" />
        {String(n).padStart(2, "0")}
      </p>
      <h2 id={`${id}-title`} className="mt-3 font-display text-[30px] leading-none font-bold tracking-[-0.04em]">
        {title}
      </h2>
      {lead ? <p className="mt-3 max-w-[34ch] text-sm leading-relaxed text-ink-muted">{lead}</p> : null}
    </div>
  );
}

function Section({ id, n, title, lead, children }: { id: string; n: number; title: string; lead: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="grid gap-8 border-t border-line py-12 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-12 lg:py-16">
      <SectionHeading id={id} n={n} title={title} lead={lead} />
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function SubHeading({ children }: { children: ReactNode }) {
  return <h3 className="eyebrow mb-3">{children}</h3>;
}

const SWATCHES: { group: string; tokens: [name: string, light: string, admin: string][] }[] = [
  {
    group: "Flächen & Linien",
    tokens: [
      ["canvas", "#f7f1ea", "#0f0d0c"],
      ["surface", "#fffaf4", "#171412"],
      ["surface-2", "#f1e7dc", "#1f1b18"],
      ["line", "#e6d9cb", "#2c2622"],
      ["line-strong", "#cfbdab", "#3d3530"],
    ],
  },
  {
    group: "Tinte",
    tokens: [
      ["ink", "#1d1714", "#f3ede6"],
      ["ink-muted", "#62544a", "#b2a59a"],
      ["ink-faint", "#786960", "#93877c"],
    ],
  },
  {
    group: "Akzent & Status",
    tokens: [
      ["accent", "#d7352a", "#ec5545"],
      ["accent-soft", "#f8ddd5", "#3a1915"],
      ["success", "#1f7a4a", "#45b884"],
      ["warning", "#9a5b00", "#e3a23b"],
      ["danger", "#b42318", "#ff6a5c"],
      ["premium", "#87621a", "#dbb56d"],
    ],
  },
  {
    group: "Serien · validiert",
    tokens: [
      ["series-1", "#d7352a", "#ec5545"],
      ["series-2", "#00886d", "#00ab8e"],
      ["series-3", "#bb7400", "#c38300"],
      ["series-4", "#734dbe", "#8e71d6"],
    ],
  },
];

function SwatchPanel({ world }: { world: "hell" | "admin" }) {
  return (
    <div className="rounded-card border border-line bg-canvas p-4 sm:p-5">
      <div className="mb-5 flex items-baseline justify-between">
        <p className="font-display text-lg font-bold tracking-[-0.03em] text-ink">{world === "hell" ? "Hell · Puder & Creme" : "Admin · Tintenschwarz"}</p>
        <code className="font-mono text-[11px] text-ink-faint">{world === "hell" ? ":root" : ".theme-admin"}</code>
      </div>
      <div className="grid gap-5">
        {SWATCHES.map((g) => (
          <div key={g.group}>
            <p className="eyebrow mb-2">{g.group}</p>
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {g.tokens.map(([name, light, admin]) => (
                <li key={name} className="min-w-0">
                  <span className="block h-11 rounded-[4px] border border-line" style={{ background: `var(--color-${name})` }} />
                  <span className="mt-1.5 block truncate font-mono text-[10.5px] text-ink">{name}</span>
                  <span className="block font-mono text-[10.5px] text-ink-faint">{world === "hell" ? light : admin}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function TypeSpecimen() {
  return (
    <div className="grid gap-px overflow-hidden rounded-card border border-line bg-line">
      <div className="bg-surface p-5 sm:p-8">
        <p className="eyebrow">Display · Bricolage Grotesque 800 · −0.055em</p>
        <p className="mt-4 font-display text-[44px] leading-[0.9] font-extrabold tracking-[-0.055em] sm:text-[72px]">Fussbilder, direkt von Creatorn.</p>
      </div>
      <div className="grid gap-px bg-line md:grid-cols-2">
        <div className="bg-surface p-5 sm:p-8">
          <p className="eyebrow">Seitentitel · 46 / Abschnitt · 24</p>
          <p className="mt-4 font-display text-[46px] leading-[0.95] font-bold tracking-[-0.04em]">Moderation</p>
          <p className="mt-3 font-display text-2xl font-semibold tracking-[-0.03em]">Warteschlangen zuerst, dann Geld.</p>
        </div>
        <div className="bg-surface p-5 sm:p-8">
          <p className="eyebrow">Fliesstext · Geist 15 / 13</p>
          <p className="mt-4 max-w-prose text-[15px] leading-relaxed">
            Fans abonnieren Creator für einen fixen Monatspreis. Gesperrte Posts zeigen nur eine verpixelte Vorschau – die Originale verlassen den
            Server erst mit gültigem Abo.
          </p>
          <p className="mt-3 text-[13px] text-ink-muted">Hinweise, Labels und Metadaten in 13px, gedämpft.</p>
        </div>
      </div>
      <div className="grid gap-px bg-line md:grid-cols-[1.4fr_1fr]">
        <div className="bg-surface p-5 sm:p-8">
          <p className="eyebrow">Zahlen · Geist Mono · Schweizer Apostroph</p>
          <p className="mt-4 font-mono text-[40px] leading-none font-medium tracking-[-0.04em] sm:text-[56px]">
            <span className="mr-2.5 align-text-top font-sans text-sm text-ink-faint">CHF</span>12<span className="-mx-[0.16em]">’</span>480<span className="text-ink-faint">.00</span>
          </p>
        </div>
        <div className="bg-surface p-5 sm:p-8">
          <p className="eyebrow">Tabellarisch · tabular-nums</p>
          <dl className="mt-4 grid gap-1.5 font-mono text-[13px] tabular-nums">
            {[
              ["Brutto", 1_234_550],
              ["Provision 15 %", -185_183],
              ["Netto", 1_049_367],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between border-b border-line pb-1.5 last:border-0">
                <dt className="font-sans text-ink-muted">{label}</dt>
                <dd>{formatChf(Number(value))}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}

function Controls() {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card title="Buttons">
        <div className="grid gap-5">
          {(["primary", "secondary", "ghost", "danger"] as const).map((variant) => (
            <div key={variant} className="flex flex-wrap items-center gap-2">
              <span className="w-20 font-mono text-[11px] text-ink-faint">{variant}</span>
              <Button variant={variant} size="sm">
                Klein
              </Button>
              <Button variant={variant}>Standard</Button>
              <Button variant={variant} size="lg">
                Gross
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <span className="w-20 font-mono text-[11px] text-ink-faint">Zustände</span>
            <Button variant="primary" disabled>
              Deaktiviert
            </Button>
            <ButtonLink href="#bedienelemente" variant="secondary">
              Als Link <ArrowRight aria-hidden />
            </ButtonLink>
          </div>
        </div>
      </Card>
      <Card title="Formular">
        <div className="grid gap-4">
          <Field label="Handle" hint="3–24 Zeichen: a–z, 0–9 und _">
            <Input name="handle" defaultValue="lena_barfuss" />
          </Field>
          <Field label="Monatspreis (CHF)" error="Der Preis muss zwischen CHF 4.90 und CHF 49.90 liegen.">
            <Input name="price" inputMode="decimal" defaultValue="55.00" />
          </Field>
          <Field label="Sichtbarkeit">
            <Select name="visibility" defaultValue="subscribers">
              <option value="public">Öffentlich</option>
              <option value="subscribers">Nur Abonnenten</option>
            </Select>
          </Field>
          <Field label="Bio" hint="Max. 2000 Zeichen">
            <Textarea name="bio" rows={3} defaultValue="Pediküre-Liebhaberin aus Zürich. Neue Bilder jeden Freitag." />
          </Field>
        </div>
      </Card>
      <Card title="Tabs (Segmented)" className="lg:col-span-2">
        <Segmented
          items={[
            { href: "#offen", label: "Offen", count: 3 },
            { href: "#freigegeben", label: "Freigegeben", count: 148 },
            { href: "#abgelehnt", label: "Abgelehnt", count: 12 },
          ]}
          active="#offen"
        />
      </Card>
    </div>
  );
}

function Marks() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="Badges">
        <div className="flex flex-wrap gap-2">
          <Badge tone="neutral">Entwurf</Badge>
          <Badge tone="accent">Neu</Badge>
          <Badge tone="success">Freigegeben</Badge>
          <Badge tone="warning">In Prüfung</Badge>
          <Badge tone="danger">Kritisch</Badge>
          <Badge tone="premium">Premium</Badge>
        </div>
        <div className="mt-4 flex items-center gap-3 border-t border-line pt-4 text-sm">
          <PremiumBadge />
          <span className="flex items-center gap-1.5">
            Mira Keller <PremiumBadge compact />
          </span>
        </div>
      </Card>
      <Card title="Avatare & Tasten">
        <div className="flex items-end gap-3">
          {(["xs", "sm", "md", "lg", "xl"] as const).map((size, i) => (
            <Avatar key={size} name={CREATORS[i].name} size={size} />
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-4 text-[13px] text-ink-muted">
          <span className="flex items-center gap-1">
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd> Suche
          </span>
          <span className="flex items-center gap-1">
            <Kbd>g</Kbd> dann <Kbd>m</Kbd> Moderation
          </span>
          <span className="flex items-center gap-1">
            <Kbd>j</Kbd>
            <Kbd>k</Kbd> blättern
          </span>
        </div>
      </Card>
    </div>
  );
}

function StatCell({ children }: { children: ReactNode }) {
  return <div className="bg-surface p-5">{children}</div>;
}

function PaymentsTable() {
  const rows = [
    { at: "01.11.2026, 13:58", fan: "marco_b", kind: "Neu", gross: 990, fee: 149 },
    { at: "01.11.2026, 12:31", fan: "reto_zh", kind: "Verlängerung", gross: 990, fee: 149 },
    { at: "01.11.2026, 09:12", fan: "anna_sg", kind: "Verlängerung", gross: 1290, fee: 65 },
    { at: "31.10.2026, 22:47", fan: "luca_lu", kind: "Neu", gross: 1490, fee: 75 },
    { at: "31.10.2026, 18:05", fan: "nina_bs", kind: "Verlängerung", gross: 890, fee: 134 },
  ];
  return (
    <Card title="Letzte Zahlungen" action={<span className="font-mono text-xs text-ink-faint">5 von 1’284</span>} flush>
      <Table>
        <THead>
          <TR>
            <TH>Zeitpunkt</TH>
            <TH>Fan</TH>
            <TH>Art</TH>
            <TH numeric>Brutto</TH>
            <TH numeric>Provision</TH>
            <TH numeric>Netto</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((r) => (
            <TR key={r.at}>
              <TD className="font-mono text-[13px] whitespace-nowrap text-ink-muted tabular-nums">{r.at}</TD>
              <TD>
                <span className="flex items-center gap-2">
                  <Avatar name={r.fan} size="xs" />@{r.fan}
                </span>
              </TD>
              <TD>
                <Badge tone={r.kind === "Neu" ? "accent" : "neutral"}>{r.kind}</Badge>
              </TD>
              <TD numeric>{formatChf(r.gross)}</TD>
              <TD numeric className="text-ink-muted">
                {formatChf(-r.fee)}
              </TD>
              <TD numeric className="font-medium">
                {formatChf(r.gross - r.fee)}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </Card>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Admin-Dashboard (Mock-Komposition – Vorlage für /admin)
 * ──────────────────────────────────────────────────────────────────────────── */

type Platform = ReturnType<typeof buildPlatform>;

function tickerFor(k: Platform["kpis"]): TickerItem[] {
  return [
    { label: "MRR", value: formatChf(k.mrr), delta: signedPct(k.mrrDelta), direction: k.mrrDelta >= 0 ? "up" : "down" },
    { label: "Plattform 30 T", value: formatChf(k.platform30), delta: signedPct(k.platformDelta), direction: k.platformDelta >= 0 ? "up" : "down" },
    { label: "Brutto 30 T", value: formatChf(k.gross30, { compact: true }), delta: signedPct(k.grossDelta), direction: k.grossDelta >= 0 ? "up" : "down" },
    { label: "Aktive Abos", value: formatNumber(k.activeSubs), delta: signed(k.activeDelta), direction: "up" },
    { label: "Heute neu", value: formatNumber(k.newToday) },
    { label: "Heute gekündigt", value: formatNumber(k.canceledToday) },
    { label: "Premium-Anteil", value: formatPercent(k.creatorsPremium / k.creatorsApproved, 1) },
    { label: "Offene Meldungen", value: "7", delta: "2 kritisch", direction: "flat" },
  ];
}

function AdminDashboardMock({ platform }: { platform: Platform }) {
  const k = platform.kpis;
  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Sonntag, 1. November 2026 · 14:05"
        title="Dashboard"
        description="Warteschlangen zuerst, dann Geld."
        actions={
          <Segmented
            label="Zeitraum"
            items={[
              { href: "#7", label: "7 T" },
              { href: "#30", label: "30 T" },
              { href: "#90", label: "90 T" },
            ]}
            active="#90"
          />
        }
      />

      {/* Hero + KPI-Raster */}
      <section aria-label="Kennzahlen" className="grid overflow-hidden rounded-card border border-line bg-surface lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="relative border-b border-line p-5 sm:p-7 lg:border-r lg:border-b-0">
          <Stat
            size="lg"
            label="MRR · Fan-Abos"
            value={formatChf(k.mrr)}
            delta={{ value: signedPct(k.mrrDelta), direction: k.mrrDelta >= 0 ? "up" : "down" }}
            hint="vs. 2. Oktober"
          >
            <Sparkline values={platform.mrrSeries} label="MRR, letzte 90 Tage" className="mt-6 h-16" />
            <div className="mt-2 flex justify-between font-mono text-[10.5px] text-ink-faint">
              <span>4. Aug</span>
              <span>heute</span>
            </div>
          </Stat>
          <dl className="mt-6 grid grid-cols-3 gap-4 border-t border-line pt-4">
            {[
              ["Plattform-MRR", formatChf(k.platformMrr, { compact: true })],
              ["Ø Abo-Preis", formatChf(Math.round(k.mrr / k.activeSubs))],
              ["Kündigt", formatPercent(k.cancelingShare, 1)],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="eyebrow truncate">{label}</dt>
                <dd className="mt-2 font-mono text-[13px] whitespace-nowrap text-ink tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 [&>*]:border-line [&>*]:p-5 sm:[&>*]:p-6">
          <Stat
            className="border-r border-b"
            label="Plattform-Umsatz 30 T"
            value={formatChf(k.platform30, { compact: true })}
            delta={{ value: signedPct(k.platformDelta), direction: k.platformDelta >= 0 ? "up" : "down" }}
          />
          <Stat
            className="border-b sm:border-r"
            label="Bruttovolumen 30 T"
            value={formatChf(k.gross30, { compact: true })}
            delta={{ value: signedPct(k.grossDelta), direction: k.grossDelta >= 0 ? "up" : "down" }}
          />
          <Stat
            className="border-r border-b sm:border-r-0"
            label="Aktive Abos"
            value={formatNumber(k.activeSubs)}
            delta={{ value: signed(k.activeDelta), direction: "up" }}
            hint="30 T"
          />
          <Stat className="border-b sm:border-r sm:border-b-0" label="Creator freigegeben" value={formatNumber(k.creatorsApproved)} hint={`${k.creatorsPending} in Prüfung`} />
          <Stat className="border-r" label="Fans" value={formatNumber(k.fans)} delta={{ value: "+212", direction: "up" }} hint="30 T" />
          <Stat label="Premium-Anteil" value={formatPercent(k.creatorsPremium / k.creatorsApproved, 1)} hint={`${k.creatorsPremium} Creator`} />
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <AreaChart
            data={platform.revenue}
            series={[
              { key: "platformFeeRappen", label: "Plattform", color: "series-1" },
              { key: "creatorNetRappen", label: "Creator", color: "series-2" },
            ]}
            stacked
            format="chf"
            title="Umsatz · 90 Tage"
            height={300}
          />
        </Card>
        <QueueList />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <BarChart
            data={platform.subs}
            series={[
              { key: "newSubs", label: "Neue Abos", color: "series-2" },
              { key: "canceledSubs", label: "Kündigungen", color: "series-1" },
            ]}
            mode="diverging"
            format="number"
            title="Neue Abos vs. Kündigungen · 90 Tage"
            height={260}
          />
        </Card>
        <Card>
          <div className="grid gap-8">
            <Meter
              title="Provisions-Mix · 30 T"
              format="chf"
              parts={[
                { label: "Standard-Provision (15 %)", value: platform.feeMix.standardFees, color: "series-1" },
                { label: "Premium-Provision (5 %)", value: platform.feeMix.premiumFees, color: "series-2" },
                { label: "Premium-Pläne", value: platform.feeMix.premiumPlans, color: "series-3" },
              ]}
            />
            <div>
              <p className="flex items-baseline justify-between text-[13px] font-semibold text-ink">
                Aktuelle Sätze
                <a href="/admin/settings" className="text-xs font-normal text-ink-muted hover:text-ink">
                  Einstellungen →
                </a>
              </p>
              <dl className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-control border border-line bg-line">
                {[
                  ["Standard", formatPercentBps(1500)],
                  ["Premium", formatPercentBps(500)],
                  ["Plan / Mt.", formatChf(1900)],
                ].map(([label, value]) => (
                  <div key={label} className="bg-surface px-3 py-2.5">
                    <dt className="eyebrow">{label}</dt>
                    <dd className="mt-2 font-mono text-[13px] whitespace-nowrap text-ink tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <TopCreators />
        <ActivityFeed />
      </div>

      <Card title="Bausteine im Admin">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="grid content-start gap-3">
            <SubHeading>Aktionen</SubHeading>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" size="sm">
                <Check aria-hidden /> Freigeben
              </Button>
              <Button variant="secondary" size="sm">
                Überspringen
              </Button>
              <Button variant="danger" size="sm">
                <X aria-hidden /> Ablehnen
              </Button>
              <Button variant="ghost" size="sm">
                Abbrechen
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge tone="success">Freigegeben</Badge>
              <Badge tone="warning">Dringend</Badge>
              <Badge tone="danger">Kritisch</Badge>
              <Badge tone="accent">Neu</Badge>
              <PremiumBadge />
            </div>
          </div>
          <div className="grid content-start gap-3">
            <SubHeading>Notiz</SubHeading>
            <Field label="Grund der Ablehnung" error="Bitte gib eine Notiz an (wird dem Creator angezeigt).">
              <Textarea rows={2} placeholder="z. B. Bild zeigt ein Gesicht" />
            </Field>
          </div>
          <EmptyState title="Keine offenen Meldungen" description="Alles erledigt. Neue Meldungen erscheinen hier." className="self-start" />
        </div>
      </Card>
    </div>
  );
}

type Urgency = "ok" | "due" | "overdue";
const URGENCY: Record<Urgency, { tone: "neutral" | "warning" | "danger"; label: string }> = {
  ok: { tone: "neutral", label: "Im Rahmen" },
  due: { tone: "warning", label: "Dringend" },
  overdue: { tone: "danger", label: "Überfällig" },
};

function QueueList() {
  const queues: { title: string; icon: LucideIcon; count: number; meta: string; urgency?: Urgency; oldestHours?: number; href: string }[] = [
    { title: "Meldungen", icon: Flag, count: 7, meta: "2 kritisch", urgency: "overdue", oldestHours: 79, href: "/admin/moderation?tab=reports" },
    { title: "Verifizierungen", icon: BadgeCheck, count: 3, meta: "Creator-Anträge", urgency: "due", oldestHours: 26, href: "/admin/verifications" },
    { title: "Vorab-Prüfung", icon: ShieldCheck, count: 6, meta: "Posts neuer Creator", urgency: "ok", oldestHours: 5, href: "/admin/moderation" },
    { title: "Auszahlungen", icon: Wallet, count: 5, meta: `geplant · ${formatChf(693_010)}`, href: "/admin/payouts" },
  ];
  return (
    <Card title="Warteschlangen" action={<span className="font-mono text-xs text-ink-faint">älteste zuerst</span>} flush>
      <ul className="divide-y divide-line">
        {queues.map((q) => {
          const Icon = q.icon;
          const u = q.urgency ? URGENCY[q.urgency] : null;
          return (
            <li key={q.title}>
              <a href={q.href} className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-3.5 transition-colors hover:bg-surface-2">
                <Icon aria-hidden className="size-4 text-ink-faint group-hover:text-ink-muted" />
                <span className="truncate text-[13.5px] font-medium text-ink">{q.title}</span>
                <span className="row-span-2 font-mono text-[28px] leading-none font-medium tracking-[-0.04em] text-ink">{q.count}</span>
                <span />
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-faint">
                  {u ? <Badge tone={u.tone}>{u.label}</Badge> : null}
                  <span>
                    {q.meta}
                    {q.oldestHours ? ` · älteste vor ${q.oldestHours} Std.` : null}
                  </span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function TopCreators() {
  return (
    <Card title="Top-Creator · 30 T" action={<span className="font-mono text-xs text-ink-faint">nach Brutto</span>} flush>
      <Table>
        <THead>
          <TR>
            <TH className="hidden w-8 sm:table-cell">#</TH>
            <TH>Creator</TH>
            <TH className="hidden md:table-cell">Trend</TH>
            <TH numeric>Abos</TH>
            <TH numeric>Brutto</TH>
            <TH numeric className="hidden sm:table-cell">Netto</TH>
          </TR>
        </THead>
        <TBody>
          {CREATORS.map((c, i) => (
            <TR key={c.handle}>
              <TD className="hidden font-mono text-[12px] text-ink-faint tabular-nums sm:table-cell">{String(i + 1).padStart(2, "0")}</TD>
              <TD>
                <span className="flex min-w-0 items-center gap-2.5">
                  <Avatar name={c.name} size="sm" />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 truncate text-[13.5px] font-medium">
                      {c.name}
                      {c.premium ? <Gem aria-label="Premium" className="size-3 shrink-0 text-premium" /> : null}
                    </span>
                    <span className="block truncate font-mono text-[11px] text-ink-faint">@{c.handle}</span>
                  </span>
                </span>
              </TD>
              <TD className="hidden w-28 md:table-cell">
                <Sparkline values={c.trend} label={`Abos von ${c.name}, 30 Tage`} className="h-6 w-24" />
              </TD>
              <TD numeric>{formatNumber(c.subs)}</TD>
              <TD numeric>{formatChf(c.gross30)}</TD>
              <TD numeric className="hidden text-ink-muted sm:table-cell">
                {formatChf(c.net30)}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </Card>
  );
}

const ACTIVITY_TONE: Record<Activity["tone"], string> = {
  neutral: "text-ink-faint",
  success: "text-success",
  danger: "text-danger",
  accent: "text-accent",
};

function ActivityFeed() {
  return (
    <Card title="Aktivität" action={<a href="/admin/audit" className="text-xs text-ink-muted hover:text-ink">Audit-Log →</a>} flush>
      <ol className="relative px-4 py-3">
        <span aria-hidden className="absolute top-5 bottom-5 left-[25px] w-px bg-line" />
        {ACTIVITY.map((a, i) => {
          const Icon = a.icon;
          return (
            <li key={i} className="relative grid grid-cols-[20px_minmax(0,1fr)] gap-3 py-2">
              <span className="relative z-10 mt-px grid size-5 place-items-center rounded-full border border-line bg-surface">
                <Icon aria-hidden className={cn("size-3", ACTIVITY_TONE[a.tone])} strokeWidth={2.4} />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] leading-snug text-ink-muted [&_b]:font-medium [&_b]:text-ink">{a.text}</span>
                <span className="mt-0.5 block font-mono text-[11px] text-ink-faint">{formatRelative(a.at, NOW)} · @admin</span>
              </span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
