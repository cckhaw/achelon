"use client";
import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

export function SubmitButton({ children, className = "btn", pendingLabel }: { children: ReactNode; className?: string; pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} aria-disabled={pending} disabled={pending}>
      {pending ? <span className="spinner" aria-hidden="true" /> : null}
      <span>{pending ? (pendingLabel ?? "Working…") : children}</span>
    </button>
  );
}
