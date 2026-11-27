import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, and, inArray } from "drizzle-orm";
import { requireMember } from "@/lib/context";
import { schema, withTenant } from "@/lib/db";
import { PageHeader } from "@/components/ui/NavBar";
import { Avatar, EmptyState, Group, Row } from "@/components/ui";
import { directoryFor } from "@/lib/services/profiles";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Home" };

export default async function HomePage({ params, searchParams }: { params: Promise<{ tenant: string }>; searchParams: Promise<{ welcome?: string }> }) {
  const { tenant } = await params;
  const { welcome } = await searchParams;
  const ctx = await requireMember(tenant);
  const base = `/${ctx.tenant.slug}`;
  if (!ctx.can("directory.view")) redirect(`${base}/events`);

  const newest = await withTenant(ctx.tenant.id, async (tx) => (await directoryFor(tx, ctx.viewer)).filter((m) => m.membershipId !== ctx.membership.id).sort((a, b) => (b.joinedAt?.getTime() ?? 0) - (a.joinedAt?.getTime() ?? 0)).slice(0, 5));

  return (
    <>
      <PageHeader title={ctx.tenant.name} />
      {welcome ? <p className="form-ok mb-4" role="status">Welcome aboard. Your profile is set up; you can change it any time under Me.</p> : null}
      <HomeEvents ctx={ctx} />
      <Group title="New members" id="new">
        {newest.length ? newest.map((m) => (
          <Row key={m.membershipId} href={`${base}/members/${m.membershipId}`} leading={<Avatar name={m.displayName} url={m.photoUrl} />} title={m.displayName} sub={[m.jobTitle, m.company, m.city].filter(Boolean).join(" · ") || undefined} />
        )) : <div className="row muted">No other members yet.</div>}
      </Group>
      <p className="mt-6"><Link href={`${base}/directory`}>Browse the directory</Link></p>
    </>
  );
}

/** Replaced with real content in Phase 2 (events) and Phase 3 (races). */
function HomeEvents({ ctx }: { ctx: Awaited<ReturnType<typeof requireMember>> }) {
  void ctx;
  return <EmptyState title="Nothing scheduled yet" body="Upcoming rides, runs and races will appear here." icon="events" />;
}

void [desc, eq, and, inArray, schema];
