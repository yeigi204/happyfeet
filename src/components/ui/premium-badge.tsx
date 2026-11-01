import { Badge } from "./badge";

/** Kennzeichnung für Premium-Creator. `compact`: nur Icon (Text bleibt für Screenreader). */
export function PremiumBadge({ compact, className }: { compact?: boolean; className?: string }) {
  if (compact) {
    return (
      <Badge tone="premium" className={className} title="Premium">
        <span className="sr-only">Premium</span>
      </Badge>
    );
  }
  return (
    <Badge tone="premium" className={className}>
      Premium
    </Badge>
  );
}
