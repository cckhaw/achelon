import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { after } from "next/server";
import { and, eq, lt, or, isNull } from "drizzle-orm";
import type { MembershipRole } from "@/db/constants";
import { schema, withTenant } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { tenantBySlug, tenantSettings, membershipFor, type TenantRow } from "@/lib/system/tenants";
import { can, type Permission } from "@/lib/rbac";
import type { SessionUser } from "@/lib/system/auth";
import type { Viewer } from "@/lib/visibility";

export interface MemberContext {
  user: SessionUser;
  tenant: TenantRow;
  settings: ReturnType<typeof tenantSettings>;
  membership: { id: string; role: MembershipRole };
  viewer: Viewer;
  can: (p: Permission) => boolean;
}

export class ForbiddenError extends Error {
  constructor(msg = "Forbidden") {
    super(msg);
    this.name = "ForbiddenError";
  }
}

/** Resolve the caller's access to a community. Returns null (never a reason) for unknown tenant / non-member / paused. */
export const getMemberContext = cache(async (slug: string): Promise<MemberContext | null> => {
  const user = await currentUser();
  if (!user) return null;
  const tenant = await tenantBySlug(slug);
  if (!tenant) return null;
  const m = await membershipFor(user.id, tenant.id);
  if (!m || m.status !== "active") return null;
  // Throttled activity stamp (engagement summary): at most hourly, off the request path.
  if (!m.lastActiveAt || Date.now() - m.lastActiveAt.getTime() > 3_600_000) {
    const stamp = async () => {
      try {
        await withTenant(tenant.id, (tx) =>
          tx.update(schema.memberships).set({ lastActiveAt: new Date() })
            .where(and(eq(schema.memberships.id, m.id), or(isNull(schema.memberships.lastActiveAt), lt(schema.memberships.lastActiveAt, new Date(Date.now() - 3_600_000))))));
      } catch { /* non-critical */ }
    };
    try { after(stamp); } catch { /* outside a request scope (tests, scripts): skip */ }
  }
  return {
    user,
    tenant,
    settings: tenantSettings(tenant),
    membership: { id: m.id, role: m.role },
    viewer: { membershipId: m.id, role: m.role },
    can: (p) => can(m.role, p),
  };
});

/** For pages: sends anonymous users to login; hides existence of tenants and admin areas with a 404. */
export async function requireMember(slug: string, perm?: Permission): Promise<MemberContext> {
  const user = await currentUser();
  if (!user) redirect("/login");
  const ctx = await getMemberContext(slug);
  if (!ctx) notFound();
  if (perm && !ctx.can(perm)) notFound();
  return ctx;
}

/** For server actions: throws ForbiddenError instead of redirecting. */
export async function requireMemberForAction(slug: string, perm?: Permission): Promise<MemberContext> {
  const ctx = await getMemberContext(slug);
  if (!ctx) throw new ForbiddenError();
  if (perm && !ctx.can(perm)) throw new ForbiddenError();
  return ctx;
}
