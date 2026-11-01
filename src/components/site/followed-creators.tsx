import Link from "next/link";

import { Avatar } from "@/components/ui/avatar";

export type FollowedCreator = { handle: string; displayName: string; avatarUrl: string | null };

/** Reihe „Deine Creator“ oben im Feed: Avatare mit Ring, horizontal scrollbar. Ohne Abos: nichts. */
export function FollowedCreators({ items }: { items: FollowedCreator[] }) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="Deine Creator" className="-mx-4 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-3.5 pb-1">
        {items.map((c) => (
          <li key={c.handle}>
            <Link href={`/c/${c.handle}`} className="grid w-[80px] justify-items-center gap-1.5 rounded-control text-center">
              <Avatar ring name={c.displayName} src={c.avatarUrl} size="xl" />
              <span className="w-full truncate text-[11px] font-semibold text-ink-muted">{c.handle}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
