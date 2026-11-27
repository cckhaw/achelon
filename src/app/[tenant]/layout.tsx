import { AppShell, type NavItem } from "@/components/AppShell";
import { requireMember } from "@/lib/context";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function TenantLayout({ children, params }: { children: React.ReactNode; params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const ctx = await requireMember(tenant);
  const base = `/${ctx.tenant.slug}`;
  const guest = ctx.membership.role === "guest";

  const tabs: NavItem[] = guest
    ? [
        { href: `${base}/events`, label: t("nav.events"), icon: "events" },
        { href: `${base}/calendar`, label: t("nav.calendar"), icon: "calendar" },
        { href: `${base}/me`, label: t("nav.me"), icon: "me" },
      ]
    : [
        { href: base, label: t("nav.home"), icon: "home" },
        { href: `${base}/events`, label: t("nav.events"), icon: "events" },
        { href: `${base}/directory`, label: t("nav.directory"), icon: "directory" },
        { href: `${base}/calendar`, label: t("nav.calendar"), icon: "calendar" },
        { href: `${base}/me`, label: t("nav.me"), icon: "me" },
      ];
  const extra: NavItem[] = [];
  if (ctx.can("races.view")) extra.push({ href: `${base}/races`, label: t("nav.races"), icon: "races" });
  if (ctx.can("admin.access")) extra.push({ href: `${base}/admin`, label: t("nav.admin"), icon: "admin" });

  return (
    <AppShell root={base} tabs={tabs} extra={extra} tenantName={ctx.tenant.name} navLabel={t("nav.primary")} brand={ctx.settings.branding?.tint}>
      {children}
    </AppShell>
  );
}
