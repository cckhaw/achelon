import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { isPlatformOperator } from "@/lib/platform-operator";

export const dynamic = "force-dynamic";

/** Operators only. Everyone else gets a plain 404 (the area is not advertised, and a refusal is not distinguishable from "no such page"). */
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!isPlatformOperator(user.email)) notFound();
  return (
    <div className="shell">
      <a href="#main" className="skip-link">Skip to content</a>
      <main id="main" className="platform-main" tabIndex={-1}>
        <p className="t-caps" style={{ paddingTop: "calc(1rem + env(safe-area-inset-top))" }}>Achelon platform</p>
        {children}
        <p className="mt-8"><Link href="/">Back to the app</Link></p>
      </main>
    </div>
  );
}
