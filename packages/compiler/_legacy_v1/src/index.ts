// Core Imports (Internal)
import { parseZenFile } from './parseZenFile'
import { InvariantError } from './errors/compilerError'

// Essential Type Exports
import type { ZenIR } from './ir/types'
import type { CompiledTemplate, FinalizedOutput } from './output/types'

export type ZenCompileOptions = {
  /**
   * Map of component names to their definitions.
   */
  components?: Map<string, any>
  /**
   * Optional layout to wrap the page in
   */
  layout?: any
  /**
   * Initial props for layout processing
   */
  props?: Record<string, any>
}

export type ZenCompileResult = {
  ir: ZenIR
  compiled: CompiledTemplate
  finalized?: FinalizedOutput
}

/**
 * Compile Zenith source code using the unified "One True Bridge" (Native Syscall).
 */
export async function compile(
  source: string,
  filePath: string,
  options?: ZenCompileOptions
): Promise<ZenCompileResult> {
  const opts = options || {};
  const components = opts.components || new Map()

  const finalized = parseZenFile(filePath, source, {
    mode: 'full',
    components: components ? Object.fromEntries(components) : {},
    layout: opts.layout,
    props: opts.props,
    useCache: true
  });

  // If the native side returned a compiler error (camelCase or snake_case fields)
  if (finalized.code && (finalized.errorType || finalized.error_type)) {
    throw new InvariantError(
      finalized.code,
      finalized.message,
      finalized.guarantee || "Zenith Invariant Violation", // Guarantee provided by native code checks
      filePath,
      finalized.line || 1,
      finalized.column || 1,
      finalized.context,
      finalized.hints
    );
  }


  // FIX: Extract from manifest if using NEW native compiler
  const manifest = finalized.manifest;
  let js = finalized.js || (manifest ? (manifest.bundle || manifest.script) : '');
  const expressions = manifest ? manifest.expressions : '';

  if (expressions) {
    const matches = expressions.match(/function (_expr_[a-zA-Z0-9_]+)/g);
    if (matches) {
      console.log("[Compiler] Expression Functions found:", matches.length);
      const seen = new Set();
      matches.forEach((m: string) => {
        if (seen.has(m)) console.error("[Compiler] DUPLICATE EXPRESSION:", m);
        seen.add(m);
      });
    }
  }
  const styles = finalized.styles || (manifest ? manifest.styles : '');
  const npmImports = finalized.npmImports || (manifest ? manifest.npmImports : '');

  // Append expressions registry to JS if present AND not already likely in the bundle
  // The expressions registry is critical for hydration
  // If we used manifest.bundle, the native compiler likely already included expressions.
  const usedBundle = manifest && manifest.bundle;
  // Only inject if we have expressions AND we are not using the pre-bundled output
  if (expressions && !usedBundle) {
    js = `${js}\n\n${expressions}`;
  }

  const hasSetup = js && js.includes('export const setup');

  // Phase 1: Compiler Emits IR
  console.log("PHASE 1", {
    nodes: finalized.ir?.template?.nodes?.length || 0,
    expressions: finalized.ir?.template?.expressions?.length || 0,
    styles: styles ? styles.length : 0,
    hasSetup: !!hasSetup,
    scriptLength: js ? js.length : 0
  });

  return {
    ir: finalized.ir as ZenIR,
    compiled: {
      html: finalized.html,
      bindings: finalized.bindings || [],
      scripts: js || null,
      styles: styles || []
    },
    finalized: {
      ...finalized,
      js: js,
      npmImports: npmImports,
      styles: styles,
      bundlePlan: finalized.bundlePlan,
      // Pass manifest through if needed
      manifest: manifest
    }
  };
}

export * from './core'
export { parseZenFile }
export type { FinalizedOutput, CompiledTemplate }
export type { BundlePlan, ExpressionIR, ZenIR, TemplateNode } from './ir/types'
export type { HookContext } from './core/plugins/bridge'

