"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { CREATED_PARAM, toNewPostFieldErrors, type NewPostState } from "@/components/studio/new-post-state";
import { POST_LIMITS } from "@/lib/domain/posts";
import type { PostVisibility } from "@/lib/domain/types";
import { toActionResult } from "@/server/action-result";
import { requireCreator } from "@/server/auth/viewer";
import { createPost } from "@/server/services/posts";

const MB = 1024 * 1024;

function fail(error: string, field: "files" | "caption" | "visibility"): NewPostState {
  return { status: "error", error, fieldErrors: { [field]: error } };
}

/**
 * Neuer Post aus dem Studio-Formular (FormData: `caption`, `visibility`, `files[]`).
 * Grobe Grenzen prüfen wir vor dem Einlesen, damit keine 100 MB umsonst in den Speicher wandern;
 * verbindlich validiert `createPost` (inkl. Bildformat via sharp). Erfolg → Post-Liste mit Hinweis.
 */
export async function createPostAction(_prev: NewPostState, formData: FormData): Promise<NewPostState> {
  void _prev;
  const viewer = await requireCreator();

  const rawCaption = formData.get("caption");
  const caption = typeof rawCaption === "string" ? rawCaption : "";
  // Unbekannte Werte lehnt `createPost` mit einem Feldfehler ab.
  const visibility = String(formData.get("visibility") ?? "") as PostVisibility;
  const uploads = formData.getAll("files").filter((entry): entry is File => typeof entry !== "string" && entry.size > 0);

  if (uploads.length < POST_LIMITS.minImages || uploads.length > POST_LIMITS.maxImages) {
    return fail(`Bitte wähle ${POST_LIMITS.minImages} bis ${POST_LIMITS.maxImages} Bilder aus.`, "files");
  }
  const tooLarge = uploads.find((file) => file.size > POST_LIMITS.maxImageBytes);
  if (tooLarge) {
    return fail(`„${tooLarge.name}“ ist grösser als ${POST_LIMITS.maxImageBytes / MB} MB.`, "files");
  }

  const result = await toActionResult(async () => {
    const files = await Promise.all(
      uploads.map(async (file) => ({ bytes: Buffer.from(await file.arrayBuffer()), name: file.name, type: file.type })),
    );
    return createPost(viewer, { caption, visibility, files });
  });
  if (!result.ok) {
    const fieldErrors = toNewPostFieldErrors(result.fieldErrors);
    // sharp erkennt kaputte/getarnte Dateien – das gehört zu den Bildern, nicht ins Leere.
    if (Object.keys(fieldErrors).length === 0 && /bild|datei|format/i.test(result.error)) fieldErrors.files = result.error;
    return { status: "error", error: result.error, fieldErrors };
  }

  revalidatePath("/studio", "layout");
  revalidatePath("/c/[handle]", "page");
  revalidatePath("/feed");
  redirect(`/studio/posts?${CREATED_PARAM}=${result.data.moderationStatus}`);
}
