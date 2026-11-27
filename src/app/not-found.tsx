import Link from "next/link";

export default function NotFound() {
  return (
    <main className="auth-wrap" id="main">
      <p className="t-caps">404</p>
      <h1 className="t-large mt-1">Not found</h1>
      <p className="muted mt-2 mb-6">That page doesn&apos;t exist, or you don&apos;t have access to it.</p>
      <Link href="/" className="btn">Go home</Link>
    </main>
  );
}
