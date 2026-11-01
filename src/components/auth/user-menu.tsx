import { UserButton } from "@clerk/nextjs";

import { isDevImpersonation } from "@/server/auth/dev-impersonation";
import { getViewer } from "@/server/auth/viewer";

/**
 * Konto-Menü für die Kopfzeile (Server Component).
 * Mit Clerk: `<UserButton />`. Bei Dev-Impersonation gibt es kein Clerk – dann ein Chip „Dev: @handle“.
 */
export async function UserMenu() {
  if (isDevImpersonation()) {
    const viewer = await getViewer();
    const label = viewer?.handle ? `@${viewer.handle}` : (viewer?.clerkId ?? "unbekannt");
    return (
      <span
        title="Dev-Impersonation aktiv – Clerk ist ausgeschaltet"
        className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 font-mono text-xs text-ink"
      >
        <span aria-hidden className="size-1.5 rounded-full bg-accent" />
        Dev: {label}
      </span>
    );
  }

  return <UserButton />;
}
