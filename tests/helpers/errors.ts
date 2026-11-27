/** Resolve to the full message chain of a rejection (drizzle wraps the Postgres error in `cause`). */
export async function rejection(p: Promise<unknown> | (() => Promise<unknown>)): Promise<string> {
  try {
    await (typeof p === "function" ? p() : p);
  } catch (e) {
    const parts: string[] = [];
    let cur: unknown = e;
    while (cur instanceof Error) {
      parts.push(cur.message);
      cur = (cur as { cause?: unknown }).cause;
    }
    return parts.join(" | ");
  }
  throw new Error("expected promise to reject");
}
