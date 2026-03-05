import { runtimeDevClientSource } from '../dist/template.js';

describe('runtime dev client css contract', () => {
    test('uses atomic stylesheet swap with load commit and error rollback', () => {
        const source = runtimeDevClientSource();

        expect(source).toContain("nextLink.setAttribute('data-zenith-dev-pending', 'true')");
        expect(source).toContain("nextLink.addEventListener('load'");
        expect(source).toContain("nextLink.setAttribute('data-zenith-dev-primary', 'true')");
        expect(source).toContain("activeLink.remove();");
        expect(source).toContain("nextLink.addEventListener('error'");
        expect(source).toContain("activeLink.setAttribute('data-zenith-dev-primary', 'true')");
        expect(source).toContain('scheduleCssRetry(nextHref, tries);');
    });

    test('retries css updates by refetching /__zenith_dev/state and using cssHref', () => {
        const source = runtimeDevClientSource();

        expect(source).toContain("return fetch('/__zenith_dev/state', { cache: 'no-store' })");
        expect(source).toContain('swapStylesheet(href, attempt + 1);');
        expect(source).toContain("if (statePayload && typeof statePayload.cssHref === 'string' && statePayload.cssHref.length > 0)");
        expect(source).toContain('swapStylesheet(statePayload.cssHref);');
        expect(source).toContain("reportBuildFailure('CSS update failed (404): server build not ready'");
    });

    test('surfaces persistent build-failed banner when dev state reports error', () => {
        const source = runtimeDevClientSource();

        expect(source).toContain("buildFailure.setAttribute('data-zenith-dev-build-error', 'true')");
        expect(source).toContain("buildFailure.textContent = 'Build failed - fix errors to continue");
        expect(source).toContain("if (buildStatus === 'error') {");
    });
});
