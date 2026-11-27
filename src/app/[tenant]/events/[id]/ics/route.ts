import { NextResponse } from "next/server";
import { z } from "zod";
import { getMemberContext } from "@/lib/context";
import { withTenant } from "@/lib/db";
import { getEvent } from "@/lib/services/events";
import { buildCalendar } from "@/lib/ical";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ tenant: string; id: string }> }) {
  const { tenant, id } = await params;
  const ctx = await getMemberContext(tenant);
  if (!ctx || !ctx.can("events.view") || !z.uuid().safeParse(id).success) return new NextResponse(null, { status: 404 });
  const data = await withTenant(ctx.tenant.id, (tx) => getEvent(tx, ctx.viewer, id));
  if (!data || data.event.status === "draft") return new NextResponse(null, { status: 404 });
  const e = data.event;
  const ics = buildCalendar(ctx.tenant.name, [{
    uid: `${e.id}@achelon`, start: e.startsAt, end: e.endsAt, summary: e.title, description: [e.description, e.paceOrLevelNote].filter(Boolean).join("\n\n"),
    location: [e.locationName, e.locationAddress].filter(Boolean).join(", ") || null, geo: e.locationLat != null && e.locationLng != null ? { lat: e.locationLat, lng: e.locationLng } : null,
    url: `${env().APP_URL}/${ctx.tenant.slug}/events/${e.id}`, cancelled: e.status === "cancelled",
  }]);
  return new NextResponse(ics, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="event.ics"`, "Cache-Control": "private, no-store" } });
}
