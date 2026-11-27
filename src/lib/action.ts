import "server-only";
import { unstable_rethrow } from "next/navigation";
import { failure, type ActionState } from "@/lib/forms";
import { ForbiddenError } from "@/lib/context";
import { t } from "@/lib/i18n";

/** Wraps a server action body: permission failures become form errors; redirects pass through; the rest are logged. */
export async function run(fn: () => Promise<ActionState>): Promise<ActionState> {
  try {
    return await fn();
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof ForbiddenError) return failure(e.message === "Forbidden" ? t("common.error.forbidden") : e.message);
    console.error("[action]", e instanceof Error ? e.message : e);
    return failure(t("common.error.generic"));
  }
}
