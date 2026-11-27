"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Pull-to-refresh for touch devices (installed iOS web apps have no native one). Only starts at the very top of the
 * page, never inside a dialog, and does nothing for mouse or keyboard users.
 */
export function PullToRefresh() {
  const router = useRouter();
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const start = useRef<number | null>(null);
  const THRESHOLD = 72;

  useEffect(() => {
    if (!window.matchMedia("(pointer: coarse)").matches) return;
    const onStart = (e: TouchEvent) => {
      if (window.scrollY > 0 || document.querySelector("dialog[open]")) return;
      start.current = e.touches[0].clientY;
    };
    const onMove = (e: TouchEvent) => {
      if (start.current === null) return;
      const dy = e.touches[0].clientY - start.current;
      if (dy <= 0 || window.scrollY > 0) { setPull(0); return; }
      setPull(Math.min(dy * 0.5, 96));
    };
    const onEnd = () => {
      if (start.current === null) return;
      const fire = pull >= THRESHOLD / 2;
      start.current = null;
      setPull(0);
      if (fire) {
        setBusy(true);
        router.refresh();
        setTimeout(() => setBusy(false), 700);
      }
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, [pull, router]);

  const visible = pull > 8 || busy;
  return (
    <div aria-hidden={!visible} role="status" style={{ position: "fixed", top: "calc(env(safe-area-inset-top) + 0.5rem)", left: 0, right: 0, display: "flex", justifyContent: "center", pointerEvents: "none", zIndex: 40, opacity: visible ? 1 : 0, transform: `translateY(${busy ? 12 : pull / 3}px)`, transition: busy ? "transform 0.2s" : "none" }}>
      <span className="card" style={{ padding: "0.5rem", borderRadius: 999, display: "inline-flex" }}><span className="spinner" style={{ animationPlayState: busy ? "running" : "paused" }} /></span>
      <span className="sr-only">{busy ? "Refreshing" : ""}</span>
    </div>
  );
}
