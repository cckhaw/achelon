import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
export const sha256Hex = (s: string) => createHash("sha256").update(s).digest("hex");

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function subkey(purpose: string): Buffer {
  return Buffer.from(hkdfSync("sha256", env().APP_SECRET, "achelon", purpose, 32));
}

/** Keyed hash so rate-limit buckets never store raw emails or IPs. */
export const bucketKey = (scope: string, id: string) =>
  createHmac("sha256", subkey("rate-limit")).update(`${scope}:${id.trim().toLowerCase()}`).digest("hex");

const PREFIX = "enc:v1:";
/** AES-256-GCM for OAuth tokens at rest (same envelope as PaceVelo). */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", subkey("secrets"), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return PREFIX + [iv, c.getAuthTag(), ct].map((b) => b.toString("base64url")).join(".");
}
export function decryptSecret(stored: string): string {
  if (!stored.startsWith(PREFIX)) throw new Error("Unrecognised secret format");
  const [iv, tag, ct] = stored.slice(PREFIX.length).split(".").map((p) => Buffer.from(p, "base64url"));
  const d = createDecipheriv("aes-256-gcm", subkey("secrets"), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
}
