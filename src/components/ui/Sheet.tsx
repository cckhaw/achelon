"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";

/** Native <dialog> sheet: bottom sheet on phones, centred on wide screens. Focus trap and Esc come from the platform. */
export function SheetButton({
  label, title, children, className = "btn btn-tinted btn-sm", icon, closeOnSubmit = false, defaultOpen = false,
}: { label: ReactNode; title: string; children: ReactNode; className?: string; icon?: "plus" | "filter" | "link"; closeOnSubmit?: boolean; defaultOpen?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(defaultOpen);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)} aria-haspopup="dialog">
        {icon ? <Icon name={icon} width={18} height={18} /> : null}
        {label}
      </button>
      <dialog
        ref={ref}
        className="sheet"
        aria-labelledby={titleId}
        onClose={() => setOpen(false)}
        onClick={(e) => { if (e.target === ref.current) setOpen(false); }}
        onSubmit={closeOnSubmit ? () => setTimeout(() => setOpen(false), 0) : undefined}
      >
        <div className="sheet-grab" aria-hidden="true" />
        <div className="sheet-head">
          <h2 id={titleId} className="t-headline">{title}</h2>
          <button type="button" className="btn btn-plain" onClick={() => setOpen(false)}>Done</button>
        </div>
        <div className="sheet-body">{children}</div>
      </dialog>
    </>
  );
}
