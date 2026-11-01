"use client";

import { ArrowRight, Hourglass, OctagonAlert } from "lucide-react";
import { usePathname } from "next/navigation";

import { Container } from "@/components/site/container";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";

export type StatusBannerProps = { status: "pending" | "rejected"; note: string | null };

/**
 * Hinweis für Creator, deren Bewerbung noch läuft oder abgelehnt wurde. Auf der Bewerbungsseite selbst
 * ausgeblendet – dort steht der Kontext (inkl. Begründung) direkt über dem Formular.
 */
export function StatusBanner({ status, note }: StatusBannerProps) {
  const pathname = usePathname();
  if (pathname === "/studio/become-creator") return null;

  const pending = status === "pending";
  const Icon = pending ? Hourglass : OctagonAlert;

  return (
    <Container className="pt-6">
      <section
        aria-labelledby="studio-status-title"
        className={cn(
          "grid gap-4 rounded-card border p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:gap-5 sm:p-5",
          pending ? "border-warning/40 bg-warning/10" : "border-danger/40 bg-danger/10",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "grid size-10 place-items-center rounded-full border bg-surface",
            pending ? "border-warning/40 text-warning" : "border-danger/40 text-danger",
          )}
        >
          <Icon className="size-[18px]" />
        </span>
        <div className="min-w-0">
          <h2 id="studio-status-title" className="font-display text-lg leading-tight font-bold tracking-[-0.02em] text-ink">
            {pending ? "Deine Bewerbung wird geprüft" : "Deine Bewerbung wurde abgelehnt"}
          </h2>
          <p className="mt-1 max-w-prose text-sm leading-relaxed text-ink-muted">
            {pending
              ? "Wir schauen uns jedes Profil persönlich an. Bis zur Freigabe ist deine Seite nicht öffentlich und du kannst noch nicht posten – Bio und Preis kannst du aber schon anpassen."
              : "Dein Profil ist nicht öffentlich. Du kannst dich mit angepassten Angaben jederzeit erneut bewerben."}
          </p>
          {!pending && note ? (
            <blockquote className="mt-3 border-l-2 border-danger/60 pl-3 text-sm leading-relaxed text-ink">
              <span className="sr-only">Begründung: </span>
              {note}
            </blockquote>
          ) : null}
        </div>
        {!pending ? (
          <ButtonLink href="/studio/become-creator" variant="primary" size="sm" className="justify-self-start">
            Erneut bewerben
            <ArrowRight aria-hidden />
          </ButtonLink>
        ) : null}
      </section>
    </Container>
  );
}
