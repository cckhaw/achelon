"use client";
import { useState } from "react";

export function CopyField({ value, label = "Invitation link" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <div>
      <label className="field-label" htmlFor="copy-field">{label}</label>
      <div className="flex gap-2">
        <input id="copy-field" className="input" readOnly value={value} onFocus={(e) => e.currentTarget.select()} />
        <button
          type="button"
          className="btn btn-tinted"
          onClick={async () => {
            try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 2000); } catch { /* user can select the text */ }
          }}
        >
          {done ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="sr-only" role="status">{done ? "Copied to clipboard" : ""}</p>
    </div>
  );
}
