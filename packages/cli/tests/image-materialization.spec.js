import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createImageRuntimePayload } from '../dist/images/payload.js';
import { materializeImageMarkup } from '../dist/images/materialize.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('image materialization trust boundary', () => {
    test('materializes image markers from explicit structured entries', async () => {
        const html = '<main><span class="contents" data-zx-data-zenith-image="0" data-zx-unsafeHTML="1"></span></main>';
        const payload = createImageRuntimePayload(
            {
                formats: ['png'],
                deviceSizes: [1],
                imageSizes: [1]
            },
            {
                '/hero.png': {
                    width: 1,
                    height: 1,
                    originalFormat: 'png',
                    availableWidths: [1],
                    availableFormats: ['png']
                }
            },
            'passthrough',
            '/docs'
        );

        const nextHtml = await materializeImageMarkup({
            html,
            payload,
            imageMaterialization: [
                {
                    selector: '[data-zx-data-zenith-image="0"]',
                    props: {
                        src: '/hero.png',
                        alt: 'Hero',
                        sizes: '100vw'
                    }
                }
            ]
        });

        expect(nextHtml).toContain('data-zenith-image=');
        expect(nextHtml).toContain('<img');
        expect(nextHtml).toContain('/docs/_zenith/image/local/');
    });

    test('rejects unresolved image markers without an explicit artifact', async () => {
        const html = '<main><span class="contents" data-zx-data-zenith-image="0" data-zx-unsafeHTML="1"></span></main>';
        const payload = createImageRuntimePayload({}, {}, 'passthrough', '/');

        await expect(materializeImageMarkup({
            html,
            payload,
            imageMaterialization: []
        })).rejects.toThrow(/compiler-owned image materialization artifact/i);
    });

    test('image materialization sources contain no dynamic evaluation', () => {
        const imagesDir = path.resolve(__dirname, '../src/images');
        const files = fs.readdirSync(imagesDir).filter((name) => /\.(js|ts)$/.test(name));

        for (const file of files) {
            const source = fs.readFileSync(path.join(imagesDir, file), 'utf8');
            expect(source.includes('eval(')).toBe(false);
            expect(source.includes('new Function')).toBe(false);
            expect(/\bFunction\(/.test(source)).toBe(false);
        }
    });

    test('build/static materialization is bundler-owned while runtime materialization stays route-artifact-driven', () => {
        const materializeSource = fs.readFileSync(path.resolve(__dirname, '../src/images/materialize.ts'), 'utf8');
        const buildSource = fs.readFileSync(path.resolve(__dirname, '../src/build.js'), 'utf8');
        const previewSource = fs.readFileSync(path.resolve(__dirname, '../src/preview/request-handler.js'), 'utf8');
        const devServerSource = fs.readFileSync(path.resolve(__dirname, '../src/dev-server/request-handler.js'), 'utf8');
        const routeRenderSource = fs.readFileSync(path.resolve(__dirname, '../src/server-runtime/route-render.js'), 'utf8');
        const toolchainSource = fs.readFileSync(path.resolve(__dirname, '../src/toolchain-paths.ts'), 'utf8');
        const bundlerSource = fs.readFileSync(path.resolve(__dirname, '../../bundler/src/main.rs'), 'utf8');

        expect(materializeSource).toContain("router-manifest.json");
        expect(materializeSource).toContain('route.image_materialization');
        expect(buildSource.includes('materializeImageMarkupInHtmlFiles')).toBe(false);
        expect(bundlerSource).toContain('materialize_image_markup_in_build_html');
        expect(previewSource).toContain('resolved.route.image_materialization');
        expect(devServerSource).toContain('resolved.route.image_materialization');
        expect(routeRenderSource).toContain('route.image_materialization');

        expect(materializeSource.includes('page_asset')).toBe(false);
        expect(materializeSource.includes('pageAssetPath')).toBe(false);
        expect(routeRenderSource.includes('pageAssetPath')).toBe(false);
        expect(toolchainSource.includes('_legacy_v1')).toBe(false);
    });

    test('docs and legacy markers describe the static image boundary truthfully', () => {
        const cliContract = fs.readFileSync(path.resolve(__dirname, '../CLI_CONTRACT.md'), 'utf8');
        const cliReadme = fs.readFileSync(path.resolve(__dirname, '../README.md'), 'utf8');
        const deploymentGuide = fs.readFileSync(
            path.resolve(__dirname, '../../../docs/documentation/guides/deployment-targets.md'),
            'utf8'
        );
        const legacyIndex = fs.readFileSync(
            path.resolve(__dirname, '../../bundler/_legacy_v1/src/index.ts'),
            'utf8'
        );

        expect(cliContract).toContain('Final build/static HTML image materialization is bundler-owned');
        expect(cliContract).toContain('Neither bundler nor CLI runtime paths may execute emitted page assets');
        expect(cliReadme).toContain('route-artifact-driven');
        expect(deploymentGuide).toContain('bundler-owned final build/static HTML image materialization');
        expect(legacyIndex).toContain('Legacy v1 bundler surface only');
    });
});
