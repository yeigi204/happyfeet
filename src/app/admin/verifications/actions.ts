"use server";

import { approveCreator, rejectCreator } from "@/server/services/admin/verifications";

import { runAdminAction, textValue } from "../_lib/admin-action";

/** Creator-Antrag freigeben (Notiz optional). */
export async function approveCreatorAction(userId: string, note?: string) {
  return runAdminAction((admin) => approveCreator(admin, textValue(userId), textValue(note) || undefined));
}

/** Creator-Antrag ablehnen – die Begründung ist Pflicht (prüft der Service). */
export async function rejectCreatorAction(userId: string, note: string) {
  return runAdminAction((admin) => rejectCreator(admin, textValue(userId), textValue(note)));
}
