import type { Metadata } from "next";

import { AdminShell } from "@/components/admin/shell/admin-shell";
import { AdminToaster } from "@/components/admin/toast";
import { requireAdmin } from "@/server/auth/viewer";
import { getThemePreference } from "@/server/theme";

import { loadAdminDashboard } from "./_lib/data";
import { quickSearchAction } from "./actions";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin · happyfeet" },
};

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  // Der Proxy schützt keine Pfade: jede Admin-Seite steht hinter diesem Layout (Nicht-Admins → 404).
  const admin = await requireAdmin();
  const [{ queues }, theme] = await Promise.all([loadAdminDashboard(admin), getThemePreference()]);

  return (
    <AdminShell
      counts={{
        verifications: queues.verifications.count,
        moderation: queues.premoderation.count,
        reports: queues.reports.count,
      }}
      theme={theme}
      quickSearch={quickSearchAction}
    >
      {children}
      <AdminToaster />
    </AdminShell>
  );
}
