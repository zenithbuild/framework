/**
 * create-zenith
 * 
 * Create a new Zenith application with interactive prompts.
 * 
 * Runtime-agnostic: works identically on Bun and Node.
 * This is the main CLI entry point - bundles to dist/cli.js
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import * as brand from './branding.js'
import * as prompts from './prompts.js'
import { getUiMode } from './ui/env.js'

export interface ProjectOptions {
    name: string
    eslint: boolean
    prettier: boolean
    pathAlias: boolean
    tailwind: boolean
}

// GitHub repository info
const GITHUB_REPO = 'zenithbuild/create-zenith'
const DEFAULT_TEMPLATE = 'examples/starter'
const TAILWIND_TEMPLATE = 'examples/starter-tailwindcss'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function getCliVersion(): string {
    try {
        const pkgPath = path.resolve(__dirname, '..', 'package.json')
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
        return typeof pkg.version === 'string' ? pkg.version : '0.0.0'
    } catch {
        return '0.0.0'
    }
}

const VERSION = getCliVersion()

function flagEnabled(value: string | undefined): boolean {
    if (value == null) return false
    const normalized = value.trim().toLowerCase()
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

function resolveLocalTemplatePath(templatePath: string): string | null {
    const candidate = path.resolve(__dirname, '..', templatePath)
    return fs.existsSync(candidate) ? candidate : null
}

/**
 * Detect which package manager is available
 * Returns 'bun' | 'pnpm' | 'yarn' | 'npm'
 */
function detectPackageManager(): 'bun' | 'pnpm' | 'yarn' | 'npm' {
    // Check npm_config_user_agent for the invoking package manager
    const userAgent = process.env.npm_config_user_agent || ''

    if (userAgent.includes('bun')) return 'bun'
    if (userAgent.includes('pnpm')) return 'pnpm'
    if (userAgent.includes('yarn')) return 'yarn'
    if (userAgent.includes('npm')) return 'npm'

    // Fallback: check what's available
    try {
        execSync('bun --version', { stdio: 'pipe' })
        return 'bun'
    } catch {
        try {
            execSync('pnpm --version', { stdio: 'pipe' })
            return 'pnpm'
        } catch {
            return 'npm'
        }
    }
}

/**
 * Check if git is available
 */
function hasGit(): boolean {
    try {
        execSync('git --version', { stdio: 'pipe' })
        return true
    } catch {
        return false
    }
}

/**
 * Download template from GitHub
 */
async function downloadTemplate(targetDir: string, templatePath: string): Promise<void> {
    const localTemplatePath = resolveLocalTemplatePath(templatePath)
    const forceLocal = process.env.CREATE_ZENITH_TEMPLATE_MODE === 'local' || flagEnabled(process.env.CREATE_ZENITH_OFFLINE)
    const preferLocal = process.env.CREATE_ZENITH_PREFER_LOCAL !== '0'

    if (localTemplatePath && (forceLocal || preferLocal)) {
        fs.cpSync(localTemplatePath, targetDir, { recursive: true })
        return
    }

    if (forceLocal && !localTemplatePath) {
        throw new Error(`Local template not found: ${templatePath}`)
    }

    const tempDir = path.join(os.tmpdir(), `zenith-template-${Date.now()}`)

    try {
        if (hasGit()) {
            // Use git clone with sparse checkout for efficiency
            execSync(`git clone --depth 1 --filter=blob:none --sparse https://github.com/${GITHUB_REPO}.git "${tempDir}"`, {
                stdio: 'pipe'
            })
            execSync(`git sparse-checkout set ${templatePath}`, {
                cwd: tempDir,
                stdio: 'pipe'
            })

            // Copy template contents to target
            const templateSource = path.join(tempDir, templatePath)
            fs.cpSync(templateSource, targetDir, { recursive: true })
        } else {
            // Fallback: download tarball via curl/fetch
            const tarballUrl = `https://github.com/${GITHUB_REPO}/archive/refs/heads/main.tar.gz`
            const tarballPath = path.join(os.tmpdir(), `zenith-${Date.now()}.tar.gz`)

            // Download tarball
            execSync(`curl -sL "${tarballUrl}" -o "${tarballPath}"`, { stdio: 'pipe' })

            // Extract
            fs.mkdirSync(tempDir, { recursive: true })
            execSync(`tar -xzf "${tarballPath}" -C "${tempDir}"`, { stdio: 'pipe' })

            // Find extracted directory (create-zenith-main)
            const extractedDir = fs.readdirSync(tempDir).find(f => f.startsWith('create-zenith'))
            if (!extractedDir) {
                throw new Error('Failed to extract template from GitHub')
            }

            // Copy template contents
            const templateSource = path.join(tempDir, extractedDir, templatePath)
            fs.cpSync(templateSource, targetDir, { recursive: true })

            // Cleanup tarball
            fs.unlinkSync(tarballPath)
        }
    } finally {
        // Cleanup temp directory
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true })
        }
    }
}

