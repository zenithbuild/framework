use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
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
) -> Result<(String, Vec<HoistedScript>), ScriptContractError> {
    let mut output = String::new();
    let mut scripts = Vec::new();

    let mut cursor = 0usize;
    let mut script_id = 0usize;
    let mut depth = 0i32;

    while let Some(open_rel) = input[cursor..].find("<script") {
        let open_start = cursor + open_rel;
        let prefix = &input[cursor..open_start];
        output.push_str(prefix);
        update_tag_depth(prefix, &mut depth);

        let open_end_rel = input[open_start..].find('>').ok_or_else(|| {
            script_contract_error(
                source_path,
                script_id,
                "malformed <script> tag: missing closing `>`".to_string(),
            )
        })?;
        let open_end = open_start + open_end_rel;
        let open_tag = &input[open_start..=open_end];
        validate_script_tag_contract(open_tag, source_path, script_id)?;

        let close_tag = "</script>";
        let close_rel = input[(open_end + 1)..].find(close_tag).ok_or_else(|| {
            script_contract_error(
                source_path,
                script_id,
                "malformed <script> block: missing closing </script>".to_string(),
            )
        })?;
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
        let analyzed = analyze_component_script(
            script_id,
            source_path,
            &component_path,
            script_source,
            is_global,
        )?;
        scripts.push(analyzed);

        cursor = close_end;
        script_id += 1;
    }

    output.push_str(&input[cursor..]);

    // Preserve legacy structural behavior for script-only files.
    // Hoisting only activates when a script contributes to a non-script tree.
    if !scripts.is_empty() && output.trim().is_empty() {
        return Ok((input.to_string(), Vec::new()));
    }

    Ok((output, scripts))
}

fn validate_script_tag_contract(
    open_tag: &str,
    source_path: &str,
    script_id: usize,
) -> Result<(), ScriptContractError> {
    let lang = extract_script_tag_attr_value(open_tag, "lang");
    let setup = extract_script_tag_attr_value(open_tag, "setup");
    let lang_attr_count = count_script_tag_attr_occurrences(open_tag, "lang");
    let setup_attr_count = count_script_tag_attr_occurrences(open_tag, "setup");

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
    let pattern = format!(
        r#"(?i)\b{}\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))"#,
        regex::escape(attr_name)
    );
    let re = Regex::new(&pattern).unwrap();
    let captures = re.captures(open_tag)?;

    captures
        .get(1)
        .or_else(|| captures.get(2))
        .or_else(|| captures.get(3))
        .map(|m| m.as_str().trim().to_string())
}

