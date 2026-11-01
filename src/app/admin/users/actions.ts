"use server";

import { banUser, unbanUser } from "@/server/services/admin/users";

import { runAdminAction, textValue } from "../_lib/admin-action";

/** Nutzer sperren – Grund Pflicht; sich selbst und Admins sperrt der Service nie. */
export async function banUserAction(userId: string, reason: string) {
  return runAdminAction((admin) => banUser(admin, textValue(userId), textValue(reason)));
}

/** Sperre aufheben. */
export async function unbanUserAction(userId: string) {
  return runAdminAction((admin) => unbanUser(admin, textValue(userId)));
}
