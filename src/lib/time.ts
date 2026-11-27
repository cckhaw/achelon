/** Time-zone helpers. Everything is stored as UTC instants + an IANA zone; formatting is always via Intl. */

export function isValidTimeZone(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Offset (ms) of `tz` from UTC at the given instant. */
function offsetMs(instant: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** "2026-05-03T07:30" interpreted as wall-clock time in `tz` → UTC Date. */
export function zonedLocalToUtc(local: string, tz: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m) throw new Error("Invalid local date-time");
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let t = guess - offsetMs(guess, tz);
  t = guess - offsetMs(t, tz); // second pass handles DST boundaries
  return new Date(t);
}

/** UTC Date → "YYYY-MM-DDTHH:mm" wall-clock in `tz` (for <input type=datetime-local>). */
export function utcToZonedLocal(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
}

export interface TimeView {
  /** In the viewer's zone. */
  primary: string;
  /** In the event's zone, only when it differs from the viewer's rendering. */
  local: string | null;
  localZoneLabel: string | null;
}

const fmt = (d: Date, tz: string, locale: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(locale, { timeZone: tz, ...opts }).format(d);

/** Viewer's zone first; event-local beside it when the wall-clock differs (D-22). */
export function formatEventTime(start: Date, eventTz: string, viewerTz: string, locale: string, opts: { weekday?: boolean } = {}): TimeView {
  const base: Intl.DateTimeFormatOptions = { weekday: opts.weekday === false ? undefined : "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" };
  const primary = fmt(start, viewerTz, locale, { ...base, timeZoneName: viewerTz === eventTz ? "short" : undefined });
  if (viewerTz === eventTz) return { primary, local: null, localZoneLabel: null };
  const mine = utcToZonedLocal(start, viewerTz);
  const theirs = utcToZonedLocal(start, eventTz);
  if (mine === theirs) return { primary, local: null, localZoneLabel: null };
  return {
    primary,
    local: fmt(start, eventTz, locale, { hour: "numeric", minute: "2-digit", timeZoneName: "short" }),
    localZoneLabel: eventTz,
  };
}

export const formatDate = (d: Date, tz: string, locale: string, o: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", year: "numeric" }) => fmt(d, tz, locale, o);
export const formatTime = (d: Date, tz: string, locale: string) => fmt(d, tz, locale, { hour: "numeric", minute: "2-digit" });
export const dayKey = (d: Date, tz: string) => utcToZonedLocal(d, tz).slice(0, 10);
