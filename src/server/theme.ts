import "server-only";

import { cookies } from "next/headers";

import { THEME_COOKIE, parseThemePreference, type ThemePreference } from "@/lib/theme";

/** Theme-Wahl aus dem Cookie (fehlt er oder ist er ungültig: „Auto“). */
export async function getThemePreference(): Promise<ThemePreference> {
  const jar = await cookies();
  return parseThemePreference(jar.get(THEME_COOKIE)?.value);
}
