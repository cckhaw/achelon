"use client";
import { useId, useState } from "react";

/** Password field with a "Show password" switch (fewer typos than a second confirm field; works with password managers). */
export function PasswordInput({ id = "password", name = "password", label, autoComplete = "current-password", error, hint, required = true }: {
  id?: string; name?: string; label: string; autoComplete?: "current-password" | "new-password"; error?: string; hint?: string; required?: boolean;
}) {
  const [show, setShow] = useState(false);
  const sw = useId();
  const described = [hint ? `${id}-hint` : null, error ? `${id}-err` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div>
      <label className="field-label" htmlFor={id}>{label}</label>
      <input id={id} name={name} className="input" type={show ? "text" : "password"} autoComplete={autoComplete} autoCapitalize="none" autoCorrect="off" spellCheck={false} required={required} minLength={autoComplete === "new-password" ? 10 : undefined} maxLength={128} aria-invalid={error ? true : undefined} aria-describedby={described} />
      {hint ? <p className="field-hint" id={`${id}-hint`}>{hint}</p> : null}
      {error ? <p className="field-error" id={`${id}-err`} role="alert">{error}</p> : null}
      <label className="row" htmlFor={sw} style={{ padding: "0.25rem 0" }}>
        <input id={sw} type="checkbox" role="switch" className="switch" checked={show} onChange={(e) => setShow(e.target.checked)} />
        <span className="row-main t-sub">Show password</span>
      </label>
    </div>
  );
}
