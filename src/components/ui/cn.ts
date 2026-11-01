import { clsx, type ClassValue } from "clsx";

/**
 * Klassen zusammenführen (clsx). Kein tailwind-merge: bei Konflikten gewinnt die CSS-Reihenfolge,
 * nicht die Argument-Reihenfolge – `className`-Overrides daher nur für nicht kollidierende Utilities nutzen.
 */
export function cn(...classes: ClassValue[]): string {
  return clsx(classes);
}

export type { ClassValue };
