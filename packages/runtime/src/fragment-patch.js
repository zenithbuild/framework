import { _createContextualFragment, _coerceText } from './render.js';
import { _isHtmlFragment } from './markup.js';

export function createFragmentRegion() {
    let oldItems = [];
    let regions = [];

    return {
        mount(items, ctx) {
            oldItems = _flattenFragment(items);
            for (let i = 0; i < oldItems.length; i++) {
                regions.push(mountItemIntoRegion(oldItems[i], ctx));
            }
        },
        update(newItemsRaw, ctx) {
            const newItems = _flattenFragment(newItemsRaw);
            
            for (let i = 0; i < newItems.length; i++) {
                if (i < oldItems.length) {
                    if (oldItems[i] === newItems[i]) {
                        continue;
                    }
                    unmountRegion(regions[i]);
                    
                    let insertBefore = ctx.insertBefore;
                    for (let j = i + 1; j < regions.length; j++) {
                        if (regions[j] && regions[j].nodes.length > 0) {
                            insertBefore = regions[j].nodes[0];
                            break;
                        }
                    }
                    const patchCtx = { parent: ctx.parent, insertBefore };
                    regions[i] = mountItemIntoRegion(newItems[i], patchCtx);
                    oldItems[i] = newItems[i];
                } else {
                    regions.push(mountItemIntoRegion(newItems[i], ctx));
                    oldItems.push(newItems[i]);
                }
            }

            while (oldItems.length > newItems.length) {
                const idx = oldItems.length - 1;
                unmountRegion(regions[idx]);
                regions.pop();
                oldItems.pop();
            }
        },
        destroy() {
            for (let i = 0; i < regions.length; i++) {
                unmountRegion(regions[i]);
            }
            regions = [];
            oldItems = [];
        }
    };
}

export function unmountRegion(region) {
    if (!region) return;
    for (let i = 0; i < region.unmounts.length; i++) {
        try { region.unmounts[i](); } catch (e) { }
    }
    for (let i = 0; i < region.nodes.length; i++) {
        const node = region.nodes[i];
        if (node.parentNode) {
            node.parentNode.removeChild(node);
        }
    }
    region.nodes = [];
    region.unmounts = [];
}

export function mountItemIntoRegion(item, ctx) {
    const parent = ctx.parent;
    const insertBefore = ctx.insertBefore || null;
    const doc = parent.ownerDocument || document;
    const region = { nodes: [], unmounts: [] };

    if (item && item.__zenith_fragment === true && typeof item.mount === 'function') {
        const fragment = doc.createDocumentFragment();
        item.mount(fragment);
        const childNodes = Array.from(fragment.childNodes);
        parent.insertBefore(fragment, insertBefore);
        region.nodes = childNodes;
        if (typeof item.unmount === 'function') {
            region.unmounts.push(item.unmount.bind(item));
        }
        return region;
    }

    if (_isHtmlFragment(item)) {
        const fragment = _createContextualFragment(parent, item.html);
        const childNodes = Array.from(fragment.childNodes);
        parent.insertBefore(fragment, insertBefore);
        region.nodes = childNodes;
        return region;
    }

    const text = _coerceText(item, ctx.rootPath || 'renderable');
    if (text || text === '') {
        const textNode = doc.createTextNode(text);
        parent.insertBefore(textNode, insertBefore);
        region.nodes = [textNode];
    }

    return region;
}

function _flattenFragment(value) {
    if (!Array.isArray(value)) return [value];
    const res = [];
    function walk(item) {
        if (Array.isArray(item)) {
            for (let i = 0; i < item.length; i++) walk(item[i]);
        } else {
            res.push(item);
        }
    }
    walk(value);
    return res;
}

export const coerceText = _coerceText;
