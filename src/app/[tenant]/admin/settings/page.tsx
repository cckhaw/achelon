import type { Metadata } from "next";
import { requireMember } from "@/lib/context";
import { PageHeader } from "@/components/ui/NavBar";
import { SettingsForm } from "@/components/forms/AdminForms";

export const metadata: Metadata = { title: "Community settings · Admin" };

export default async function CommunitySettings({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const ctx = await requireMember(tenant, "settings.manage");
  return (
    <>
      <PageHeader back={{ href: `/${ctx.tenant.slug}/admin`, label: "Admin" }} title="Community settings" />
      <SettingsForm slug={ctx.tenant.slug} values={{ name: ctx.tenant.name, defaultTimezone: ctx.settings.defaultTimezone, types: ctx.settings.allowedEventTypes, sponsorship: ctx.settings.sponsorshipEnabled }} />
    </>
  );
}
