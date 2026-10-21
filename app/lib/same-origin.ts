/**
 * Cross-site requests can't change data: a browser always sends `Origin` on
 * POST/PUT/DELETE, and it must name the host the browser is talking to — the
 * `Host` header — not the server's own idea of its address (`next dev
 * --hostname 0.0.0.0` makes `req.url` say 0.0.0.0). Another website's request
 * carries that website's Origin, so it never matches. Framework-free.
 */

export function isSameOrigin(req: { url: string; headers: { get(name: string): string | null } }): boolean {
  const origin = req.headers.get('origin');
  if (!origin || origin === 'null') return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return false;
  }
  const hosts = new Set<string>();
  const host = req.headers.get('host');
  if (host) hosts.add(host.toLowerCase());
  try {
    hosts.add(new URL(req.url).host.toLowerCase());
  } catch {
    // Unparseable request URL: only the Host header counts.
  }
  return hosts.has(originHost);
}
