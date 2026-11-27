import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { communitiesForUser } from "@/lib/system/tenants";
import { SetPasswordForm } from "@/components/forms/SetPasswordForm";

export const metadata: Metadata = { title: "Password" };
export const dynamic = "force-dynamic";

export default async function PasswordPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const [first] = await communitiesForUser(user.id);
  const needsCurrent = user.hasPassword && !user.fresh;
  return (
    <main className="auth-wrap" id="main">
      <p className="t-caps">Achelon</p>
      <h1 className="t-large mt-1">{user.hasPassword ? "Change password" : "Set a password"}</h1>
      <p className="muted mt-2 mb-6">
        {user.hasPassword ? (needsCurrent ? "Enter your current password and choose a new one. Other devices will be signed out." : "Choose a new password. Other devices will be signed out.") : "Sign in faster next time with your email and a password. You can always use an emailed link instead."}
      </p>
      <SetPasswordForm needsCurrent={needsCurrent} />
      <p className="mt-6"><Link href={first ? `/${first.slug}/me` : "/"}>{user.hasPassword ? "Cancel" : "Not now"}</Link></p>
    </main>
  );
}
