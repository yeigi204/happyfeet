import type { ReactNode } from "react";

import { requireCreator } from "@/server/auth/viewer";

/**
 * Schranke für alle Studio-Seiten ausser der Bewerbung: nur mit Creator-Profil (egal welcher Prüfstatus).
 * Läuft vor allen Lade-Grenzen darunter – Nutzer ohne Profil bekommen so eine echte Weiterleitung zur
 * Bewerbung statt erst ein Lade-Skelett. Die Seiten prüfen zusätzlich selbst.
 *
 * Bewusst KEIN `loading.tsx` auf dieser Ebene: es würde jede Studio-Seite umschliessen, und Prefetch
 * bzw. Streaming zeigten dann überall das Kennzahlen-Skelett (auch vor Formular und Post-Raster).
 * Deshalb liegen Übersicht und Post-Liste in eigenen Gruppen `(overview)` / `posts/(list)` – jedes
 * Skelett gilt genau für seine Seite. Seiten ohne eigenes Skelett behalten bis zum Laden die alte Ansicht.
 */
export default async function CreatorStudioLayout({ children }: { children: ReactNode }) {
  await requireCreator();
  return children;
}
