/** @type {import('next').NextConfig} */
const nextConfig = {
  // Server Components by default
  experimental: {
    serverActions: true,
  },
  // Environment variables
  env: {
    NEXT_PUBLIC_CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
  },
  // Rewrites to serve public/index.html as the root route
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/',
          destination: '/index.html',
        },
      ],
    };
  },
};

export default nextConfig;
