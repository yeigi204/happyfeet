import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";

import { AppProviders } from "@/components/providers";

import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "happyfeet",
    template: "%s · happyfeet",
  },
  description: "Abos für Fussbilder – direkt von Creatorn aus der Schweiz.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fffbfa" },
    { media: "(prefers-color-scheme: dark)", color: "#171113" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: Browser-Erweiterungen (z. B. ColorZilla, Grammarly, Dark-Reader) setzen vor
    // dem Hydrieren eigene Attribute auf <html>/<body>. Gilt nur für die Attribute dieser beiden Elemente,
    // Abweichungen in Kind-Elementen meldet React weiterhin.
    <html
      lang="de-CH"
      className={`${jakarta.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full" suppressHydrationWarning>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
