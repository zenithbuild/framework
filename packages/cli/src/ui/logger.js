import {
    formatErrorBlock,
    formatHeading,
    formatHint,
    formatLine,
    formatSummaryTable
} from './format.js';
import { getUiMode } from './env.js';

function write(out, text) {
    out.write(`${text}\n`);
}

const SILENT_MODE = {
    plain: true,
    color: false,
    tty: false,
    ci: true,
    spinner: false,
    debug: false,
    logLevel: 'quiet'
};

function createNoopSpinner() {
    return {
        start() { },
        update() { },
        stop() { },
        succeed() { },
        fail() { }
    };
}

function normalizeLevel(level) {
    return level === 'quiet' || level === 'verbose' ? level : 'normal';
}

function shouldEmit(mode, tag) {
    const level = normalizeLevel(mode.logLevel);
    if (level === 'quiet') {
        return tag === 'OK' || tag === 'WARN' || tag === 'ERR';
    }
    return true;
}

function createWriter(runtime, mode, sink = null) {
    if (typeof sink === 'function') {
        return sink;
    }
    return (stream, text) => {
        const out = stream === 'stderr' ? runtime.stderr : runtime.stdout;
        write(out, text);
    };
}

function classifyChildLine(line) {
    const trimmed = String(line || '').trim();
    if (!trimmed) {
        return null;
    }

    const vendorCache = trimmed.match(/^\[zenith\]\s+Vendor cache (hit|miss):\s+(.+)$/);
    if (vendorCache) {
        return {
            tag: 'BUILD',
            glyph: '•',
            message: `vendor cache ${vendorCache[1]} (${vendorCache[2]})`,
            onceKey: `vendor-cache:${vendorCache[1]}:${vendorCache[2]}`
        };
    }

    const vendorBundle = trimmed.match(/^\[zenith\]\s+Vendor bundle:\s+(.+)$/);
    if (vendorBundle) {
        return {
            tag: 'BUILD',
            glyph: '•',
            message: `vendor bundle ${vendorBundle[1]}`,
            onceKey: `vendor-bundle:${vendorBundle[1]}`
        };
    }

    const bundler = trimmed.match(/^\[zenith-bundler\]\s*(.+)$/);
    if (bundler) {
        const message = bundler[1].trim();
        const lower = message.toLowerCase();
        if (lower.includes('warning')) {
            return {
                tag: 'WARN',
                glyph: '⚠',
                message,
                onceKey: `bundler-warning:${message}`
            };
        }
        if (lower.includes('error') || lower.includes('failed')) {
            return {
                tag: 'ERR',
                glyph: '✖',
                message
            };
        }
        return {
            tag: 'BUILD',
            glyph: '•',
            message
        };
    }

    const zenith = trimmed.match(/^\[zenith\]\s+(.+)$/);
    if (zenith) {
        return {
            tag: 'BUILD',
            glyph: '•',
            message: zenith[1].trim(),
            onceKey: `zenith-child:${zenith[1].trim()}`
        };
    }

    const compilerWarning = trimmed.match(/warning\[[^\]]+\]/i);
    if (compilerWarning) {
        return {
            tag: 'WARN',
            glyph: '⚠',
            message: trimmed,
            onceKey: `compiler-warning:${trimmed}`
        };
    }

    return {
        tag: 'BUILD',
        glyph: '•',
        message: trimmed
    };
}

function createBaseLogger({ runtime = process, mode, sink = null, silent = false } = {}) {
    const resolvedMode = mode || (silent ? SILENT_MODE : getUiMode(runtime));
    const once = new Set();
    const writeLine = createWriter(runtime, resolvedMode, sink);

    function emit(tag, glyph, message, options = {}) {
        if (options.onceKey) {
            if (once.has(options.onceKey)) {
                return false;
            }
            once.add(options.onceKey);
        }

        if (!shouldEmit(resolvedMode, tag)) {
            return false;
        }

        const stream = tag === 'WARN' || tag === 'ERR' ? 'stderr' : 'stdout';
        writeLine(stream, formatLine(resolvedMode, { glyph, tag, text: message }));
        if (options.hint) {
            writeLine(stream, formatHint(resolvedMode, options.hint));
        }
        return true;
    }

    return {
        mode: resolvedMode,
        spinner: createNoopSpinner(),
        heading(text) {
            writeLine('stdout', formatHeading(resolvedMode, text));
        },
        print(text) {
            writeLine('stdout', String(text));
        },
        summary(rows, tag = 'BUILD') {
            const table = formatSummaryTable(resolvedMode, rows, tag);
            if (table) {
                writeLine('stdout', table);
            }
        },
        dev(message, options = {}) {
            return emit('DEV', '•', message, options);
        },
        build(message, options = {}) {
            return emit('BUILD', '•', message, options);
        },
        hmr(message, options = {}) {
            return emit('HMR', '•', message, options);
        },
        router(message, options = {}) {
            return emit('ROUTER', '•', message, options);
        },
        css(message, options = {}) {
            return emit('CSS', '•', message, options);
        },
        ok(message, options = {}) {
            return emit('OK', '✓', message, options);
        },
        warn(message, options = {}) {
            return emit('WARN', '⚠', message, options);
        },
        error(messageOrError, options = {}) {
            const hasStructuredError = messageOrError instanceof Error || typeof messageOrError === 'object';
            if (hasStructuredError && !options.hint && !options.onceKey && !options.error) {
                writeLine('stderr', formatErrorBlock(messageOrError, resolvedMode));
                return true;
            }
            const detail = options.error || messageOrError;
            const formatted = detail instanceof Error || typeof detail === 'object'
                ? formatErrorBlock(detail, resolvedMode)
                : null;
            if (formatted && (resolvedMode.logLevel === 'verbose' || resolvedMode.debug)) {
                writeLine('stderr', formatted);
                return true;
            }
            const text = typeof messageOrError === 'string'
                ? messageOrError
                : (detail instanceof Error ? detail.message : String(detail || 'Command failed'));
            return emit('ERR', '✖', text, options);
        },
        verbose(tag, message, options = {}) {
            if (resolvedMode.logLevel !== 'verbose') {
                return false;
            }
            return emit(tag, '•', message, options);
        },
        childLine(source, line, options = {}) {
            const entry = classifyChildLine(line);
            if (!entry) {
                return false;
            }
            const streamHint = options.stream === 'stderr';
            const isVerbose = resolvedMode.logLevel === 'verbose';
            const isSeverity = entry.tag === 'WARN' || entry.tag === 'ERR';
            if (!isVerbose && !isSeverity && options.showInfo === false) {
                return false;
            }
            const onceKey = options.onceKey || entry.onceKey;
            const message = options.prefix
                ? `${options.prefix}${entry.message}`
                : entry.message;
            return emit(entry.tag, entry.glyph, message, {
                ...options,
                onceKey,
                hint: options.hint,
                stream: streamHint ? 'stderr' : undefined
            });
        },
        info(message) {
            return emit('DEV', '•', message);
        },
        success(message) {
            return emit('OK', '✓', message);
        }
    };
}

export function createZenithLogger(runtime = process, options = {}) {
    const mode = getUiMode(runtime);
    if (options.logLevel) {
        mode.logLevel = normalizeLevel(options.logLevel);
    }
    return createBaseLogger({ runtime, mode });
}

export function createSilentLogger() {
    return createBaseLogger({
        mode: SILENT_MODE,
        sink: () => { },
        silent: true
    });
}

export function createLogger(runtime = process, options = {}) {
    return createZenithLogger(runtime, options);
}
