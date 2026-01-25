/**
 * @zenithbuild/cli - Create Command
 * 
 * Scaffolds a new Zenith application with interactive prompts,
 * branded visuals, and optional configuration generation.
 */

import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import readline from 'readline'
import * as brand from '../utils/branding'

// Types for project options
interface ProjectOptions {
    name: string
    directory: 'app' | 'src'
    eslint: boolean
    prettier: boolean
    pathAlias: boolean
}

/**
 * Interactive readline prompt helper
 */
async function prompt(question: string, defaultValue?: string): Promise<string> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    })

    const displayQuestion = defaultValue
        ? `${question} ${brand.dim(`(${defaultValue})`)}: `
        : `${question}: `

    return new Promise((resolve) => {
        rl.question(displayQuestion, (answer) => {
            rl.close()
            resolve(answer.trim() || defaultValue || '')
        })
    })
}

/**
 * Yes/No prompt helper
 */
async function confirm(question: string, defaultYes: boolean = true): Promise<boolean> {
    const hint = defaultYes ? 'Y/n' : 'y/N'
    const answer = await prompt(`${question} ${brand.dim(`(${hint})`)}`)

    if (!answer) return defaultYes
    return answer.toLowerCase().startsWith('y')
}

/**
 * Main create command
 */
export async function create(appName?: string): Promise<void> {
    // Show branded intro
    await brand.showIntro()
    brand.header('Create a new Zenith app')

    // Gather project options
    const options = await gatherOptions(appName)

    console.log('')
    const spinner = new brand.Spinner('Creating project structure...')
    spinner.start()

    try {
        // Create project
        await createProject(options)
        spinner.succeed('Project structure created')

        // Always generate configs (tsconfig.json is required)
        const configSpinner = new brand.Spinner('Generating configurations...')
        configSpinner.start()
        await generateConfigs(options)
        configSpinner.succeed('Configurations generated')

        // Install dependencies
        const installSpinner = new brand.Spinner('Installing dependencies...')
        installSpinner.start()

        const targetDir = path.resolve(process.cwd(), options.name)
        process.chdir(targetDir)

        try {
            execSync('bun install', { stdio: 'pipe' })
            installSpinner.succeed('Dependencies installed')
        } catch {
            try {
                execSync('npm install', { stdio: 'pipe' })
                installSpinner.succeed('Dependencies installed')
            } catch {
                installSpinner.fail('Could not install dependencies automatically')
                brand.warn('Run "bun install" or "npm install" manually')
            }
        }

        // Show success message
        brand.showNextSteps(options.name)

    } catch (err: unknown) {
        spinner.fail('Failed to create project')
        const message = err instanceof Error ? err.message : String(err)
        brand.error(message)
        process.exit(1)
    }
}

/**
 * Gather all project options through interactive prompts
 */
async function gatherOptions(providedName?: string): Promise<ProjectOptions> {
    // Project name
    let name = providedName
    if (!name) {
        name = await prompt(brand.highlight('Project name'))
        if (!name) {
            brand.error('Project name is required')
            process.exit(1)
        }
    }

    const targetDir = path.resolve(process.cwd(), name)
    if (fs.existsSync(targetDir)) {
        brand.error(`Directory "${name}" already exists`)
        process.exit(1)
    }

    console.log('')
    brand.info(`Creating ${brand.bold(name)} in ${brand.dim(targetDir)}`)
    console.log('')

    // Directory structure
    const useSrc = await confirm('Use src/ directory instead of app/?', false)
    const directory = useSrc ? 'src' : 'app'

    // ESLint
    const eslint = await confirm('Add ESLint for code linting?', true)

    // Prettier
    const prettier = await confirm('Add Prettier for code formatting?', true)

    // TypeScript path aliases
    const pathAlias = await confirm('Add TypeScript path alias (@/*)?', true)

    return {
        name,
        directory,
        eslint,
        prettier,
        pathAlias
    }
}

