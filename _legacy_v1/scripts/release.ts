#!/usr/bin/env bun
/**
 * =============================================================================
 * Zenith Release Script
 * =============================================================================
 * 
 * Automated release script using Bun for all Zenith repositories.
 * Handles:
 * - Conventional Commit parsing for automatic version determination
 * - CHANGELOG.md generation
 * - package.json version updates
 * - Release notes generation for GitHub releases
 * 
 * Usage:
 *   bun run scripts/release.ts              # Normal release
 *   bun run scripts/release.ts --dry-run    # Test without making changes
 *   bun run scripts/release.ts --bump=major # Force major version bump
 *   bun run scripts/release.ts --bump=minor # Force minor version bump
 *   bun run scripts/release.ts --bump=patch # Force patch version bump
 * 
 * Environment Variables:
 *   DRY_RUN      - Set to 'true' for dry run mode
 *   BUMP_TYPE    - Force bump type (patch, minor, major)
 *   GITHUB_TOKEN - GitHub token for API calls (optional)
 * 
 * =============================================================================
 */

import { $ } from "bun";
import { existsSync } from "fs";
import { join } from "path";

// =============================================================================
// Types
// =============================================================================

interface Commit {
    hash: string;
    type: string;
    scope: string | null;
    subject: string;
    body: string;
    breaking: boolean;
    raw: string;
}

interface PackageJson {
    name: string;
    version: string;
    private?: boolean;
    [key: string]: unknown;
}

interface ReleaseConfig {
    types: {
        [key: string]: {
            title: string;
            bump: "patch" | "minor" | "major" | null;
            hidden?: boolean;
        };
    };
    skipCI: string[];
    tagPrefix: string;
}

type BumpType = "patch" | "minor" | "major";

// =============================================================================
// Configuration
// =============================================================================

const DEFAULT_CONFIG: ReleaseConfig = {
    types: {
        feat: { title: "✨ Features", bump: "minor" },
        fix: { title: "🐛 Bug Fixes", bump: "patch" },
        perf: { title: "⚡ Performance Improvements", bump: "patch" },
        refactor: { title: "♻️ Code Refactoring", bump: "patch" },
        docs: { title: "📚 Documentation", bump: null },
        style: { title: "💄 Styles", bump: null },
        test: { title: "✅ Tests", bump: null },
        build: { title: "📦 Build System", bump: "patch" },
        ci: { title: "🔧 CI Configuration", bump: null },
        chore: { title: "🔨 Chores", bump: null },
        revert: { title: "⏪ Reverts", bump: "patch" },
    },
    skipCI: ["[skip ci]", "[ci skip]", "[no ci]"],
    tagPrefix: "v",
};

// =============================================================================
// Utility Functions
// =============================================================================

function log(message: string, type: "info" | "success" | "warn" | "error" = "info"): void {
    const colors = {
        info: "\x1b[36m",    // Cyan
        success: "\x1b[32m", // Green
        warn: "\x1b[33m",    // Yellow
        error: "\x1b[31m",   // Red
    };
    const reset = "\x1b[0m";
    const prefix = {
        info: "ℹ",
        success: "✓",
        warn: "⚠",
        error: "✖",
    };
    console.log(`${colors[type]}${prefix[type]}${reset} ${message}`);
}

function parseArgs(): { dryRun: boolean; bumpType: BumpType | null } {
    const args = process.argv.slice(2);
    let dryRun = process.env.DRY_RUN === "true";
    let bumpType: BumpType | null = (process.env.BUMP_TYPE as BumpType) || null;

    for (const arg of args) {
        if (arg === "--dry-run") {
            dryRun = true;
        } else if (arg.startsWith("--bump=")) {
            const bump = arg.split("=")[1] as BumpType;
            if (["patch", "minor", "major"].includes(bump)) {
                bumpType = bump;
            }
        }
    }

    return { dryRun, bumpType };
}

// =============================================================================
// Git Functions
// =============================================================================

async function getLastTag(): Promise<string | null> {
    try {
        const result = await $`git describe --tags --abbrev=0 2>/dev/null`.text();
        return result.trim() || null;
    } catch {
        return null;
    }
}

