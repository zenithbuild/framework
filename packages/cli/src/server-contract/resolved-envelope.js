import { STAGED_SET_COOKIES_KEY } from './constants.js';

export function buildResolvedEnvelope({ result, trace, status, ctx }) {
    const envelope = { result, trace };
    if (status !== undefined) {
        envelope.status = status;
    }
    const setCookies = Array.isArray(ctx?.[STAGED_SET_COOKIES_KEY])
        ? ctx[STAGED_SET_COOKIES_KEY].slice()
        : [];
    if (setCookies.length > 0) {
        envelope.setCookies = setCookies;
    }
    return envelope;
}
