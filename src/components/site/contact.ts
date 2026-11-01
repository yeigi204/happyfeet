/**
 * Öffentliche Kontaktangaben aus der Umgebung (`NEXT_PUBLIC_…`, zur Build-Zeit eingesetzt).
 * Nicht gesetzt → `null`: Die Oberfläche blendet Kontakt-Links dann aus, statt ins Leere (`#`) zu zeigen.
 */
const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

export function supportEmail(): string | null {
  const value = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim();
  return value && EMAIL.test(value) ? value : null;
}

/** `mailto:` an den Support mit vorbelegtem Betreff. */
export function supportMailto(email: string, subject: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}`;
}

/** Rechtstexte – nur Einträge mit gesetzter URL erscheinen (bis zum Launch keine Platzhalter-Links). */
export function legalLinks(): { href: string; label: string }[] {
  return [
    { href: process.env.NEXT_PUBLIC_LEGAL_IMPRINT_URL, label: "Impressum" },
    { href: process.env.NEXT_PUBLIC_LEGAL_TERMS_URL, label: "AGB" },
    { href: process.env.NEXT_PUBLIC_LEGAL_PRIVACY_URL, label: "Datenschutz" },
  ].flatMap((link) => {
    const href = link.href?.trim();
    return href && (href.startsWith("/") || href.startsWith("https://")) ? [{ href, label: link.label }] : [];
  });
}
