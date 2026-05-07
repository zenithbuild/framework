import { mkdir, readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm';

const WORKSPACE_ROOT = join(process.cwd(), '..', '..');

export async function makeProject(files) {
    const root = join(tmpdir(), `zenith-build-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const pagesDir = join(root, 'pages');
    const outDir = join(root, 'dist');
    await mkdir(pagesDir, { recursive: true });

    for (const [file, source] of Object.entries(files)) {
        const fullPath = join(pagesDir, file);
        await mkdir(join(fullPath, '..'), { recursive: true });
        await writeFile(fullPath, source, 'utf8');
    }

    return { root, pagesDir, outDir };
}

export async function linkWorkspaceNodeModules(projectRoot) {
    const workspaceNodeModules = join(WORKSPACE_ROOT, 'node_modules');
    const target = join(projectRoot, 'node_modules');
    await symlink(workspaceNodeModules, target, 'dir').catch(() => { });
}

export async function walkFiles(dir) {
    const out = [];
    async function walk(current) {
        let entries = [];
        try {
            entries = await readdir(current);
        } catch {
            return;
        }

        entries.sort((a, b) => a.localeCompare(b));
        for (const entry of entries) {
            const full = join(current, entry);
            const children = await readdir(full).catch(() => null);
            if (children) {
                await walk(full);
                continue;
            }
            out.push(full);
        }
    }

    await walk(dir);
    out.sort((a, b) => a.localeCompare(b));
    return out;
}

export async function findBuiltCssAsset(outDir) {
    const assetsDir = join(outDir, 'assets');
    const entries = await readdir(assetsDir);
    const cssAsset = entries.find((name) => name.startsWith('styles.') && name.endsWith('.css'));
    expect(cssAsset).toBeTruthy();
    return join(assetsDir, String(cssAsset));
}

export async function evaluateBuiltModule(source, identifier) {
    const context = createContext({
        console,
        URL,
        URLSearchParams,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        requestAnimationFrame: () => 1,
        cancelAnimationFrame: () => { },
        location: { pathname: '/', href: 'http://localhost/' },
        window: {
            location: { pathname: '/', href: 'http://localhost/' },
            __zenith_ssr_data: {}
        },
        document: {},
        globalThis: undefined
    });
    context.globalThis = context;
    context.global = context;
    context.window.window = context.window;
    context.window.globalThis = context;

    const sharedExports = [
        'default',
        'hydrate',
        'signal',
        'state',
        'ref',
        'zeneffect',
        'zenEffect',
        'zenMount',
        'zenWindow',
        'zenDocument',
        'zenOn',
        'zenResize',
        'collectRefs',
        'createRouter',
        'matchRoute',
        'resolveRequestRoute'
    ];
    const moduleCache = new Map();

    const linker = async (specifier) => {
        if (moduleCache.has(specifier)) {
            return moduleCache.get(specifier);
        }

        const module = new SyntheticModule(
            sharedExports,
            function () {
                const noop = () => { };
                const signalLike = (value) => ({
                    get: () => value,
                    set: noop
                });

                this.setExport('default', {});
                this.setExport('hydrate', noop);
                this.setExport('signal', signalLike);
                this.setExport('state', signalLike);
                this.setExport('ref', () => ({ current: null }));
                this.setExport('zeneffect', noop);
                this.setExport('zenEffect', noop);
                this.setExport('zenMount', noop);
                this.setExport('zenWindow', () => null);
                this.setExport('zenDocument', () => null);
                this.setExport('zenOn', noop);
                this.setExport('zenResize', () => noop);
                this.setExport('collectRefs', (...refs) => refs.map((ref) => ref?.current).filter(Boolean));
                this.setExport('createRouter', () => ({ navigate: noop }));
                this.setExport('matchRoute', () => null);
                this.setExport('resolveRequestRoute', () => null);
            },
            { context, identifier: `stub:${specifier}` }
        );

        moduleCache.set(specifier, module);
        return module;
    };

    const module = new SourceTextModule(source, {
        context,
        identifier
    });

    await module.link(linker);
    await module.evaluate();
}
