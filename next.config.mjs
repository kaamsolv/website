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

  /** Canonical host is the apex: www.kaamsolv.com → kaamsolv.com (308). */
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.kaamsolv.com' }],
        destination: 'https://kaamsolv.com/:path*',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
