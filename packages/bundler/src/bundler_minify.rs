use super::*;
use std::sync::OnceLock;

fn generated_scoped_identifier_regex() -> &'static Regex {
    static GENERATED_SCOPED_IDENTIFIER_REGEX: OnceLock<Regex> = OnceLock::new();
    GENERATED_SCOPED_IDENTIFIER_REGEX.get_or_init(|| {
        Regex::new(r"\b__[A-Za-z0-9_]*_zenith_src_[A-Za-z0-9_]*_script[0-9]+_[A-Za-z0-9_]+\b")
            .expect("failed to compile generated scoped identifier regex")
    })
}

fn identifier_token_regex() -> &'static Regex {
    static IDENTIFIER_TOKEN_REGEX: OnceLock<Regex> = OnceLock::new();
    IDENTIFIER_TOKEN_REGEX.get_or_init(|| {
        Regex::new(r"\b[A-Za-z_$][A-Za-z0-9_$]*\b")
            .expect("failed to compile identifier token regex")
    })
}

fn minify_js_module_source(source: &str, asset_label: &str) -> Result<String, String> {
    let allocator = Allocator::default();
    let parser = Parser::new(&allocator, source, SourceType::default().with_module(true));
    let parse_result = parser.parse();
    if !parse_result.errors.is_empty() {
        let diagnostics = parse_result
            .errors
            .iter()
            .take(4)
            .map(|error| format!("{error}"))
            .collect::<Vec<_>>()
            .join("; ");
        return Err(format!(
            "{asset_label} minification parse failure: {diagnostics}"
        ));
    }

    let codegen = Codegen::<true>::new(source, CodegenOptions::default());
    let compiled = codegen.build(&parse_result.program);
    Ok(compiled.source_text)
}

fn minify_runtime_module_source(source: &str) -> Result<String, String> {
    minify_js_module_source(source, "runtime asset")
}

fn minify_router_module_source(source: &str) -> Result<String, String> {
    minify_js_module_source(source, "router asset")
}

fn minify_page_module_source(source: &str) -> Result<String, String> {
    minify_js_module_source(source, "page asset")
}

pub(crate) fn maybe_minify_runtime_for_output(
    runtime_js: &str,
    output_mode: OutputMode,
) -> Result<String, String> {
    if output_mode.is_dev_stable() {
        return Ok(runtime_js.to_string());
    }
    minify_runtime_module_source(runtime_js)
}

pub(crate) fn maybe_minify_router_for_output(
    router_js: &str,
    output_mode: OutputMode,
) -> Result<String, String> {
    if output_mode.is_dev_stable() {
        return Ok(router_js.to_string());
    }
    minify_router_module_source(router_js)
}

fn compact_generated_page_identifiers(source: &str) -> String {
    let mut existing_identifiers = BTreeSet::<String>::new();
    for capture in identifier_token_regex().find_iter(source) {
        existing_identifiers.insert(capture.as_str().to_string());
    }

    let mut replacements = BTreeMap::<String, String>::new();
    let mut alias_index = 0usize;
    for capture in generated_scoped_identifier_regex().find_iter(source) {
        let original = capture.as_str().to_string();
        if replacements.contains_key(&original) {
            continue;
        }
        let alias = loop {
            let candidate = format!("__zv{alias_index}");
            alias_index += 1;
            if !existing_identifiers.contains(&candidate) {
                existing_identifiers.insert(candidate.clone());
                break candidate;
            }
        };
        replacements.insert(original, alias);
    }

    if replacements.is_empty() {
        return source.to_string();
    }

    generated_scoped_identifier_regex()
        .replace_all(source, |captures: &regex::Captures| {
            let original = captures.get(0).map(|m| m.as_str()).unwrap_or_default();
            replacements
                .get(original)
                .cloned()
                .unwrap_or_else(|| original.to_string())
        })
        .into_owned()
}

pub(crate) fn maybe_minify_page_for_output(
    page_js: &str,
    output_mode: OutputMode,
) -> Result<String, String> {
    if output_mode.is_dev_stable() {
        return Ok(page_js.to_string());
    }
    let compacted = compact_generated_page_identifiers(page_js);
    minify_page_module_source(&compacted)
}
