import type { Metadata, Viewport } from "next";
import { TimezoneSync } from "@/components/TimezoneSync";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Achelon", template: "%s · Achelon" },
  description: "Private member platform.",
  applicationName: "Achelon",
  robots: { index: false, follow: false, nocache: true, noarchive: true, nosnippet: true, noimageindex: true },
  appleWebApp: { capable: true, title: "Achelon", statusBarStyle: "default" },
  other: { "apple-mobile-web-app-capable": "yes" },
  formatDetection: { telephone: false, email: false, address: false },
  icons: { icon: [{ url: "/favicon.ico", sizes: "48x48" }, { url: "/icon-192.png", sizes: "192x192", type: "image/png" }, { url: "/icon.svg", type: "image/svg+xml" }], apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }] },
};

// viewport-fit=cover lets us use env(safe-area-inset-*); zoom stays enabled (accessibility).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffd60a" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <TimezoneSync />
      </body>
    </html>
  );
}
