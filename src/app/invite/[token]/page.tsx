import type { Metadata } from "next";
import { clientIp, hit, RULES } from "@/lib/rate-limit";
import { viewInvite } from "@/lib/system/invite-accept";
import { InviteForm } from "@/components/forms/InviteForm";
import { AuthShell } from "@/components/brand/AuthShell";

export const metadata: Metadata = { title: "Accept invitation" };
export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const allowed = await hit("invite-view", await clientIp(), RULES.inviteView);
  const invite = allowed && token.length <= 200 ? await viewInvite(token) : null;

  if (!allowed) {
    return (
      <AuthShell>
        <h1>Please wait</h1>
        <p className="b-sub">Too many attempts. Try again in a few minutes.</p>
      </AuthShell>
    );
  }
  if (!invite) {
    // Identical for unknown, used, revoked and expired links.
    return (
      <AuthShell>
        <h1>Invitation unavailable</h1>
        <p className="b-sub">This invitation link isn&apos;t valid any more. Ask the person who invited you to send a new one.</p>
      </AuthShell>
    );
  }
  return (
    <AuthShell wide>
      <p className="t-caps" style={{ color: "var(--card-muted)" }}>{invite.tenantName}</p>
      <h1 className="mt-1">Welcome</h1>
      <p className="b-sub">
        {invite.inviter ? `${invite.inviter} invited you to join ` : "You've been invited to join "}
        <strong>{invite.tenantName}</strong>. A short profile and you&apos;re in. You choose who sees what.
      </p>
      <InviteForm token={token} boundEmail={invite.email} tenantName={invite.tenantName} prefill={invite.prefill} />
    </AuthShell>
  );
}
