import type { Metadata } from "next";
import { and, eq, inArray } from "drizzle-orm";
import { requireMember } from "@/lib/context";
import { schema, withTenant } from "@/lib/db";
import { PageHeader } from "@/components/ui/NavBar";
import { EventForm, type EventFormValues } from "@/components/forms/EventForm";

export const metadata: Metadata = { title: "New event · Admin" };

export default async function NewEvent({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const ctx = await requireMember(tenant, "events.manage");
  const members = await withTenant(ctx.tenant.id, (tx) => tx.select({ id: schema.memberProfiles.membershipId, name: schema.memberProfiles.displayName }).from(schema.memberProfiles).innerJoin(schema.memberships, eq(schema.memberships.id, schema.memberProfiles.membershipId)).where(and(eq(schema.memberships.status, "active"), inArray(schema.memberships.role, ["owner", "admin", "founding_member", "member", "guest"]))).orderBy(schema.memberProfiles.displayName));
  const values: EventFormValues = {
    type: ctx.settings.allowedEventTypes[0], title: "", description: "", timezone: ctx.settings.defaultTimezone, start: "", end: "", locationName: "", locationAddress: "", lat: "", lng: "",
    routeUrl: "", externalUrl: "", distanceKm: "", paceOrLevelNote: "", capacity: "", cutoff: "", visibility: "all_members", attendeeVisibility: "names", status: "draft", invitees: [],
  };
  return (
    <>
      <PageHeader title="New event" back={{ href: `/${ctx.tenant.slug}/admin/events`, label: "Events" }} />
      <EventForm slug={ctx.tenant.slug} eventId={null} values={values} allowedTypes={ctx.settings.allowedEventTypes} members={members} />
    </>
  );
}
