"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";
import { PullToRefresh } from "@/components/PullToRefresh";
import { NavProgress } from "@/components/NavProgress";

export interface NavItem { href: string; label: string; icon: IconName }

function isActive(pathname: string, href: string, root: string) {
  if (href === root) return pathname === root;
  return pathname === href || pathname.startsWith(href + "/");
}

export function AppShell({ root, tabs, extra, tenantName, children, navLabel }: {
  root: string; tabs: NavItem[]; extra: NavItem[]; tenantName: string; children: React.ReactNode; navLabel: string;
}) {
  const pathname = usePathname();
  const all = [...tabs, ...extra];
  return (
    <div className="shell">
      <a href="#main" className="skip-link">Skip to content</a>
      <nav className="sidebar" aria-label={navLabel}>
        <div style={{ padding: "0 0.75rem 1rem" }}>
          <p className="t-caps">Achelon</p>
          <p className="t-headline">{tenantName}</p>
        </div>
        {all.map((n) => (
          <Link key={n.href} href={n.href} className="side-link" aria-current={isActive(pathname, n.href, root) ? "page" : undefined}>
            <Icon name={n.icon} />
            <span>{n.label}</span>
          </Link>
        ))}
      </nav>
      <NavProgress />
      <PullToRefresh />
      <main id="main" className="shell-main" tabIndex={-1}>
        <div className="shell-inner">{children}</div>
      </main>
      <nav className="tabbar" aria-label={navLabel}>
        {tabs.map((n) => (
          <Link key={n.href} href={n.href} className="tab" aria-current={isActive(pathname, n.href, root) ? "page" : undefined}>
            <Icon name={n.icon} />
            <span>{n.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
