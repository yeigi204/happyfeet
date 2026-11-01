import { Images, LockKeyhole } from "lucide-react";
import type { ReactNode } from "react";

import { SignedImg } from "@/components/ui/signed-img";

import type { GalleryImage } from "./post-gallery";

/**
 * Gesperrter Post: nur die verpixelte Vorschau (vom Server, `isPreview`) – das Original erreicht den
 * Browser nie. Darüber der Hinweis „Nur für Abonnenten“ und der Abo-Aufruf (`action`).
 */
export function LockedOverlay({ preview, imageCount, action }: { preview: GalleryImage | undefined; imageCount: number; action?: ReactNode }) {
  const ratio = preview && preview.width > 0 && preview.height > 0 ? Math.min(Math.max(preview.width / preview.height, 4 / 5), 3 / 2) : 4 / 5;

  return (
    <div className="relative isolate overflow-hidden rounded-card bg-surface-2" style={{ aspectRatio: String(ratio) }}>
      {preview ? (
        <SignedImg
          src={preview.url}
          alt="Verpixelte Vorschau – nur für Abonnenten sichtbar"
          width={preview.width}
          height={preview.height}
          loading="lazy"
          decoding="async"
          draggable={false}
          className="absolute inset-0 -z-10 size-full scale-110 object-cover blur-lg"
        />
      ) : null}
      <div aria-hidden className="absolute inset-0 -z-10 bg-canvas/35" />

      {imageCount > 1 ? (
        <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-ink/70 px-2 py-1 font-num text-[11px] leading-none text-canvas">
          <Images aria-hidden className="size-3" />
          {imageCount} Bilder
        </span>
      ) : null}

      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <span aria-hidden className="grid size-12 place-items-center rounded-full border border-line-strong bg-surface text-ink">
          <LockKeyhole className="size-5" strokeWidth={1.75} />
        </span>
        <div>
          <p className="font-display text-xl leading-tight font-bold tracking-[-0.03em] text-ink">Nur für Abonnenten</p>
          <p className="mt-1 text-sm text-ink-muted">
            {imageCount > 1 ? `${imageCount} Bilder in voller Auflösung` : "Das Bild in voller Auflösung"} – nach dem Abo sofort sichtbar.
          </p>
        </div>
        {action}
      </div>
    </div>
  );
}
