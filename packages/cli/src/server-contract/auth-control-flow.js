import { AUTH_CONTROL_FLOW_FLAG } from './constants.js';
import { assertValidRouteResultShape } from './route-result-validation.js';

export function unwrapAuthControlFlow(error, where, allowedKinds) {
    if (!error || typeof error !== 'object' || error[AUTH_CONTROL_FLOW_FLAG] !== true) {
        return null;
    }
    const result = error.result;
    assertValidRouteResultShape(result, where, allowedKinds);
    return result;
}
