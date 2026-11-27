"use client";
import { useEffect, useState } from "react";
import { staticTimezoneGroups, timezoneGroups } from "@/lib/timezones";

/**
 * Dropdown of IANA time zones with GMT offsets, Malaysia first. The first render (server and hydration) is a fixed list so
 * it can never mismatch; after mount it expands to every zone with live offsets.
 */
export function TimezoneSelect({ id = "timezone", name = "timezone", defaultValue, blankLabel, ...aria }: {
  id?: string; name?: string; defaultValue?: string | null; blankLabel?: string; "aria-invalid"?: boolean; "aria-describedby"?: string;
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [live, setLive] = useState(false);
  useEffect(() => setLive(true), []);
  const { common, others } = live ? timezoneGroups(defaultValue) : staticTimezoneGroups(defaultValue);
  return (
    <select id={id} name={name} className="select" value={value} onChange={(e) => setValue(e.target.value)} {...aria}>
      {blankLabel ? <option value="">{blankLabel}</option> : null}
      <optgroup label="Common">{common.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup>
      {others.length ? <optgroup label="All time zones">{others.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup> : null}
    </select>
  );
}
