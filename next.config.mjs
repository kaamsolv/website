import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js';

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
   * the Cloudflare Worker bundle (free plan: 3 MB gzip). Invoice PDFs, HEIC
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
