/**
 * Zenith Intermediate Representation (IR)
 * 
 * Phase 1: Parse & Extract
 * This IR represents the parsed structure of a .zen file
 * without any runtime execution or transformation.
 */

/**
 * Structured ES module import metadata
 * Parsed from component scripts, used for deterministic bundling
 */
export interface ScriptImport {
  source: string         // Module specifier, e.g. 'gsap'
  specifiers: string     // Import clause, e.g. '{ gsap }' or 'gsap' or ''
  typeOnly: boolean      // TypeScript type-only import
  sideEffect: boolean    // Side-effect import (no specifiers)
}

/**
 * Property extracted from interface/type definition
 * Used by props<T>() constraint - shape-only parsing
 */
export interface PropTypeProperty {
  name: string
  optional: boolean               // ? suffix
  typeAnnotation: string          // Shape-only, for documentation
}

/**
 * TypeScript type binding parsed from props<T>() constraint
 * This is a CONSTRAINT, not a declaration - it restricts allowed props
 */
export interface PropsTypeBinding {
  typeName: string                    // e.g., "Props", "ButtonProps"
  sourceFile?: string                 // For type imports
  properties: PropTypeProperty[]      // Extracted from interface/type
}

/**
 * Component Script IR - represents a component's script block
 * Used for collecting and bundling component scripts
 */
export type ComponentScriptIR = {
  name: string                           // Component name (e.g., 'HeroSection')
  script: string                         // Raw script content
  props: string[]                        // Declared props
  scriptAttributes: Record<string, string>  // Script attributes (setup, lang)
  imports: ScriptImport[]                // Parsed npm imports for bundling
  instanceId?: string                    // Unique instance ID for flattening
  propValues?: Record<string, any>       // Concrete props for this instance
  expressions?: ExpressionIR[]           // Instance-specific expression IRs
  propsTypeBinding?: PropsTypeBinding    // TypeScript props<T>() constraint
}

export type ZenIR = {
  filePath: string
  template: TemplateIR
  script: ScriptIR | null
  styles: StyleIR[]
  states?: Record<string, string>         // Page-level state (name -> initializer)
  componentScripts?: ComponentScriptIR[]  // Scripts from used components
  pageBindings?: string[]                 // Page-level state bindings (extracted BEFORE component inlining)
  props?: string[]                        // Declared props
  mergedBindings?: string[]               // Combined bindings (locals + imports)
}

export type TemplateIR = {
  raw: string
  nodes: TemplateNode[]
  expressions: ExpressionIR[]
}

export type TemplateNode =
  | ElementNode
  | TextNode
  | ExpressionNode
  | ComponentNode
  | ConditionalFragmentNode  // JSX ternary: {cond ? <A /> : <B />}
  | OptionalFragmentNode     // JSX logical AND: {cond && <A />}
  | LoopFragmentNode         // JSX map: {items.map(i => <li>...</li>)}

  | DoctypeNode          // Document Type Declaration

export type DoctypeNode = {
  type: 'doctype'
  name: string
  publicId: string
  systemId: string
  location: SourceLocation
}

export type ElementNode = {
  type: 'element'
  tag: string
  attributes: AttributeIR[]
  children: TemplateNode[]
  location: SourceLocation
  loopContext?: LoopContext  // Phase 7: Inherited loop context from parent map expressions
}

export type ComponentNode = {
  type: 'component'
  name: string
  attributes: AttributeIR[]
  children: TemplateNode[]
  location: SourceLocation
  loopContext?: LoopContext
}

export type TextNode = {
  type: 'text'
  value: string
  location: SourceLocation
}

export type ExpressionNode = {
  type: 'expression'
  expression: string
  location: SourceLocation
  loopContext?: LoopContext  // Phase 7: Loop context for expressions inside map iterations
}

/**
 * Conditional Fragment Node
 * 
 * Represents ternary expressions with JSX branches: {cond ? <A /> : <B />}
 * 
 * BOTH branches are compiled at compile time.
 * Runtime toggles visibility — never creates DOM.
 */
export type ConditionalFragmentNode = {
  type: 'conditional-fragment'
  condition: string           // The condition expression ID
  consequent: TemplateNode[]  // Precompiled "true" branch
  alternate: TemplateNode[]   // Precompiled "false" branch
  location: SourceLocation
  loopContext?: LoopContext
}

/**
 * Optional Fragment Node
 * 
 * Represents logical AND expressions with JSX: {cond && <A />}
 * 
 * Fragment is compiled at compile time.
 * Runtime toggles mount/unmount based on condition.
 */
export type OptionalFragmentNode = {
  type: 'optional-fragment'
  condition: string           // The condition expression ID
  fragment: TemplateNode[]    // Precompiled fragment
  location: SourceLocation
  loopContext?: LoopContext
}

/**
 * Loop Fragment Node
 * 
 * Represents .map() expressions with JSX body: {items.map(i => <li>...</li>)}
 * 
 * Desugars to @for loop semantics at compile time.
 * Body is compiled once, instantiated per item at runtime.
 * Node identity is compiler-owned via stable keys.
 */
export type LoopFragmentNode = {
  type: 'loop-fragment'
  source: string              // Array expression ID (e.g., 'expr_123')
  itemVar: string             // Loop variable (e.g., 'item')
  indexVar?: string           // Optional index variable
  body: TemplateNode[]        // Precompiled loop body template
  location: SourceLocation
  loopContext: LoopContext    // Extended with this loop's variables
}

export type AttributeIR = {
  name: string
  value: string | ExpressionIR
  location: SourceLocation
  loopContext?: LoopContext  // Phase 7: Loop context for expressions inside map iterations
}

/**
 * Loop context for expressions inside map iterations
 * Phase 7: Tracks loop variables (e.g., todo, index) for expressions inside .map() calls
 */
export type LoopContext = {
  variables: string[]  // e.g., ['todo', 'index'] for todoItems.map((todo, index) => ...)
  mapSource?: string   // The array being mapped, e.g., 'todoItems'
}

export type ExpressionIR = {
  id: string
  code: string
  location: SourceLocation
  loopContext?: LoopContext
}

export type ScriptIR = {
  raw: string
  attributes: Record<string, string>
  props?: string[]
  states?: Record<string, string>         // Component-level state
  bindings?: string[]                     // Local bindings (functions, let/const, imports)
}

export type StyleIR = {
  raw: string
}

export type SourceLocation = {
  line: number
  column: number
}

/**
 * BundlePlan - Compiler-emitted contract for bundler execution
 *
 * If a plan exists, bundling MUST occur.
 * If no plan exists, bundling MUST NOT occur.
 * The bundler performs ZERO inference—it executes exactly what the compiler specifies.
 */
export interface BundlePlan {
  /** Entry point code (not a file path) */
  entry: string

  /** Target platform */
  platform: 'browser' | 'node'

  /** Output format */
  format: 'esm' | 'cjs'

  /** Directories to resolve modules from */
  resolveRoots: string[]

  /** Virtual modules provided by the compiler */
  virtualModules: Array<{
    id: string
    code: string
  }>
}
