/** „1 Post“ / „14 Posts“ – mit Schweizer Tausendertrennzeichen. */
export function countLabel(n: number, singular: string, plural: string, format: (n: number) => string): string {
  return `${format(n)} ${n === 1 ? singular : plural}`;
}

/**
 * Text zur Vorab-Prüfung neuer Posts, passend zur Einstellung (0–50): 0 = Prüfung aus, 1 = Einzahl, sonst Mehrzahl.
 * So entsteht nie „die ersten 0 Posts“ oder „ersten 1 Posts“.
 */
export function premoderationCopy(
  count: number,
  copy: { off: string; one: string; many: (count: string) => string },
  format: (n: number) => string = String,
): string {
  if (count <= 0) return copy.off;
  if (count === 1) return copy.one;
  return copy.many(format(count));
}
