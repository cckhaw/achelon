import { NextResponse } from "next/server";
import { currentUser } from "@/lib/session";
import { exportUserData } from "@/lib/system/account";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  if (!user) return new NextResponse(null, { status: 401 });
  const data = await exportUserData(user.id);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="achelon-my-data.json"', "Cache-Control": "no-store" },
  });
}
