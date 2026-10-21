/**
 * Sign-in for KaamSolv accounts — better-auth (pinned 1.7.12), server only.
 *
 * Google, plus an email sign-in link (no passwords). Sessions live in our own
 * Postgres (`auth_*` tables, migration 0003). Nothing outside this file and
 * app/lib/session.ts imports better-auth, so it can be swapped without touching
 * invoices, profiles or entitlements (docs/products/accounts.md, fallback).
 *
 * Secrets (Worker secrets in production; .env.local in dev):
 *   BETTER_AUTH_SECRET            required in production
 *   GOOGLE_CLIENT_ID / _SECRET    Google button shown only when both are set
 *   RESEND_API_KEY                sign-in emails (app/lib/email.ts)
 */

import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { APIError, createAuthEndpoint } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import { betterAuth } from 'better-auth/minimal';
import { handleOAuthUserInfo } from 'better-auth/oauth2';
import { magicLink } from 'better-auth/plugins/magic-link';
import { getDb } from '@/db/client';
import { consumeRateLimits } from '@/db/rate-limits';
import { authAccounts, authSessions, authUsers, authVerifications } from '@/db/schema';
import { e2eSecretMatches, isE2eEnabled } from './e2e-gate';
import { signInEmail, sendEmail } from './email';
import { clientIp, hashIp, resolveIpHashSalt } from './ip-hash';
import { rateLimitChecks } from './rate-limit';
import { isProductionServer } from './runtime-platform';

/** Only under `next dev` and tests. Never valid on a production server. */
const LOCAL_DEV_SECRET = 'kaamsolv-local-dev-auth-secret-not-for-production';

export const SIGN_IN_LINK_MINUTES = 15;

const NO_TOKENS = {
  accessToken: null,
  refreshToken: null,
  idToken: null,
  accessTokenExpiresAt: null,
  refreshTokenExpiresAt: null,
};
const DAY = 24 * 60 * 60;

function resolveSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET?.trim();
  if (secret) return secret;
  if (isProductionServer()) {
    throw new Error('BETTER_AUTH_SECRET is not set for this deployment. Set it as a Worker secret and redeploy.');
  }
  return LOCAL_DEV_SECRET;
}

function resolveBaseUrl(): string {
  const configured = process.env.BETTER_AUTH_URL?.trim();
  if (configured) return configured;
  return isProductionServer() ? 'https://kaamsolv.com' : 'http://localhost:3000';
}

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());
}

/** Rate-limit sign-in emails per caller and per address. Over the limit → silently not sent. */
async function allowSignInEmail(email: string, headers: Headers | undefined): Promise<boolean> {
  const db = await getDb();
  const salt = resolveIpHashSalt();
  const ipHash = await hashIp(headers ? clientIp(headers) : 'unknown', salt);
  const emailHash = await hashIp(`email:${email.toLowerCase()}`, salt);
  const decision = await consumeRateLimits(db, [
    ...rateLimitChecks('accounts', 'signInLinkIp', ipHash),
    ...rateLimitChecks('accounts', 'signInLinkEmail', emailHash),
  ]);
  return decision.allowed;
}

/**
 * Test-only: sign in "with Google" without Google (Playwright can't drive
 * Google's real login). Runs better-auth's own `handleOAuthUserInfo()` — the
 * function Google's callback runs — so account creation and linking are real.
 * Server-only endpoint (not reachable over HTTP); only registered when
 * isE2eEnabled(); reached through app/api/test/oauth-sign-in, which checks the
 * secret header too. The secret is re-checked here.
 */
const e2eOAuthPlugin = () => ({
  id: 'kk-e2e-oauth',
  endpoints: {
    kkE2eOAuthSignIn: createAuthEndpoint(
      '/kk-e2e/oauth-sign-in',
      { method: 'POST', metadata: { SERVER_ONLY: true }, requireHeaders: true },
      async (ctx) => {
        if (!isE2eEnabled() || !e2eSecretMatches(ctx.headers?.get('x-kk-e2e-secret'))) {
          throw new APIError('NOT_FOUND');
        }
        const body = (ctx.body ?? {}) as { email?: unknown; name?: unknown };
        const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
        if (!email.includes('@')) throw new APIError('BAD_REQUEST', { message: 'email required' });
        const name = typeof body.name === 'string' ? body.name : 'Test User';
        const subject = `e2e-${email}`;
        const result = await handleOAuthUserInfo(ctx, {
          userInfo: { id: subject, email, name, emailVerified: true, image: null },
          account: { providerId: 'google', accountId: subject },
          callbackURL: '/',
        });
        if (result.error || !result.data) throw new APIError('BAD_REQUEST', { message: String(result.error) });
        await setSessionCookie(ctx, { session: result.data.session, user: result.data.user });
        return ctx.json({ userId: result.data.user.id });
      },
    ),
  },
});

async function createAuth() {
  const db = await getDb();
  const baseURL = resolveBaseUrl();
  const google = googleConfigured()
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID!.trim(),
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!.trim(),
          prompt: 'select_account' as const,
        },
      }
    : {};

  return betterAuth({
    appName: 'KaamSolv',
    baseURL,
    secret: resolveSecret(),
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: { user: authUsers, session: authSessions, account: authAccounts, verification: authVerifications },
    }),
    socialProviders: google,
    session: { expiresIn: 30 * DAY, updateAge: DAY },
    // Keep only what sign-in needs: no profile photo, and no Google access /
    // refresh / ID tokens (we never call Google's APIs on anyone's behalf).
    databaseHooks: {
      user: {
        create: { before: async (user) => ({ data: { ...user, image: null } }) },
        update: { before: async (user) => ({ data: { ...user, image: null } }) },
      },
      account: {
        create: { before: async (account) => ({ data: { ...account, ...NO_TOKENS } }) },
        update: { before: async (account) => ({ data: { ...account, ...NO_TOKENS } }) },
      },
    },
    account: {
      encryptOAuthTokens: true,
      // Google and the email link with the same verified address are one account.
      accountLinking: { enabled: true, trustedProviders: ['google'] },
    },
    advanced: {
      cookiePrefix: 'kk',
      database: { generateId: 'uuid' },
      // Never store raw IPs (same rule as the URL Shortener).
      ipAddress: { disableIpTracking: true },
    },
    plugins: [
      magicLink({
        expiresIn: SIGN_IN_LINK_MINUTES * 60,
        storeToken: 'hashed',
        async sendMagicLink({ email, url }, ctx) {
          if (!(await allowSignInEmail(email, ctx?.headers))) {
            console.warn('[auth] sign-in email rate-limited');
            return;
          }
          await sendEmail(signInEmail(email, url));
        },
      }),
      ...(isE2eEnabled() ? [e2eOAuthPlugin()] : []),
    ],
  });
}

export type Auth = Awaited<ReturnType<typeof createAuth>>;

const globalForAuth = globalThis as unknown as { __kkAuth?: Promise<Auth> };

/** The shared better-auth instance (built once per isolate; `await` it). */
export function getAuth(): Promise<Auth> {
  globalForAuth.__kkAuth ??= createAuth().catch((err: unknown) => {
    globalForAuth.__kkAuth = undefined;
    throw err;
  });
  return globalForAuth.__kkAuth;
}
