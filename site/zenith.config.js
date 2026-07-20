export default {
    target: 'node',
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
