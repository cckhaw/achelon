"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

/**
 * Loading feedback for navigation: a thin fixed bar at the top (position: fixed, so it can never shift layout; skeleton
 * screens did, and cost CLS). Starts on an internal link click, ends when the route or query changes.
 */
function Bar() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [active, setActive] = useState(false);

  useEffect(() => { setActive(false); }, [pathname, search]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
      setActive(true);
      setTimeout(() => setActive(false), 8000); // never get stuck
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return (
    <div role="progressbar" aria-label="Loading" aria-hidden={!active} className="nav-progress" data-active={active} />
  );
}

export function NavProgress() {
  return <Suspense fallback={null}><Bar /></Suspense>;
}
