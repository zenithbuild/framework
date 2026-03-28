use regex::Regex;
use serde::{Deserialize, Serialize};
use std::error::Error;
use std::fmt::{Display, Formatter};
use std::sync::OnceLock;
use std::time::Instant;

use crate::script_transform::analyze_component_script_structure;

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
    fn new(message: String) -> Self {
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

fn script_lang_attr_value_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r#"(?i)\blang\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))"#)
            .expect("valid lang attr regex")
    })
}

fn script_setup_attr_value_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r#"(?i)\bsetup\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))"#)
            .expect("valid setup attr regex")
    })
}

fn script_lang_attr_count_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r#"(?i)(?:^|[\s<])lang(?:\s*=|[\s>/])"#).expect("valid lang count regex")
    })
}

fn script_setup_attr_count_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r#"(?i)(?:^|[\s<])setup(?:\s*=|[\s>/])"#).expect("valid setup count regex")
    })
}

fn dom_query_selector_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"querySelector\s*\(").expect("valid querySelector regex"))
}

fn dom_query_selector_all_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"querySelectorAll\s*\(").expect("valid querySelectorAll regex"))
}

fn dom_get_element_by_id_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"getElementById\s*\(").expect("valid getElementById regex"))
}

fn dom_add_event_listener_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\.addEventListener\s*\(").expect("valid addEventListener regex"))
}

fn dom_typeof_eq_undefined_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r#"typeof\s+(?:window|document)\s*===\s*["']undefined["']"#)
            .expect("valid typeof undefined eq regex")
    })
}

fn dom_typeof_neq_undefined_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r#"typeof\s+(?:window|document)\s*!==\s*["']undefined["']"#)
            .expect("valid typeof undefined neq regex")
    })
}

fn dom_global_this_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"globalThis\.(?:window|document)\b")
            .expect("valid globalThis window/document regex")
    })
}

#[derive(Debug, Clone, PartialEq, Eq)]
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

pub fn extract_script_blocks(
    input: &str,
    source_path: &str,
) -> Result<(String, Vec<HoistedScript>, Vec<ScriptDomLint>), ScriptContractError> {
    let (output, scripts, dom_lints, _) =
        extract_script_blocks_with_profile(input, source_path, false)?;
    Ok((output, scripts, dom_lints))
}

pub fn extract_script_blocks_with_profile(
    input: &str,
    source_path: &str,
    profile_enabled: bool,
) -> Result<
    (
        String,
        Vec<HoistedScript>,
        Vec<ScriptDomLint>,
        ScriptProfileMetrics,
    ),
    ScriptContractError,
