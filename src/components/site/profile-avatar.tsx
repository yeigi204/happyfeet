import { cn } from "@/components/ui/cn";

/** Grosses Profilbild für die Creator-Seite (grösser als `Avatar xl`), mit Rand in Hintergrundfarbe. */
export function ProfileAvatar({ name, src, className }: { name: string; src: string | null; className?: string }) {
  return (
    <span
      className={cn(
        "relative inline-grid size-24 shrink-0 place-items-center overflow-hidden rounded-full border-4 border-canvas bg-accent-soft sm:size-32",
        className,
      )}
    >
      {src ? (
        <img src={src} alt={`Profilbild von ${name}`} width={128} height={128} decoding="async" className="size-full object-cover" />
      ) : (
        <span role="img" aria-label={`Profilbild von ${name}`} className="font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">
          {name.trim().slice(0, 1).toUpperCase() || "?"}
        </span>
      )}
    </span>
  );
}