/**
 * Gather all project options through interactive prompts
 */
async function gatherOptions(providedName?: string, withTailwind?: boolean): Promise<ProjectOptions> {
    // Project name - REQUIRED
    let name = providedName

    if (!name) {
        const nameResult = await prompts.text({
            message: 'What is your project named?',
            placeholder: 'my-zenith-app',
            validate: (value) => {
                if (!value) return 'Project name is required'
                if (fs.existsSync(path.resolve(process.cwd(), value))) {
                    return `Directory "${value}" already exists`
                }
            }
        })

        if (prompts.isCancel(nameResult)) {
            prompts.handleCancel()
        }

        name = nameResult as string
    }

    if (!name) {
        brand.error('Project name is required')
        console.log('')
        console.log('Usage: npx create-zenith <project-name>')
        console.log('')
        console.log('Examples:')
        console.log('  npx create-zenith my-app')
        console.log('  bunx create-zenith my-app')
        process.exit(1)
    }

    // CRITICAL: Use process.cwd() to resolve the target directory
    const targetDir = path.resolve(process.cwd(), name)
    if (fs.existsSync(targetDir)) {
        brand.error(`Directory "${name}" already exists`)
        process.exit(1)
    }

    // If not TTY, use defaults
    if (!brand.isTTY()) {
        prompts.log.info('Non-interactive mode detected, using defaults...')
        return {
            name,
            eslint: true,
            prettier: true,
            pathAlias: true,
            tailwind: withTailwind ?? false
        }
    }

    // Interactive prompts with visual indicators
    const tailwindResult = (withTailwind !== undefined) ? withTailwind : await prompts.confirm({
        message: 'Add Tailwind CSS for styling?',
        initialValue: true
    })
    if (prompts.isCancel(tailwindResult)) prompts.handleCancel()
    const eslintResult = await prompts.confirm({
        message: 'Add ESLint for code linting?',
        initialValue: true
    })
    if (prompts.isCancel(eslintResult)) prompts.handleCancel()

    const prettierResult = await prompts.confirm({
        message: 'Add Prettier for code formatting?',
        initialValue: true
    })
    if (prompts.isCancel(prettierResult)) prompts.handleCancel()

    const pathAliasResult = await prompts.confirm({
        message: 'Add TypeScript path alias (@/*)?',
        initialValue: true
    })
    if (prompts.isCancel(pathAliasResult)) prompts.handleCancel()

    return {
        name,
        eslint: eslintResult as boolean,
        prettier: prettierResult as boolean,
        pathAlias: pathAliasResult as boolean,
        tailwind: tailwindResult as boolean
    }
}

/**
 * Create the project directory structure and files
 */
