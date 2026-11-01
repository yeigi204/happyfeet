import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { KpiOverview, type KpiOverviewProps } from "./kpi-overview";

const props: KpiOverviewProps = {
  kpis: {
    mrrRappen: 344_370,
    mrrDeltaPct: 49.9,
    platformMrrRappen: 33_100,
    platformRevenue30dRappen: 36_500,
    platformRevenueDeltaPct: 26.5,
    grossVolume30dRappen: 366_800,
    activeSubscriptions: 230,
    activeSubscriptionsDelta30d: 12,
    creatorsApproved: 9,
    creatorsPending: 2,
    creatorsPremium: 4,
    fans: 60,
    premiumSharePct: 44,
  },
  activeSeries: [
    { date: "2026-08-04", active: 120 },
    { date: "2026-11-01", active: 230 },
  ],
  today: { newSubs: 5, canceledSubs: 0 },
  now: new Date("2026-11-01T18:00:00Z"),
};

const markup = renderToStaticMarkup(h(KpiOverview, props));
const classLists = [...markup.matchAll(/class="([^"]*)"/g)].map((m) => m[1].split(/\s+/));

describe("KpiOverview", () => {
  it("pads the MRR hero once, so the number and the KPI row line up", () => {
    // Genau eine Akzentfläche mit Innenabstand – keine verschachtelte zweite Hero-Fläche.
    const accentSurfaces = classLists.filter((c) => c.includes("bg-accent") && c.some((x) => /^p-\d/.test(x)));
    expect(accentSurfaces).toHaveLength(1);
    // Keine widersprüchlichen Padding-Klassen (cn() ist clsx – in CSS gewinnt die Reihenfolge, nicht die Klasse).
    expect(classLists.filter((c) => c.includes("p-0") && c.some((x) => /^p-[1-9]/.test(x)))).toEqual([]);
  });

  it("zeigt MRR, Take-Rate und Heute in der Hero-Fläche", () => {
    expect(markup).toContain("MRR · Fan-Abos");
    expect(markup).toContain("Take-Rate");
    expect(markup).toContain("+5 / 0");
  });
});
