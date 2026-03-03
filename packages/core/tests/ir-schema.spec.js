import { IR_VERSION } from '../dist/schema.js';
import { IR_VERSION as IrFromSubpath } from '../dist/ir/index.js';
import * as core from '../dist/index.js';

describe('IR schema authority', () => {
    test('IR_VERSION is stable and numeric', () => {
        expect(typeof IR_VERSION).toBe('number');
        expect(IR_VERSION).toBe(1);
    });

    test('IR_VERSION is exported consistently', () => {
        expect(IrFromSubpath).toBe(IR_VERSION);
        expect(core.IR_VERSION).toBe(IR_VERSION);
    });
});
