import { Ban, Compass, Heart, LayoutGrid, LayoutList, ShieldCheck, type LucideIcon } from "lucide-react";

import type { ShellNavIcon } from "./nav-items";

export const NAV_ICONS: Record<ShellNavIcon, LucideIcon> = {
  feed: LayoutList,
  explore: Compass,
  subs: Heart,
  studio: LayoutGrid,
  admin: ShieldCheck,
  banned: Ban,
};
