import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));

describe('Batch 5A CLI README truth', () => {
    test('hosted image endpoint wording matches current target support', () => {
        const readme = readFileSync(resolve(REPO_ROOT, 'packages/cli/README.md'), 'utf8');

        expect(readme).toContain('`node`, `vercel`, and `netlify` expose deployed `/_zenith/image` endpoints');
        expect(readme).toContain('Hosted `vercel` and `netlify` targets expose advisory `/__zenith/route-check`');
        expect(readme).not.toContain('`vercel` and `netlify` do not yet emit a deployed `/_zenith/image` endpoint');
    });
});
