"use server";

import { approvePost, dismissReport, rejectPost, removePost, resolveReport } from "@/server/services/admin/moderation";

import { runAdminAction, textValue } from "../_lib/admin-action";

/** Post aus der Vorab-Prüfung freigeben. */
export async function approvePostAction(postId: string) {
  return runAdminAction((admin) => approvePost(admin, textValue(postId)));
}

/** Post aus der Vorab-Prüfung ablehnen (Begründung Pflicht, sieht der Creator). */
export async function rejectPostAction(postId: string, note: string) {
  return runAdminAction((admin) => rejectPost(admin, textValue(postId), textValue(note)));
}

/** Post entfernen (Begründung Pflicht) – erledigt alle offenen Meldungen dazu. */
export async function removePostAction(postId: string, note: string) {
  return runAdminAction((admin) => removePost(admin, textValue(postId), textValue(note)));
}

/** Meldung als berechtigt erledigen (Massnahme ausserhalb des Entfernens). */
export async function resolveReportAction(reportId: string, note?: string) {
  return runAdminAction((admin) => resolveReport(admin, textValue(reportId), textValue(note) || undefined));
}

/** Meldung als unbegründet verwerfen – der Post bleibt online. */
export async function dismissReportAction(reportId: string, note?: string) {
  return runAdminAction((admin) => dismissReport(admin, textValue(reportId), textValue(note) || undefined));
}
