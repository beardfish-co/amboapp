import type { Metadata, Viewport } from "next";
import "./globals.css";

// Force dynamic rendering on every request — prevents Vercel/Next.js
// from serving a stale statically-generated shell with old JS chunk refs.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ambo — Homily writing space",
  description: "A sacred writing workspace for priests. Read, pray, and write your homily in a space designed for encounter.",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#EEF2F7",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" style={{ height: "100%" }}>
      <body style={{ height: "100%", margin: 0 }}>{children}</body>
    </html>
  );
}