/**
 * Create the project directory structure and files
 */
async function createProject(options: ProjectOptions): Promise<void> {
    const targetDir = path.resolve(process.cwd(), options.name)
    const baseDir = options.directory
    const appDir = path.join(targetDir, baseDir)

    // Create directories
    fs.mkdirSync(targetDir, { recursive: true })
    fs.mkdirSync(path.join(appDir, 'pages'), { recursive: true })
    fs.mkdirSync(path.join(appDir, 'layouts'), { recursive: true })
    fs.mkdirSync(path.join(appDir, 'components'), { recursive: true })
    fs.mkdirSync(path.join(appDir, 'styles'), { recursive: true }) // Create styles inside appDir

    // package.json
    const pkg: Record<string, unknown> = {
        name: options.name,
        version: '0.1.0',
        private: true,
        type: 'module',
        scripts: {
            dev: 'zen-dev',
            build: 'zen-build',
            preview: 'zen-preview',
            test: 'bun test'
        },
        dependencies: {
            '@zenithbuild/core': '^0.1.0'
        },
        devDependencies: {
            '@types/bun': 'latest'
        } as Record<string, string>
    }

    // Add optional dev dependencies
    const devDeps = pkg.devDependencies as Record<string, string>
    if (options.eslint) {
        devDeps['eslint'] = '^8.0.0'
        devDeps['@typescript-eslint/eslint-plugin'] = '^6.0.0'
        devDeps['@typescript-eslint/parser'] = '^6.0.0'
        pkg.scripts = { ...(pkg.scripts as object), lint: 'eslint .' }
    }
    if (options.prettier) {
        devDeps['prettier'] = '^3.0.0'
        pkg.scripts = { ...(pkg.scripts as object), format: 'prettier --write .' }
    }

    fs.writeFileSync(
        path.join(targetDir, 'package.json'),
        JSON.stringify(pkg, null, 4)
    )

    // index.zen
    fs.writeFileSync(
        path.join(targetDir, baseDir, 'pages', 'index.zen'),
        generateIndexPage()
    )

    // DefaultLayout.zen
    fs.writeFileSync(
        path.join(targetDir, baseDir, 'layouts', 'DefaultLayout.zen'),
        generateDefaultLayout()
    )

    // global.css
    fs.writeFileSync(
        path.join(appDir, 'styles', 'global.css'),
        generateGlobalCSS()
    )

    // .gitignore
    fs.writeFileSync(
        path.join(targetDir, '.gitignore'),
        generateGitignore()
    )
}

/**
 * Generate configuration files based on options
 */
async function generateConfigs(options: ProjectOptions): Promise<void> {
    const targetDir = path.resolve(process.cwd(), options.name)

    // tsconfig.json
    const tsconfig: Record<string, unknown> = {
        compilerOptions: {
            target: 'ESNext',
            module: 'ESNext',
            moduleResolution: 'bundler',
            strict: true,
            esModuleInterop: true,
            skipLibCheck: true,
            forceConsistentCasingInFileNames: true,
            resolveJsonModule: true,
            declaration: true,
            declarationMap: true,
            noEmit: true
        },
        include: [options.directory + '/**/*', '*.ts'],
        exclude: ['node_modules', 'dist']
    }

    if (options.pathAlias) {
        (tsconfig.compilerOptions as Record<string, unknown>).baseUrl = '.'
            ; (tsconfig.compilerOptions as Record<string, unknown>).paths = {
                '@/*': [`./${options.directory}/*`]
            }
    }

    fs.writeFileSync(
        path.join(targetDir, 'tsconfig.json'),
        JSON.stringify(tsconfig, null, 4)
    )

    // ESLint config
    if (options.eslint) {
        const eslintConfig = {
            root: true,
            parser: '@typescript-eslint/parser',
            plugins: ['@typescript-eslint'],
            extends: [
                'eslint:recommended',
                'plugin:@typescript-eslint/recommended'
            ],
            env: {
                browser: true,
                node: true,
                es2022: true
            },
            rules: {
                '@typescript-eslint/no-unused-vars': 'warn',
                '@typescript-eslint/no-explicit-any': 'warn'
            },
            ignorePatterns: ['dist', 'node_modules']
        }

        fs.writeFileSync(
            path.join(targetDir, '.eslintrc.json'),
            JSON.stringify(eslintConfig, null, 4)
        )
    }

    // Prettier config
    if (options.prettier) {
        const prettierConfig = {
            semi: false,
            singleQuote: true,
            tabWidth: 4,
            trailingComma: 'es5',
            printWidth: 100
        }

        fs.writeFileSync(
            path.join(targetDir, '.prettierrc'),
            JSON.stringify(prettierConfig, null, 4)
        )

        fs.writeFileSync(
            path.join(targetDir, '.prettierignore'),
            'dist\nnode_modules\nbun.lock\n'
        )
    }
}