> {
    let mut output = String::new();
    let mut scripts = Vec::new();
    let mut dom_lints = Vec::new();
    let mut profile = ScriptProfileMetrics::default();

    let mut cursor = 0usize;
    let mut script_id = 0usize;
    let mut depth = 0i32;

    while let Some(open_rel) = {
        let started_at = profile_enabled.then(Instant::now);
        let found = input[cursor..].find("<script");
        if let Some(started_at) = started_at {
            profile.open_tag_scan_ms += started_at.elapsed().as_secs_f64() * 1000.0;
        }
        found
    } {
        let open_start = cursor + open_rel;
        let prefix = &input[cursor..open_start];
        output.push_str(prefix);
        let update_tag_depth_started_at = profile_enabled.then(Instant::now);
        update_tag_depth(prefix, &mut depth);
        if let Some(started_at) = update_tag_depth_started_at {
            profile.update_tag_depth_ms += started_at.elapsed().as_secs_f64() * 1000.0;
        }

        let open_end_search_started_at = profile_enabled.then(Instant::now);
        let open_end_rel = input[open_start..].find('>').ok_or_else(|| {
            script_contract_error(
                source_path,
                script_id,
                "malformed <script> tag: missing closing `>`".to_string(),
            )
        })?;
        if let Some(started_at) = open_end_search_started_at {
            profile.open_tag_close_search_ms += started_at.elapsed().as_secs_f64() * 1000.0;
        }
        let open_end = open_start + open_end_rel;
        let open_tag = &input[open_start..=open_end];
        let validate_started_at = profile_enabled.then(Instant::now);
        validate_script_tag_contract(
            open_tag,
            source_path,
            script_id,
            profile_enabled,
            &mut profile,
        )?;
        if let Some(started_at) = validate_started_at {
            profile.validate_tag_ms += started_at.elapsed().as_secs_f64() * 1000.0;
        }

        let close_tag = "</script>";
        let close_search_started_at = profile_enabled.then(Instant::now);
        let close_rel = input[(open_end + 1)..].find(close_tag).ok_or_else(|| {
            script_contract_error(
                source_path,
                script_id,
                "malformed <script> block: missing closing </script>".to_string(),
            )
        })?;
        if let Some(started_at) = close_search_started_at {
            profile.close_tag_search_ms += started_at.elapsed().as_secs_f64() * 1000.0;
        }
        let close_start = open_end + 1 + close_rel;
        let close_end = close_start + close_tag.len();

        let script_source = &input[(open_end + 1)..close_start];
        let component_path = format!("{source_path}#script{script_id}");
        let is_global = depth <= 0;
        if !is_global {
            return Err(script_contract_error(
                source_path,
                script_id,
                "nested <script> tags inside markup are not supported".to_string(),
            ));
        }
        let analyze_started_at = profile_enabled.then(Instant::now);
        let analyzed = analyze_component_script(
            script_id,
            source_path,
            &component_path,
            script_source,
            is_global,
            profile_enabled,
            &mut profile,
        )?;
        if let Some(started_at) = analyze_started_at {
            profile.analyze_script_ms += started_at.elapsed().as_secs_f64() * 1000.0;
        }
        scripts.push(analyzed);

        let line_offset_started_at = profile_enabled.then(Instant::now);
        let line_offset = input[..=open_end].matches('\n').count();
        if let Some(started_at) = line_offset_started_at {
            profile.line_offset_ms += started_at.elapsed().as_secs_f64() * 1000.0;
        }
        let dom_lint_started_at = profile_enabled.then(Instant::now);
        dom_lints.extend(collect_dom_lint_warnings(
            script_source,
            source_path,
            script_id,
            line_offset,
        ));
        if let Some(started_at) = dom_lint_started_at {
            profile.dom_lint_ms += started_at.elapsed().as_secs_f64() * 1000.0;
        }

        cursor = close_end;
        script_id += 1;
    }

    output.push_str(&input[cursor..]);

    // Preserve legacy structural behavior for script-only files.
    // Hoisting only activates when a script contributes to a non-script tree.
    if !scripts.is_empty() && output.trim().is_empty() {
        return Ok((input.to_string(), Vec::new(), Vec::new(), profile));
    }

    Ok((output, scripts, dom_lints, profile))
}

fn validate_script_tag_contract(
    open_tag: &str,
    source_path: &str,
    script_id: usize,
    profile_enabled: bool,
    profile: &mut ScriptProfileMetrics,
) -> Result<(), ScriptContractError> {
    let extract_started_at = profile_enabled.then(Instant::now);
    let lang = extract_script_tag_attr_value(open_tag, "lang");
    let setup = extract_script_tag_attr_value(open_tag, "setup");
    if let Some(started_at) = extract_started_at {
        profile.validate_attr_extract_ms += started_at.elapsed().as_secs_f64() * 1000.0;
    }
    let count_started_at = profile_enabled.then(Instant::now);
    let lang_attr_count = count_script_tag_attr_occurrences(open_tag, "lang");
    let setup_attr_count = count_script_tag_attr_occurrences(open_tag, "setup");
    if let Some(started_at) = count_started_at {
        profile.validate_attr_count_ms += started_at.elapsed().as_secs_f64() * 1000.0;
    }

    if lang_attr_count > 1 {
        return Err(script_contract_error(
            source_path,
            script_id,
            "duplicate `lang` attribute on <script>".to_string(),
        ));
    }
    if setup_attr_count > 1 {
        return Err(script_contract_error(
            source_path,
            script_id,
            "duplicate `setup` attribute on <script>".to_string(),
        ));
    }
    if lang_attr_count > 0 && lang.is_none() {
        return Err(script_contract_error(
            source_path,
            script_id,
            "malformed `lang` attribute on <script>".to_string(),
        ));
    }
    if setup_attr_count > 0 && setup.is_none() {
        return Err(script_contract_error(
            source_path,
            script_id,
            "malformed `setup` attribute on <script>".to_string(),
        ));
    }
    if lang_attr_count > 0 && setup_attr_count > 0 {
        return Err(script_contract_error(
            source_path,
            script_id,
            "ambiguous script attributes: use either `lang` or `setup`, not both".to_string(),
        ));
    }

    if let Some(value) = lang {
        if value.eq_ignore_ascii_case("ts") {
            return Ok(());
        }
        return Err(script_contract_error(
            source_path,
            script_id,
            format!("invalid script language annotation lang=\"{}\"", value),
        ));
    }

    if let Some(value) = setup {
        if value.eq_ignore_ascii_case("ts") {
            return Ok(());
        }
        return Err(script_contract_error(
            source_path,
            script_id,
            format!("invalid script setup annotation setup=\"{}\"", value),
        ));
    }

    Err(script_contract_error(
        source_path,
        script_id,
        "missing lang=\"ts\" annotation on <script>".to_string(),
    ))
}

