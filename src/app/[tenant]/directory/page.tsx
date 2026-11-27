import type { Metadata } from "next";
import { requireMember } from "@/lib/context";
import { withTenant } from "@/lib/db";
import { directoryFor } from "@/lib/services/profiles";
import { matchesFilters, type DirectoryFilters } from "@/lib/visibility";
import { LEVELS, OPEN_TO, SPORTS, type Level, type OpenTo, type Sport } from "@/db/constants";
import { PageHeader } from "@/components/ui/NavBar";
import { SheetButton } from "@/components/ui/Sheet";
import { Avatar, Badge, EmptyState, Group, Row } from "@/components/ui";
import { t, type MessageKey } from "@/lib/i18n";
import Link from "next/link";

export const metadata: Metadata = { title: "Directory" };

type SP = { q?: string; city?: string; sport?: string; level?: string; open?: string };
const pick = <T extends string>(v: string | undefined, all: readonly T[]) => (v && (all as readonly string[]).includes(v) ? (v as T) : undefined);

export default async function DirectoryPage({ params, searchParams }: { params: Promise<{ tenant: string }>; searchParams: Promise<SP> }) {
  const { tenant } = await params;
  const sp = await searchParams;
  const ctx = await requireMember(tenant, "directory.view");
  const base = `/${ctx.tenant.slug}`;
  const filters: DirectoryFilters = {
    q: sp.q?.slice(0, 80), city: sp.city?.slice(0, 80),
    sport: pick<Sport>(sp.sport, SPORTS), level: pick<Level>(sp.level, LEVELS), openTo: pick<OpenTo>(sp.open, OPEN_TO),
  };
  const all = await withTenant(ctx.tenant.id, (tx) => directoryFor(tx, ctx.viewer));
  const rows = all.filter((m) => matchesFilters(m, filters));
  const cities = [...new Set(all.map((m) => m.city).filter((c): c is string => Boolean(c)))].sort();
  const active = [filters.city, filters.sport, filters.level, filters.openTo].filter(Boolean).length;

  return (
    <>
      <PageHeader
        title="Directory"
        subtitle={`${rows.length} ${rows.length === 1 ? "member" : "members"}`}
        action={
          <SheetButton label={active ? `Filter (${active})` : "Filter"} title="Filter members" icon="filter">
            <form method="get" className="grid gap-4">
              {filters.q ? <input type="hidden" name="q" value={filters.q} /> : null}
              <div>
                <label className="field-label" htmlFor="f-city">City</label>
                <select id="f-city" name="city" className="select" defaultValue={filters.city ?? ""}>
                  <option value="">Any city</option>
                  {cities.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label" htmlFor="f-sport">Sport</label>
                <select id="f-sport" name="sport" className="select" defaultValue={filters.sport ?? ""}>
                  <option value="">Any sport</option>
                  {SPORTS.map((s) => <option key={s} value={s}>{t(`sport.${s}` as MessageKey)}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label" htmlFor="f-level">Level</label>
                <select id="f-level" name="level" className="select" defaultValue={filters.level ?? ""}>
                  <option value="">Any level</option>
                  {LEVELS.map((s) => <option key={s} value={s}>{t(`level.${s}` as MessageKey)}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label" htmlFor="f-open">Open to</label>
                <select id="f-open" name="open" className="select" defaultValue={filters.openTo ?? ""}>
                  <option value="">Anything</option>
                  {OPEN_TO.map((s) => <option key={s} value={s}>{t(`openTo.${s}` as MessageKey)}</option>)}
                </select>
              </div>
              <button className="btn btn-block">Show results</button>
              <Link href={base + "/directory"} className="btn btn-plain">Clear filters</Link>
            </form>
          </SheetButton>
        }
      />
      <form method="get" role="search" className="mb-2">
        <label className="sr-only" htmlFor="q">Search members</label>
        <input id="q" name="q" type="search" className="input" placeholder="Search name, company, city" defaultValue={filters.q ?? ""} enterKeyHint="search" />
        {filters.city ? <input type="hidden" name="city" value={filters.city} /> : null}
        {filters.sport ? <input type="hidden" name="sport" value={filters.sport} /> : null}
        {filters.level ? <input type="hidden" name="level" value={filters.level} /> : null}
        {filters.openTo ? <input type="hidden" name="open" value={filters.openTo} /> : null}
      </form>
      {rows.length ? (
        <Group>
          {rows.map((m) => (
            <Row
              key={m.membershipId}
              href={`${base}/members/${m.membershipId}`}
              leading={<Avatar name={m.displayName} url={m.photoUrl} />}
              title={<>{m.displayName} {m.role === "founding_member" ? <Badge>Founding</Badge> : null}</>}
              sub={[m.jobTitle, m.company].filter(Boolean).join(" · ") || [m.city, (m.sports ?? []).map((s) => t(`sport.${s}` as MessageKey)).join(", ")].filter(Boolean).join(" · ") || undefined}
            />
          ))}
        </Group>
      ) : (
        <EmptyState icon="directory" title="No members match" body="Try a different search or clear the filters. You can only filter on what members have chosen to share." />
      )}
    </>
  );
}
