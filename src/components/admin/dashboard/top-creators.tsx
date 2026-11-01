import { Gem } from "lucide-react";
import Link from "next/link";

import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatChf, formatNumber } from "@/lib/format";

export type TopCreator = {
  userId: string;
  handle: string;
  displayName: string;
  isPremium: boolean;
  activeSubscribers: number;
  gross30dRappen: number;
  net30dRappen: number;
};

export function TopCreators({ creators }: { creators: TopCreator[] }) {
  return (
    <Card title="Top-Creator · 30 T" action={<span className="font-mono text-xs text-ink-faint">nach Brutto</span>} flush>
      {creators.length === 0 ? (
        <div className="p-4">
          <EmptyState title="Noch keine Umsätze" description="Sobald Fans abonnieren, steht hier, wer am meisten bewegt." className="border-0 bg-transparent px-0 py-2" />
        </div>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH className="hidden w-8 sm:table-cell">#</TH>
              <TH>Creator</TH>
              <TH numeric>Abos</TH>
              <TH numeric>Brutto</TH>
              <TH numeric className="hidden sm:table-cell">
                Netto
              </TH>
            </TR>
          </THead>
          <TBody>
            {creators.map((c, i) => (
              <TR key={c.userId}>
                <TD className="hidden font-mono text-[12px] text-ink-faint tabular-nums sm:table-cell">{String(i + 1).padStart(2, "0")}</TD>
                <TD>
                  <Link href={`/admin/users?q=${encodeURIComponent(c.handle)}`} className="flex min-w-0 items-center gap-2.5 rounded-control hover:text-ink">
                    <Avatar name={c.displayName} size="sm" />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 truncate text-[13.5px] font-medium">
                        <span className="truncate">{c.displayName}</span>
                        {c.isPremium ? <Gem aria-label="Premium" className="size-3 shrink-0 text-premium" /> : null}
                      </span>
                      <span className="block truncate font-mono text-[11px] text-ink-faint">@{c.handle}</span>
                    </span>
                  </Link>
                </TD>
                <TD numeric>{formatNumber(c.activeSubscribers)}</TD>
                <TD numeric>{formatChf(c.gross30dRappen)}</TD>
                <TD numeric className="hidden text-ink-muted sm:table-cell">
                  {formatChf(c.net30dRappen)}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Card>
  );
}
