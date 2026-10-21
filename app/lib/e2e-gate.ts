/**
 * The gate for test-only sign-in (Playwright's stand-in for Google). Three
 * locks, all required — a hole here would mean account takeover:
 *
 *   1. Compile-out: `next build` inlines NODE_ENV, so in a production bundle
 *      both functions are `return false` and the test code is dead.
 *   2. KK_E2E=1 must be set.
 *   3. The request must carry X-KK-E2E-Secret equal to KK_E2E_SECRET (≥ 32
 *      chars), compared in constant time. KK_E2E_SECRET exists only in local /
 *      CI env — it is NEVER a Worker secret (see wrangler.jsonc).
 */

export function isE2eEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  return process.env.KK_E2E === '1' && (process.env.KK_E2E_SECRET?.length ?? 0) >= 32;
}

export function e2eSecretMatches(provided: string | null | undefined): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  const expected = process.env.KK_E2E_SECRET ?? '';
  if (expected.length < 32 || typeof provided !== 'string') return false;
  const a = new TextEncoder().encode(provided);
  const b = new TextEncoder().encode(expected);
  // Constant time over the expected length; a length mismatch still fails.
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i];
  return diff === 0;
}
