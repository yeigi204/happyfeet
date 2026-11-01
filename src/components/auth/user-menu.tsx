import { UserButton } from "@clerk/nextjs";
import Link from "next/link";

import { isDevImpersonation } from "@/server/auth/dev-impersonation";
import { getViewer } from "@/server/auth/viewer";

/**
 * Konto-Menü für die Kopfzeile (Server Component).
 * Mit Clerk: `<UserButton />`. Bei Dev-Impersonation gibt es kein Clerk – dann ein Chip „Dev: @handle“.
 * `compact` (Seitenleiste, wo Name und Handle daneben stehen): Chip zeigt nur „Dev“.
 */
export async function UserMenu({ compact = false }: { compact?: boolean }) {
  if (isDevImpersonation()) {
    const viewer = await getViewer();
    const label = viewer?.handle ? `@${viewer.handle}` : (viewer?.clerkId ?? "unbekannt");
    // Link statt <span>: per Tastatur erreichbar; /sign-in erklärt die Impersonation und wie man wechselt.
    return (
      <Link
        href="/sign-in"
        title="Dev-Impersonation aktiv – Clerk ist ausgeschaltet"
        className="inline-flex shrink-0 items-center gap-2 rounded-full whitespace-nowrap border border-line bg-surface px-3 py-1.5 font-num text-xs text-ink transition-colors hover:border-line-strong hover:bg-surface-2"
      >
        <span aria-hidden className="size-1.5 rounded-full bg-accent" />
        {compact ? "Dev" : `Dev: ${label}`}
        <span className="sr-only">{compact ? ` (${label})` : ""} – Dev-Impersonation aktiv, Details anzeigen</span>
      </Link>
    );
  }

  return <UserButton />;
}
