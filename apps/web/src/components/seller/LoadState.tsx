import Link from 'next/link';
export default function LoadState({ error, retry }: { error?: string; retry: () => void }) {
  return error ? <div role="alert" className="space-y-3"><p>{error}</p><button className="btn btn-secondary" onClick={retry}>Try again</button> <Link href="/login?mode=seller" className="btn btn-secondary">Sign in</Link></div> : <p role="status">Loading…</p>;
}