// Template generators
function generateIndexPage(): string {
    return `<script setup="ts">
    state count = 0
    
    function increment() {
        count = count + 1
    }
    
    function decrement() {
        count = count - 1
    }
    
    zenOnMount(() => {
        console.log('🚀 Zenith app mounted!')
    })
</script>

<DefaultLayout title="Zenith App">
    <main>
        <div class="hero">
            <h1>Welcome to <span class="brand">Zenith</span></h1>
            <p class="tagline">The Modern Reactive Web Framework</p>
        </div>
    
    <div class="counter-card">
        <h2>Interactive Counter</h2>
        <p class="count">{count}</p>
        <div class="buttons">
            <button onclick="decrement" class="btn-secondary">−</button>
            <button onclick="increment" class="btn-primary">+</button>
        </div>
    </div>
    
    <div class="features">
        <div class="feature">
            <span class="icon">⚡</span>
            <h3>Reactive State</h3>
            <p>Built-in state management with automatic DOM updates</p>
        </div>
        <div class="feature">
            <span class="icon">🎯</span>
            <h3>Zero Config</h3>
            <p>Works immediately with no build step required</p>
        </div>
        <div class="feature">
            <span class="icon">🔥</span>
            <h3>Hot Reload</h3>
            <p>Instant updates during development</p>
        </div>
    </div>
    </div>
</DefaultLayout>

<style>
    main {
        max-width: 900px;
        margin: 0 auto;
        padding: 3rem 2rem;
        font-family: system-ui, -apple-system, sans-serif;
        background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
        color: #f1f5f9;
        min-height: 100vh;
    }
    
    .hero {
        text-align: center;
        margin-bottom: 3rem;
    }
    
    h1 {
        font-size: 3rem;
        font-weight: 700;
        margin-bottom: 0.5rem;
    }
    
    .brand {
        background: linear-gradient(135deg, #3b82f6, #06b6d4);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
    }
    
    .tagline {
        color: #94a3b8;
        font-size: 1.25rem;
    }
    
    .counter-card {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 16px;
        padding: 2rem;
        text-align: center;
        margin-bottom: 3rem;
    }
    
    .counter-card h2 {
        color: #e2e8f0;
        margin-bottom: 1rem;
    }
    
    .count {
        font-size: 4rem;
        font-weight: 700;
        color: #3b82f6;
        margin: 1rem 0;
    }
    
    .buttons {
        display: flex;
        gap: 1rem;
        justify-content: center;
    }
    
    button {
        font-size: 1.5rem;
        width: 60px;
        height: 60px;
        border: none;
        border-radius: 12px;
        cursor: pointer;
        transition: all 0.2s ease;
        font-weight: 600;
    }
    
    .btn-primary {
        background: linear-gradient(135deg, #3b82f6, #2563eb);
        color: white;
    }
    
    .btn-primary:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 20px rgba(59, 130, 246, 0.4);
    }
    
    .btn-secondary {
        background: rgba(255, 255, 255, 0.1);
        color: #e2e8f0;
    }
    
    .btn-secondary:hover {
        background: rgba(255, 255, 255, 0.2);
    }
    
    .features {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 1.5rem;
    }
    
    .feature {
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 12px;
        padding: 1.5rem;
        text-align: center;
    }
    
    .icon {
        font-size: 2rem;
        display: block;
        margin-bottom: 0.75rem;
    }
    
    .feature h3 {
        color: #e2e8f0;
        margin-bottom: 0.5rem;
        font-size: 1.1rem;
    }
    
    .feature p {
        color: #94a3b8;
        font-size: 0.9rem;
        line-height: 1.5;
    }
</style>
`
}

