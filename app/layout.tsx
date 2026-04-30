import type { Metadata, Viewport } from "next";
import { Inter, Newsreader } from "next/font/google";
import "./globals.css";

// Force dynamic rendering on every request — prevents Vercel/Next.js
// from serving a stale statically-generated shell with old JS chunk refs.
export const dynamic = "force-dynamic";

// UI chrome — Inter. Reading + draft surfaces — Newsreader.
// next/font/google pins the file, self-hosts it from our origin, and
// exposes the family via a CSS variable we can bind into --ambo-font-*.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

import ServiceWorkerRegistration from "@/app/components/ServiceWorkerRegistration";

export const metadata: Metadata = {
  title: "Ambo — Homily writing space",
  description: "A sacred writing workspace for priests. Read, pray, and write your homily in a space designed for encounter.",
  manifest: "/manifest.json",
  // PWA — makes the app run full-screen when added to home screen, and sets the
  // status bar to transparent so our background shows through the Dynamic Island.
  // Works in conjunction with viewport-fit=cover and env(safe-area-inset-*).
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Ambo",
  },
  icons: {
    icon: [
      { url: "/ambo-mark-32.png", sizes: "32x32", type: "image/png" },
      { url: "/ambo-mark-64.png", sizes: "64x64", type: "image/png" },
      { url: "/ambo-mark-256.png", sizes: "256x256", type: "image/png" },
    ],
    apple: [
      { url: "/ambo-mark-180-solid.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#EEF2F7" },
    { media: "(prefers-color-scheme: dark)",  color: "#0F1824" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${newsreader.variable}`} style={{ height: "100%" }}>
      {/* Theme bootstrap — apply saved preference before first paint to prevent flash */}
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){try{var t=localStorage.getItem('ambo-theme');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`,
        }}
      />
      <body style={{ height: "100%", margin: 0 }}><ServiceWorkerRegistration />{children}</body>
    </html>
  );
}
