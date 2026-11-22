import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pull in only the parts of these packages that are used, rather than their whole entry files (#837).
  experimental: {
    optimizePackageImports: ['@sorowill/sdk', 'next-intl'],
  },
  compiler: {
    // Drop console.log/info/debug calls from the production bundle. Warnings and errors stay.
    removeConsole: { exclude: ['error', 'warn'] },
  },
};

export default withNextIntl(nextConfig);
