import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { requireMember } from "@/lib/context";
import { schema, withTenant } from "@/lib/db";
import { PageHeader } from "@/components/ui/NavBar";
import { Group, Row } from "@/components/ui";
import { SheetButton } from "@/components/ui/Sheet";
import { DeleteAccountForm, PreferencesForm } from "@/components/forms/SettingsForms";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const ctx = await requireMember(tenant);
  const [prefs] = await withTenant(ctx.tenant.id, (tx) => tx.select().from(schema.notificationPreferences).where(eq(schema.notificationPreferences.membershipId, ctx.membership.id)));
  return (
    <>
      <PageHeader title="Settings" back={{ href: `/${ctx.tenant.slug}/me`, label: "Me" }} />
      <PreferencesForm slug={ctx.tenant.slug} prefs={{ eventAnnouncements: prefs?.eventAnnouncements ?? true, reminders: prefs?.reminders ?? true, waitlist: prefs?.waitlist ?? true, digest: prefs?.digest ?? "off" }} />

      <Group
        title="What admins can see"
        id="admin-note"
        footer="Admins can see an engagement summary: which events members attended and who has been quiet for a while. It is only visible to admins and it uses attendance you've chosen to record by signing up."
      >
        <Row title="Engagement summary" value="Admins only" />
      </Group>

      <Group title="Your data" id="data" footer="We keep the minimum needed to run the community. See what is collected and for how long in the privacy notes from your admins.">
        <a className="row" href="/api/export" download>
          <span className="row-main"><span className="row-title block">Export my data</span><span className="row-sub block">A JSON file with everything we hold about you.</span></span>
        </a>
      </Group>

      <div className="mt-6">
        <SheetButton label="Delete my account" title="Delete my account" className="btn btn-danger btn-block"><DeleteAccountForm slug={ctx.tenant.slug} /></SheetButton>
      </div>
    </>
  );
}
