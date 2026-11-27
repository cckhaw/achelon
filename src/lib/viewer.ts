import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { isValidTimeZone } from "@/lib/time";

/** Viewer's locale from Accept-Language (first tag that Intl accepts), default en. */
export const viewerLocale = cache(async (): Promise<string> => {
  const al = (await headers()).get("accept-language") ?? "";
  for (const part of al.split(",")) {
    const tag = part.split(";")[0].trim();
    if (!tag || tag === "*") continue;
    try {
      new Intl.DateTimeFormat(tag);
      return tag;
    } catch { /* try next */ }
  }
  return "en";
});

/** Viewer's time zone: browser cookie → profile zone → community default → UTC. */
export async function viewerTimeZone(fallbacks: (string | null | undefined)[] = []): Promise<string> {
  const c = (await cookies()).get("tz")?.value;
  const tz = c ? decodeURIComponent(c) : null;
  if (isValidTimeZone(tz)) return tz;
  for (const f of fallbacks) if (isValidTimeZone(f)) return f;
  return "UTC";
}

import { formatDate, formatEventTime, formatTime } from "@/lib/time";

/** Bundle of the viewer's zone + locale with formatting helpers, for server components. */
export async function viewerFormat(defaultTz?: string | null) {
  const [tz, locale] = await Promise.all([viewerTimeZone([defaultTz]), viewerLocale()]);
  return {
    tz,
    locale,
    date: (d: Date) => formatDate(d, tz, locale),
    dateTime: (d: Date) => `${formatDate(d, tz, locale, { day: "numeric", month: "short", year: "numeric" })}, ${formatTime(d, tz, locale)}`,
    shortDate: (d: Date) => formatDate(d, tz, locale, { day: "numeric", month: "short" }),
    event: (start: Date, eventTz: string) => formatEventTime(start, eventTz, tz, locale),
  };
}
