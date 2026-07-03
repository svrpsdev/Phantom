/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/dash/api/:path*',
        destination: `${process.env.BACKEND_URL || 'http://localhost:3000'}/dash/api/:path*`,
      },
      {
        source: '/device/:path*',
        destination: `${process.env.BACKEND_URL || 'http://localhost:3000'}/device/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
