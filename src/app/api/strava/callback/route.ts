import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getMemberContext } from "@/lib/context";
import { currentUser } from "@/lib/session";
import { getProvider } from "@/lib/strava/provider";
import { decodeState } from "@/lib/strava/state";
import { saveConnection, syncMember } from "@/lib/strava/service";

export const dynamic = "force-dynamic";

const back = (slug: string, result: string) => NextResponse.redirect(`${env().APP_URL}/${slug}/settings?strava=${result}`, 303);

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const provider = getProvider();
  const state = await decodeState(p.get("state") ?? "");
  const user = await currentUser();
  // The callback must come back to the same signed-in person who started it.
  if (!provider || !state || !user || user.id !== state.userId) return new NextResponse(null, { status: 404 });
  const ctx = await getMemberContext(state.slug);
  if (!ctx || ctx.membership.id !== state.membershipId) return new NextResponse(null, { status: 404 });

  const code = p.get("code");
  if (p.get("error") || !code) return back(state.slug, "denied");
  // Live mode: the athlete can untick activity access on Strava's consent screen; we need it, so say so.
  if (provider.mode === "live" && !(p.get("scope") ?? "").includes("activity:read")) return back(state.slug, "scope");

  try {
    const tokens = await provider.exchangeCode(code);
    const saved = await saveConnection(ctx.tenant.id, ctx.membership.id, tokens, state.share);
    if (!saved.ok) {
      await provider.deauthorize(tokens.accessToken).catch(() => undefined);
      return back(state.slug, "linked");
    }
    await syncMember(ctx.tenant.id, ctx.membership.id).catch((e) => console.error("[strava] first sync", e instanceof Error ? e.message : e));
    return back(state.slug, "connected");
  } catch (e) {
    console.error("[strava] callback", e instanceof Error ? e.message : e);
    return back(state.slug, "error");
  }
}
