"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";

/** Large title that collapses into a compact translucent bar once scrolled (iOS large-title pattern). */
export function PageHeader({ title, action, subtitle, back }: { title: string; action?: ReactNode; subtitle?: ReactNode; back?: { href: string; label: string } }) {
  const sentinel = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setScrolled(!e.isIntersecting), { rootMargin: "-8px 0px 0px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <>
      <header className="navbar" data-scrolled={scrolled}>
        {back ? <Link href={back.href} className="back-link"><Icon name="chevron" aria-hidden="true" /><span>{back.label}</span></Link> : null}
        <span className="navbar-title" aria-hidden="true">{title}</span>
        <div className="navbar-actions">{action}</div>
      </header>
      <div className="large-title-wrap">
        <h1 className="t-large" id="page-title" tabIndex={-1}>{title}</h1>
        {subtitle ? <p className="muted mt-1">{subtitle}</p> : null}
        <div ref={sentinel} aria-hidden="true" style={{ height: 1 }} />
      </div>
    </>
  );
}
