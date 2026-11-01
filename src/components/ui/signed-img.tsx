"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ComponentPropsWithoutRef } from "react";

/**
 * Signierte Medien-URLs leben nur 300 s (`MEDIA_URL_TTL_SECONDS`). Lädt ein Bild erst danach – `loading="lazy"`
 * unterhalb des sichtbaren Bereichs, Tab lange im Hintergrund, Zurück-Navigation aus dem Router-Cache –, antwortet
 * der Speicher mit 403. Dann holen wir die Seite einmal neu vom Server (`router.refresh()`): Alle URLs kommen frisch
 * signiert zurück, die `<img>` laden mit der neuen `src` nach, Client-State (Galerie-Index, offene Dialoge) bleibt.
 *
 * Gedrosselt und seitenweit geteilt: Viele abgelaufene Bilder lösen zusammen nur einen Refresh aus. Ein dauerhaft
 * defektes Bild erzeugt keine Schleife – seine neue URL scheitert sofort wieder, also innerhalb der Sperrfrist.
 */
const REFRESH_COOLDOWN_MS = 20_000;
let lastRefreshAt = 0;

/** `onError`-Handler für Bilder mit signierter URL: holt bei Bedarf frische URLs (gedrosselt). */
export function useSignedUrlRecovery(): () => void {
  const router = useRouter();
  return () => {
    const now = Date.now();
    if (now - lastRefreshAt < REFRESH_COOLDOWN_MS) return;
    lastRefreshAt = now;
    router.refresh();
  };
}

type SignedImgProps = Omit<ComponentPropsWithoutRef<"img">, "onError" | "onLoad" | "src"> & { src: string; alt: string };

/** URL ohne Query – bei signierten URLs der Speicherort; die Signatur steckt in der Query. */
function withoutQuery(url: string): string {
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

/**
 * `<img>` für signierte Medien-URLs, das sich nach Ablauf der Signatur selbst erholt. Ein bereits geladenes Bild
 * behält seine URL, wenn nach einem Refresh nur die Signatur neu ist (gleicher Pfad) – kein zweiter Download.
 */
export function SignedImg({ alt, src, ...props }: SignedImgProps) {
  const recover = useSignedUrlRecovery();
  const ref = useRef<HTMLImageElement>(null);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const shown = loadedSrc !== null && withoutQuery(loadedSrc) === withoutQuery(src) ? loadedSrc : src;

  // Vor der Hydration fertig geladene Bilder lösen kein `onLoad` mehr aus – einmal beim Mount nachsehen.
  useEffect(() => {
    const img = ref.current;
    if (img?.complete && img.naturalWidth > 0) setLoadedSrc(img.getAttribute("src"));
  }, []);

  return <img ref={ref} alt={alt} {...props} src={shown} onLoad={() => setLoadedSrc(shown)} onError={recover} />;
}
