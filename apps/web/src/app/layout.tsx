import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const sora = localFont({
  src: "./fonts/Sora-Variable.ttf",
  variable: "--font-sora",
  weight: "400 700",
  display: "swap",
});

const figtree = localFont({
  src: "./fonts/Figtree-Variable.ttf",
  variable: "--font-figtree",
  weight: "400 600",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "MakelaarsCockpit", template: "%s · MakelaarsCockpit" },
  description: "Eén overzicht over je hele kantoor: aanbod, leads, opdrachten en resultaat.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // data-theme="light": de donkere modus staat in de tokens klaar, maar wordt pas aangezet met een schakelaar.
  return (
    <html lang="nl" data-theme="light" className={`${sora.variable} ${figtree.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
