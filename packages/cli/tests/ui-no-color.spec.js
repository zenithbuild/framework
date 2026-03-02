import { getUiMode } from '../src/ui/env.js';
import { containsAnsi, formatStep } from '../src/ui/format.js';

describe('cli ui no-color mode', () => {
    test('NO_COLOR disables ANSI even when FORCE_COLOR is set', () => {
        const mode = getUiMode({
            env: {
                NO_COLOR: '1',
                FORCE_COLOR: '1'
            },
            stdout: {
                isTTY: true
            }
        });

        expect(mode.plain).toBe(false);
        expect(mode.color).toBe(false);
        expect(containsAnsi(formatStep(mode, 'Color disabled'))).toBe(false);
    });
});