fn extract_script_tag_attr_value(open_tag: &str, attr_name: &str) -> Option<String> {
    let captures = match attr_name {
        "lang" => script_lang_attr_value_re().captures(open_tag)?,
        "setup" => script_setup_attr_value_re().captures(open_tag)?,
        _ => return None,
    };

    captures
        .get(1)
        .or_else(|| captures.get(2))
        .or_else(|| captures.get(3))
        .map(|m| m.as_str().trim().to_string())
}

fn count_script_tag_attr_occurrences(open_tag: &str, attr_name: &str) -> usize {
    match attr_name {
        "lang" => script_lang_attr_count_re().find_iter(open_tag).count(),
        "setup" => script_setup_attr_count_re().find_iter(open_tag).count(),
        _ => 0,
    }
}

fn script_contract_error(
    source_path: &str,
    script_id: usize,
    reason: String,
) -> ScriptContractError {
    ScriptContractError::new(format!(
        "Zenith requires TypeScript scripts. Add lang=\"ts\".\nFile: {}#script{}\nReason: {}\nExample: <script lang=\"ts\">",
        source_path, script_id, reason
    ))
}

fn analyze_component_script(
    id: usize,
    source_path: &str,
    component_path: &str,
    source: &str,
    is_global: bool,
    profile_enabled: bool,
    profile: &mut ScriptProfileMetrics,
) -> Result<HoistedScript, ScriptContractError> {
    assert_no_forbidden_tokens(source, source_path, id)?;
    let import_work_started_at = profile_enabled.then(Instant::now);
    let rename_prefix = format!(
        "__{}_{}_",
        sanitize_component_slug(component_path),
        stable_hash_8(component_path),
    );
    let analyzed = analyze_component_script_structure(source, component_path, &rename_prefix)
        .map_err(|reason| script_contract_error(source_path, id, reason))?;
    let imports = analyzed.imports;
    let source_without_imports = analyzed.source_without_imports;
    let renamed_source = analyzed.renamed_source;
    let declarations = analyzed.declarations;
    let bindings = analyzed.bindings;
    let canonical_source = canonicalize_script_source(&source_without_imports);
    let hoist_id = stable_hash_8(&canonical_source);
    let factory_name = format!("createComponent_{}", sanitize_factory_suffix(&hoist_id));
    if let Some(started_at) = import_work_started_at {
        let elapsed_ms = started_at.elapsed().as_secs_f64() * 1000.0;
        profile.analyze_import_work_ms += elapsed_ms;
        profile.analyze_rename_rewrite_ms += elapsed_ms;
        profile.analyze_state_lower_ms += elapsed_ms;
        profile.analyze_lower_state_reads_ms += elapsed_ms;
        profile.analyze_declaration_collect_ms += elapsed_ms;
    }

    let mut functions = Vec::new();
    let mut signals = Vec::new();
    for binding in &bindings {
        if matches!(binding.kind, HoistedBindingKind::Function) {
            functions.push(binding.renamed.clone());
        }
        if matches!(
            binding.kind,
            HoistedBindingKind::Signal | HoistedBindingKind::State
        ) {
            signals.push(binding.renamed.clone());
        }
    }

    let factory_code_started_at = profile_enabled.then(Instant::now);
    let factory_code =
        generate_factory_code(&factory_name, &imports, &source_without_imports, &bindings);
    if let Some(started_at) = factory_code_started_at {
        profile.analyze_factory_code_ms += started_at.elapsed().as_secs_f64() * 1000.0;
    }

    Ok(HoistedScript {
        id,
        component_path: component_path.to_string(),
        is_global,
        hoist_id,
        factory_name,
        factory_code,
        renamed_source: renamed_source.trim().to_string(),
        imports,
        declarations,
        functions,
        signals,
        bindings,
    })
}