async function tagExists(version: string): Promise<boolean> {
    try {
        const result = await $`git tag -l "v${version}"`.text();
        return result.trim() !== "";
    } catch {
        return false;
    }
}


async function getCommitsSinceTag(tag: string | null): Promise<string[]> {
    try {
        let result: string;
        if (tag) {
            result = await $`git log ${tag}..HEAD --pretty=format:"%H|%s|%b|||"`.text();
        } else {
            result = await $`git log --pretty=format:"%H|%s|%b|||"`.text();
        }
        return result.split("|||").filter((c) => c.trim());
    } catch {
        return [];
    }
}

function parseCommit(rawCommit: string, config: ReleaseConfig): Commit | null {
    const parts = rawCommit.trim().split("|");
    if (parts.length < 2) return null;

    const hash = parts[0];
    const subject = parts[1];
    const body = parts.slice(2).join("|").trim();

    // Skip CI commits
    if (config.skipCI.some((skip) => subject.includes(skip))) {
        return null;
    }

    // Parse conventional commit format: type(scope): subject
    const conventionalMatch = subject.match(/^(\w+)(?:\(([^)]+)\))?!?:\s*(.+)$/);

    if (!conventionalMatch) {
        // Non-conventional commit, treat as misc
        return {
            hash,
            type: "other",
            scope: null,
            subject,
            body,
            breaking: false,
            raw: rawCommit,
        };
    }

    const [, type, scope, message] = conventionalMatch;
    const breaking = subject.includes("!:") ||
        body.toLowerCase().includes("breaking change") ||
        body.toLowerCase().includes("breaking-change");

    return {
        hash,
        type: type.toLowerCase(),
        scope: scope || null,
        subject: message.trim(),
        body,
        breaking,
        raw: rawCommit,
    };
}

// =============================================================================
// Version Functions
// =============================================================================

function bumpVersion(version: string, bumpType: BumpType): string {
    const parts = version.replace(/^v/, "").split(".");
    const major = parseInt(parts[0] || "0", 10);
    const minor = parseInt(parts[1] || "0", 10);
    const patch = parseInt(parts[2] || "0", 10);

    switch (bumpType) {
        case "major":
            return `${major + 1}.0.0`;
        case "minor":
            return `${major}.${minor + 1}.0`;
        case "patch":
            return `${major}.${minor}.${patch + 1}`;
    }
}

function determineBumpType(commits: Commit[], config: ReleaseConfig): BumpType | null {
    let bump: BumpType | null = null;
    const priority: Record<BumpType, number> = { patch: 1, minor: 2, major: 3 };

    for (const commit of commits) {
        // Breaking changes always result in major bump
        if (commit.breaking) {
            return "major";
        }

        const typeConfig = config.types[commit.type];
        if (typeConfig?.bump) {
            if (!bump || priority[typeConfig.bump] > priority[bump]) {
                bump = typeConfig.bump;
            }
        }
    }

    return bump;
}

// =============================================================================
// Changelog Generation
// =============================================================================

