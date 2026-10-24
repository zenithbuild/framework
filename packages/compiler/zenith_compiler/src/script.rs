#[path = "script_analyze.rs"]
mod script_analyze;
#[path = "script_contract.rs"]
mod script_contract;
#[path = "script_dom_lint.rs"]
mod script_dom_lint;
#[path = "script_extract.rs"]
mod script_extract;
#[path = "script_types.rs"]
mod script_types;

pub use script_dom_lint::{collect_dom_lint_warnings, ScriptDomLint};
pub use script_extract::{extract_script_blocks, extract_script_blocks_with_profile};
pub use script_types::{
    ComponentInstanceBinding, ComponentScriptAsset, ExtractedStyleBlock, HoistedBinding,
    HoistedBindingKind, HoistedOutput, HoistedScript, HoistedStateBinding, ScriptContractError,
    ScriptProfileMetrics, SCRIPT_ID_ATTR, SCRIPT_PLACEHOLDER_TAG,
};
