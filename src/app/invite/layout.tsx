import type { Viewport } from "next";
import "../brand.css";

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffd60a" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
