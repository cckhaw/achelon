import type { RaceItem } from "./races";

/** Normalise a race name so "Sentosa Half-Marathon" and "sentosa half marathon" group together. */
export const normaliseRaceName = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

export interface RaceGroup {
  key: string;
  raceName: string;
  raceDate: string;
  location: string | null;
  distances: string[];
  externalEventId: string | null;
  entries: RaceItem[];
}

/** Group declarations by linked event when there is one, otherwise by normalised name + date. Sorted by date, then name. */
export function groupRaces(items: RaceItem[]): RaceGroup[] {
  const map = new Map<string, RaceGroup>();
  for (const r of items) {
    const key = r.externalEventId ? `e:${r.externalEventId}` : `n:${normaliseRaceName(r.raceName)}|${r.raceDate}`;
    const g = map.get(key) ?? { key, raceName: r.raceName, raceDate: r.raceDate, location: r.location, distances: [], externalEventId: r.externalEventId, entries: [] };
    g.location ??= r.location;
    if (r.distance && !g.distances.includes(r.distance)) g.distances.push(r.distance);
    g.entries.push(r);
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => a.raceDate.localeCompare(b.raceDate) || a.raceName.localeCompare(b.raceName));
}