function generateDefaultLayout(): string {
    return `<script setup="ts">
    // interface Props { title?: string; lang?: string }
    
    zenEffect(() => {
        document.title = title || 'Zenith App'
    })
    
    zenOnMount(() => {
        console.log(\`[Layout] Mounted with title: \${title || 'Zenith App'}\`)
    })
</script>

<html lang={lang || 'en'}>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="/styles/global.css">
</head>
<body>
    <div class="layout">
        <header class="header">
            <nav class="nav">
                <a href="/" class="logo">⚡ Zenith</a>
                <div class="nav-links">
                    <a href="/">Home</a>
                    <a href="/docs">Docs</a>
                    <a href="https://github.com/zenithbuild/zenith" target="_blank">GitHub</a>
                </div>
            </nav>
        </header>
        
        <main class="content">
            <slot />
        </main>
        
        <footer class="footer">
            <p>Built with ⚡ Zenith Framework</p>
        </footer>
    </div>
</body>
</html>

<style>
    .layout {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
    }
    
    .header {
        background: rgba(15, 23, 42, 0.95);
        backdrop-filter: blur(10px);
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        position: sticky;
        top: 0;
        z-index: 100;
    }
    
    .nav {
        max-width: 1200px;
        margin: 0 auto;
        padding: 1rem 2rem;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    
    .logo {
        font-size: 1.25rem;
        font-weight: 700;
        color: #3b82f6;
        text-decoration: none;
    }
    
    .nav-links {
        display: flex;
        gap: 2rem;
    }
    
    .nav-links a {
        color: #94a3b8;
        text-decoration: none;
        transition: color 0.2s;
    }
    
    .nav-links a:hover {
        color: #f1f5f9;
    }
    
    .content {
        flex: 1;
    }
    
    .footer {
        background: #0f172a;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        padding: 2rem;
        text-align: center;
        color: #64748b;
    }
</style>
`
}

function generateGlobalCSS(): string {
    return `/* Zenith Global Styles */

/* CSS Reset */
*, *::before, *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
}

html {
    font-size: 16px;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
}

body {
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    line-height: 1.6;
    background: #0f172a;
    color: #f1f5f9;
}

a {
    color: #3b82f6;
    text-decoration: none;
}

a:hover {
    text-decoration: underline;
}

img, video {
    max-width: 100%;
    height: auto;
}

button, input, select, textarea {
    font: inherit;
}

/* Utility Classes */
.container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 1rem;
}

.text-center { text-align: center; }
.text-muted { color: #94a3b8; }

/* Zenith Brand Colors */
:root {
    --zen-primary: #3b82f6;
    --zen-secondary: #06b6d4;
    --zen-bg: #0f172a;
    --zen-surface: #1e293b;
    --zen-text: #f1f5f9;
    --zen-muted: #94a3b8;
}
`
}

function generateGitignore(): string {
    return `# Dependencies
node_modules/
bun.lock

# Build output
dist/
.cache/

# IDE
.idea/
.vscode/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Environment
.env
.env.local
.env.*.local

# Logs
*.log
npm-debug.log*

# Testing
coverage/
`
}
