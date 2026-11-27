/** Client-safe password policy (no Node imports), shared by forms and server validation. */
export const MIN_PASSWORD = 10;
export const MAX_PASSWORD = 128;

// The most common choices that still satisfy a pure length rule. Not exhaustive; length does the real work.
const COMMON = new Set(["password12", "password123", "1234567890", "12345678910", "qwertyuiop", "iloveyou12", "welcome123", "letmein123", "administrator", "passw0rd123", "abcdefghij", "0123456789", "1q2w3e4r5t", "qwerty12345", "changeme123", "password1234", "trustno1234", "football123", "cycling1234", "running1234"]);

export function passwordProblem(password: string, email?: string | null): string | null {
  if (password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters. A few random words make a strong, memorable password.`;
  if (password.length > MAX_PASSWORD) return `Use at most ${MAX_PASSWORD} characters.`;
  const lower = password.toLowerCase();
  if (COMMON.has(lower) || /^(.)\1+$/.test(password)) return "That password is too easy to guess. Try a longer phrase.";
  const local = email?.split("@")[0]?.toLowerCase();
  if (email && (lower === email.toLowerCase() || (local && local.length >= 4 && lower.includes(local)))) return "Your password can't contain your email address.";
  return null;
}
