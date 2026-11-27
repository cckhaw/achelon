import type { Metadata } from "next";
import { requireMember } from "@/lib/context";
import { PageHeader } from "@/components/ui/NavBar";
import { Group, Row } from "@/components/ui";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminHome({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const ctx = await requireMember(tenant, "admin.access");
  const b = `/${ctx.tenant.slug}/admin`;
  return (
    <>
      <PageHeader title="Admin" back={{ href: `/${ctx.tenant.slug}/me`, label: "Me" }} />
      <Group title="People" id="people">
        <Row href={`${b}/members`} title="Members" sub="Roles, pause and remove" />
        <Row href={`${b}/invites`} title="Invites" sub="Invite people and track status" />
        <Row href={`${b}/import`} title="Import" sub="Bring members over from a CSV" />
        <Row href={`${b}/insights`} title="Engagement" sub="Who has attended, who has gone quiet" />
      </Group>
      <Group title="Programme" id="programme">
        <Row href={`${b}/events`} title="Events" sub="Create, publish, manage attendees" />
        <Row href={`${b}/announcements`} title="Announcements" sub="Email and post to members" />
        <Row href={`${b}/applications`} title="Applications" sub="Review member nominations" />
      </Group>
      <Group title="Community" id="community">
        <Row href={`${b}/settings`} title="Settings" sub="Name, time zone, event types" />
        <Row href={`${b}/audit`} title="Audit log" sub="Who changed what" />
      </Group>
    </>
  );
}
