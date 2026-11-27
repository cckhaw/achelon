export default function Loading() {
  return (
    <div role="status" aria-live="polite" aria-label="Loading">
      <div className="skeleton" style={{ height: "2.5rem", width: "55%", margin: "3.5rem 0 1.5rem" }} />
      <div className="skeleton" style={{ height: "5rem", marginBottom: "0.75rem" }} />
      <div className="skeleton" style={{ height: "5rem", marginBottom: "0.75rem" }} />
      <div className="skeleton" style={{ height: "5rem" }} />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
