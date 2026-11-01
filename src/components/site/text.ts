/** „1 Post“ / „14 Posts“ – mit Schweizer Tausendertrennzeichen. */
export function countLabel(n: number, singular: string, plural: string, format: (n: number) => string): string {
  return `${format(n)} ${n === 1 ? singular : plural}`;
}
