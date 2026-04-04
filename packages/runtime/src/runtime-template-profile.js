const DEFAULT_RUNTIME_MODULES = Object.freeze([
    { sourceFile: 'reactivity-core.js', contributorId: 'reactivity-core.js' },
    { sourceFile: 'side-effect-scope.js', contributorId: 'side-effect-scope.js' },
    { sourceFile: 'effect-utils.js', contributorId: 'effect-utils.js' },
    { sourceFile: 'effect-scheduler.js', contributorId: 'effect-scheduler.js' },
    { sourceFile: 'effect-runtime.js', contributorId: 'effect-runtime.js' },
    { sourceFile: 'mount-runtime.js', contributorId: 'mount-runtime.js' },
    { sourceFile: 'zeneffect.js', contributorId: 'zeneffect.js' },
    { sourceFile: 'ref.js', contributorId: 'ref.js' },
    { sourceFile: 'env.js', contributorId: 'env.js' },
    { sourceFile: 'platform.js', contributorId: 'platform.js' },
    { sourceFile: 'presence.js', contributorId: 'presence.js' },
    { sourceFile: 'signal.js', contributorId: 'signal.js' },
    { sourceFile: 'state.js', contributorId: 'state.js' },
    { sourceFile: 'diagnostics.js', contributorId: 'diagnostics.js' },
    { sourceFile: 'cleanup.js', contributorId: 'cleanup.js' },
    { sourceFile: 'template-parser.js', contributorId: 'template-parser.js' },
    { sourceFile: 'markup.js', contributorId: 'markup.js' },
    { sourceFile: 'payload.js', contributorId: 'payload.js' },
    { sourceFile: 'expressions.js', contributorId: 'expressions.js' },
    { sourceFile: 'render.js', contributorId: 'render.js' },
    { sourceFile: 'fragment-patch.js', contributorId: 'fragment-patch.js' },
    { sourceFile: 'scanner.js', contributorId: 'scanner.js' },
    { sourceFile: 'events.js', contributorId: 'events.js' },
    { sourceFile: 'hydrate.js', contributorId: 'hydrate.js' }
]);

const PRODUCTION_EMITTED_RUNTIME_MODULES = Object.freeze([
    { sourceFile: 'reactivity-core.js', contributorId: 'reactivity-core.js' },
    { sourceFile: 'side-effect-scope.js', contributorId: 'side-effect-scope.js' },
    { sourceFile: 'effect-utils.js', contributorId: 'effect-utils.js' },
    { sourceFile: 'effect-scheduler.js', contributorId: 'effect-scheduler.js' },
    { sourceFile: 'effect-runtime.js', contributorId: 'effect-runtime.js' },
    { sourceFile: 'mount-runtime.js', contributorId: 'mount-runtime.js' },
    { sourceFile: 'zeneffect.js', contributorId: 'zeneffect.js' },
    { sourceFile: 'ref.js', contributorId: 'ref.js' },
    { sourceFile: 'env.js', contributorId: 'env.js' },
    { sourceFile: 'platform.js', contributorId: 'platform.js' },
    { sourceFile: 'signal.js', contributorId: 'signal.js' },
    { sourceFile: 'state.js', contributorId: 'state.js' },
    { sourceFile: 'diagnostics-production.js', contributorId: 'diagnostics.js' },
    { sourceFile: 'cleanup.js', contributorId: 'cleanup.js' },
    { sourceFile: 'template-parser.js', contributorId: 'template-parser.js' },
    { sourceFile: 'markup.js', contributorId: 'markup.js' },
    { sourceFile: 'payload.js', contributorId: 'payload.js' },
    { sourceFile: 'expressions.js', contributorId: 'expressions.js' },
    { sourceFile: 'render.js', contributorId: 'render.js' },
    { sourceFile: 'fragment-patch.js', contributorId: 'fragment-patch.js' },
    { sourceFile: 'scanner.js', contributorId: 'scanner.js' },
    { sourceFile: 'events.js', contributorId: 'events.js' },
    { sourceFile: 'hydrate.js', contributorId: 'hydrate.js' }
]);

