"use client";
import { useEffect } from "react";

/** Remembers the browser's IANA zone in a cookie so server-rendered times show in the viewer's zone (D-22). */
export function TimezoneSync() {
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz && !document.cookie.split("; ").some((c) => c === `tz=${encodeURIComponent(tz)}`)) {
        document.cookie = `tz=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax`;
      }
    } catch { /* unsupported: server falls back to profile/community zone */ }
  }, []);
  return null;
}
