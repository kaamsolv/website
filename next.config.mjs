import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js';

/**
 * Response headers for every route (docs/infra/deployment.md → "Security headers").
 * Deliberately conservative: nothing here can stop a script, style, image, font or
 * connection the site uses today. A script-src Content-Security-Policy needs
 * per-request nonces (which would end static pre-rendering), so it is a separate,
 * later decision.
 *  - HSTS: browsers talk HTTPS only, for a year (no includeSubDomains / preload: separate decisions).
 *  - nosniff: a file is only ever treated as the type we declared.
 *  - X-Frame-Options + frame-ancestors: other sites can't put KaamSolv in a frame (clickjacking).
 *  - base-uri / object-src: no injected <base> or plugin content.
 *  - Referrer-Policy: the browser default, made explicit.
 *  - Permissions-Policy: no tool uses camera, microphone, location, USB or Bluetooth, so none may.
 */
export const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'" },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), usb=(), bluetooth=()' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * Next.js 16 blocks dev assets (HMR, client chunks) from LAN origins by default.
   * Without this, opening http://<your-lan-ip>:3000 on a phone serves HTML but
   * JavaScript never runs — buttons, inputs, and QR generation all stay dead.
   *
   * Update the IP when your router assigns a new one (check `ipconfig`).
   * Restart `npm run dev` after changing this file.
   *
   * @see https://nextjs.org/docs/app/api-reference/config/next-config-js/allowedDevOrigins
   */
  allowedDevOrigins: ['192.168.1.11'],

  /**
   * Browser-only libraries: give the server build a stub so they stay out of
   * the Cloudflare Worker bundle (it was the free plan's 3 MB gzip limit until Cloudflare replaced it with 64 MiB
   * uncompressed in September 2026; a smaller Worker still starts faster). Invoice PDFs, HEIC
   * decoding and the PDF tools only ever run in the browser.
   */
  turbopack: {
    resolveAlias: {
      '@cantoo/pdf-lib': {
        browser: './node_modules/@cantoo/pdf-lib/es/index.js',
        default: './app/lib/pdf/server-stubs/pdf-lib.ts',
      },
      'pdfjs-dist/legacy/build/pdf.mjs': {
        browser: 'pdfjs-dist/legacy/build/pdf.min.mjs',
        default: './app/lib/pdf/server-stubs/pdfjs.ts',
      },
      'pdfjs-dist/legacy/build/pdf.worker.mjs': {
        browser: 'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
        default: './app/lib/pdf/server-stubs/pdfjs.ts',
      },
      '@react-pdf/renderer': {
        browser: '@react-pdf/renderer/lib/react-pdf.browser.js',
        default: './app/_components/invoice/react-pdf-server-stub.ts',
      },
      heic2any: {
        browser: 'heic2any/dist/heic2any.js',
        default: './app/lib/image/heic2any-server-stub.ts',
      },
    },
  },

  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },

  /** Canonical host is the apex: www.kaamsolv.com → kaamsolv.com (308). */
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.kaamsolv.com' }],
        destination: 'https://kaamsolv.com/:path*',
        permanent: true,
      },
      // Account pages moved into the per-tool / shared structure (docs/products/accounts.md).
      { source: '/app/customers', destination: '/app/business/customers', permanent: true },
      { source: '/app/items', destination: '/app/business/items', permanent: true },
      { source: '/app/settings', destination: '/app/business', permanent: true },
    ];
  },
};

/**
 * `next dev` only: load PGlite (the local stand-in database, db/client.ts) with
 * Node's own `require` instead of bundling it. Bundled, its start-up file reads
 * fail when the first query happens inside some routes (sign-in). Production
 * builds never include PGlite (Neon is used), so they are unchanged.
 */
export default (phase) =>
  phase === PHASE_DEVELOPMENT_SERVER ? { ...nextConfig, serverExternalPackages: ['@electric-sql/pglite'] } : nextConfig;
