import type { Metadata } from "next";
import { requireMember } from "@/lib/context";
import { PageHeader } from "@/components/ui/NavBar";
import { Group, Row } from "@/components/ui";

export const metadata: Metadata = { title: "Privacy" };

/** In-app privacy notice (members only: the app has no public pages beyond sign-in and invitations). Mirrors docs/PRIVACY.md. */
export default async function PrivacyPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const ctx = await requireMember(tenant);
  return (
    <>
      <PageHeader title="Privacy" back={{ href: `/${ctx.tenant.slug}/settings`, label: "Settings" }} subtitle="What we keep, who sees it, and for how long." />
      <Group title="What we collect" id="collect">
        <Row title="Email address" sub="Sign-in and email. Seen by you and admins." />
        <Row title="Your name" sub="Seen by all members." />
        <Row title="Profile details" sub="Job, company, city, sports, level, pace, photo link, about you. Each one is shown only to the audience you choose under Me, Profile and privacy." />
        <Row title="Sign-ups and races" sub="For running events. Names are shown to members unless an event is counts-only. Goal times are only ever visible to you." />
        <Row title="Activity" sub="When you last used the app and which events you signed up to. Visible to admins only, as an engagement summary." />
        <Row title="Strava (optional)" sub="Read-only. Encrypted tokens, your inferred level (you only) and, if you allow it, results for events you attended." />
      </Group>
      <Group title="What we don't do" id="not">
        <Row title="No tracking" sub="No analytics, advertising trackers, third-party scripts or fonts." />
        <Row title="No public pages" sub="Nothing here is visible or indexable without signing in." />
      </Group>
      <Group title="Your control" id="control" footer="Photo links are fetched directly by viewers' browsers (without a referrer), so the host of the image can see their IP address.">
        <Row title="Export" sub="Settings, Export my data: everything we hold, as a file." />
        <Row title="Delete" sub="Settings, Delete my account: access ends at once; your data is erased after 30 days." />
        <Row title="Visibility" sub="Change who sees each field any time." />
      </Group>
      <Group title="Retention" id="retention">
        <Row title="Departed members" value="30 days" />
        <Row title="Sign-in links" value="15 minutes" />
        <Row title="Sessions" value="30 days" />
        <Row title="Sent email" value="30 days" />
        <Row title="Audit log" sub="Opaque ids only, no names or emails." />
      </Group>
    </>
  );
}
