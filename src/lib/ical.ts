/** Minimal RFC 5545 writer: escaping, 75-octet line folding, UTC timestamps, CRLF. */

export interface IcsEvent {
  uid: string;
  start: Date;
  end?: Date | null;
  allDay?: string; // YYYY-MM-DD (floating date)
  summary: string;
  description?: string | null;
  location?: string | null;
  geo?: { lat: number; lng: number } | null;
  url?: string | null;
  cancelled?: boolean;
  updated?: Date;
}

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const utc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Fold at 75 octets (not characters), never splitting a UTF-8 sequence. */
export function fold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > limit) {
      out.push(cur);
      cur = " " + ch;
      bytes = 1 + n;
      limit = 75;
    } else {
      cur += ch;
      bytes += n;
    }
  }
  out.push(cur);
  return out.join("\r\n");
}

export function buildCalendar(name: string, events: IcsEvent[], now = new Date()): string {
  const lines: string[] = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Achelon//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${esc(name)}`, "REFRESH-INTERVAL;VALUE=DURATION:PT6H", "X-PUBLISHED-TTL:PT6H"];
  for (const e of events) {
    lines.push("BEGIN:VEVENT", `UID:${e.uid}`, `DTSTAMP:${utc(e.updated ?? now)}`);
    if (e.allDay) {
      const d = e.allDay.replace(/-/g, "");
      const next = new Date(Date.parse(e.allDay + "T00:00:00Z") + 86_400_000).toISOString().slice(0, 10).replace(/-/g, "");
      lines.push(`DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${next}`);
    } else {
      lines.push(`DTSTART:${utc(e.start)}`, `DTEND:${utc(e.end ?? new Date(e.start.getTime() + 2 * 3_600_000))}`);
    }
    lines.push(`SUMMARY:${esc(e.summary)}`);
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
    if (e.geo) lines.push(`GEO:${e.geo.lat};${e.geo.lng}`);
    if (e.url) lines.push(`URL:${e.url}`);
    lines.push(`STATUS:${e.cancelled ? "CANCELLED" : "CONFIRMED"}`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
