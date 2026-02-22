/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Permettre les connexions API depuis le backend existant
  async rewrites() {
    return [
      {
        source: '/api/legacy/:path*',
        destination: 'http://localhost:3001/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
