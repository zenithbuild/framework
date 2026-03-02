//! # Zenith Compiler Ground Truth (Preflight Lock)
//!
//! ## Identifier Binding Invariants
//!
//! 1. **Scope Container**: `scope = { state, props, locals }` is the ONLY runtime container.
//!    All component state, props, and local variables MUST be accessed through this container.
//!
//! 2. **Scope Registration**: `resolve_component_node` ALWAYS emits scope registration.
//!    Every component instance gets a unique scope registered at `window.__ZENITH_SCOPES__[instanceId]`.
//!
//! 3. **Expression Functions**: ALL expression functions accept `(scope)` as their first argument.
//!    Expressions are generated as `function _expr_ID(scope) { return scope.state.x; }`.
//!
//! 4. **Identifier Qualification**: Bare identifiers MUST be rewritten to qualified form at compile time.
//!    - `count` → `scope.state.count` (for state variables)
//!    - `title` → `scope.props.title` (for props)
//!    - `helper` → `scope.locals.helper` (for local declarations)
//!
//! 5. **Classification Priority**: Identifiers are classified in this exact order:
//!    1. Scope stack locals (function params, loop vars, catch params)
//!    2. Component locals (let/const/function declarations)
//!    3. State bindings (declared with `state`)
//!    4. Prop bindings (declared with `prop`)
//!    5. Globals whitelist (window, console, Math, etc.)
//!    6. Unresolved → COMPILE ERROR (Z-ERR-SCOPE-002)
//!
//! 6. **Protected Identifiers**: `scope`, `state`, `props`, `locals` are NEVER shadowable.
//!    They are always classified as GlobalRef and left untransformed.
//!
//! ## Bug Being Fixed
//!
//! The bug is identifier binding, NOT component resolution.
//! Bare identifiers in expressions and event handlers were escaping to global scope,
//! causing ReferenceErrors at runtime.

#[cfg(feature = "napi")]
use napi_derive::napi;

mod codegen;
mod component;
mod discovery;
mod document;

mod finalize;
mod jsx_lowerer;

mod parse;
mod static_eval;
mod transform;
mod validate;

#[cfg(test)]
mod safety_tests;

#[cfg(feature = "napi")]
pub use codegen::generate_codegen_intent;
// Re-export native NAPI-wrappers only if NAPI is enabled?
// Actually if they are gated in their respective files, re-exporting them here requires they exist.
// But some are pub fns. If I gate them in `parse.rs`, `parse_template_native` won't exist if feature is off.
// So re-exports will fail.
// I should gate the re-exports too if they are NAPI-specific.

#[cfg(feature = "napi")]
pub use parse::parse_full_zen_native;

// Internal Rust-to-Rust API (for Rolldown plugin)
pub use parse::{compile_zen_internal, CompileOptions, CompileResult};

// Re-export types for the bundler
pub use finalize::ZenManifestExport;
pub use transform::Binding;
// These seem to be internal logic, maybe not napi-gated?
// transform_template_native might be NAPI?
// classify_expression_native might be NAPI?
// Let's check transform.rs
#[cfg(feature = "napi")]
pub use transform::transform_template_native;
pub use validate::*;

#[cfg(feature = "napi")]
#[napi]
pub fn compile_bridge() -> String {
    "Zenith Native Bridge Connected".to_string()
}

mod sanity_check_phase_0;
