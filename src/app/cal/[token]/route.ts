import { NextResponse, type NextRequest } from "next/server";
import { withTenant } from "@/lib/db";
import { resolveCalendarToken } from "@/lib/system/calendar";
import { buildFeed } from "@/lib/services/calendar";
import { clientIp, hit, RULES } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Secret per-member iCal feed: /cal/<token>.ics. Unknown, revoked and malformed tokens are indistinguishable (404). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token: raw } = await params;
  if (!(await hit("calendar-ip", await clientIp(), RULES.calendarIp))) return new NextResponse(null, { status: 429, headers: { "Retry-After": "60" } });
  const token = raw.replace(/\.ics$/, "");
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(token)) return new NextResponse(null, { status: 404 });
  const who = await resolveCalendarToken(token);
  if (!who) return new NextResponse(null, { status: 404 });
  const ics = await withTenant(who.tenantId, (tx) => buildFeed(tx, { tenantName: who.tenantName, slug: who.slug, membershipId: who.membershipId, role: who.role }));
  return new NextResponse(ics, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, no-store", "Content-Disposition": 'inline; filename="achelon.ics"' } });
}
