import "server-only";
import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * Password hashing with scrypt (Node built-in, memory-hard, no native dependency): `scrypt$N$r$p$salt$hash`.
 * Parameters are stored with each hash, so they can be raised later and old hashes still verify.
 */
const N = 2 ** 15, R = 8, P = 1, KEYLEN = 32;
const MAXMEM = 128 * N * R * 2;

const derive = (password: string, salt: Buffer, n: number, r: number, p: number, len: number) =>
  new Promise<Buffer>((resolve, reject) => scryptCb(password.normalize("NFKC"), salt, len, { N: n, r, p, maxmem: 128 * n * r * 2 } satisfies ScryptOptions, (e, k) => (e ? reject(e) : resolve(k))));

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P, KEYLEN);
  return ["scrypt", N, R, P, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !salt || !hash) return false;
  try {
    const expected = Buffer.from(hash, "base64url");
    const got = await derive(password, Buffer.from(salt, "base64url"), Number(n), Number(r), Number(p), expected.length);
    return got.length === expected.length && timingSafeEqual(got, expected);
  } catch {
    return false;
  }
}

/** A real hash of a random secret: unknown accounts verify against it so "no such user" costs the same time. */
let dummy: Promise<string> | undefined;
export const dummyHash = () => (dummy ??= hashPassword(randomBytes(18).toString("base64url")));
void MAXMEM;
