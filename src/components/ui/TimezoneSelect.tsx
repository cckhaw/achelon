import { timezoneGroups } from "@/lib/timezones";

/** Dropdown of IANA time zones with GMT offsets, Malaysia first. Works in server and client components. */
export function TimezoneSelect({ id = "timezone", name = "timezone", defaultValue, blankLabel, ...aria }: {
  id?: string; name?: string; defaultValue?: string | null; blankLabel?: string; "aria-invalid"?: boolean; "aria-describedby"?: string;
}) {
  const { common, others } = timezoneGroups(defaultValue);
  return (
    <select id={id} name={name} className="select" defaultValue={defaultValue ?? ""} {...aria}>
      {blankLabel ? <option value="">{blankLabel}</option> : null}
      <optgroup label="Common">{common.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup>
      <optgroup label="All time zones">{others.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup>
    </select>
  );
}
