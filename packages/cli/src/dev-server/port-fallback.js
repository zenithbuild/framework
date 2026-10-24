const MAX_PORT = 65535;
const DEFAULT_MAX_ATTEMPTS = 20;

export function isPortConflict(error) {
    return error && error.code === 'EADDRINUSE';
}

function normalizeRequestedPort(port) {
    return Number.isInteger(port) && port >= 0 ? port : 3000;
}

function waitForListen(server, port, host) {
    return new Promise((resolve, reject) => {
        const cleanup = () => {
            server.off('error', onError);
            server.off('listening', onListening);
        };
        const onError = (error) => {
            cleanup();
            reject(error);
        };
        const onListening = () => {
            cleanup();
            resolve();
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(port, host);
    });
}

export async function listenWithPortFallback({
    server,
    port,
    host,
    maxAttempts = DEFAULT_MAX_ATTEMPTS
}) {
    const requestedPort = normalizeRequestedPort(port);
    let candidatePort = requestedPort;
    const occupiedPorts = [];

    for (let attempt = 0; attempt <= maxAttempts; attempt += 1) {
        try {
            await waitForListen(server, candidatePort, host);
            const address = server.address();
            const actualPort = address && typeof address === 'object' ? address.port : candidatePort;
            return {
                port: actualPort,
                requestedPort,
                portFallback: occupiedPorts.length > 0
                    ? {
                        requestedPort,
                        occupiedPorts: occupiedPorts.slice(),
                        finalPort: actualPort
                    }
                    : null
            };
        } catch (error) {
            if (
                requestedPort === 0 ||
                !isPortConflict(error) ||
                candidatePort >= MAX_PORT ||
                attempt >= maxAttempts
            ) {
                throw error;
            }
            occupiedPorts.push(candidatePort);
            candidatePort += 1;
        }
    }

    throw new Error(`Unable to bind dev server after ${maxAttempts + 1} attempts`);
}
