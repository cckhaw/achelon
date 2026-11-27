import { NextResponse, type NextRequest } from "next/server";
import { getMemberContext } from "@/lib/context";
import { getProvider } from "@/lib/strava/provider";
import { encodeState } from "@/lib/strava/state";

export const dynamic = "force-dynamic";

/** Starts the opt-in OAuth flow. Needs a signed-in member; the state is bound to them and expires in 10 minutes. */
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("tenant") ?? "";
  const ctx = await getMemberContext(slug);
  const provider = getProvider();
  if (!ctx || !provider) return new NextResponse(null, { status: 404 });
  const state = await encodeState({ slug: ctx.tenant.slug, userId: ctx.user.id, membershipId: ctx.membership.id, share: req.nextUrl.searchParams.get("share") === "on" });
  return NextResponse.redirect(provider.authorizeUrl(state), 303);
}
