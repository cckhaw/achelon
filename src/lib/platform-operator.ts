import "server-only";
import { env } from "@/lib/env";

/**
 * Platform operators (D-55): people who may create, list and suspend communities. Configured ONLY through the
 * PLATFORM_ADMIN_EMAILS environment variable, so there is no sign-up path, no database flag and nothing inside the app
 * that can grant it. Being an operator gives no access to a community's members or data; that still needs a membership.
 */
export function isPlatformOperator(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = (env().PLATFORM_ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.trim().toLowerCase());
}
