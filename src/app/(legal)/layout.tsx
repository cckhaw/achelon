import type { Viewport } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import "../brand.css";
import { Logo } from "@/components/brand/Logo";

export const dynamic = "force-dynamic"; // per-request CSP nonce (proxy.ts); static HTML would have none

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffd60a" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

/** Public legal pages (/terms, /privacy). Generic: never mention a community or a member. */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="brand" style={{ background: "var(--hero-bg)" }}>
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="b-nav">
        <div className="b-wrap">
          <Logo />
          <nav className="b-menu" aria-label="Legal">
            <Link href="/terms" className="b-hide-sm">Terms</Link>
            <Link href="/privacy" className="b-hide-sm">Privacy</Link>
            <Link className="btn btn-sm" href="/login">Sign in</Link>
          </nav>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="b-auth-main">
        <div className="b-wrap">
          <article className="b-card b-doc">{children}</article>
        </div>
      </main>
    </div>
  );
}
