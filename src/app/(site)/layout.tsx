import type { ReactNode } from "react";

import { AppShell } from "@/components/shell/app-shell";

/** Rahmen für Landing, Entdecken, Creator-Profile und den Fan-Bereich. */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
