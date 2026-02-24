import { formatErrorBlock, formatHeading, formatStep, formatSummaryTable } from './format.js';
import { getUiMode } from './env.js';

const SPINNER_FRAMES = ['-', '\\', '|', '/'];

function write(out, text) {
    out.write(`${text}\n`);
}

function createSpinner(mode, stderr) {
    if (!mode.spinner) {
        return {
            start() { },
            update() { },
            stop() { },
            succeed() { },
            fail() { }
        };
    }

    let interval = null;
    let frame = 0;
    let message = '';

    const paint = () => {
        const current = SPINNER_FRAMES[frame % SPINNER_FRAMES.length];
        stderr.write(`\r[zenith] ${current} ${message}`);
        frame += 1;
    };

    const clear = () => {
        stderr.write('\r');
        stderr.write(' '.repeat(message.length + 12));
        stderr.write('\r');
    };

    return {
        start(nextMessage) {
            message = String(nextMessage || '');
            clearInterval(interval);
            frame = 0;
            paint();
            interval = setInterval(paint, 80);
        },
        update(nextMessage) {
            message = String(nextMessage || '');
        },
        stop() {
            clearInterval(interval);
            interval = null;
            clear();
        },
        succeed(nextMessage) {
            this.stop();
            write(stderr, `[zenith] OK: ${nextMessage}`);
        },
        fail(nextMessage) {
            this.stop();
            write(stderr, `[zenith] ERROR: ${nextMessage}`);
        }
    };
}

/**
 * @param {NodeJS.Process} runtime
 */
export function createLogger(runtime = process) {
    const mode = getUiMode(runtime);
    const stdout = runtime.stdout;
    const stderr = runtime.stderr;
    const spinner = createSpinner(mode, stderr);

    return {
        mode,
        spinner,
        heading(text) {
            write(stdout, formatHeading(mode, text));
        },
        info(text) {
            if (mode.plain) {
                write(stdout, `[zenith] INFO: ${text}`);
                return;
            }
            write(stdout, formatStep(mode, text));
        },
        success(text) {
            write(stdout, `[zenith] OK: ${text}`);
        },
        warn(text) {
            write(stderr, `[zenith] WARN: ${text}`);
        },
        error(err) {
            write(stderr, formatErrorBlock(err, mode));
        },
        summary(rows) {
            const table = formatSummaryTable(mode, rows);
            if (table) {
                write(stdout, table);
            }
        },
        print(text) {
            write(stdout, String(text));
        }
    };
}
