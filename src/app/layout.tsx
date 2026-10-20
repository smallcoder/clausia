import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic, Noto_Naskh_Arabic } from "next/font/google";
import "./globals.css";

const plex = IBM_Plex_Sans_Arabic({ subsets: ["arabic", "latin"], weight: ["400", "500", "600", "700"], variable: "--font-plex", display: "swap" });
const naskh = Noto_Naskh_Arabic({ subsets: ["arabic"], weight: ["400", "600"], variable: "--font-naskh", display: "swap" });

export const metadata: Metadata = {
  title: "Clausia — ملف القضية",
  description: "ملف القضية للمحامي المصري، يُملأ بالمحادثة",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f4f3f0" }, { media: "(prefers-color-scheme: dark)", color: "#121110" }] };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`${plex.variable} ${naskh.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
