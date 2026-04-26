const createNextIntlPlugin = require('next-intl/plugin');

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const backendUrl = (
    process.env.NEXT_PUBLIC_API_URL ||
    (process.env.NODE_ENV === 'development'
        ? 'http://localhost:3001'
        : 'https://your-backend-service.onrender.com')
).replace(/\/+$/, '');

const nextConfig = {
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'lh3.googleusercontent.com',
                pathname: '/**',
            },
        ],
    },
    async rewrites() {
        return [
            {
                source: '/quotes/:path*',
                destination: `${backendUrl}/quotes/:path*`,
            },
        ];
    },
};

module.exports = withNextIntl(nextConfig);
