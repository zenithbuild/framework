import { readFileSync } from 'node:fs';
import { findMatchingComponentClose, findNextKnownComponentTag } from './component-tag-parser.js';
import { extractTemplate, isDocumentMode } from './resolve-components.js';

export function collectExpandedComponentOccurrences(source, registry, sourceFile) {
    /** @type {Array<{ name: string, attrs: string, ownerPath: string, componentPath: string }>} */
    const occurrences = [];
    walkSource(String(source || ''), registry, sourceFile, [], occurrences);
    return occurrences;
}

function walkSource(source, registry, sourceFile, chain, occurrences) {
    let cursor = 0;

    while (cursor < source.length) {
        const tag = findNextKnownComponentTag(source, registry, cursor);
        if (!tag) {
            return;
        }

        let children = '';
        let replaceEnd = tag.end;
        if (!tag.selfClosing) {
            const close = findMatchingComponentClose(source, tag.name, tag.end);
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

function countSlots(template) {
    const matches = template.match(/<slot\s*>\s*<\/slot>|<slot\s*\/>|<slot\s*>/gi);
    return matches ? matches.length : 0;
}

function replaceSlot(template, content) {
    return template.replace(/<slot\s*>\s*<\/slot>|<slot\s*\/>|<slot\s*>/i, content);
}