fn update_tag_depth(segment: &str, depth: &mut i32) {
    let mut cursor = 0usize;
    while let Some(rel) = segment[cursor..].find('<') {
        let start = cursor + rel;
        let Some(end_rel) = segment[start..].find('>') else {
            break;
        };
        let end = start + end_rel;
        let inner = segment[(start + 1)..end].trim();

        if inner.is_empty() || inner.starts_with('!') || inner.starts_with('?') {
            cursor = end + 1;
            continue;
        }

        if inner.starts_with('/') {
            *depth = (*depth - 1).max(0);
            cursor = end + 1;
            continue;
        }

        if inner.ends_with('/') {
            cursor = end + 1;
            continue;
        }

        *depth += 1;
        cursor = end + 1;
    }
}

fn sanitize_component_slug(source_path: &str) -> String {
    let mut slug = String::new();
    for ch in source_path.chars() {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch);
        } else {
            slug.push('_');
        }
    }
    slug
}

pub(crate) fn stable_hash_8(input: &str) -> String {
    let mut hash: i32 = 0;
    for byte in input.bytes() {
        hash = hash
            .wrapping_shl(5)
            .wrapping_sub(hash)
            .wrapping_add(byte as i32);
    }
    let normalized = hash.wrapping_abs() as u32;
    format!("{normalized:08x}")
}

fn canonicalize_script_source(source: &str) -> String {
    source
        .lines()
        .map(|line| line.trim())
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

fn sanitize_factory_suffix(input: &str) -> String {
    let mut out = String::new();
    for ch in input.chars() {
        if ch.is_ascii_alphanumeric() || ch == '_' {
            out.push(ch);
        } else {
            out.push('_');
        }
    }
    if out.is_empty() {
        "component".to_string()
    } else {
        out
    }
}

fn generate_factory_code(
    factory_name: &str,
    _imports: &[String],
    source_without_imports: &str,
    bindings: &[HoistedBinding],
) -> String {
    let body = source_without_imports.trim();

    let mut lines = Vec::new();

    lines.push(format!(
        "export function {factory_name}(host, props, runtime) {{"
    ));
    lines.push(
        "  const __props = props && typeof props === 'object' ? props : Object.freeze({});"
            .to_string(),
    );
    lines.push(
        "  const __runtime = runtime && typeof runtime === 'object' ? runtime : {};".to_string(),
    );
    lines.push("  const signal = __runtime.signal;".to_string());
    lines.push("  const state = __runtime.state;".to_string());
    lines.push("  const ref = __runtime.ref;".to_string());
    lines.push("  const zeneffect = __runtime.zeneffect;".to_string());
    if !body.is_empty() {
        for line in body.lines() {
            lines.push(format!("  {}", line));
        }
    }
    lines.push("  return {".to_string());
    lines.push("    mount() {},".to_string());
    lines.push("    update(nextProps) {".to_string());
    lines.push("      void nextProps;".to_string());
    lines.push("      void __props;".to_string());
    lines.push("    },".to_string());
    lines.push("    destroy() {},".to_string());
    lines.push("    bindings: Object.freeze({".to_string());
    for binding in bindings {
        let value = match binding.kind {
            HoistedBindingKind::Signal => format!(
                "() => (typeof {ident} === 'undefined' ? undefined : ({ident} && typeof {ident}.get === 'function' ? {ident}.get() : undefined))",
                ident = binding.original
            ),
            HoistedBindingKind::Ref => format!(
                "(typeof {ident} === 'undefined' ? undefined : {ident})",
                ident = binding.original
            ),
            HoistedBindingKind::State
            | HoistedBindingKind::Function
            | HoistedBindingKind::Const => format!(
                "(typeof {ident} === 'undefined' ? undefined : {ident})",
                ident = binding.original
            ),
        };
        lines.push(format!("      \"{}\": {},", binding.original, value));
    }
    lines.push("    })".to_string());
    lines.push("  };".to_string());
    lines.push("}".to_string());
    lines.push(format!("export default {factory_name};"));

    lines.join("\n")
}

/// DOM lint warning emitted by script scan. Same shape as CompileWarning.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScriptDomLint {
    pub code: String,
    pub message: String,
    pub line: usize,
    pub column: usize,
}

