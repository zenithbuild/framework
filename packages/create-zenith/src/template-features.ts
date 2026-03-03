export type PackageManifest = {
    scripts?: Record<string, string>
    devDependencies?: Record<string, string>
}

type FeatureName = 'eslint' | 'prettier'

type FeatureDefinition = {
    templatePath: string
    packagePatch: PackageManifest
}

const FEATURE_DEFINITIONS: Record<FeatureName, FeatureDefinition> = {
    eslint: {
        templatePath: 'templates/features/eslint',
        packagePatch: {
            scripts: {
                lint: 'eslint .'
            },
            devDependencies: {
                eslint: '^9.39.2',
                '@typescript-eslint/eslint-plugin': '^8.53.0',
                '@typescript-eslint/parser': '^8.53.0'
            }
        }
    },
    prettier: {
        templatePath: 'templates/features/prettier',
        packagePatch: {
            scripts: {
                format: 'prettier --write .'
            },
            devDependencies: {
                prettier: '^3.7.4'
            }
        }
    }
}

function mergeRecord(target: Record<string, string> | undefined, patch: Record<string, string> | undefined) {
    if (!patch) {
        return target
    }
    return { ...(target || {}), ...patch }
}

export function selectedTemplateFeaturePaths(options: { eslint: boolean; prettier: boolean }): string[] {
    const paths: string[] = []

    if (options.eslint) {
        paths.push(FEATURE_DEFINITIONS.eslint.templatePath)
    }
    if (options.prettier) {
        paths.push(FEATURE_DEFINITIONS.prettier.templatePath)
    }

    return paths
}

export function applyPackageFeatures(
    manifest: PackageManifest,
    options: { eslint: boolean; prettier: boolean }
): PackageManifest {
    const nextManifest: PackageManifest = {
        ...manifest,
        scripts: { ...(manifest.scripts || {}) },
        devDependencies: { ...(manifest.devDependencies || {}) }
    }

    for (const featureName of Object.keys(FEATURE_DEFINITIONS) as FeatureName[]) {
        if (!options[featureName]) {
            continue
        }

        const patch = FEATURE_DEFINITIONS[featureName].packagePatch
        nextManifest.scripts = mergeRecord(nextManifest.scripts, patch.scripts)
        nextManifest.devDependencies = mergeRecord(nextManifest.devDependencies, patch.devDependencies)
    }

    if (nextManifest.scripts && Object.keys(nextManifest.scripts).length === 0) {
        delete nextManifest.scripts
    }
    if (nextManifest.devDependencies && Object.keys(nextManifest.devDependencies).length === 0) {
        delete nextManifest.devDependencies
    }

    return nextManifest
}
