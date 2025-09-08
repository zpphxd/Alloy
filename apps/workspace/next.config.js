/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@alloy/agent-core", "@alloy/agent-tools", "@alloy/ui"],
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    serverComponentsExternalPackages: ['@clerk/nextjs', 'svix'],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'img.clerk.com',
      },
      {
        protocol: 'https',
        hostname: 'images.clerk.dev',
      },
    ],
  },
  async redirects() {
    return [
      {
        source: '/sign-in',
        destination: '/sign-in/[[...sign-in]]',
        permanent: false,
      },
      {
        source: '/sign-up',
        destination: '/sign-up/[[...sign-up]]',
        permanent: false,
      },
    ]
  },
  headers: async () => [
    {
      source: "/:path*",
      headers: [
        {
          key: "X-Frame-Options",
          value: "DENY",
        },
        {
          key: "X-Content-Type-Options",
          value: "nosniff",
        },
        {
          key: "Referrer-Policy",
          value: "strict-origin-when-cross-origin",
        },
        {
          key: "Permissions-Policy",
          value: "camera=(), microphone=(), geolocation=()",
        },
      ],
    },
  ],
};

module.exports = nextConfig;