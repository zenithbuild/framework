export default {
    target: process.env.VERCEL ? 'vercel' : 'node',
    outDir: process.env.VERCEL ? '.vercel/output' : 'dist',
    pagesDir: 'src/pages',
    typescriptDefault: true,
    embeddedMarkupExpressions: true,
    router: true,
    images: {
        remotePatterns: [
            {
                protocol: 'http',
                hostname: 'localhost',
                port: '8055',
                pathname: '/assets/**'
            },
            {
                protocol: 'http',
                hostname: '127.0.0.1',
                port: '8055',
                pathname: '/assets/**'
            }
        ],
        dangerouslyAllowLocalNetwork: true
    }
};
