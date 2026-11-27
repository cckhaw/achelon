import { z } from "zod";
import { ATTENDEE_VISIBILITIES, EVENT_TYPES, EVENT_VISIBILITIES, type EventType } from "@/db/constants";
import { isValidTimeZone, zonedLocalToUtc } from "./time";
import { httpsUrl } from "./validation";

const local = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Choose a date and time");
const optLocal = z.union([z.literal(""), local]).optional().transform((v) => v || null);
const optText = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : null));
const optUrl = z.union([z.literal(""), httpsUrl]).optional().transform((v) => v || null);
const optNum = (min: number, max: number, msg: string) =>
  z.string().trim().optional().transform((v) => (v ? v : null)).refine((v) => v === null || (Number.isFinite(Number(v)) && Number(v) >= min && Number(v) <= max), msg);

export const eventFormSchema = z.object({
  type: z.enum(EVENT_TYPES),
  title: z.string().trim().min(2, "Enter a title").max(120),
  description: optText(4000),
  timezone: z.string().trim().refine(isValidTimeZone, "Unknown time zone"),
  start: local,
  end: optLocal,
  locationName: optText(120),
  locationAddress: optText(240),
  lat: optNum(-90, 90, "Latitude is between -90 and 90"),
  lng: optNum(-180, 180, "Longitude is between -180 and 180"),
  routeUrl: optUrl,
  externalUrl: optUrl,
  distanceKm: optNum(0, 1000, "Enter a distance in km"),
  paceOrLevelNote: optText(160),
  capacity: optNum(1, 10000, "Capacity is a whole number of 1 or more").refine((v) => v === null || Number.isInteger(Number(v)), "Capacity is a whole number of 1 or more"),
  cutoff: optLocal,
  visibility: z.enum(EVENT_VISIBILITIES),
  attendeeVisibility: z.enum(ATTENDEE_VISIBILITIES),
  status: z.enum(["draft", "published"]),
  invitees: z.array(z.uuid()).default([]),
});

export interface EventInput {
  type: EventType;
  title: string;
  description: string | null;
  timezone: string;
  startsAt: Date;
  endsAt: Date | null;
  locationName: string | null;
  locationAddress: string | null;
  locationLat: number | null;
  locationLng: number | null;
  routeUrl: string | null;
  externalUrl: string | null;
  distanceKm: string | null;
  paceOrLevelNote: string | null;
  capacity: number | null;
  rsvpCutoffAt: Date | null;
  visibility: (typeof EVENT_VISIBILITIES)[number];
  attendeeVisibility: (typeof ATTENDEE_VISIBILITIES)[number];
  status: "draft" | "published";
  invitees: string[];
}

export type EventParse = { ok: true; value: EventInput } | { ok: false; errors: Record<string, string> };

export function parseEventForm(raw: Record<string, unknown>, allowed: readonly EventType[]): EventParse {
  const p = eventFormSchema.safeParse(raw);
  const errors: Record<string, string> = {};
  if (!p.success) {
    for (const i of p.error.issues) errors[String(i.path[0] ?? "form")] ??= i.message;
    return { ok: false, errors };
  }
  const d = p.data;
  if (!allowed.includes(d.type)) errors.type = "This community doesn't allow that event type";
  if ((d.lat === null) !== (d.lng === null)) errors.lat = "Enter both latitude and longitude, or neither";
  const startsAt = zonedLocalToUtc(d.start, d.timezone);
  const endsAt = d.end ? zonedLocalToUtc(d.end, d.timezone) : null;
  const cutoff = d.cutoff ? zonedLocalToUtc(d.cutoff, d.timezone) : null;
  if (endsAt && endsAt <= startsAt) errors.end = "The end must be after the start";
  if (cutoff && cutoff > startsAt) errors.cutoff = "The sign-up cutoff must be before the start";
  if (d.visibility === "invite_list" && d.invitees.length === 0 && d.status === "published") errors.invitees = "Choose who is invited";
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      type: d.type, title: d.title, description: d.description, timezone: d.timezone, startsAt, endsAt,
      locationName: d.locationName, locationAddress: d.locationAddress,
      locationLat: d.lat === null ? null : Number(d.lat), locationLng: d.lng === null ? null : Number(d.lng),
      routeUrl: d.routeUrl, externalUrl: d.externalUrl, distanceKm: d.distanceKm === null ? null : Number(d.distanceKm).toFixed(1),
      paceOrLevelNote: d.paceOrLevelNote, capacity: d.capacity === null ? null : Number(d.capacity), rsvpCutoffAt: cutoff,
      visibility: d.visibility, attendeeVisibility: d.attendeeVisibility, status: d.status, invitees: d.invitees,
    },
  };
}
