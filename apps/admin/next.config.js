/** @type {import('next').NextConfig} */
const nextConfig = {
  // @attrakt/core is a workspace TS package and must be transpiled by Next.
  transpilePackages: ['@attrakt/core'],
  // Heavy node-only deps pulled in transitively by @attrakt/core: keep them as
  // runtime externals rather than bundling them into server components.
  experimental: {
    serverComponentsExternalPackages: [
      '@prisma/client',
      'pino',
      'pino-pretty',
      // Platform clients pulled in transitively via @attrakt/core's barrel.
      // The dashboard never calls them; keep them as runtime externals so
      // webpack doesn't try to bundle their native/optional deps.
      'discord.js',
      '@discordjs/ws',
      'octokit',
      'twitter-api-v2',
      'undici',
    ],
  },
  eslint: { ignoreDuringBuilds: true },
};

module.exports = nextConfig;
