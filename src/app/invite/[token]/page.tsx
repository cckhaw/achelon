import type { Metadata } from "next";
import { clientIp, hit, RULES } from "@/lib/rate-limit";
import { viewInvite } from "@/lib/system/invite-accept";
import { InviteForm } from "@/components/forms/InviteForm";

export const metadata: Metadata = { title: "Accept invitation" };
export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const allowed = await hit("invite-view", await clientIp(), RULES.inviteView);
  const invite = allowed && token.length <= 200 ? await viewInvite(token) : null;

  if (!allowed) {
    return (
      <main className="auth-wrap" id="main">
        <h1 className="t-large">Please wait</h1>
        <p className="muted mt-2">Too many attempts. Try again in a few minutes.</p>
      </main>
    );
  }
  if (!invite) {
    // Identical for unknown, used, revoked and expired links.
    return (
      <main className="auth-wrap" id="main">
        <p className="t-caps">Achelon</p>
        <h1 className="t-large mt-1">Invitation unavailable</h1>
        <p className="muted mt-2">This invitation link isn&apos;t valid any more. Ask the person who invited you to send a new one.</p>
      </main>
    );
  }
  return (
    <main className="auth-wrap" id="main" style={{ maxWidth: "36rem", justifyContent: "flex-start" }}>
      <p className="t-caps">Achelon · {invite.tenantName}</p>
      <h1 className="t-large mt-1">Welcome</h1>
      <p className="muted mt-2 mb-6">
        {invite.inviter ? `${invite.inviter} invited you to join ` : "You've been invited to join "}
        <strong>{invite.tenantName}</strong>. A short profile and you&apos;re in. You choose who sees what.
      </p>
      <InviteForm token={token} boundEmail={invite.email} tenantName={invite.tenantName} prefill={invite.prefill} />
    </main>
  );
}
