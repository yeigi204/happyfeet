import type { ReactNode } from "react";

/**
 * Globale Provider (Clerk etc.). Wird von der Auth-Integration befüllt.
 * Muss Server-Component-kompatibel bleiben (Root-Layout).
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
