"use client";
import { useEffect, useId, useState } from "react";

export function TimezoneInput({ defaultValue, invalid }: { defaultValue: string; invalid?: boolean }) {
  const [value, setValue] = useState(defaultValue);
  const [zones, setZones] = useState<string[]>([]);
  const list = useId();

  useEffect(() => {
    try {
      if (!defaultValue) setValue(Intl.DateTimeFormat().resolvedOptions().timeZone ?? "");
      const sv = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
      setZones(sv ? sv("timeZone") : []);
    } catch { /* leave empty */ }
  }, [defaultValue]);

  return (
    <>
      <input id="timezone" name="timezone" className="input" list={list} value={value} onChange={(e) => setValue(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-invalid={invalid || undefined} aria-describedby="timezone-hint" />
      <datalist id={list}>{zones.map((z) => <option key={z} value={z} />)}</datalist>
    </>
  );
}
