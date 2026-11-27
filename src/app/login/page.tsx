import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { LoginForm } from "@/components/forms/LoginForm";
import { t } from "@/lib/i18n";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await currentUser()) redirect("/");
  const { error } = await searchParams;
  return (
    <main className="auth-wrap" id="main">
      <p className="t-caps">Achelon</p>
      <h1 className="t-large mt-1">{t("login.title")}</h1>
      <p className="muted mt-2 mb-6">{t("login.lede")}</p>
      {error === "link" ? <p className="form-error mb-4" role="alert">That link has expired or was already used. Request a new one below.</p> : null}
      <LoginForm />
      <p className="t-foot muted mt-8">Achelon is invite-only. If you haven&apos;t been invited yet, ask a member to sponsor you.</p>
    </main>
  );
}
