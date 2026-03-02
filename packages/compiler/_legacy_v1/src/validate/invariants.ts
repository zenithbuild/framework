/**
 * Invariant Validation
 * 
 * NATIVE BRIDGE: All validation logic exists in Rust (`native/compiler-native/src/validate.rs`).
 * The NAPI function `validateIr(irJson)` is the sole semantic authority.
 */

import type { ZenIR } from '../ir/types'
import { InvariantError } from '../errors/compilerError'

let native: any
try {
    try {
        native = require('../../native/compiler-native')
    } catch {
        native = require('../../native/compiler-native/index.js')
    }
} catch (e) {
    // Bridge load handled elsewhere
}

/**
 * Native bridge for IR validation
 */
export function validateIr(ir: ZenIR): void {
    if (native && native.validateIr) {
        const validationIR = {
            filePath: ir.filePath,
            template: {
                raw: ir.template.raw,
                nodes: ir.template.nodes,
                expressions: ir.template.expressions,
            },
            styles: ir.styles,
            script: ir.script,
        };
        const error = native.validateIr(JSON.stringify(validationIR));
        if (error) {
            throw new InvariantError(
                error.code,
                error.message,
                error.guarantee,
                error.file,
                error.line,
                error.column,
                error.context,
                error.hints
            );
        }
    } else {
        throw new Error('[Zenith Native] Validation bridge unavailable');
    }
}

export const INVARIANT = {
    LOOP_CONTEXT_LOST: 'INV001',
    ATTRIBUTE_NOT_FORWARDED: 'INV002',
    UNRESOLVED_COMPONENT: 'INV003',
    REACTIVE_BOUNDARY: 'INV004',
    TEMPLATE_TAG: 'INV005',
    SLOT_ATTRIBUTE: 'INV006',
    ORPHAN_COMPOUND: 'INV007',
    NON_ENUMERABLE_JSX: 'INV008',
    UNREGISTERED_EXPRESSION: 'INV009',
    COMPONENT_PRECOMPILED: 'INV010',
} as const
