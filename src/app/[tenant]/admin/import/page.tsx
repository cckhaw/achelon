import type { Metadata } from "next";
import { requireMember } from "@/lib/context";
import { PageHeader } from "@/components/ui/NavBar";
import { ImportForm } from "@/components/forms/AdminForms";

export const metadata: Metadata = { title: "Import · Admin" };

export default async function ImportPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const ctx = await requireMember(tenant, "import.run");
  return (
    <>
      <PageHeader back={{ href: `/${ctx.tenant.slug}/admin`, label: "Admin" }} title="Import" subtitle="Bring existing members over from a CSV. You see a dry-run preview first." />
      <ImportForm slug={ctx.tenant.slug} />
    </>
  );
}