function generateChangelog(
    commits: Commit[],
    newVersion: string,
    config: ReleaseConfig
): string {
    const date = new Date().toISOString().split("T")[0];
    const groupedCommits: Record<string, Commit[]> = {};

    // Group commits by type
    for (const commit of commits) {
        const type = commit.type;
        if (!groupedCommits[type]) {
            groupedCommits[type] = [];
        }
        groupedCommits[type].push(commit);
    }

    let changelog = `## [${newVersion}] - ${date}\n\n`;

    // Breaking changes section
    const breakingChanges = commits.filter((c) => c.breaking);
    if (breakingChanges.length > 0) {
        changelog += `### ⚠️ BREAKING CHANGES\n\n`;
        for (const commit of breakingChanges) {
            const scope = commit.scope ? `**${commit.scope}**: ` : "";
            changelog += `#### ${scope}${commit.subject} (${commit.hash.slice(0, 7)})\n`;
            if (commit.body) {
                changelog += `\n${commit.body.split('\n').map(line => `> ${line}`).join('\n')}\n`;
            }
            changelog += "\n";
        }
        changelog += "---\n\n";
    }

    // Regular changes by type
    for (const [type, typeConfig] of Object.entries(config.types)) {
        if (typeConfig.hidden) continue;

        const typeCommits = groupedCommits[type];
        if (!typeCommits || typeCommits.length === 0) continue;

        changelog += `### ${typeConfig.title}\n\n`;
        for (const commit of typeCommits) {
            const scope = commit.scope ? `**${commit.scope}**: ` : "";
            changelog += `- **${scope}${commit.subject}** (${commit.hash.slice(0, 7)})\n`;

            // Include body if present
            if (commit.body && commit.body.trim()) {
                const cleanedBody = commit.body.trim();
                // Indent body for better hierarchy
                changelog += `${cleanedBody.split('\n').map(line => `  > ${line}`).join('\n')}\n`;
            }
        }
        changelog += "\n";
    }

    // Other/uncategorized commits
    if (groupedCommits.other && groupedCommits.other.length > 0) {
        changelog += `### 📝 Other Changes\n\n`;
        for (const commit of groupedCommits.other) {
            changelog += `- **${commit.subject}** (${commit.hash.slice(0, 7)})\n`;
            if (commit.body && commit.body.trim()) {
                changelog += `${commit.body.trim().split('\n').map(line => `  > ${line}`).join('\n')}\n`;
            }
        }
        changelog += "\n";
    }

    return changelog;
}

function generateReleaseNotes(
    commits: Commit[],
    newVersion: string,
    packageName: string,
    config: ReleaseConfig
): string {
    const changelog = generateChangelog(commits, newVersion, config);

    return `# 🚀 ${packageName} v${newVersion}

${changelog}

## 📦 Installation

\`\`\`bash
bun add ${packageName}@${newVersion}
\`\`\`

*or with npm:*

\`\`\`bash
npm install ${packageName}@${newVersion}
\`\`\`

---
*Generated by Zenith Automated Release*
`;
}

async function updateChangelogFile(
    newChangelog: string,
    dryRun: boolean
): Promise<void> {
    const changelogPath = join(process.cwd(), "CHANGELOG.md");
    let existingChangelog = "";

    if (existsSync(changelogPath)) {
        existingChangelog = await Bun.file(changelogPath).text();
        // Remove the header if it exists
        existingChangelog = existingChangelog.replace(
            /^# Changelog\n\n(?:.*\n)*?(?=## \[)/,
            ""
        );
    }

    const fullChangelog = `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

${newChangelog}${existingChangelog}`;

    if (dryRun) {
        log("Would write CHANGELOG.md:", "info");
        console.log(fullChangelog.slice(0, 500) + "...");
    } else {
        await Bun.write(changelogPath, fullChangelog);
        log("Updated CHANGELOG.md", "success");
    }
}

// =============================================================================
// Package.json Functions
// =============================================================================

async function readPackageJson(): Promise<PackageJson> {
    const packagePath = join(process.cwd(), "package.json");
    const content = await Bun.file(packagePath).text();
    return JSON.parse(content);
}

async function updatePackageJson(
    newVersion: string,
    dryRun: boolean
): Promise<void> {
    const packagePath = join(process.cwd(), "package.json");
    const packageJson = await readPackageJson();
    packageJson.version = newVersion;

    if (dryRun) {
        log(`Would update package.json version to ${newVersion}`, "info");
    } else {
        await Bun.write(packagePath, JSON.stringify(packageJson, null, 2) + "\n");
        log(`Updated package.json version to ${newVersion}`, "success");
    }
}

// =============================================================================
// GitHub Actions Output
// =============================================================================

async function setGitHubOutput(name: string, value: string): Promise<void> {
    const outputFile = process.env.GITHUB_OUTPUT;
    if (outputFile) {
        const output = `${name}=${value}\n`;
        // Use Node.js appendFileSync for reliable GitHub Actions output
        const { appendFileSync } = await import("fs");
        appendFileSync(outputFile, output);
        log(`Set output: ${name}=${value}`, "info");
    }
}

// =============================================================================
// Load Custom Config
// =============================================================================

