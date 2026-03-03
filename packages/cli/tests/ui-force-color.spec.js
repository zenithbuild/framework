import { getUiMode } from '../dist/ui/env.js';
import { containsAnsi, formatStep } from '../dist/ui/format.js';

describe('cli ui force-color mode', () => {
    test('FORCE_COLOR enables ANSI when tty is true and NO_COLOR is unset', () => {
        const mode = getUiMode({
            env: {
                FORCE_COLOR: '1'
            },
            stdout: {
                isTTY: true
            }
        });

        expect(mode.plain).toBe(false);
        expect(mode.color).toBe(true);
        expect(containsAnsi(formatStep(mode, 'Color enabled'))).toBe(true);
    });

    test('NO_COLOR takes precedence when FORCE_COLOR is also set', () => {
        const mode = getUiMode({
            env: {
                NO_COLOR: '1',
                FORCE_COLOR: '1'
            },
            stdout: {
                isTTY: true
            }
        });

        expect(mode.color).toBe(false);
        expect(containsAnsi(formatStep(mode, 'No color precedence'))).toBe(false);
    });
});
