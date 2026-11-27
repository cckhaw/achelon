import { NextResponse } from "next/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getMemberContext } from "@/lib/context";
import { schema, withTenant } from "@/lib/db";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** CSV cell safe for spreadsheets: quotes, and neutralises formula injection (=, +, -, @). */
const cell = (v: unknown) => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

export async function GET(_req: Request, { params }: { params: Promise<{ tenant: string; id: string }> }) {
  const { tenant, id } = await params;
  const ctx = await getMemberContext(tenant);
  if (!ctx || !ctx.can("events.manage") || !z.uuid().safeParse(id).success) return new NextResponse(null, { status: 404 });
  const rows = await withTenant(ctx.tenant.id, async (tx) => {
    const [ev] = await tx.select({ id: schema.events.id }).from(schema.events).where(eq(schema.events.id, id));
    if (!ev) return null;
    await audit(tx, { tenantId: ctx.tenant.id, actor: ctx.membership.id, action: "event.exported", targetType: "event", targetId: id });
    return tx.select({ name: schema.memberProfiles.displayName, email: schema.users.email, company: schema.memberProfiles.company, status: schema.eventSignups.status, note: schema.eventSignups.note, at: schema.eventSignups.createdAt })
      .from(schema.eventSignups).innerJoin(schema.memberships, eq(schema.memberships.id, schema.eventSignups.membershipId)).innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
      .leftJoin(schema.memberProfiles, eq(schema.memberProfiles.membershipId, schema.eventSignups.membershipId))
      .where(and(eq(schema.eventSignups.eventId, id), inArray(schema.eventSignups.status, ["going", "waitlist", "maybe"]))).orderBy(asc(schema.eventSignups.status), asc(schema.eventSignups.createdAt));
  });
  if (!rows) return new NextResponse(null, { status: 404 });
  const csv = ["Name,Email,Company,Status,Note,Signed up", ...rows.map((r) => [r.name, r.email, r.company, r.status, r.note, r.at.toISOString()].map(cell).join(","))].join("\r\n");
  return new NextResponse(csv + "\r\n", { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="attendees.csv"', "Cache-Control": "private, no-store" } });
}