async function loadConfig(): Promise<ReleaseConfig> {
    const configPaths = [
        join(process.cwd(), ".releaserc.json"),
        join(process.cwd(), "release.config.json"),
        join(process.cwd(), ".release.json"),
    ];

    for (const configPath of configPaths) {
        if (existsSync(configPath)) {
            const content = await Bun.file(configPath).text();
            const customConfig = JSON.parse(content);
            return { ...DEFAULT_CONFIG, ...customConfig };
        }
    }

    return DEFAULT_CONFIG;
}

// =============================================================================
// Main Release Function
// =============================================================================

async function main(): Promise<void> {
    console.log("\n🚀 Zenith Release Script\n");
    console.log("=".repeat(50) + "\n");

    const { dryRun, bumpType: forcedBumpType } = parseArgs();

    if (dryRun) {
        log("Running in DRY RUN mode - no changes will be made", "warn");
        console.log();
    }

    // Load configuration
    const config = await loadConfig();
    log("Loaded release configuration", "success");

    // Read package.json
    const packageJson = await readPackageJson();
    log(`Package: ${packageJson.name}`, "info");
    log(`Current version: ${packageJson.version}`, "info");

    // Get last tag
    const lastTag = await getLastTag();
    log(`Last tag: ${lastTag || "none"}`, "info");

    // Get commits since last tag
    const rawCommits = await getCommitsSinceTag(lastTag);
    log(`Found ${rawCommits.length} commits since last release`, "info");

    if (rawCommits.length === 0) {
        log("No commits since last release. Nothing to do.", "warn");
        await setGitHubOutput("should_release", "false");
        return;
    }

    // Parse commits
    const commits = rawCommits
        .map((c) => parseCommit(c, config))
        .filter((c): c is Commit => c !== null);

    log(`Parsed ${commits.length} conventional commits`, "info");

    // Determine bump type
    const determinedBumpType = forcedBumpType || determineBumpType(commits, config);

    if (!determinedBumpType) {
        log("No version bump required based on commits", "warn");
        await setGitHubOutput("should_release", "false");
        return;
    }

    log(`Version bump type: ${determinedBumpType}`, "info");

    // Calculate new version
    const newVersion = bumpVersion(packageJson.version, determinedBumpType);
    log(`New version: ${newVersion}`, "success");

    // Check if this version already exists as a tag (fallback to prevent duplicates)
    if (await tagExists(newVersion)) {
        log(`Version v${newVersion} already exists as a tag. Skipping release.`, "warn");
        await setGitHubOutput("should_release", "false");
        return;
    }

    console.log("\n" + "-".repeat(50) + "\n");

    // Generate changelog
    const changelog = generateChangelog(commits, newVersion, config);
    log("Generated changelog", "success");

    // Generate release notes
    const releaseNotes = generateReleaseNotes(
        commits,
        newVersion,
        packageJson.name,
        config
    );

    // Update files
    await updateChangelogFile(changelog, dryRun);
    await updatePackageJson(newVersion, dryRun);

    // Write release notes for GitHub Action
    if (!dryRun) {
        await Bun.write(join(process.cwd(), "RELEASE_NOTES.md"), releaseNotes);
        log("Written RELEASE_NOTES.md", "success");
    }

    // Set GitHub Actions outputs
    await setGitHubOutput("should_release", "true");
    await setGitHubOutput("new_version", newVersion);
    await setGitHubOutput("bump_type", determinedBumpType);
    await setGitHubOutput("package_name", packageJson.name);

    console.log("\n" + "=".repeat(50));
    console.log("\n✅ Release preparation complete!\n");

    if (dryRun) {
        console.log("DRY RUN - Summary of what would happen:");
        console.log(`  • Version: ${packageJson.version} → ${newVersion}`);
        console.log(`  • CHANGELOG.md would be updated`);
        console.log(`  • Release notes would be created`);
        console.log(`  • Git tag: v${newVersion} would be created`);
        console.log(`  • GitHub release would be published`);
        if (!packageJson.private) {
            console.log(`  • Package would be published to NPM`);
        }
    }
}

// Run the script
main().catch((error) => {
    log(`Release failed: ${error.message}`, "error");
    process.exit(1);
});
