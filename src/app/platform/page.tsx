import type { Metadata } from "next";
import { listCommunities } from "@/lib/system/platform";
import { PageHeader } from "@/components/ui/NavBar";
import { SheetButton } from "@/components/ui/Sheet";
import { Badge, EmptyState, Group, Row } from "@/components/ui";
import { CreateCommunityForm } from "@/components/forms/PlatformForms";
import { viewerFormat } from "@/lib/viewer";

export const metadata: Metadata = { title: "Platform" };

export default async function PlatformPage() {
  const [communities, fmt] = await Promise.all([listCommunities(), viewerFormat()]);
  return (
    <>
      <PageHeader title="Communities" subtitle="Create and manage communities. Operators don't see member data." action={<SheetButton label="New community" title="New community" icon="plus" className="btn btn-sm"><CreateCommunityForm defaultTimezone="Asia/Singapore" /></SheetButton>} />
      {communities.length ? (
        <Group>
          {communities.map((c) => (
            <Row key={c.id} href={`/platform/${c.slug}`} title={<>{c.name} {c.suspendedAt ? <Badge tone="danger">Suspended</Badge> : null}</>} sub={`/${c.slug} · ${c.members} active ${c.members === 1 ? "member" : "members"} · ${c.events} events${c.lastActiveAt ? ` · active ${fmt.shortDate(c.lastActiveAt)}` : ""}`} />
          ))}
        </Group>
      ) : <EmptyState icon="directory" title="No communities yet" body="Create the first one." />}
    </>
  );
}
