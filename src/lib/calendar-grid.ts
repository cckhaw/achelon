/** Pure month-grid maths on "YYYY-MM-DD" strings (no time zones involved: callers bucket instants into day keys first). */

const pad = (n: number) => String(n).padStart(2, "0");
export const keyOf = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const parse = (k: string) => { const [y, m, d] = k.split("-").map(Number); return { y, m, d }; };
const utc = (k: string) => { const { y, m, d } = parse(k); return Date.UTC(y, m - 1, d); };
export const addDays = (k: string, n: number) => new Date(utc(k) + n * 86_400_000).toISOString().slice(0, 10);
/** 0 = Sunday … 6 = Saturday */
export const weekday = (k: string) => new Date(utc(k)).getUTCDay();

export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

export function validMonth(ym: string | undefined): ym is string {
  return Boolean(ym && /^\d{4}-(0[1-9]|1[0-2])$/.test(ym));
}

/** Weeks of day keys covering the month. `firstDay`: 1 = Monday … 7 = Sunday (Intl weekInfo convention). */
export function monthGrid(ym: string, firstDay: number): { weeks: string[][]; start: string; end: string } {
  const first = `${ym}-01`;
  const lastDay = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5)), 0)).getUTCDate();
  const last = `${ym}-${pad(lastDay)}`;
  const startOffset = (weekday(first) - (firstDay % 7) + 7) % 7;
  const start = addDays(first, -startOffset);
  const endOffset = 6 - ((weekday(last) - (firstDay % 7) + 7) % 7);
  const end = addDays(last, endOffset);
  const weeks: string[][] = [];
  for (let d = start; d <= end; d = addDays(d, 7)) weeks.push(Array.from({ length: 7 }, (_, i) => addDays(d, i)));
  return { weeks, start, end };
}
