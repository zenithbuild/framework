import { readFileSync } from 'node:fs';
import { findMatchingComponentClose, findNextKnownComponentTag } from './component-tag-parser.js';
import { extractTemplate, isDocumentMode } from './resolve-components.js';

export function collectExpandedComponentOccurrences(source, registry, sourceFile) {
    /** @type {Array<{ name: string, attrs: string, ownerPath: string, componentPath: string }>} */
    const occurrences = [];
    walkSource(
        String(source || ''),
        registry,
        {
            parseFilePath: sourceFile,
            ownerPath: sourceFile
        },
        [],
        occurrences
    );
    return occurrences;
}

function walkSource(source, registry, context, chain, occurrences) {
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
                throw new Error(`Unclosed component tag <${tag.name}> in ${context.parseFilePath} at offset ${tag.start}`);
            }
            children = source.slice(tag.end, close.contentEnd);
            replaceEnd = close.tagEnd;
        }

        const compPath = registry.get(tag.name);
        if (!compPath) {
            throw new Error(`Unknown component "${tag.name}" referenced in ${context.parseFilePath}`);
        }
        if (chain.includes(tag.name)) {
            const cycle = [...chain, tag.name].join(' -> ');
            throw new Error(`Circular component dependency detected: ${cycle}\nFile: ${context.parseFilePath}`);
        }

        occurrences.push({
            name: tag.name,
            attrs: String(tag.attrs || '').trim(),
            ownerPath: context.ownerPath,
            componentPath: compPath
        });

        const compSource = readFileSync(compPath, 'utf8');
        const fragments = materializeFragments(
            compSource,
            tag.name,
            children,
            compPath,
            context
        );
        for (const fragment of fragments) {
            if (!fragment.source) {
                continue;
            }
            walkSource(fragment.source, registry, fragment, [...chain, tag.name], occurrences);
        }
        cursor = replaceEnd;
    }
}

function materializeFragments(componentSource, name, children, componentPath, slotContext) {
    let template = extractTemplate(componentSource);
    const slotCount = countSlots(template);
    const slotMatch = findFirstSlot(template);

    if (isDocumentMode(template)) {
        if (slotCount !== 1) {
            throw new Error(
                `Document Mode component "${name}" must contain exactly one <slot />, found ${slotCount}.\nFile: ${componentPath}`
            );
        }
        return splitFragmentsAtFirstSlot(template, slotMatch, children, componentPath, slotContext);
    }

    if (children.trim().length > 0 && slotCount === 0) {
        throw new Error(
            `Component "${name}" has children but its template has no <slot />.\nEither add <slot /> to ${componentPath} or make the tag self-closing.`
        );
    }

    if (slotCount === 0) {
        return [{
            source: template,
            parseFilePath: componentPath,
            ownerPath: componentPath
        }];
    }

    return splitFragmentsAtFirstSlot(template, slotMatch, children || '', componentPath, slotContext);
}

function countSlots(template) {
    const matches = template.match(/<slot\s*>\s*<\/slot>|<slot\s*\/>|<slot\s*>/gi);
    return matches ? matches.length : 0;
}

function findFirstSlot(template) {
    const match = /<slot\s*>\s*<\/slot>|<slot\s*\/>|<slot\s*>/i.exec(template);
    if (!match || typeof match.index !== 'number') {
        return null;
    }
    return {
        index: match.index,
        length: match[0].length
    };
}

function splitFragmentsAtFirstSlot(template, slotMatch, content, componentPath, slotContext) {
    if (!slotMatch) {
        return [{
            source: template,
            parseFilePath: componentPath,
            ownerPath: componentPath
        }];
    }

    const before = template.slice(0, slotMatch.index);
    const after = template.slice(slotMatch.index + slotMatch.length);

    return [
        {
            source: before,
            parseFilePath: componentPath,
            ownerPath: componentPath
        },
        {
            source: content,
            parseFilePath: slotContext.parseFilePath,
            ownerPath: slotContext.ownerPath
        },
        {
            source: after,
            parseFilePath: componentPath,
            ownerPath: componentPath
        }
    ];
}
