// ---------------------------------------------------------------------------
// resolve-components.js — Compile-time component expansion
// ---------------------------------------------------------------------------
// Zenith components are structural macros. This module expands PascalCase
// component tags into their template HTML at build time, so the compiler
// only ever sees standard HTML.
//
// Pipeline:
//   buildComponentRegistry() → expandComponents() → expanded source string
// ---------------------------------------------------------------------------

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

// ---------------------------------------------------------------------------
// Registry: Map<PascalCaseName, absolutePath>
// ---------------------------------------------------------------------------

/**
 * Walk `srcDir/components/` recursively. Return Map<PascalName, absPath>.
 * Errors on duplicate component names within the registry.
 *
 * Also scans `srcDir/layouts/` for layout components (Document Mode).
 *
 * @param {string} srcDir — absolute path to the project's `src/` directory
 * @returns {Map<string, string>}
 */
export function buildComponentRegistry(srcDir) {
    /** @type {Map<string, string>} */
    const registry = new Map();

    const scanDirs = ['components', 'layouts', 'globals'];
    for (const sub of scanDirs) {
        const dir = join(srcDir, sub);
        try {
            statSync(dir);
        } catch {
            continue; // Directory doesn't exist, skip
        }
        walkDir(dir, registry);
    }

    return registry;
}

/**
 * @param {string} dir
 * @param {Map<string, string>} registry
 */
function walkDir(dir, registry) {
    let entries;
    try {
        entries = readdirSync(dir);
    } catch {
        return;
    }
    entries.sort();

    for (const name of entries) {
        const fullPath = join(dir, name);
        const info = statSync(fullPath);
        if (info.isDirectory()) {
            walkDir(fullPath, registry);
            continue;
        }
        if (extname(name) !== '.zen') continue;

        const componentName = basename(name, '.zen');
        // Only register PascalCase names (first char uppercase)
        if (!/^[A-Z]/.test(componentName)) continue;

        if (registry.has(componentName)) {
            throw new Error(
                `Duplicate component name "${componentName}":\n` +
                `  1) ${registry.get(componentName)}\n` +
                `  2) ${fullPath}\n` +
                `Rename one to resolve the conflict.`
            );
        }
        registry.set(componentName, fullPath);
    }
}

// ---------------------------------------------------------------------------
// Template extraction
// ---------------------------------------------------------------------------

/**
 * Strip all <script ...>...</script> and <style ...>...</style> blocks
 * from a .zen source. Return template-only markup.
 *
 * @param {string} zenSource
 * @returns {string}
 */
export function extractTemplate(zenSource) {
    // Remove <script ...>...</script> blocks (greedy matching for nested content)
    let template = zenSource;

    // Strip script blocks (handles <script>, <script lang="ts">, etc.)
    template = stripBlock(template, 'script');
    // Strip style blocks
    template = stripBlock(template, 'style');

    return template.trim();
}

/**
 * Strip a matched pair of <tag ...>...</tag> from source.
 * Handles multiple occurrences and attributes on the opening tag.
 *
 * @param {string} source
 * @param {string} tag
 * @returns {string}
 */
function stripBlock(source, tag) {
    // Use a regex that matches <tag ...>...</tag> including multiline content
    // We need a non-greedy approach for nested scenarios, but script/style
    // blocks cannot be nested in HTML, so we can match the first closing tag.
    const re = new RegExp(
        `<${tag}(?:\\s[^>]*)?>` +    // opening tag with optional attributes
        `[\\s\\S]*?` +                // content (non-greedy)
        `</${tag}>`,                   // closing tag
        'gi'
    );
    return source.replace(re, '');
}

// ---------------------------------------------------------------------------
// Document Mode detection
// ---------------------------------------------------------------------------

/**
 * Returns true if the template contains <!doctype or <html,
 * indicating it's a Document Mode component (layout wrapper).
 *
 * @param {string} template
 * @returns {boolean}
 */
export function isDocumentMode(template) {
    const lower = template.toLowerCase();
    return lower.includes('<!doctype') || lower.includes('<html');
}

// ---------------------------------------------------------------------------
// Component expansion
// ---------------------------------------------------------------------------

const OPEN_COMPONENT_TAG_RE = /<([A-Z][a-zA-Z0-9]*)(\s[^<>]*?)?\s*(\/?)>/g;

/**
 * Recursively expand PascalCase component tags in `source`.
 *
 * @param {string} source — page or component template source
 * @param {Map<string, string>} registry — component name → .zen file path
 * @param {string} sourceFile — source file path (for error messages)
 * @param {Set<string>} [visited] — cycle detection set
 * @returns {{ expandedSource: string, usedComponents: string[] }}
 */
export function expandComponents(source, registry, sourceFile, visited) {
    if (visited && visited.size > 0) {
        throw new Error('expandComponents() does not accept a pre-populated visited set');
    }

    const usedComponents = [];
    const expandedSource = expandSource(source, registry, sourceFile, [], usedComponents);
    return {
        expandedSource,
        usedComponents: [...new Set(usedComponents)],
    };
}

/**
 * Expand component tags recursively.
 *
 * @param {string} source
 * @param {Map<string, string>} registry
 * @param {string} sourceFile
 * @param {string[]} chain
 * @param {string[]} usedComponents
 * @returns {string}
 */
