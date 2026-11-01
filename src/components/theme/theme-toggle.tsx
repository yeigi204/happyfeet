"use client";

import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useState } from "react";

import { cn } from "@/components/ui/cn";
import { themeAttribute, themeCookieValue, type ThemePreference } from "@/lib/theme";

const OPTIONS: ReadonlyArray<{ value: ThemePreference; label: string; icon: LucideIcon }> = [
  { value: "light", label: "Hell", icon: Sun },
  { value: "dark", label: "Dunkel", icon: Moon },
  { value: "system", label: "Auto", icon: Monitor },
];

function applyTheme(pref: ThemePreference): void {
  const attribute = themeAttribute(pref);
  if (attribute) document.documentElement.setAttribute("data-theme", attribute);
  else document.documentElement.removeAttribute("data-theme");
  try {
    document.cookie = themeCookieValue(pref);
  } catch {
    // Cookies blockiert: Wahl gilt bis zum Neuladen.
  }
}

/**
 * Umschalter Hell / Dunkel / Auto. Wirkt sofort (Attribut auf <html>) und merkt sich die Wahl im Cookie,
 * damit der Server beim nächsten Aufruf gleich richtig rendert.
 * `segmented`: Pillen mit Icon und Text · `labels`: nur Text (für schmale Stellen wie die Seitenleiste) ·
 * `compact`: nur Icons (mit aria-label).
 */
export function ThemeToggle({
  value,
  className,
  variant = "segmented",
}: {
  value: ThemePreference;
  className?: string;
  variant?: "segmented" | "labels" | "compact";
}) {
  // Startwert vom Server (Cookie); danach führt der Klick – Cookie und Attribut folgen sofort.
  const [current, setCurrent] = useState<ThemePreference>(value);
  const compact = variant === "compact";
  const labelsOnly = variant === "labels";

  return (
    <div role="group" aria-label="Darstellung" className={cn("inline-flex shrink-0 gap-0.5 rounded-full bg-surface-2 p-[3px]", className)}>
      {OPTIONS.map(({ value: option, label, icon: Icon }) => (
        <button
          key={option}
          type="button"
          aria-pressed={current === option}
          aria-label={compact ? `Darstellung: ${label}` : undefined}
          title={compact ? label : undefined}
          onClick={() => {
            setCurrent(option);
            applyTheme(option);
          }}
          className={cn(
            "inline-flex items-center justify-center gap-1.5 rounded-full font-semibold text-ink-muted transition-colors",
            "hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
            "aria-pressed:bg-surface aria-pressed:text-ink aria-pressed:shadow-sm",
            compact ? "size-7 [&_svg]:size-3.5" : labelsOnly ? "h-8 px-2.5 text-[13px]" : "h-8 px-3 text-[13px] [&_svg]:size-3.5",
          )}
        >
          {labelsOnly ? null : <Icon aria-hidden />}
          {compact ? null : label}
        </button>
      ))}
    </div>
  );
}
