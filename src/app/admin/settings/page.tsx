import type { Metadata } from "next";

import { SettingsForm } from "@/components/admin/settings/settings-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdmin } from "@/server/auth/viewer";
import { getPlatformSettings } from "@/server/services/settings";

export const metadata: Metadata = { title: "Einstellungen" };

export default async function SettingsPage() {
  await requireAdmin();
  const settings = await getPlatformSettings();
  const { updatedAt, ...values } = settings;

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Verwaltung · Plattform"
        title="Einstellungen"
        description="Provision, Premium-Preis, Preisrahmen und Vorab-Prüfung. Jede Änderung landet mit Vorher und Nachher im Audit-Log."
      />
      <SettingsForm initial={values} updatedAt={updatedAt} />
    </div>
  );
}
