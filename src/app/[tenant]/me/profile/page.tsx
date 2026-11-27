import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/context";
import { withTenant } from "@/lib/db";
import { ownProfile } from "@/lib/services/profiles";
import { PageHeader } from "@/components/ui/NavBar";
import { ProfileForm } from "@/components/forms/ProfileForm";

export const metadata: Metadata = { title: "Profile and privacy" };

export default async function EditProfilePage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const ctx = await requireMember(tenant);
  const me = await withTenant(ctx.tenant.id, (tx) => ownProfile(tx, ctx.membership.id));
  if (!me) notFound();
  return (
    <>
      <PageHeader title="Profile" back={{ href: `/${ctx.tenant.slug}/me`, label: "Me" }} />
      <ProfileForm slug={ctx.tenant.slug} values={me.data} visibility={me.visibility} />
    </>
  );
}
