import { requireMember } from "@/lib/context";


/** Permission guard in a layout: it runs before any loading boundary streams, so refusals are a real HTTP 404. */
export default async function Guard({ children, params }: { children: React.ReactNode; params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const ctx = await requireMember(tenant, "directory.view");
  
  return children;
}