const PRODUCTION_EMITTED_WITH_PRESENCE_RUNTIME_MODULES = Object.freeze([
    { sourceFile: 'reactivity-core.js', contributorId: 'reactivity-core.js' },
    { sourceFile: 'side-effect-scope.js', contributorId: 'side-effect-scope.js' },
    { sourceFile: 'effect-utils.js', contributorId: 'effect-utils.js' },
    { sourceFile: 'effect-scheduler.js', contributorId: 'effect-scheduler.js' },
    { sourceFile: 'effect-runtime.js', contributorId: 'effect-runtime.js' },
    { sourceFile: 'mount-runtime.js', contributorId: 'mount-runtime.js' },
    { sourceFile: 'zeneffect.js', contributorId: 'zeneffect.js' },
    { sourceFile: 'ref.js', contributorId: 'ref.js' },
    { sourceFile: 'env.js', contributorId: 'env.js' },
    { sourceFile: 'platform.js', contributorId: 'platform.js' },
    { sourceFile: 'presence.js', contributorId: 'presence.js' },
    { sourceFile: 'signal.js', contributorId: 'signal.js' },
    { sourceFile: 'state.js', contributorId: 'state.js' },
    { sourceFile: 'diagnostics-production.js', contributorId: 'diagnostics.js' },
    { sourceFile: 'cleanup.js', contributorId: 'cleanup.js' },
    { sourceFile: 'template-parser.js', contributorId: 'template-parser.js' },
    { sourceFile: 'markup.js', contributorId: 'markup.js' },
    { sourceFile: 'payload.js', contributorId: 'payload.js' },
    { sourceFile: 'expressions.js', contributorId: 'expressions.js' },
    { sourceFile: 'render.js', contributorId: 'render.js' },
    { sourceFile: 'fragment-patch.js', contributorId: 'fragment-patch.js' },
    { sourceFile: 'scanner.js', contributorId: 'scanner.js' },
    { sourceFile: 'events.js', contributorId: 'events.js' },
    { sourceFile: 'hydrate.js', contributorId: 'hydrate.js' }
]);

export const RUNTIME_TEMPLATE_PROFILES = Object.freeze({
    DEFAULT: 'default',
    PRODUCTION_EMITTED: 'production-emitted',
    PRODUCTION_EMITTED_WITH_PRESENCE: 'production-emitted-with-presence'
});

function stripImports(source) {
    return source
        .replace(/^\s*import\s+[^;]+;\s*$/gm, '')
        .replace(/^\s*export\s+\{[^}]+\}\s+from\s+['"]\.[^'"]+['"];\s*$/gm, '')
        .trim();
}

export function normalizeRuntimeTemplateProfile(profile) {
    if (profile === RUNTIME_TEMPLATE_PROFILES.PRODUCTION_EMITTED) {
        return RUNTIME_TEMPLATE_PROFILES.PRODUCTION_EMITTED;
    }
    if (profile === RUNTIME_TEMPLATE_PROFILES.PRODUCTION_EMITTED_WITH_PRESENCE) {
        return RUNTIME_TEMPLATE_PROFILES.PRODUCTION_EMITTED_WITH_PRESENCE;
    }
    return RUNTIME_TEMPLATE_PROFILES.DEFAULT;
}

function runtimeModulesForProfile(profile) {
    switch (normalizeRuntimeTemplateProfile(profile)) {
        case RUNTIME_TEMPLATE_PROFILES.PRODUCTION_EMITTED:
            return PRODUCTION_EMITTED_RUNTIME_MODULES;
        case RUNTIME_TEMPLATE_PROFILES.PRODUCTION_EMITTED_WITH_PRESENCE:
            return PRODUCTION_EMITTED_WITH_PRESENCE_RUNTIME_MODULES;
        default:
            return DEFAULT_RUNTIME_MODULES;
    }
}

export function buildRuntimeTemplateProfile({
    profile,
    normalizeNewlines,
    readRuntimeSourceFile
}) {
    const resolvedProfile = normalizeRuntimeTemplateProfile(profile);
    const modules = runtimeModulesForProfile(resolvedProfile);
    const segments = [];
    const contributors = [];
    let coverageBytes = 0;

    for (let i = 0; i < modules.length; i += 1) {
        const entry = modules[i];
        const source = stripImports(readRuntimeSourceFile(entry.sourceFile));
        if (!source) continue;
        segments.push(source);
        const bytes = Buffer.byteLength(source, 'utf8');
        coverageBytes += bytes;
        contributors.push({
            id: entry.contributorId,
            sourceFile: entry.sourceFile,
            bytes
        });
    }

    contributors.sort((left, right) => {
        if (right.bytes !== left.bytes) return right.bytes - left.bytes;
        if (left.id !== right.id) return left.id.localeCompare(right.id);
        return left.sourceFile.localeCompare(right.sourceFile);
    });

    return {
        profile: resolvedProfile,
        source: normalizeNewlines(segments.join('\n\n')),
        contributors,
        coverageBytes
    };
}
