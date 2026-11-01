"use client";

import { ArrowLeft, ArrowRight, Globe, ImagePlus, LoaderCircle, Lock, Plus, ShieldCheck, TriangleAlert, X } from "lucide-react";
import { unstable_rethrow } from "next/navigation";
import {
  startTransition,
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
  type ReactNode,
} from "react";

import { Button, buttonClasses } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { POST_LIMITS } from "@/lib/domain/posts";
import type { PostVisibility } from "@/lib/domain/types";
import { formatNumber } from "@/lib/format";

import { NEW_POST_IDLE, type NewPostField, type NewPostState } from "./new-post-state";
import { ACCEPT_ATTRIBUTE, formatMegabytes, MAX_IMAGE_MB, moveItem, screenFiles, type RejectedFile } from "./upload-rules";

type Item = { id: string; file: File; url: string };

export type NewPostFormProps = {
  action: (state: NewPostState, formData: FormData) => Promise<NewPostState>;
  /** Vorab-Prüfung aktiv? Dann heisst der Knopf „Zur Prüfung einreichen“. */
  premoderation: { active: boolean; remaining: number; total: number };
};

const REORDER_TYPE = "application/x-happyfeet-image-index";

/** Übertragung abgebrochen (Netz, Server-Fehler, zu grosse Anfrage) – die Auswahl bleibt stehen. */
const UPLOAD_FAILED =
  "Der Upload hat nicht geklappt – deine Bilder sind noch ausgewählt. Prüf deine Verbindung und versuch es nochmal. Bei sehr grossen Dateien hilft es, weniger Bilder auf einmal hochzuladen.";

const VISIBILITY_OPTIONS: { value: PostVisibility; label: string; text: string; icon: ReactNode }[] = [
  {
    value: "subscribers",
    label: "Nur Abonnenten",
    text: "Fans ohne Abo sehen eine verpixelte Vorschau des ersten Bildes.",
    icon: <Lock aria-hidden />,
  },
  {
    value: "public",
    label: "Öffentlich",
    text: "Alle sehen die Bilder – gut, um neue Fans auf dich aufmerksam zu machen.",
    icon: <Globe aria-hidden />,
  },
];

function hasType(event: DragEvent, type: string): boolean {
  return Array.from(event.dataTransfer.types).includes(type);
}

/**
 * Neuer Post: Bilder per Drag & Drop oder Dateiauswahl, Live-Vorschau (Object-URLs, beim Entfernen und
 * Verlassen wieder freigegeben), Reihenfolge per Ziehen oder Pfeil-Knöpfen, Sichtbarkeit und Text.
 * Prüft vorab wie `POST_LIMITS`; verbindlich prüft der Server. Erfolg leitet zur Post-Liste weiter.
 */