async function createProject(options: ProjectOptions): Promise<void> {
    const targetDir = path.resolve(process.cwd(), options.name)
    const templatePath = options.tailwind ? TAILWIND_TEMPLATE : DEFAULT_TEMPLATE

    // Download template from GitHub
    await downloadTemplate(targetDir, templatePath)

    // Update package.json
    const pkgPath = path.join(targetDir, 'package.json')
    if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
        pkg.name = options.name
        pkg.version = '0.1.0'

        // Remove ESLint dependencies and scripts if not selected
        if (!options.eslint) {
            delete pkg.devDependencies?.['eslint']
            delete pkg.devDependencies?.['@typescript-eslint/eslint-plugin']
            delete pkg.devDependencies?.['@typescript-eslint/parser']
            delete pkg.scripts?.lint

            // Remove config file
            const eslintPath = path.join(targetDir, '.eslintrc.json')
            if (fs.existsSync(eslintPath)) fs.unlinkSync(eslintPath)
        }

        // Remove Prettier dependencies and scripts if not selected
        if (!options.prettier) {
            delete pkg.devDependencies?.['prettier']
            delete pkg.scripts?.format

            // Remove config files
            const prettierRc = path.join(targetDir, '.prettierrc')
            const prettierIgnore = path.join(targetDir, '.prettierignore')
            if (fs.existsSync(prettierRc)) fs.unlinkSync(prettierRc)
            if (fs.existsSync(prettierIgnore)) fs.unlinkSync(prettierIgnore)
        }

        fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 4))
    }

    // Update tsconfig.json for path alias
    const tsconfigPath = path.join(targetDir, 'tsconfig.json')
    if (fs.existsSync(tsconfigPath)) {
        const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'))

        if (options.pathAlias) {
            tsconfig.compilerOptions = tsconfig.compilerOptions || {}
            tsconfig.compilerOptions.baseUrl = '.'
            tsconfig.compilerOptions.paths = {
                '@/*': [`./src/*`]
            }
        } else if (tsconfig.compilerOptions?.paths) {
            delete tsconfig.compilerOptions.paths
        }

        fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 4))
    }
}

/**
 * Main create command
 */
async function create(appName?: string, withTailwind?: boolean): Promise<void> {
    // Show branded animated intro
    await prompts.intro()

    // Gather project options
    const options = await gatherOptions(appName, withTailwind)
    const templateLabel = options.tailwind ? 'starter-tailwindcss' : 'starter'

    brand.showScaffoldSummary(options.name, templateLabel)

    console.log('')
    prompts.log.step(`Creating ${brand.bold(options.name)}...`)

    // Create project with spinner
    const s = prompts.spinner()
    s.start('Downloading starter template...')

    try {
        await createProject(options)
        s.stop('Project created')

        // Install dependencies
        s.start('Installing dependencies...')

        const targetDir = path.resolve(process.cwd(), options.name)
        const pm = detectPackageManager()

        if (flagEnabled(process.env.CREATE_ZENITH_SKIP_INSTALL)) {
            s.stop('Dependency installation skipped')
            brand.warn(`Run "${pm} install" manually in the project directory`)
        } else {
            try {
                // Run install in the target directory
                execSync(`${pm} install`, {
                    cwd: targetDir,
                    stdio: 'pipe'
                })
                s.stop('Dependencies installed')
            } catch {
                s.stop('Could not install dependencies automatically')
                brand.warn(`Run "${pm} install" manually in the project directory`)
            }
        }

        // Show completion with animation and next steps
        await prompts.outro(options.name, pm)

    } catch (err: unknown) {
        s.stop('Failed to create project')
        const message = err instanceof Error ? err.message : String(err)
        brand.error(message)
        process.exit(1)
    }
}

// ============================================================================
// CLI Entry Point
// ============================================================================

const args = process.argv.slice(2)

// Handle help flag
if (args.includes('--help') || args.includes('-h')) {
    brand.showCompactLogo()
    console.log('Usage: npx create-zenith [project-name]\n')
    console.log('Create a new Zenith application.\n')
    console.log('Options:')
    console.log('  -h, --help           Show this help message')
    console.log('  -v, --version        Show version number')
    console.log('  --with-tailwind      Initialize with Tailwind CSS v4 template')
    console.log('')
    console.log('Examples:')
    console.log('  npx create-zenith my-app')
    console.log('  bunx create-zenith my-app')
    console.log('  npm create zenith my-app')
    console.log('  bun create zenith my-app')
    process.exit(0)
}

// Handle version flag
if (args.includes('--version') || args.includes('-v')) {
    console.log(`create-zenith ${VERSION}`)
    process.exit(0)
}

// Get project name from arguments (first non-flag argument)
const projectName = args.find((arg: string) => !arg.startsWith('-'))

// Check for Tailwind flag
const withTailwind = args.includes('--with-tailwind') ? true : undefined

// Run the create command
create(projectName, withTailwind).catch((err: unknown) => {
    const mode = getUiMode(process)
    if (mode.plain) {
        console.log('ERROR: SCAFFOLD_ERROR')
    }
    brand.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
})
