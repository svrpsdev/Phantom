/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
    return [
      {
        source: '/dash/api/:path*',
        destination: `${backendUrl}/dash/api/:path*`,
      },
      {
        source: '/device/:path*',
        destination: `${backendUrl}/device/:path*`,
      },
      {
        source: '/login/:path*',
        destination: `${backendUrl}/login/:path*`,
      },
    ];
  },
  async redirects() {
    return [
      {
        source: '/',
        destination: '/dashboard',
        permanent: true,
      },
    ];
  },
};

module.exports = nextConfig;
