import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { requireMember } from "@/lib/context";
import { schema, withTenant } from "@/lib/db";
import { PageHeader } from "@/components/ui/NavBar";
import { Badge, Group, Row } from "@/components/ui";
import { EventForm, type EventFormValues } from "@/components/forms/EventForm";
import { AttendeeActions, CancelEventForm } from "@/components/forms/EventAdminActions";
import { utcToZonedLocal } from "@/lib/time";
import { SheetButton } from "@/components/ui/Sheet";
import { CopyField } from "@/components/ui/CopyField";
import { CreateInviteForm } from "@/components/forms/AdminForms";
import { can, canAssignRole } from "@/lib/rbac";
import { MEMBERSHIP_ROLES } from "@/db/constants";
import { env } from "@/lib/env";
import { t, type MessageKey } from "@/lib/i18n";

export const metadata: Metadata = { title: "Event · Admin" };

export default async function AdminEvent({ params, searchParams }: { params: Promise<{ tenant: string; id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { tenant, id } = await params;
  const { saved } = await searchParams;
  const ctx = await requireMember(tenant, "events.manage");
  if (!z.uuid().safeParse(id).success) notFound();
  const data = await withTenant(ctx.tenant.id, async (tx) => {
    const [e] = await tx.select().from(schema.events).where(eq(schema.events.id, id));
    if (!e) return null;
    const invitees = await tx.select({ m: schema.eventInvitees.membershipId }).from(schema.eventInvitees).where(eq(schema.eventInvitees.eventId, id));
    const signups = await tx.select({ m: schema.eventSignups.membershipId, s: schema.eventSignups.status, note: schema.eventSignups.note, name: schema.memberProfiles.displayName, email: schema.users.email })
      .from(schema.eventSignups).innerJoin(schema.memberships, eq(schema.memberships.id, schema.eventSignups.membershipId)).innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
      .leftJoin(schema.memberProfiles, eq(schema.memberProfiles.membershipId, schema.eventSignups.membershipId))
      .where(and(eq(schema.eventSignups.eventId, id), inArray(schema.eventSignups.status, ["going", "waitlist", "maybe"]))).orderBy(asc(schema.eventSignups.position), asc(schema.eventSignups.createdAt));
    const members = await tx.select({ id: schema.memberProfiles.membershipId, name: schema.memberProfiles.displayName }).from(schema.memberProfiles).innerJoin(schema.memberships, eq(schema.memberships.id, schema.memberProfiles.membershipId)).where(eq(schema.memberships.status, "active")).orderBy(schema.memberProfiles.displayName);
    return { e, invitees: invitees.map((i) => i.m), signups, members };
  });
  if (!data) notFound();
  const { e, invitees, signups, members } = data;
  const tz = e.timezone;
  const values: EventFormValues = {
    type: e.type, title: e.title, description: e.description ?? "", timezone: tz, start: utcToZonedLocal(e.startsAt, tz), end: e.endsAt ? utcToZonedLocal(e.endsAt, tz) : "",
    locationName: e.locationName ?? "", locationAddress: e.locationAddress ?? "", lat: e.locationLat?.toString() ?? "", lng: e.locationLng?.toString() ?? "", routeUrl: e.routeUrl ?? "", externalUrl: e.externalUrl ?? "",
    distanceKm: e.distanceKm ? String(Number(e.distanceKm)) : "", paceOrLevelNote: e.paceOrLevelNote ?? "", capacity: e.capacity?.toString() ?? "", cutoff: e.rsvpCutoffAt ? utcToZonedLocal(e.rsvpCutoffAt, tz) : "",
    visibility: e.visibility, attendeeVisibility: e.attendeeVisibility, status: e.status === "published" ? "published" : "draft", invitees,
  };
  const b = `/${ctx.tenant.slug}`;
  const by = (s: string) => signups.filter((x) => x.s === s);
  return (
    <>
      <PageHeader title={e.title} back={{ href: `${b}/admin/events`, label: "Events" }} action={<Link href={`${b}/events/${e.id}`} className="btn btn-plain">View</Link>} />
      {saved ? <p className="form-ok mb-4" role="status">Event created.</p> : null}
      <p className="flex flex-wrap gap-1 mb-4"><Badge>{t(`eventType.${e.type}` as MessageKey)}</Badge><Badge tone={e.status === "published" ? "tint" : e.status === "draft" ? "muted" : "danger"}>{e.status}</Badge></p>

      {e.status === "published" && can(ctx.membership.role, "invites.manage") ? (
        <Group title="Invite people" id="invite" footer="Members already in the community can open the event link once they are signed in. To bring in someone new, email them an invitation: they join as a guest (or member) and are added to this event automatically.">
          <div className="row" style={{ display: "grid", gap: "0.75rem" }}>
            <CopyField value={`${env().APP_URL}/${ctx.tenant.slug}/events/${e.id}`} label="Event link (sign-in required)" />
            <div><SheetButton label="Invite someone by email" title={`Invite to ${e.title}`} icon="plus" className="btn btn-sm"><CreateInviteForm slug={ctx.tenant.slug} roles={MEMBERSHIP_ROLES.filter((r) => canAssignRole(ctx.membership.role, r) && (r === "guest" || r === "member"))} sponsors={[]} eventId={e.id} /></SheetButton></div>
          </div>
        </Group>
      ) : null}

      <Group title={`Going (${by("going").length}${e.capacity ? ` of ${e.capacity}` : ""})`} id="going" footer={<a href={`${b}/admin/events/${e.id}/export`} download>Download attendee list (CSV)</a>}>
        {by("going").length ? by("going").map((s) => (
          <div key={s.m}><Row title={s.name ?? s.email} sub={[s.email, s.note].filter(Boolean).join(" · ")} /><AttendeeActions slug={ctx.tenant.slug} eventId={e.id} membershipId={s.m} status="going" /></div>
        )) : <div className="row muted">Nobody yet.</div>}
      </Group>
      {by("waitlist").length ? (
        <Group title={`Waitlist (${by("waitlist").length})`} id="wl">
          {by("waitlist").map((s, i) => <div key={s.m}><Row title={`${i + 1}. ${s.name ?? s.email}`} sub={s.email} /><AttendeeActions slug={ctx.tenant.slug} eventId={e.id} membershipId={s.m} status="waitlist" /></div>)}
        </Group>
      ) : null}
      {by("maybe").length ? <Group title={`Maybe (${by("maybe").length})`} id="maybe">{by("maybe").map((s) => <Row key={s.m} title={s.name ?? s.email} sub={s.email} />)}</Group> : null}

      <h2 className="t-title mt-8 mb-4">Details</h2>
      <EventForm slug={ctx.tenant.slug} eventId={e.id} values={values} allowedTypes={ctx.settings.allowedEventTypes} members={members} locked={e.status === "cancelled"} />
      {e.status !== "cancelled" ? <div className="mt-10"><CancelEventForm slug={ctx.tenant.slug} eventId={e.id} /></div> : null}
    </>
  );
}
