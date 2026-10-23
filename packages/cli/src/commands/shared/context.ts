import type { createZenithLogger } from '../../ui/logger.js';

export interface CommandContext {
    projectRoot: string;
    logger: ReturnType<typeof createZenithLogger>;
}