/// Collect ZEN-DOM-* lint warnings from script source. Does not fail compilation.
pub fn collect_dom_lint_warnings(
    source: &str,
    _source_path: &str,
    _script_id: usize,
    line_offset: usize,
) -> Vec<ScriptDomLint> {
    let mut warnings = Vec::new();
    let lines: Vec<&str> = source.lines().collect();

    for (i, line) in lines.iter().enumerate() {
        let line_num = line_offset + i + 1;
        let prev_line = if i > 0 { lines[i - 1] } else { "" };

        // ZEN-DOM-QUERY (with escape hatch)
        for (re, name, needle) in [
            (dom_query_selector_re(), "querySelector", "querySelector"),
            (
                dom_query_selector_all_re(),
                "querySelectorAll",
                "querySelectorAll",
            ),
            (
                dom_get_element_by_id_re(),
                "getElementById",
                "getElementById",
            ),
        ] {
            if line.contains(needle) && re.is_match(line) {
                let suppressed =
                    prev_line.trim().starts_with("//") && prev_line.contains("zen-allow:dom-query");
                if !suppressed {
                    let col = line.find(name).unwrap_or(0) + 1;
                    warnings.push(ScriptDomLint {
                        code: "ZEN-DOM-QUERY".to_string(),
                        message: "Use ref<T>() + zenMount for DOM nodes, or collectRefs() for multiple refs. Suppress with // zen-allow:dom-query <reason>".to_string(),
                        line: line_num,
                        column: col,
                    });
                }
            }
        }

        // ZEN-DOM-LISTENER
        if line.contains(".addEventListener") && dom_add_event_listener_re().is_match(line) {
            let col = line.find(".addEventListener").unwrap_or(0) + 1;
            warnings.push(ScriptDomLint {
                code: "ZEN-DOM-LISTENER".to_string(),
                message: "Use zenOn(target, eventName, handler, options?) and register disposer via zenMount ctx.cleanup.".to_string(),
                line: line_num,
                column: col,
            });
        }

        // ZEN-DOM-WRAPPER: detect SSR guard patterns (typeof window/document === 'undefined' ? ... : ...)
        if line.contains("typeof")
            && line.contains("undefined")
            && (line.contains("window") || line.contains("document"))
            && (dom_typeof_eq_undefined_re().is_match(line)
                || dom_typeof_neq_undefined_re().is_match(line))
        {
            let col = line.find("typeof").unwrap_or(0) + 1;
            warnings.push(ScriptDomLint {
                code: "ZEN-DOM-WRAPPER".to_string(),
                message: "Use zenWindow() / zenDocument().".to_string(),
                line: line_num,
                column: col,
            });
        }
        if line.contains("globalThis") && dom_global_this_re().is_match(line) {
            let col = line.find("globalThis").unwrap_or(0) + 1;
            warnings.push(ScriptDomLint {
                code: "ZEN-DOM-WRAPPER".to_string(),
                message: "Use zenWindow() / zenDocument().".to_string(),
                line: line_num,
                column: col,
            });
        }
    }

    warnings
}

fn assert_no_forbidden_tokens(
    source: &str,
    source_path: &str,
    script_id: usize,
) -> Result<(), ScriptContractError> {
    // document.* and window.* removed: now ZEN-DOM-* lints instead of hard-fail
    let forbidden = [
        (r"\bonMount\s*\(", "onMount() lifecycle hooks"),
        (r"\bsetTimeout\s*\(", "timer scheduling via setTimeout()"),
        (r"\bwith\s*\(", "`with (...)` usage"),
        (r"\beval\s*\(", "eval() usage"),
        (r"\bnew\s+Function\s*\(", "new Function() usage"),
        (r"\bimport\s*\(", "dynamic import() usage"),
        (r"\bexport\s+default\b", "default exports"),
    ];

    for (pattern, reason) in forbidden {
        let re = Regex::new(pattern).unwrap();
        if re.is_match(source) {
            return Err(script_contract_error(
                source_path,
                script_id,
                format!(
                    "Component scripts cannot create runtime scope boundaries. Forbidden {}",
                    reason
                ),
            ));
        }
    }

    Ok(())
}
