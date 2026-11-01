import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { safeReturnPath } from "@/server/auth/return-path";
import { requireViewer } from "@/server/auth/viewer";

import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "Profil einrichten" };

/** Heutiges Datum in Europe/Zurich als YYYY-MM-DD (Obergrenze für das Datumsfeld). */
function todayInZurich(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const viewer = await requireViewer();
  const raw = (await searchParams).redirect_url;
  const returnTo = safeReturnPath(Array.isArray(raw) ? raw[0] : raw);
  if (viewer.status === "banned") redirect("/banned");
  if (viewer.onboarded) redirect(returnTo ?? "/explore");

  return (
    <div>
      <p className="eyebrow text-accent-strong">Letzter Schritt</p>
      <h1 className="mt-4 font-display text-4xl font-extrabold leading-[1.05] tracking-[-0.035em] text-balance sm:text-5xl">
        Wie sollen dich die anderen sehen?
      </h1>
      <p className="mt-4 leading-relaxed text-ink-muted">
        Wähle deinen Handle und Namen. Dein Geburtsdatum brauchen wir, weil happyfeet nur für Erwachsene ist – es
        bleibt privat.
      </p>

      <div className="mt-10 border-t border-line pt-8">
        <OnboardingForm maxBirthDate={todayInZurich(new Date())} returnTo={returnTo} />
      </div>
    </div>
  );
}
