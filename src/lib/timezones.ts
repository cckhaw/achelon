/** Time-zone choices for dropdowns. Pure (no server imports) so client forms can use it too. */

export const DEFAULT_TIMEZONE = "Asia/Kuala_Lumpur"; // Malaysia, GMT+8

/** Shown first, in this order. */
export const COMMON_TIMEZONES = [
  "Asia/Kuala_Lumpur", "Asia/Singapore", "Asia/Jakarta", "Asia/Bangkok", "Asia/Ho_Chi_Minh", "Asia/Manila", "Asia/Hong_Kong", "Asia/Shanghai",
  "Asia/Tokyo", "Asia/Seoul", "Asia/Kolkata", "Asia/Dubai", "Australia/Perth", "Australia/Sydney", "Pacific/Auckland",
  "Europe/London", "Europe/Paris", "America/New_York", "America/Los_Angeles", "UTC",
];

export interface TimezoneOption { value: string; label: string }

function offsetLabel(tz: string, at: Date): { minutes: number; text: string } {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" }).formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? "GMT";
    const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(part);
    if (!m) return { minutes: 0, text: "GMT" };
    const mins = (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0));
    return { minutes: mins, text: `GMT${m[1]}${Number(m[2])}${m[3] && m[3] !== "00" ? `:${m[3]}` : ""}` };
  } catch {
    return { minutes: 0, text: "GMT" };
  }
}

const pretty = (tz: string) => tz.replace(/_/g, " ").replace("/", " / ");

function allZones(): string[] {
  const sv = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
  const list = sv ? sv("timeZone") : [];
  return list.includes("UTC") ? list : [...list, "UTC"];
}

/** Common zones first, then every IANA zone ordered by offset. A zone the list lacks (e.g. legacy data) is appended so it stays selectable. */
export function timezoneGroups(current?: string | null, at = new Date()): { common: TimezoneOption[]; others: TimezoneOption[] } {
  const label = (tz: string) => `(${offsetLabel(tz, at).text}) ${pretty(tz)}`;
  const all = allZones();
  const common = COMMON_TIMEZONES.filter((z) => all.includes(z) || z === "UTC").map((z) => ({ value: z, label: z === DEFAULT_TIMEZONE ? `(GMT+8) Malaysia · Kuala Lumpur` : label(z) }));
  const commonSet = new Set(common.map((c) => c.value));
  const others = all.filter((z) => !commonSet.has(z)).map((z) => ({ z, m: offsetLabel(z, at).minutes })).sort((a, b) => a.m - b.m || a.z.localeCompare(b.z)).map(({ z }) => ({ value: z, label: label(z) }));
  if (current && !commonSet.has(current) && !others.some((o) => o.value === current)) others.unshift({ value: current, label: current });
  return { common, others };
}
