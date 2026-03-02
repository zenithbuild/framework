/**
 * Zenith Compiler Core Modules
 */

export { loadZenithConfig } from './config/loader'
export {
  PluginRegistry,
  createPluginContext,
  getPluginDataByNamespace
} from './plugins/registry'

export {
  createBridgeAPI,
  runPluginHooks,
  collectHookReturns,
  buildRuntimeEnvelope,
  clearHooks
} from './plugins/bridge'

export type { HookContext } from './plugins/bridge'
