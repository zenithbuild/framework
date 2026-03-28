// Legacy v1 bundler surface only. Modern CLI builds invoke the native bundler
// in `packages/bundler/src/main.rs` and do not route image materialization through this module.
export * from './native'
export { zenithLoader, getCollectedCss, clearCssCache } from './plugins/zenith-loader'
export * from './bundle-generator'
export * from './generateFinalBundle'
export * from './build-analyzer'
console.error("[zenith-bundler] Loaded module");
export * from './bundler'
export { bundleRuntime } from './bundler'
export * from './css'
export * from './runtime-generator'
export * from './types'
export * from './ssg-build'
export * from './spa-build'
export * from './discovery/componentDiscovery'
export * from './discovery/layouts'
