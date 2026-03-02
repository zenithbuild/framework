/**
 * Compiled Template Output Types
 * 
 * Phase 2: Transform IR → Static HTML + Runtime Bindings
 */

export type CompiledTemplate = {
  html: string
  bindings: Binding[]
  scripts: string | null
  styles: string
}

export type Binding = {
  id: string
  type: 'text' | 'attribute' | 'conditional' | 'optional' | 'loop'
  target: string  // e.g., "data-zen-text" or "class" for attribute bindings
  expression: string  // The original expression code
  location?: {
    line: number
    column: number
  }
  loopContext?: LoopContext  // Phase 7: Loop context for expressions inside map iterations
}

/**
 * Loop context for expressions inside map iterations
 * Phase 7: Tracks loop variables for runtime setter generation
 */
export type LoopContext = {
  variables: string[]  // e.g., ['todo', 'index']
  mapSource?: string   // The array being mapped, e.g., 'todoItems'
}

export type FinalizedOutput = {
  html: string
  js: string
  npmImports: string
  styles: string
  hasErrors: boolean
  errors: string[]
  bundlePlan?: any
  manifest?: any
}
