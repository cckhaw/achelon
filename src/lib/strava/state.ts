import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { hkdfSync } from "node:crypto";
import { env } from "@/lib/env";

const key = () => new Uint8Array(hkdfSync("sha256", env().APP_SECRET, "achelon", "strava-state", 32));

export interface OAuthState { slug: string; userId: string; membershipId: string; share: boolean }

/** Signed, short-lived OAuth state bound to the signed-in user (callback must match the session; PaceVelo pattern). */
export async function encodeState(s: OAuthState): Promise<string> {
  return new SignJWT({ ...s }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("10m").sign(key());
}

export async function decodeState(raw: string): Promise<OAuthState | null> {
  try {
    const { payload } = await jwtVerify(raw, key(), { algorithms: ["HS256"] });
    if (typeof payload.slug !== "string" || typeof payload.userId !== "string" || typeof payload.membershipId !== "string") return null;
    return { slug: payload.slug, userId: payload.userId, membershipId: payload.membershipId, share: payload.share === true };
  } catch {
    return null;
  }
}
