import { describe, expect, test } from 'bun:test';
import { _fragment } from '../dist/markup.js';

describe('Batch 3 embedded markup URL hardening', () => {
    test('rejects encoded unsafe URL protocols', () => {
        expect(() => _fragment`<a href="java&#115;cript:blocked">link</a>`).toThrow(/unsafe URL protocol/i);
        expect(() => _fragment`<img src="java&Tab;script:blocked">`).toThrow(/unsafe URL protocol/i);
        expect(() => _fragment`<img srcset="java&#115;cript:blocked 1x, /safe.png 2x">`).toThrow(/unsafe URL protocol/i);
    });

    test('rejects mixed-case and whitespace-obfuscated unsafe URL protocols', () => {
        expect(() => _fragment`<a href="JaVaScRiPt:blocked">link</a>`).toThrow(/javascript: URL|unsafe URL protocol/i);
        expect(() => _fragment`<a href="java
script:blocked">link</a>`).toThrow(/unsafe URL protocol/i);
    });

    test('allows safe relative and allowed absolute URLs', () => {
        const fragment = _fragment`
            <a href="/docs">Docs</a>
            <a href="#section">Section</a>
            <img src="https://cdn.example.com/image.png">
            <img srcset="/small.png 1x, https://cdn.example.com/large.png 2x">
            <form action="https://example.com/search"></form>
            <button formaction="mailto:hello@example.com">Email</button>
            <a href="tel:+15555550123">Call</a>
        `;

        expect(fragment.html).toContain('href="/docs"');
        expect(fragment.html).toContain('href="#section"');
        expect(fragment.html).toContain('src="https://cdn.example.com/image.png"');
        expect(fragment.html).toContain('srcset="/small.png 1x, https://cdn.example.com/large.png 2x"');
        expect(fragment.html).toContain('formaction="mailto:hello@example.com"');
        expect(fragment.html).toContain('href="tel:+15555550123"');
    });
});
