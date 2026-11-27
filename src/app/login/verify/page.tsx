import type { Metadata } from "next";
import { VerifyForm } from "@/components/forms/VerifyForm";

export const metadata: Metadata = { title: "Confirm sign-in" };
export const dynamic = "force-dynamic";

/** A GET never consumes the token: mail scanners and link previews would burn it (D-6). */
export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <main className="auth-wrap" id="main">
      <p className="t-caps">Achelon</p>
      <h1 className="t-large mt-1">Confirm sign-in</h1>
      <p className="muted mt-2 mb-6">Tap continue to finish signing in on this device.</p>
      {token ? <VerifyForm token={token} /> : <p className="form-error" role="alert">This link is incomplete. Request a new one from the sign-in page.</p>}
    </main>
  );
}
