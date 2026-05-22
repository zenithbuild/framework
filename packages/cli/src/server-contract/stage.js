import { unwrapAuthControlFlow } from './auth-control-flow.js';

export async function invokeRouteStage({ fn, ctx, where, allowedKinds }) {
    try {
        return await fn(ctx);
    } catch (error) {
        const authResult = unwrapAuthControlFlow(error, where, allowedKinds);
        if (authResult) {
            return authResult;
        }
        throw error;
    }
}