fn count_script_tag_attr_occurrences(open_tag: &str, attr_name: &str) -> usize {
    let pattern = format!(
        r#"(?i)(?:^|[\s<]){}(?:\s*=|[\s>/])"#,
        regex::escape(attr_name)
    );
    let re = Regex::new(&pattern).unwrap();
    re.find_iter(open_tag).count()
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
) -> Result<HoistedScript, ScriptContractError> {
    assert_no_forbidden_tokens(source, source_path, id)?;

    let decl_re = Regex::new(r"\b(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=").unwrap();
    let fn_re = Regex::new(r"\bfunction\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(").unwrap();
    let import_re = Regex::new(r"(?m)^\s*import\s+[^;\n]+;?").unwrap();
    let decl_line_re =
        Regex::new(r"(?m)^\s*(?:const|let|var)\s+[A-Za-z_$][A-Za-z0-9_$]*\s*=.*").unwrap();

    let import_lines = import_re
        .find_iter(source)
        .map(|m| m.as_str().trim().to_string())
        .collect::<Vec<_>>();
    let imports = dedupe_preserve_order(import_lines);

    let source_without_imports = import_re.replace_all(source, "").into_owned();
    let canonical_source = canonicalize_script_source(&source_without_imports);
    let hoist_id = stable_hash_8(&canonical_source);
    let factory_name = format!("createComponent_{}", sanitize_factory_suffix(&hoist_id));

    let mut declared: Vec<(usize, String, HoistedBindingKind)> = Vec::new();

    for capture in decl_re.captures_iter(source) {
        let ident = capture
            .get(1)
            .map(|m| m.as_str())
            .unwrap_or_default()
            .to_string();
        let start = capture.get(1).map(|m| m.start()).unwrap_or(0);
        let full_start = capture.get(0).map(|m| m.start()).unwrap_or(0);
        if !is_top_level_position(source, full_start) {
            continue;
        }
        let tail = &source[full_start..];

        let kind = if Regex::new(&format!(
            r"^(?:const|let|var)\s+{}\s*=\s*signal\s*\(",
            regex::escape(&ident)
        ))
        .unwrap()
        .is_match(tail)
        {
            HoistedBindingKind::Signal
        } else if Regex::new(&format!(
            r"^(?:const|let|var)\s+{}\s*=\s*state\s*\(",
            regex::escape(&ident)
        ))
        .unwrap()
        .is_match(tail)
        {
            HoistedBindingKind::State
        } else if Regex::new(&format!(
            r"^(?:const|let|var)\s+{}\s*=\s*ref\s*(?:<[^>]*>)?\s*\(",
            regex::escape(&ident)
        ))
        .unwrap()
        .is_match(tail)
        {
            HoistedBindingKind::Ref
        } else {
            HoistedBindingKind::Const
        };

        declared.push((start, ident, kind));
    }

    for capture in fn_re.captures_iter(source) {
        let full_start = capture.get(0).map(|m| m.start()).unwrap_or(0);
        if !is_top_level_position(source, full_start) {
            continue;
        }
        let ident = capture
            .get(1)
            .map(|m| m.as_str())
            .unwrap_or_default()
            .to_string();
        let start = capture.get(1).map(|m| m.start()).unwrap_or(0);
        declared.push((start, ident, HoistedBindingKind::Function));
    }

    declared.sort_by(|a, b| a.0.cmp(&b.0));

    let mut bindings = Vec::new();
    for (_, ident, kind) in declared {
        if bindings
            .iter()
            .any(|existing: &HoistedBinding| existing.original == ident)
        {
            return Err(script_contract_error(
                source_path,
                id,
                format!(
                    "component script declaration collision: `{}` declared multiple times",
                    ident
                ),
            ));
        }

        let renamed = format!(
            "__{}_{}_{}",
            sanitize_component_slug(component_path),
            stable_hash_8(component_path),
            ident
        );
        bindings.push(HoistedBinding {
            original: ident,
            renamed,
            kind,
        });
    }

    let mut renamed_source = source.to_string();
    let mut rename_order = bindings.clone();
    rename_order.sort_by(|a, b| b.original.len().cmp(&a.original.len()));
    for binding in &rename_order {
        let pattern = Regex::new(&format!(r"\b{}\b", regex::escape(&binding.original))).unwrap();
        renamed_source = pattern
            .replace_all(&renamed_source, binding.renamed.as_str())
            .into_owned();
    }

    let declarations = decl_line_re
        .find_iter(&renamed_source)
        .filter(|m| is_top_level_position(&renamed_source, m.start()))
        .map(|m| m.as_str().trim().to_string())
        .collect::<Vec<_>>();

    let mut functions = Vec::new();
    let mut signals = Vec::new();
    for binding in &bindings {
        if matches!(binding.kind, HoistedBindingKind::Function) {
            functions.push(binding.renamed.clone());
        }
        if matches!(binding.kind, HoistedBindingKind::Signal) {
            signals.push(binding.renamed.clone());
        }
    }

    let factory_code =
        generate_factory_code(&factory_name, &imports, &source_without_imports, &bindings);

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

fn is_top_level_position(source: &str, pos: usize) -> bool {
    #[derive(Clone, Copy, PartialEq, Eq)]
    enum ScanMode {
        Code,
        SingleQuote,
        DoubleQuote,
        Template,
        LineComment,
        BlockComment,
    }

    let bytes = source.as_bytes();
    let mut i = 0usize;
    let mut depth = 0i32;
    let mut mode = ScanMode::Code;
    let end = pos.min(bytes.len());

    while i < end {
        match mode {
            ScanMode::Code => {
                if i + 1 < end && bytes[i] == b'/' && bytes[i + 1] == b'/' {
                    mode = ScanMode::LineComment;
                    i += 2;
                    continue;
                }
                if i + 1 < end && bytes[i] == b'/' && bytes[i + 1] == b'*' {
                    mode = ScanMode::BlockComment;
                    i += 2;
                    continue;
                }
                match bytes[i] {
                    b'\'' => {
                        mode = ScanMode::SingleQuote;
                        i += 1;
                        continue;
                    }
                    b'"' => {
                        mode = ScanMode::DoubleQuote;
                        i += 1;
                        continue;
                    }
                    b'`' => {
                        mode = ScanMode::Template;
                        i += 1;
                        continue;
                    }
                    b'{' => {
                        depth += 1;
                    }
                    b'}' => {
                        depth = (depth - 1).max(0);
                    }
                    _ => {}
                }
                i += 1;
            }
            ScanMode::SingleQuote => {
                if bytes[i] == b'\\' {
                    i = (i + 2).min(end);
                    continue;
                }
                if bytes[i] == b'\'' {
                    mode = ScanMode::Code;
                }
                i += 1;
            }
            ScanMode::DoubleQuote => {
                if bytes[i] == b'\\' {
                    i = (i + 2).min(end);
                    continue;
                }
                if bytes[i] == b'"' {
                    mode = ScanMode::Code;
                }
                i += 1;
            }
            ScanMode::Template => {
                if bytes[i] == b'\\' {
                    i = (i + 2).min(end);
                    continue;
                }
                if bytes[i] == b'`' {
                    mode = ScanMode::Code;
                }
                i += 1;
            }
            ScanMode::LineComment => {
                if bytes[i] == b'\n' {
                    mode = ScanMode::Code;
                }
                i += 1;
            }
            ScanMode::BlockComment => {
                if i + 1 < end && bytes[i] == b'*' && bytes[i + 1] == b'/' {
                    mode = ScanMode::Code;
                    i += 2;
                    continue;
                }
                i += 1;
            }
        }
    }

    depth == 0
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

fn stable_hash_8(input: &str) -> String {
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

fn dedupe_preserve_order(items: Vec<String>) -> Vec<String> {
    let mut seen = BTreeSet::new();
    let mut out = Vec::new();
    for item in items {
        if seen.insert(item.clone()) {
            out.push(item);
        }
    }
    out
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

fn assert_no_forbidden_tokens(
    source: &str,
    source_path: &str,
    script_id: usize,
) -> Result<(), ScriptContractError> {
    let forbidden = [
        (r"\bonMount\s*\(", "onMount() lifecycle hooks"),
        (r"\bdocument\.", "DOM access via document.*"),
        (r"\bwindow\.", "DOM/global access via window.*"),
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
