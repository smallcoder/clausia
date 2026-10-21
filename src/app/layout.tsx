import type { Metadata, Viewport } from "next";
import { Inter, Noto_Naskh_Arabic, Vazirmatn } from "next/font/google";
import "./globals.css";

const vazir = Vazirmatn({ subsets: ["arabic", "latin"], weight: ["400", "500", "600", "700", "800", "900"], variable: "--font-vazir", display: "swap" });
const inter = Inter({ subsets: ["latin"], weight: ["400", "600", "700", "800", "900"], variable: "--font-inter", display: "swap" });
const naskh = Noto_Naskh_Arabic({ subsets: ["arabic"], weight: ["400", "600"], variable: "--font-naskh", display: "swap" });

export const metadata: Metadata = {
  title: "Clausia — ملف القضية",
  description: "ملف القضية للمحامي المصري، يُملأ بالمحادثة مع Clausia",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#F4F5F8" }, { media: "(prefers-color-scheme: dark)", color: "#0B0F18" }],
};

/** Applies the saved theme (ThemeToggle) before first paint; no value = follow the system. */
const THEME_SCRIPT = `try{var t=localStorage.getItem("clausia-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`${vazir.variable} ${inter.variable} ${naskh.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
