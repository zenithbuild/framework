/**
 * Zenith CLI Bridge
 * 
 * The ONLY interface between CLI and plugins.
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 * CLI BRIDGE RULES (CANONICAL)
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * 1. No runtime emitters - plugins return data, CLI serializes blindly
 * 2. No plugin typing - all data is unknown
 * 3. No semantic helpers - CLI is blind to what data means
 * 
 * The CLI dispatches hooks and collects returns. It never inspects payloads.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

/**
 * CLI Bridge API - passed to plugins during CLI registration
 * 
 * Plugins use this to register namespaced hooks.
 * CLI lifecycle hooks: 'cli:*'
 * Plugin hooks: '<namespace>:*'
 */
export interface CLIBridgeAPI {
    /**
     * Register a hook handler
     * 
     * @param hook - Namespaced hook name (e.g., 'cli:runtime:collect', 'content:dev:watch')
     * @param handler - Handler function that receives context and optionally returns data
     */
    on(hook: string, handler: (ctx: HookContext) => unknown | void | Promise<unknown | void>): void
}

/**
 * Context passed to hook handlers
 * 
 * CLI provides this but never uses getPluginData itself.
 * Only plugins call getPluginData with their own namespace.
 */
export interface HookContext {
    /** Absolute path to project root */
    projectRoot: string

    /**
     * Opaque data accessor
     * 
     * CLI passes this function but NEVER calls it.
     * Only plugins use it to access their own namespaced data.
     */
    getPluginData: (namespace: string) => unknown

    /** Additional context data (e.g., filename for file-change hooks) */
    [key: string]: unknown
}

/**
 * Runtime payload returned by plugins
 * 
 * CLI collects these and serializes without inspection.
 * The envelope structure is: { [namespace]: payload }
 */
export interface RuntimePayload {
    /** Plugin namespace (e.g., 'content', 'router') */
    namespace: string
    /** Opaque payload - CLI never inspects this */
    payload: unknown
}

// ============================================
// Hook Registry (Internal)
// ============================================

type HookHandler = (ctx: HookContext) => unknown | void | Promise<unknown | void>

const hookRegistry = new Map<string, HookHandler[]>()

/**
 * Register a hook handler
 * 
 * @internal Called by CLIBridgeAPI.on()
 */
export function registerHook(hook: string, handler: HookHandler): void {
    if (!hookRegistry.has(hook)) {
        hookRegistry.set(hook, [])
    }
    hookRegistry.get(hook)!.push(handler)
}

/**
 * Clear all registered hooks
 * 
 * @internal Used for testing and cleanup
 */
export function clearHooks(): void {
    hookRegistry.clear()
}

// ============================================
// Hook Execution (CLI-facing)
// ============================================

/**
 * Run all handlers for a hook (fire-and-forget)
 * 
 * CLI calls this for lifecycle events.
 * No return values are collected.
 * 
 * @param hook - Hook name to dispatch
 * @param ctx - Hook context
 */
export async function runPluginHooks(hook: string, ctx: HookContext): Promise<void> {
    const handlers = hookRegistry.get(hook) || []
    for (const handler of handlers) {
        try {
            await handler(ctx)
        } catch (error) {
            console.error(`[Zenith] Hook "${hook}" error:`, error)
        }
    }
}

/**
 * Collect return values from all handlers for a hook
 * 
 * CLI calls this for 'cli:runtime:collect' to gather plugin payloads.
 * Only RuntimePayload-shaped returns are collected.
 * 
 * @param hook - Hook name to dispatch
 * @param ctx - Hook context
 * @returns Array of runtime payloads from plugins
 */
export async function collectHookReturns(hook: string, ctx: HookContext): Promise<RuntimePayload[]> {
    const handlers = hookRegistry.get(hook) || []
    const results: RuntimePayload[] = []

    for (const handler of handlers) {
        try {
            const result = await handler(ctx)

            // Only collect properly shaped payloads
            if (
                result &&
                typeof result === 'object' &&
                'namespace' in result &&
                'payload' in result &&
                typeof (result as RuntimePayload).namespace === 'string'
            ) {
                results.push(result as RuntimePayload)
            }
        } catch (error) {
            console.error(`[Zenith] Hook "${hook}" collection error:`, error)
        }
    }

    return results
}

/**
 * Build runtime envelope from collected payloads
 * 
 * CLI calls this to serialize plugin data for injection.
 * CLI never inspects the envelope contents.
 * 
 * @param payloads - Array of runtime payloads from collectHookReturns
 * @returns Envelope object: { [namespace]: payload }
 */
export function buildRuntimeEnvelope(payloads: RuntimePayload[]): Record<string, unknown> {
    const envelope: Record<string, unknown> = {}

    for (const { namespace, payload } of payloads) {
        envelope[namespace] = payload
    }

    return envelope
}

// ============================================
// Bridge API Factory
// ============================================

/**
 * Create a CLI Bridge API for plugin registration
 * 
 * CLI calls this once and passes to each plugin's registerCLI method.
 * 
 * @returns CLIBridgeAPI instance
 */
export function createBridgeAPI(): CLIBridgeAPI {
    return {
        on: registerHook
    }
}
