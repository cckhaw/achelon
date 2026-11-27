import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "./Logo";

/** Compact branded frame for the link-confirmation and invitation pages. */
export function AuthShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="brand" style={{ background: "var(--hero-bg)" }}>
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="b-nav">
        <div className="b-wrap">
          <Logo />
          <nav className="b-menu" aria-label="Account"><Link href="/login">Back to sign in</Link></nav>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="b-auth-main">
        <div className="b-wrap">
          <div className="b-card b-auth-card" style={wide ? { maxWidth: "40rem" } : undefined}>{children}</div>
        </div>
      </main>
    </div>
  );
}
