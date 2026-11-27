import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { isProd } from "@/lib/env";
import { createSessionRow, destroySession, lookupSession, SESSION_TTL_DAYS, type SessionUser } from "@/lib/system/auth";

export const SESSION_COOKIE = isProd() ? "__Host-achelon_session" : "achelon_session";

export async function startSession(userId: string, o: { viaLink?: boolean } = {}) {
  const { token, expires } = await createSessionRow(userId, o);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProd(),
    sameSite: "lax",
    path: "/",
    expires,
    maxAge: SESSION_TTL_DAYS * 86_400,
  });
}

export async function endSession() {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (raw) await destroySession(raw);
  jar.delete(SESSION_COOKIE);
}

/** The signed-in user for this request, or null. Cached per request. */
export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  return lookupSession(raw);
});
