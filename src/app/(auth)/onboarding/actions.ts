"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { normalizeHandle, validateHandle } from "@/lib/domain/handles";
import { getViewer, requireViewer } from "@/server/auth/viewer";
import { toActionResult } from "@/server/action-result";
import { ValidationError, type FieldErrors } from "@/server/errors";
import { completeOnboarding, HandleTakenError, isHandleAvailable } from "@/server/services/users";

export type OnboardingValues = {
  handle: string;
  displayName: string;
  birthDate: string;
  confirmAdult: boolean;
};

export type OnboardingFormState = {
  error?: string;
  fieldErrors?: FieldErrors;
  values?: OnboardingValues;
};

export type HandleCheck =
  | { status: "available"; handle: string }
  | { status: "taken"; handle: string }
  | { status: "invalid"; reason: string };

function readValues(formData: FormData): OnboardingValues {
  const text = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  return {
    handle: text("handle"),
    displayName: text("displayName"),
    birthDate: text("birthDate"),
    confirmAdult: formData.get("confirmAdult") === "on",
  };
}

export async function submitOnboarding(_prev: OnboardingFormState, formData: FormData): Promise<OnboardingFormState> {
  const viewer = await requireViewer();
  if (viewer.status === "banned") redirect("/banned");
  if (viewer.onboarded) redirect("/explore");

  const values = readValues(formData);
  const result = await toActionResult(async () => {
    try {
      await completeOnboarding(viewer, values);
    } catch (error) {
      if (error instanceof HandleTakenError) {
        throw new ValidationError(error.message, { handle: [error.message] });
      }
      throw error;
    }
  });

  if (!result.ok) {
    return { error: result.error, fieldErrors: result.fieldErrors, values };
  }

  revalidatePath("/", "layout");
  redirect("/explore");
}

/** Live-Prüfung im Formular (entprellt). Verbindlich bleibt die Prüfung in `completeOnboarding`. */
export async function checkHandleAvailability(input: string): Promise<HandleCheck> {
  const viewer = await getViewer();
  if (!viewer) return { status: "invalid", reason: "Bitte melde dich an." };

  const handle = normalizeHandle(String(input ?? ""));
  const validation = validateHandle(handle);
  if (!validation.ok) return { status: "invalid", reason: validation.reason };
  return (await isHandleAvailable(handle)) ? { status: "available", handle } : { status: "taken", handle };
}
