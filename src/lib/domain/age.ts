type CalendarDate = { year: number; month: number; day: number };

const ADULT_AGE = 18;
const BIRTH_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const zurichDateFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Zurich",
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

function parseBirthDate(birthDate: string): CalendarDate | null {
  const match = BIRTH_DATE_PATTERN.exec(birthDate);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth) return null;
  return { year, month, day };
}

function zurichCalendarDate(now: Date): CalendarDate {
  const parts = Object.fromEntries(zurichDateFormat.formatToParts(now).map((p) => [p.type, p.value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}

/**
 * Volle Lebensjahre am heutigen Kalendertag in Europe/Zurich.
 * Wer am 29.02. geboren ist, hat in Nicht-Schaltjahren erst am 01.03. Geburtstag.
 * Wirft `RangeError` bei einem ungültigen Datum (Format `YYYY-MM-DD`).
 */
export function ageInYears(birthDate: string, now: Date): number {
  const birth = parseBirthDate(birthDate);
  if (!birth) throw new RangeError(`Invalid birth date: ${JSON.stringify(birthDate)}`);
  const today = zurichCalendarDate(now);
  const hadBirthdayThisYear =
    today.month > birth.month || (today.month === birth.month && today.day >= birth.day);
  return today.year - birth.year - (hadBirthdayThisYear ? 0 : 1);
}

/** Mindestens 18 Jahre alt? Ungültige Daten gelten als nicht volljährig (fail closed). */
export function isAdult(birthDate: string, now: Date): boolean {
  if (!parseBirthDate(birthDate)) return false;
  return ageInYears(birthDate, now) >= ADULT_AGE;
}
