import { initials } from "@/components/ui/avatar";
import { cn } from "@/components/ui/cn";

/** Grosses Profilbild für die Creator-Seite mit Akzentring (Rosé), Rand in Hintergrundfarbe. */
export function ProfileAvatar({ name, src, className }: { name: string; src: string | null; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 rounded-full bg-accent p-[3px]", className)}>
    <span className="relative inline-grid size-24 shrink-0 place-items-center overflow-hidden rounded-full border-4 border-canvas bg-accent-soft sm:size-28">
      {src ? (
        <img src={src} alt={`Profilbild von ${name}`} width={128} height={128} decoding="async" className="size-full object-cover" />
      ) : (
        <span role="img" aria-label={`Profilbild von ${name}`} className="font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">
          {initials(name, 1) || "?"}
        </span>
      )}
    </span>
    </span>
  );
}
