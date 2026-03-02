import { readFileSync } from 'node:fs';
import { extractTemplate, isDocumentMode } from './resolve-components.js';

const OPEN_COMPONENT_TAG_RE = /<([A-Z][a-zA-Z0-9]*)(\s[^<>]*?)?\s*(\/?)>/g;

export function collectExpandedComponentOccurrences(source, registry, sourceFile) {
    /** @type {Array<{ name: string, attrs: string, ownerPath: string, componentPath: string }>} */
    const occurrences = [];
    walkSource(String(source || ''), registry, sourceFile, [], occurrences);
    return occurrences;
}

function walkSource(source, registry, sourceFile, chain, occurrences) {
    let cursor = 0;

    while (cursor < source.length) {
        const tag = findNextKnownTag(source, registry, cursor);
        if (!tag) {
            return;
        }

        let children = '';
        let replaceEnd = tag.end;
        if (!tag.selfClosing) {
            const close = findMatchingClose(source, tag.name, tag.end);
            if (!close) {
                throw new Error(`Unclosed component tag <${tag.name}> in ${sourceFile} at offset ${tag.start}`);
            }
            children = source.slice(tag.end, close.contentEnd);
            replaceEnd = close.tagEnd;
        }

        const compPath = registry.get(tag.name);
        if (!compPath) {
            throw new Error(`Unknown component "${tag.name}" referenced in ${sourceFile}`);
        }
        if (chain.includes(tag.name)) {
            const cycle = [...chain, tag.name].join(' -> ');
            throw new Error(`Circular component dependency detected: ${cycle}\nFile: ${sourceFile}`);
        }

        occurrences.push({
            name: tag.name,
            attrs: String(tag.attrs || '').trim(),
            ownerPath: sourceFile,
            componentPath: compPath
        });

        const compSource = readFileSync(compPath, 'utf8');
        const nextTemplate = materializeTemplate(compSource, tag.name, children, compPath);
        walkSource(nextTemplate, registry, compPath, [...chain, tag.name], occurrences);
        cursor = replaceEnd;
    }
}

function materializeTemplate(componentSource, name, children, componentPath) {
    let template = extractTemplate(componentSource);
    const slotCount = countSlots(template);

    if (isDocumentMode(template)) {
        if (slotCount !== 1) {
            throw new Error(
                `Document Mode component "${name}" must contain exactly one <slot />, found ${slotCount}.\nFile: ${componentPath}`
            );
        }
        return replaceSlot(template, children);
    }

    if (children.trim().length > 0 && slotCount === 0) {
        throw new Error(
            `Component "${name}" has children but its template has no <slot />.\nEither add <slot /> to ${componentPath} or make the tag self-closing.`
        );
    }

    if (slotCount > 0) {
        template = replaceSlot(template, children || '');
    }

    return template;
}

function findNextKnownTag(source, registry, startIndex) {
    OPEN_COMPONENT_TAG_RE.lastIndex = startIndex;
    let match;
    while ((match = OPEN_COMPONENT_TAG_RE.exec(source)) !== null) {
        const name = match[1];
        if (!registry.has(name)) {
            continue;
        }
        if (isInsideExpressionScope(source, match.index)) {
            continue;
        }
        return {
            name,
            attrs: String(match[2] || ''),
            start: match.index,
            end: OPEN_COMPONENT_TAG_RE.lastIndex,
            selfClosing: match[3] === '/'
        };
    }
    return null;
}

function isInsideExpressionScope(source, index) {
    let depth = 0;
    for (let i = 0; i < index; i++) {
        if (source[i] === '{') {
            depth += 1;
        } else if (source[i] === '}') {
            depth = Math.max(0, depth - 1);
        }
    }
    return depth > 0;
}

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
            continue;
        }
        if (isClose) {
            depth -= 1;
            if (depth === 0) {
                return {
                    contentEnd: match.index,
                    tagEnd: match.index + match[0].length
                };
            }
        } else {
            depth += 1;
        }
    }

    return null;
}

function countSlots(template) {
    const matches = template.match(/<slot\s*>\s*<\/slot>|<slot\s*\/>|<slot\s*>/gi);
    return matches ? matches.length : 0;
}

function replaceSlot(template, content) {
    return template.replace(/<slot\s*>\s*<\/slot>|<slot\s*\/>|<slot\s*>/i, content);
}
