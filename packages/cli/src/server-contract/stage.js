import { AUTH_CONTROL_FLOW_FLAG } from './constants.js';
import { assertValidRouteResultShape } from './route-result-validation.js';

function unwrapAuthControlFlow(error, where, allowedKinds) {
    if (!error || typeof error !== 'object' || error[AUTH_CONTROL_FLOW_FLAG] !== true) {
        return null;
    }
    const result = error.result;
    assertValidRouteResultShape(result, where, allowedKinds);
    return result;
}

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
