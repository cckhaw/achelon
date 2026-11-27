import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { communitiesForUser } from "@/lib/system/tenants";
import { signOutAction } from "@/app/actions/auth";
import { Group, Row } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function RootPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const communities = await communitiesForUser(user.id);
  if (communities.length === 1) redirect(`/${communities[0].slug}`);
  return (
    <main className="auth-wrap" id="main">
      <p className="t-caps">Achelon</p>
      <h1 className="t-large mt-1">{communities.length ? "Your communities" : "No community yet"}</h1>
      {communities.length ? (
        <Group>{communities.map((c) => <Row key={c.slug} href={`/${c.slug}`} title={c.name} />)}</Group>
      ) : (
        <p className="muted mt-2">You&apos;re signed in, but you aren&apos;t an active member of any community. Ask a member to sponsor you, or check your invitation email.</p>
      )}
      <form action={signOutAction} className="mt-8"><button className="btn btn-tinted btn-block">Sign out</button></form>
    </main>
  );
}
