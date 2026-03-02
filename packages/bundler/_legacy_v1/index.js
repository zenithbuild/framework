const devServer = require('./dev-server.js');

function createZenithBundler() {
    return {
        async dev(options) {
            console.log("Starting Zenith Bundler (Dev)...");
            // Assuming options has root or fallback
            const root = options?.root || process.cwd();
            await devServer.start(root);
        },
        async build(options) {
            console.log("Zenith Bundler Build: Not yet implemented in Phase 6.");
            // Placeholder for production build integration
        }
    };
}

module.exports = { createZenithBundler };
