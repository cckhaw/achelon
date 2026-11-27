import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { purgeDeparted } from "@/lib/system/account";
import { flush, purgeSent } from "@/lib/mail/outbox";
import { runDailyJobs } from "@/lib/system/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Without the secret configured the route is closed. */
export async function GET(req: NextRequest) {
  const secret = env().CRON_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || !safeEqual(given, secret)) return new NextResponse(null, { status: 401 });
  const jobs = await runDailyJobs();
  const purged = await purgeDeparted();
  await purgeSent();
  const mail = await flush(100);
  return NextResponse.json({ ok: true, jobs, purged, mail }, { headers: { "Cache-Control": "no-store" } });
}
