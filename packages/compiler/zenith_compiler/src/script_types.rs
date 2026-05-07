use serde::{Deserialize, Serialize};
use std::error::Error;
use std::fmt::{Display, Formatter};

pub const SCRIPT_PLACEHOLDER_TAG: &str = "zenith-script";
pub const SCRIPT_ID_ATTR: &str = "data-zx-script-id";

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct ExtractedStyleBlock {
    pub module_id: String,
    pub order: u32,
    pub content: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScriptContractError {
    pub message: String,
}

impl ScriptContractError {
    pub(super) fn new(message: String) -> Self {
        Self { message }
    }
}

impl Display for ScriptContractError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

impl Error for ScriptContractError {}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ScriptProfileMetrics {
    pub open_tag_scan_ms: f64,
    pub open_tag_close_search_ms: f64,
    pub update_tag_depth_ms: f64,
    pub validate_tag_ms: f64,
    pub validate_attr_extract_ms: f64,
    pub validate_attr_count_ms: f64,
    pub close_tag_search_ms: f64,
    pub analyze_script_ms: f64,
    pub analyze_setup_regex_ms: f64,
    pub analyze_import_work_ms: f64,
    pub analyze_decl_scan_ms: f64,
    pub analyze_binding_kind_ms: f64,
    pub analyze_function_scan_ms: f64,
    pub analyze_state_decl_scan_ms: f64,
    pub analyze_rename_rewrite_ms: f64,
    pub analyze_state_lower_ms: f64,
    pub analyze_lower_state_reads_ms: f64,
    pub analyze_declaration_collect_ms: f64,
    pub analyze_factory_code_ms: f64,
    pub line_offset_ms: f64,
    pub dom_lint_ms: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HoistedBindingKind {
    Signal,
    State,
    Function,
    Const,
    Ref,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HoistedBinding {
    pub original: String,
    pub renamed: String,
    pub kind: HoistedBindingKind,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HoistedScript {
    pub id: usize,
    pub component_path: String,
    pub is_global: bool,
    pub hoist_id: String,
    pub factory_name: String,
    pub factory_code: String,
    pub renamed_source: String,
    pub imports: Vec<String>,
    pub declarations: Vec<String>,
    pub functions: Vec<String>,
    pub signals: Vec<String>,
    pub bindings: Vec<HoistedBinding>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct HoistedStateBinding {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ComponentScriptAsset {
    pub hoist_id: String,
    pub factory: String,
    pub imports: Vec<String>,
    pub code: String,
    pub bindings: Vec<HoistedBinding>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ComponentInstanceBinding {
    pub instance: String,
    pub hoist_id: String,
    pub selector: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct HoistedOutput {
    pub imports: Vec<String>,
    pub declarations: Vec<String>,
    pub functions: Vec<String>,
    pub signals: Vec<String>,
    pub state_bindings: Vec<HoistedStateBinding>,
    pub code: Vec<String>,
}

impl HoistedOutput {
    pub fn merge_script(&mut self, script: &HoistedScript) {
        self.imports.extend(script.imports.clone());
        self.declarations.extend(script.declarations.clone());
        self.functions.extend(script.functions.clone());
        self.signals.extend(script.signals.clone());

        for binding in &script.bindings {
            let value = match binding.kind {
                HoistedBindingKind::Signal => binding.renamed.clone(),
                HoistedBindingKind::State
                | HoistedBindingKind::Function
                | HoistedBindingKind::Const
                | HoistedBindingKind::Ref => binding.renamed.clone(),
            };

            self.state_bindings.push(HoistedStateBinding {
                key: binding.renamed.clone(),
                value,
            });
        }

        let trimmed = script.renamed_source.trim();
        if !trimmed.is_empty() {
            self.code.push(trimmed.to_string());
        }
    }
}