export function NewPostForm({ action, premoderation }: NewPostFormProps) {
  // Wirft die Server Action (Abbruch, 500, Body-Limit), landete das sonst in der Fehlergrenze und alle
  // gewählten Bilder wären weg. Die Weiterleitung nach Erfolg ist ein Router-Fehler und muss durch.
  const [state, formAction, pending] = useActionState(async (prev: NewPostState, formData: FormData): Promise<NewPostState> => {
    try {
      return await action(prev, formData);
    } catch (error) {
      unstable_rethrow(error);
      console.error("[studio] Upload fehlgeschlagen", error);
      return { status: "error", error: UPLOAD_FAILED, fieldErrors: {} };
    }
  }, NEW_POST_IDLE);
  const [items, setItems] = useState<Item[]>([]);
  const [rejected, setRejected] = useState<RejectedFile[]>([]);
  const [visibility, setVisibility] = useState<PostVisibility>("subscribers");
  const [caption, setCaption] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [fileDragActive, setFileDragActive] = useState(false);
  const [reorder, setReorder] = useState<{ from: number; over: number | null } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [edited, setEdited] = useState<{ after: NewPostState; fields: NewPostField[] }>({ after: state, fields: [] });

  const inputRef = useRef<HTMLInputElement>(null);
  const pickButtonRef = useRef<HTMLButtonElement>(null);
  const dragDepth = useRef(0);
  const nextId = useRef(0);
  const itemsRef = useRef(items);
  const headingId = useId();
  const imagesHintId = useId();
  const imagesErrorId = useId();

  // Object-URLs beim Verlassen der Seite freigeben (Entfernen gibt sie sofort frei).
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  useEffect(() => () => itemsRef.current.forEach((item) => URL.revokeObjectURL(item.url)), []);

  // Daneben fallengelassene Dateien sollen die Seite nicht verlassen (Browser würde das Bild öffnen).
  useEffect(() => {
    const guard = (event: globalThis.DragEvent) => {
      if (event.dataTransfer && Array.from(event.dataTransfer.types).includes("Files")) event.preventDefault();
    };
    window.addEventListener("dragover", guard);
    window.addEventListener("drop", guard);
    return () => {
      window.removeEventListener("dragover", guard);
      window.removeEventListener("drop", guard);
    };
  }, []);

  const editedFields = edited.after === state ? edited.fields : [];
  const markEdited = (field: NewPostField) =>
    setEdited((prev) => ({ after: state, fields: [...(prev.after === state ? prev.fields : []), field] }));
  const serverError = (field: NewPostField) =>
    state.status === "error" && !editedFields.includes(field) ? state.fieldErrors[field] : undefined;

  const filesError = localError ?? serverError("files");
  const captionError = serverError("caption");
  const visibilityError = serverError("visibility");
  // Formweite Fehler (z. B. Upload abgebrochen) verschwinden, sobald die Auswahl oder ein Feld geändert wird.
  const formError = state.status === "error" && Object.keys(state.fieldErrors).length === 0 && editedFields.length === 0 ? state.error : null;
  const full = items.length >= POST_LIMITS.maxImages;
  const captionRatio = caption.length / POST_LIMITS.maxCaptionLength;

  function addFiles(list: FileList | File[] | null) {
    if (!list || pending) return;
    const { accepted, rejected: skipped } = screenFiles(Array.from(list), items.map((item) => item.file));
    const added = accepted.map((file) => ({ id: `bild-${nextId.current++}`, file, url: URL.createObjectURL(file) }));
    setItems((prev) => [...prev, ...added]);
    setRejected(skipped);
    setLocalError(null);
    markEdited("files");
    const parts: string[] = [];
    if (added.length > 0) parts.push(added.length === 1 ? "1 Bild hinzugefügt." : `${added.length} Bilder hinzugefügt.`);
    if (skipped.length > 0) parts.push(skipped.length === 1 ? "1 Datei übersprungen." : `${skipped.length} Dateien übersprungen.`);
    setAnnouncement(parts.join(" "));
  }

  function removeItem(index: number) {
    const item = items[index];
    if (!item || pending) return;
    URL.revokeObjectURL(item.url);
    setItems((prev) => prev.filter((other) => other.id !== item.id));
    setAnnouncement(`Bild ${index + 1} entfernt.`);
    markEdited("files");
    // Der Knopf verschwindet mit dem Bild – Fokus auf „Bilder auswählen“ bzw. „Weitere Bilder“.
    requestAnimationFrame(() => pickButtonRef.current?.focus());
  }

  function move(from: number, to: number) {
    if (pending || to < 0 || to >= items.length) return;
    setItems((prev) => moveItem(prev, from, to));
    setAnnouncement(`Bild ${from + 1} ist jetzt an Position ${to + 1}${to === 0 ? " und das Titelbild" : ""}.`);
  }

  function openPicker() {
    inputRef.current?.click();
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (items.length < POST_LIMITS.minImages) {
      setLocalError("Wähle mindestens ein Bild aus.");
      pickButtonRef.current?.focus();
      return;
    }
    const formData = new FormData();
    formData.set("caption", caption);
    formData.set("visibility", visibility);
    for (const item of items) formData.append("files", item.file, item.file.name);
    setEdited({ after: state, fields: [] });
    startTransition(() => formAction(formData));
  }

  // ─── Drag & Drop: Dateien hinzufügen ───────────────────────────────────────
  const dropHandlers = {
    onDragEnter: (event: DragEvent) => {
      if (!hasType(event, "Files") || pending) return;
      dragDepth.current += 1;
      setFileDragActive(true);
    },
    onDragOver: (event: DragEvent) => {
      if (!hasType(event, "Files") || pending) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    },
    onDragLeave: (event: DragEvent) => {
      if (!hasType(event, "Files")) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setFileDragActive(false);
    },
    onDrop: (event: DragEvent) => {
      if (!hasType(event, "Files")) return;
      event.preventDefault();
      dragDepth.current = 0;
      setFileDragActive(false);
      addFiles(event.dataTransfer.files);
    },
  };

  return (
    <form onSubmit={onSubmit} noValidate aria-busy={pending || undefined} className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-10">
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {/* ─── Bilder ─────────────────────────────────────────────────────── */}
      <section aria-labelledby={headingId} className="min-w-0" {...dropHandlers}>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 id={headingId} className="text-[13px] font-semibold text-ink">
            Bilder
          </h2>
          <p className={cn("font-num text-xs tabular-nums", full ? "text-ink" : "text-ink-faint")}>
            {items.length} / {POST_LIMITS.maxImages}
          </p>
        </div>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_ATTRIBUTE}
          tabIndex={-1}
          aria-hidden
          className="sr-only"
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = "";
          }}
        />

        {items.length === 0 ? (
          <div
            className={cn(
              "relative grid min-h-72 place-items-center rounded-card border-2 border-dashed px-5 py-10 text-center transition-colors duration-100 sm:min-h-96",
              fileDragActive ? "border-accent bg-accent-soft/50" : filesError ? "border-danger/60 bg-surface" : "border-line-strong bg-surface",
            )}
          >
            <div className="grid justify-items-center">
              <span
                aria-hidden
                className={cn(
                  "grid size-14 place-items-center rounded-full border transition-colors",
                  fileDragActive ? "border-accent bg-surface text-accent" : "border-line-strong text-ink-muted",
                )}
              >
                <ImagePlus className="size-6" />
              </span>
              <p className="mt-5 font-display text-2xl leading-tight font-extrabold tracking-[-0.025em] text-ink">
                {fileDragActive ? "Loslassen zum Hinzufügen" : (
                  <>
                    <span className="hidden sm:inline">Bilder hierher ziehen</span>
                    <span className="sm:hidden">Bilder auswählen</span>
                  </>
                )}
              </p>
              <p id={imagesHintId} className="mt-2 max-w-sm text-sm leading-relaxed text-ink-muted">
                JPEG, PNG oder WebP · bis {MAX_IMAGE_MB} MB pro Bild · {POST_LIMITS.minImages} bis {POST_LIMITS.maxImages} Bilder. Das erste Bild ist das Titelbild.
              </p>
              {/* Nativer Knopf: die UI-Primitives reichen keine Refs durch (Fokus nach Entfernen/Fehler). */}
              <button
                ref={pickButtonRef}
                type="button"
                className={buttonClasses({ variant: "secondary", className: "mt-6" })}
                onClick={openPicker}
                disabled={pending}
                aria-describedby={[imagesHintId, filesError ? imagesErrorId : null].filter(Boolean).join(" ")}
              >
                <span className="hidden sm:inline">oder Dateien auswählen</span>
                <span className="sm:hidden">Dateien auswählen</span>
              </button>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              "rounded-card border-2 border-dashed p-2 transition-colors duration-100 sm:p-3",
              fileDragActive ? "border-accent bg-accent-soft/40" : "border-transparent",
            )}
          >
            <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 xl:grid-cols-4">
              {items.map((item, index) => (
                <li
                  key={item.id}
                  draggable={!pending}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData(REORDER_TYPE, String(index));
                    setReorder({ from: index, over: null });
                  }}
                  onDragOver={(event) => {
                    if (!hasType(event, REORDER_TYPE)) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    if (reorder && reorder.over !== index) setReorder({ ...reorder, over: index });
                  }}
                  onDrop={(event) => {
                    if (!hasType(event, REORDER_TYPE)) return;
                    event.preventDefault();
                    event.stopPropagation();
                    const from = Number(event.dataTransfer.getData(REORDER_TYPE));
                    if (Number.isInteger(from)) move(from, index);
                    setReorder(null);
                  }}
                  onDragEnd={() => setReorder(null)}
                  className={cn(
                    "group relative min-w-0 overflow-hidden rounded-card border bg-surface transition-[opacity,border-color] duration-100",
                    reorder?.from === index ? "opacity-40" : "",
                    reorder && reorder.over === index && reorder.from !== index ? "border-accent ring-2 ring-accent/40" : "border-line",
                    !pending && "cursor-grab active:cursor-grabbing",
                  )}
                >
                  <div className="relative aspect-[4/5] bg-surface-2">
                    <img
                      src={item.url}
                      alt={`Bild ${index + 1}: ${item.file.name}`}
                      decoding="async"
                      draggable={false}
                      className="absolute inset-0 size-full object-cover"
                    />
                    <span
                      className={cn(
                        "absolute top-1.5 left-1.5 inline-flex h-[22px] items-center rounded-[4px] px-1.5 font-num text-[11px] font-medium tabular-nums",
                        index === 0 ? "bg-accent text-accent-ink" : "bg-ink/75 text-canvas",
                      )}
                    >
                      {index === 0 ? "Titelbild" : index + 1}
                    </span>
                    <span className="absolute right-1.5 bottom-1.5 rounded-full bg-[rgb(20_10_14/0.55)] px-2 py-0.5 font-num text-[11px] font-semibold text-white">
                      {formatMegabytes(item.file.size)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-1 border-t border-line px-1 py-1">
                    <span className="flex">
                      <IconButton label={`Bild ${index + 1} nach vorne`} onClick={() => move(index, index - 1)} disabled={pending || index === 0}>
                        <ArrowLeft />
                      </IconButton>
                      <IconButton
                        label={`Bild ${index + 1} nach hinten`}
                        onClick={() => move(index, index + 1)}
                        disabled={pending || index === items.length - 1}
                      >
                        <ArrowRight />
                      </IconButton>
                    </span>
                    <IconButton label={`Bild ${index + 1} entfernen`} onClick={() => removeItem(index)} disabled={pending} tone="danger">
                      <X />
                    </IconButton>
                  </div>
                </li>
              ))}
              {!full ? (
                <li className="min-w-0">
                  <button
                    ref={pickButtonRef}
                    type="button"
                    onClick={openPicker}
                    disabled={pending}
                    aria-describedby={imagesHintId}
                    className={cn(
                      "grid size-full min-h-40 place-items-center rounded-card border-2 border-dashed border-line-strong bg-surface px-3 text-center transition-colors",
                      "hover:border-ink-faint hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                      "disabled:pointer-events-none disabled:opacity-45",
                    )}
                  >
                    <span className="grid justify-items-center gap-2">
                      <Plus aria-hidden className="size-6 text-ink-muted" />
                      <span className="text-sm font-medium text-ink">Weitere Bilder</span>
                      <span className="font-num text-[11px] text-ink-faint tabular-nums">noch {POST_LIMITS.maxImages - items.length}</span>
                    </span>
                  </button>
                </li>
              ) : null}
            </ol>
            <p id={imagesHintId} className="mt-3 px-1 text-xs leading-relaxed text-ink-muted">
              Ziehen oder Pfeile zum Sortieren · das erste Bild ist das Titelbild
              {visibility === "subscribers" ? " und erscheint verpixelt für Fans ohne Abo" : ""} · bis {MAX_IMAGE_MB} MB pro Bild.
            </p>
          </div>
        )}

        {filesError ? (
          <p id={imagesErrorId} role="alert" className="mt-3 flex items-center gap-1.5 text-sm font-medium text-danger">
            <span aria-hidden className="inline-block size-1.5 rounded-full bg-danger" />
            {filesError}
          </p>
        ) : null}

        {rejected.length > 0 ? (
          <div className="mt-3 rounded-control bg-warning-soft px-3.5 py-3">
            <div className="flex items-start justify-between gap-3">
              <p className="flex items-center gap-2 text-sm font-medium text-ink">
                <TriangleAlert aria-hidden className="size-4 text-warning" />
                {rejected.length === 1 ? "1 Datei übersprungen" : `${formatNumber(rejected.length)} Dateien übersprungen`}
              </p>
              <button
                type="button"
                onClick={() => setRejected([])}
                className="-m-1 grid size-7 shrink-0 place-items-center rounded-control text-ink-muted hover:bg-surface hover:text-ink"
              >
                <X aria-hidden className="size-4" />
                <span className="sr-only">Hinweis schliessen</span>
              </button>
            </div>
            <ul className="mt-2 grid gap-1 text-[13px] text-ink-muted">
              {rejected.map((file, i) => (
                <li key={`${file.name}-${i}`} className="flex min-w-0 gap-1.5">
                  <span className="truncate font-num text-ink">{file.name}</span>
                  <span className="shrink-0">– {file.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {/* ─── Details ────────────────────────────────────────────────────── */}
      <div className="grid gap-6 lg:sticky lg:top-24">
        <fieldset className="grid gap-2" aria-describedby={visibilityError ? "visibility-error" : undefined}>
          <legend className="mb-1.5 text-[13px] font-semibold text-ink">Wer sieht den Post?</legend>
          {VISIBILITY_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={cn(
                "flex cursor-pointer gap-3 rounded-control border bg-surface p-3.5 transition-colors duration-100",
                "has-checked:border-accent has-checked:bg-accent-soft hover:border-ink-faint",
                "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus",
                visibility !== option.value && "border-line-strong",
              )}
            >
              <input
                type="radio"
                name="visibility"
                value={option.value}
                checked={visibility === option.value}
                onChange={() => {
                  setVisibility(option.value);
                  markEdited("visibility");
                }}
                disabled={pending}
                className="mt-0.5 size-4 shrink-0 cursor-pointer accent-accent focus-visible:outline-none"
              />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-bold text-ink [&_svg]:size-3.5 [&_svg]:text-ink-muted">
                  {option.icon}
                  {option.label}
                </span>
                <span className="mt-0.5 block text-[13px] leading-snug text-ink-muted">{option.text}</span>
              </span>
            </label>
          ))}
          {visibilityError ? (
            <p id="visibility-error" role="alert" className="text-xs font-medium text-danger">
              {visibilityError}
            </p>
          ) : null}
        </fieldset>

        <Field
          label="Text (optional)"
          error={captionError}
          hint={
            <span className="flex justify-between gap-3">
              <span>Erscheint unter den Bildern.</span>
              <span className={cn("shrink-0 font-num tabular-nums", captionRatio >= 1 ? "text-danger" : captionRatio > 0.9 ? "text-warning" : undefined)}>
                {formatNumber(caption.length)} / {formatNumber(POST_LIMITS.maxCaptionLength)}
              </span>
            </span>
          }
        >
          <Textarea
            name="caption"
            rows={5}
            maxLength={POST_LIMITS.maxCaptionLength}
            value={caption}
            onChange={(event) => {
              setCaption(event.target.value);
              markEdited("caption");
            }}
            placeholder="Erzähl kurz, was auf den Bildern zu sehen ist."
            disabled={pending}
          />
        </Field>

        {premoderation.active ? (
          <div className="flex gap-3 rounded-control bg-warning-soft p-3.5">
            <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
            <p className="text-[13px] leading-relaxed text-warning">
              <span className="font-bold">Vorab-Prüfung:</span> Deine ersten {premoderation.total} Posts schauen wir uns an, bevor sie
              online gehen.{" "}
              {premoderation.remaining === 1
                ? "Noch eine Freigabe, dann geht jeder neue Post sofort online."
                : `Noch ${premoderation.remaining} Freigaben, dann geht jeder neue Post sofort online.`}
            </p>
          </div>
        ) : null}

        {formError ? (
          <p role="alert" className="rounded-control bg-danger-soft px-3 py-2.5 text-sm font-medium text-danger">
            {formError}
          </p>
        ) : null}

        <div className="grid gap-2 border-t border-line pt-5">
          <Button type="submit" variant="primary" size="lg" disabled={pending} aria-busy={pending || undefined} className="w-full">
            {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : null}
            {pending ? "Wird hochgeladen …" : premoderation.active ? "Zur Prüfung einreichen" : "Veröffentlichen"}
          </Button>
          <p className="text-center text-xs text-ink-faint" aria-live="polite">
            {pending
              ? `${items.length === 1 ? "1 Bild wird" : `${items.length} Bilder werden`} verarbeitet – bitte die Seite offen lassen.`
              : items.length > 0
                ? `${items.length === 1 ? "1 Bild" : `${items.length} Bilder`} · ${visibility === "public" ? "öffentlich" : "nur für Abonnenten"}`
                : "Noch keine Bilder ausgewählt"}
          </p>
        </div>
      </div>
    </form>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  tone,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "danger";
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={cn(
        "grid size-9 place-items-center rounded-control text-ink-muted transition-colors [&_svg]:size-4",
        "hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
        "disabled:pointer-events-none disabled:opacity-30",
        tone === "danger" && "hover:text-danger",
      )}
    >
      {children}
      <span className="sr-only">{label}</span>
    </button>
  );
}
