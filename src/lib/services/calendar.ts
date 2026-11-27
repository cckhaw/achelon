import { and, eq } from "drizzle-orm";
import { schema, type Tx } from "@/lib/db";
import { randomToken, sha256Hex } from "@/lib/crypto";
import type { MembershipRole } from "@/db/constants";
import { listEvents } from "./events";
import { listRaces } from "./races";
import { buildCalendar, type IcsEvent } from "@/lib/ical";
import { env } from "@/lib/env";

export async function calendarStatus(tx: Tx, membershipId: string) {
  const [t] = await tx.select().from(schema.calendarTokens).where(eq(schema.calendarTokens.membershipId, membershipId));
  return t ? { active: !t.revokedAt, createdAt: t.createdAt } : null;
}

/** Create or replace the member's secret feed token. The raw token is returned once; only its hash is stored. */
export async function rotateCalendarToken(tx: Tx, tenantId: string, membershipId: string): Promise<string> {
  const token = randomToken(24);
  await tx.insert(schema.calendarTokens).values({ membershipId, tenantId, tokenHash: sha256Hex(token) })
    .onConflictDoUpdate({ target: schema.calendarTokens.membershipId, set: { tokenHash: sha256Hex(token), createdAt: new Date(), revokedAt: null } });
  return token;
}
export async function revokeCalendarToken(tx: Tx, membershipId: string) {
  await tx.update(schema.calendarTokens).set({ revokedAt: new Date() }).where(and(eq(schema.calendarTokens.membershipId, membershipId)));
}

const STATUS_NOTE = { going: "You're going.", waitlist: "You're on the waitlist.", maybe: "You said maybe." } as const;

/** Everything the member may see from 30 days ago onwards, plus their visible race declarations. Drafts never leave the app. */
export async function buildFeed(tx: Tx, o: { tenantName: string; slug: string; membershipId: string; role: MembershipRole }): Promise<string> {
  const viewer = { membershipId: o.membershipId, role: o.role };
  const events = await listEvents(tx, viewer, { scope: "range", from: new Date(Date.now() - 30 * 86_400_000), to: new Date(Date.now() + 366 * 86_400_000), limit: 500 });
  const out: IcsEvent[] = events.filter((e) => e.status !== "draft").map((e) => ({
    uid: `${e.id}@achelon`, start: e.startsAt, end: e.endsAt, summary: e.title,
    description: [e.mine && e.mine in STATUS_NOTE ? STATUS_NOTE[e.mine as keyof typeof STATUS_NOTE] : null, e.description, e.paceOrLevelNote].filter(Boolean).join("\n\n"),
    location: [e.locationName, e.locationAddress].filter(Boolean).join(", ") || null,
    geo: e.locationLat != null && e.locationLng != null ? { lat: e.locationLat, lng: e.locationLng } : null,
    url: `${env().APP_URL}/${o.slug}/events/${e.id}`, cancelled: e.status === "cancelled",
  }));
  if (o.role !== "guest") {
    for (const r of await listRaces(tx, viewer, { from: new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10) })) {
      out.push({ uid: `race-${r.id}@achelon`, start: new Date(r.raceDate + "T00:00:00Z"), allDay: r.raceDate, summary: `Race: ${r.raceName}${r.mine ? "" : ` (${r.memberName})`}`, description: [r.distance, r.location].filter(Boolean).join(" · ") || null });
    }
  }
  return buildCalendar(`${o.tenantName} on Achelon`, out);
}
