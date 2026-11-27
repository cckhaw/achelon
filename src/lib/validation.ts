import { z } from "zod";
import { LEVELS, OPEN_TO, SPORTS, VISIBILITY_FIELDS, VISIBLE_TO, type VisibilityField, type VisibleTo } from "@/db/constants";
import { isValidTimeZone } from "./time";

const text = (max: number) => z.string().trim().max(max);
const optText = (max: number) => text(max).transform((s) => (s === "" ? null : s)).nullable().optional().transform((v) => v ?? null);

export const httpsUrl = z
  .string().trim().max(500)
  .refine((s) => { try { return new URL(s).protocol === "https:"; } catch { return false; } }, "Must be an https:// link");
export const optHttpsUrl = z.union([z.literal(""), httpsUrl]).optional().transform((v) => (v ? v : null));

/** "5:30" → 330 seconds per km. */
export function parsePace(s: string): number | null {
  const m = /^(\d{1,2}):([0-5]\d)$/.exec(s.trim());
  if (!m) return null;
  const sec = Number(m[1]) * 60 + Number(m[2]);
  return sec >= 150 && sec <= 720 ? sec : null;
}
export const formatPace = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

export const profileSchema = z.object({
  displayName: text(80).min(1, "Please enter your name"),
  jobTitle: optText(100),
  company: optText(100),
  city: optText(80),
  country: optText(80),
  timezone: z.string().trim().optional().transform((v) => (v ? v : null)).refine((v) => v === null || isValidTimeZone(v), "Unknown time zone"),
  bio: optText(600),
  sports: z.array(z.enum(SPORTS)).default([]),
  level: z.union([z.enum(LEVELS), z.literal("")]).optional().transform((v) => (v ? v : null)),
  pace: z.string().trim().optional().transform((v) => (v ? v : null)).refine((v) => v === null || parsePace(v) !== null, "Use minutes:seconds per km, e.g. 5:30"),
  speed: z.string().trim().optional().transform((v) => (v ? v : null)).refine((v) => v === null || (Number(v) >= 8 && Number(v) <= 60), "Enter a speed between 8 and 60 km/h"),
  openTo: z.array(z.enum(OPEN_TO)).default([]),
  photoUrl: optHttpsUrl,
});
export type ProfileInput = z.infer<typeof profileSchema>;

export function parseVisibility(form: FormData): Partial<Record<VisibilityField, VisibleTo>> {
  const out: Partial<Record<VisibilityField, VisibleTo>> = {};
  for (const f of VISIBILITY_FIELDS) {
    const v = form.get(`vis_${f}`);
    if (typeof v === "string" && (VISIBLE_TO as readonly string[]).includes(v)) out[f] = v as VisibleTo;
  }
  return out;
}

export const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());
export const slugSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/, "Lowercase letters, numbers and dashes");

/** FormData → plain object, keeping repeated keys as arrays for the keys listed in `arrays`. */
export function formObject(form: FormData, arrays: string[] = []): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const key of new Set([...form.keys()])) {
    if (key.startsWith("$ACTION")) continue;
    o[key] = arrays.includes(key) ? form.getAll(key).map(String) : (form.get(key) as string);
  }
  for (const a of arrays) if (!(a in o)) o[a] = [];
  return o;
}
