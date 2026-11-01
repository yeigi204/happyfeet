import type { ReactNode } from "react";

import { cn } from "@/components/ui/cn";

/** Einheitliche Seitenbreite für die öffentlichen Seiten (wie das Design-System: 1240px, 16/32px Rand). */
export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-[1240px] px-4 sm:px-8", className)}>{children}</div>;
}
