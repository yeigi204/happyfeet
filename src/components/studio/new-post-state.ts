import type { FieldErrors } from "@/server/errors";

/** Ergebnis des Uploads, wenn er nicht zur Post-Liste weiterleitet (Erfolg leitet immer weiter). */
export type NewPostField = "files" | "caption" | "visibility";

export type NewPostState =
  | { status: "idle" }
  | { status: "error"; error: string; fieldErrors: Partial<Record<NewPostField, string>> };

export const NEW_POST_IDLE: NewPostState = { status: "idle" };

export function toNewPostFieldErrors(fieldErrors: FieldErrors | undefined): Partial<Record<NewPostField, string>> {
  const out: Partial<Record<NewPostField, string>> = {};
  for (const key of ["files", "caption", "visibility"] as const) {
    const message = fieldErrors?.[key]?.[0];
    if (message) out[key] = message;
  }
  return out;
}

/** Query-Parameter für den Hinweis nach dem Upload auf `/studio/posts`. */
export const CREATED_PARAM = "neu";