function expandSource(source, registry, sourceFile, chain, usedComponents) {
    let output = source;
    let iterations = 0;
    const MAX_ITERATIONS = 10_000;

    while (iterations < MAX_ITERATIONS) {
        iterations += 1;
        const tag = findNextKnownTag(output, registry, 0);
        if (!tag) {
            return output;
        }

        let children = '';
        let replaceEnd = tag.end;

        if (!tag.selfClosing) {
            const close = findMatchingClose(output, tag.name, tag.end);
            if (!close) {
                throw new Error(
                    `Unclosed component tag <${tag.name}> in ${sourceFile} at offset ${tag.start}`
                );
            }
            children = expandSource(
                output.slice(tag.end, close.contentEnd),
                registry,
                sourceFile,
                chain,
                usedComponents
            );
            replaceEnd = close.tagEnd;
        }

        const replacement = expandTag(
            tag.name,
            children,
            registry,
            sourceFile,
            chain,
            usedComponents
        );

        output = output.slice(0, tag.start) + replacement + output.slice(replaceEnd);
    }

    throw new Error(
        `Component expansion exceeded ${MAX_ITERATIONS} replacements in ${sourceFile}.`
    );
}

/**
 * Find the next component opening tag that exists in the registry.
 *
 * @param {string} source
 * @param {Map<string, string>} registry
 * @param {number} startIndex
 * @returns {{ name: string, start: number, end: number, selfClosing: boolean } | null}
 */
function findNextKnownTag(source, registry, startIndex) {
    OPEN_COMPONENT_TAG_RE.lastIndex = startIndex;

    let match;
    while ((match = OPEN_COMPONENT_TAG_RE.exec(source)) !== null) {
        const name = match[1];
        if (!registry.has(name)) {
            continue;
        }
        return {
            name,
            start: match.index,
            end: OPEN_COMPONENT_TAG_RE.lastIndex,
            selfClosing: match[3] === '/',
        };
    }

    return null;
}

/**
 * Find the matching </Name> for an opening tag, accounting for nested
 * tags with the same name.
 *
 * @param {string} source — full source
 * @param {string} tagName — tag name to match
 * @param {number} startAfterOpen — position after the opening tag's `>`
 * @returns {{ contentEnd: number, tagEnd: number } | null}
 */
function findMatchingClose(source, tagName, startAfterOpen) {
    let depth = 1;
    const escapedName = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const tagRe = new RegExp(`<(/?)${escapedName}(?:\\s[^<>]*?)?\\s*(/?)>`, 'g');
    tagRe.lastIndex = startAfterOpen;

    let match;
    while ((match = tagRe.exec(source)) !== null) {
        const isClose = match[1] === '/';
        const isSelfClose = match[2] === '/';

        if (isSelfClose && !isClose) {
            // Self-closing <Name />, doesn't affect depth.
            continue;
        }

        if (isClose) {
            depth--;
            if (depth === 0) {
                return {
                    contentEnd: match.index,
                    tagEnd: match.index + match[0].length,
                };
            }
        } else {
            depth++;
        }
    }

    return null;
}

/**
 * Expand a single component tag into its template HTML.
 *
 * @param {string} name — component name
 * @param {string} children — children content (inner HTML of the tag)
 * @param {Map<string, string>} registry
 * @param {string} sourceFile
 * @param {string[]} chain
 * @param {string[]} usedComponents
 * @returns {string}
 */
function expandTag(name, children, registry, sourceFile, chain, usedComponents) {

    const compPath = registry.get(name);
    if (!compPath) {
        throw new Error(`Unknown component "${name}" referenced in ${sourceFile}`);
    }

    // Cycle detection
    if (chain.includes(name)) {
        const cycle = [...chain, name].join(' -> ');
        throw new Error(
            `Circular component dependency detected: ${cycle}\n` +
            `File: ${sourceFile}`
        );
    }

    const compSource = readFileSync(compPath, 'utf8');
    let template = extractTemplate(compSource);

    // Check Document Mode
    const docMode = isDocumentMode(template);

    if (docMode) {
        // Document Mode: must contain exactly one <slot />
        const slotCount = countSlots(template);
        if (slotCount !== 1) {
            throw new Error(
                `Document Mode component "${name}" must contain exactly one <slot />, found ${slotCount}.\n` +
                `File: ${compPath}`
            );
        }
        // Replace <slot /> with children
        template = replaceSlot(template, children);
    } else {
        // Standard component
        const slotCount = countSlots(template);
        if (children.trim().length > 0 && slotCount === 0) {
            throw new Error(
                `Component "${name}" has children but its template has no <slot />.\n` +
                `Either add <slot /> to ${compPath} or make the tag self-closing.`
            );
        }
        if (slotCount > 0) {
            template = replaceSlot(template, children || '');
        }
    }

    usedComponents.push(name);

    return expandSource(template, registry, compPath, [...chain, name], usedComponents);
}

/**
 * Count occurrences of <slot /> or <slot></slot> in template.
 * @param {string} template
 * @returns {number}
 */
function countSlots(template) {
    const matches = template.match(/<slot\s*>\s*<\/slot>|<slot\s*\/>|<slot\s*>/gi);
    return matches ? matches.length : 0;
}

/**
 * Replace <slot />, <slot/>, or <slot></slot> with replacement content.
 * @param {string} template
 * @param {string} content
 * @returns {string}
 */
function replaceSlot(template, content) {
    // Replace first occurrence of <slot /> or <slot></slot> or <slot>
    return template.replace(/<slot\s*>\s*<\/slot>|<slot\s*\/>|<slot\s*>/i, content);
}
