use super::*;

pub(crate) fn component_owner_module_id(component_module_id: &str) -> String {
    component_module_id
        .split_once(":script")
        .map(|(base, _)| base.to_string())
        .unwrap_or_else(|| component_module_id.to_string())
}

pub(crate) fn extract_static_import_specifier(import_line: &str) -> Option<String> {
    let re = Regex::new(r#"^\s*import(?:\s+[^'"]+?\s+from)?\s*['"]([^'"]+)['"]\s*;?\s*$"#).unwrap();
    re.captures(import_line)
        .and_then(|cap| cap.get(1))
        .map(|m| m.as_str().to_string())
}

pub(crate) fn rewrite_import_specifier_literal(
    import_line: &str,
    old_specifier: &str,
    new_specifier: &str,
) -> Result<String, String> {
    let single = format!("'{}'", old_specifier);
    if import_line.contains(&single) {
        return Ok(import_line.replacen(&single, &format!("'{}'", new_specifier), 1));
    }
    let double = format!("\"{}\"", old_specifier);
    if import_line.contains(&double) {
        return Ok(import_line.replacen(&double, &format!("\"{}\"", new_specifier), 1));
    }
    Err(format!(
        "failed to rewrite import specifier '{}' in line '{}'",
        old_specifier, import_line
    ))
}

pub(crate) fn rewrite_js_import_specifiers(
    source: &str,
    old_specifier: &str,
    new_specifier: &str,
) -> Result<String, String> {
    if old_specifier == new_specifier {
        return Ok(source.to_string());
    }

    let escaped = regex::escape(old_specifier);
    let mut updated = source.to_string();
    let mut replaced_any = false;

    let patterns = [
        format!(
            r#"(?m)(\bimport\s+[^'"\n;]*?\s+from\s*['"]){}(['"])"#,
            escaped
        ),
        format!(r#"(?m)(\bimport\s*['"]){}(['"])"#, escaped),
        format!(r#"(?m)(\bimport\s*\(\s*['"]){}(['"]\s*\))"#, escaped),
        format!(
            r#"(?m)(\bexport\s+[^'"\n;]*?\s+from\s*['"]){}(['"])"#,
            escaped
        ),
    ];

    for pattern in patterns {
        let re = Regex::new(&pattern)
            .map_err(|err| format!("failed to compile import rewrite pattern: {err}"))?;
        let next = re
            .replace_all(&updated, |caps: &regex::Captures| {
                format!("{}{}{}", &caps[1], new_specifier, &caps[2])
            })
            .into_owned();
        if next != updated {
            replaced_any = true;
            updated = next;
        }
    }

    if !replaced_any {
        return Err(format!(
            "failed to rewrite import specifier '{}' in module source",
            old_specifier
        ));
    }

    Ok(updated)
}

pub(crate) fn resolve_module_id_for_spec(
    module_registry: &BTreeMap<String, CompilerModule>,
    owner_module_id: &str,
    specifier: &str,
) -> Option<String> {
    let owner = normalize_module_id(owner_module_id);
    let owner_dir = owner.rsplit_once('/').map(|(dir, _)| dir).unwrap_or("");
    let mut candidates = Vec::new();
    if specifier.starts_with('/') {
        candidates.push(normalize_module_id(specifier.trim_start_matches('/')));
    } else {
        let joined = if owner_dir.is_empty() {
            specifier.to_string()
        } else {
            format!("{owner_dir}/{specifier}")
        };
        candidates.push(normalize_module_id(&joined));
    }

    if let Some(base) = candidates.first().cloned() {
        if !has_module_extension(&base) {
            for ext in ["js", "mjs", "cjs", "ts", "tsx", "jsx", "zen"] {
                candidates.push(format!("{base}.{ext}"));
            }
            for ext in ["js", "mjs", "cjs", "ts", "tsx", "jsx", "zen"] {
                candidates.push(format!("{base}/index.{ext}"));
            }
        }
    }

    candidates
        .into_iter()
        .find(|candidate| module_registry.contains_key(candidate))
}

pub(crate) fn normalize_module_id(raw: &str) -> String {
    let normalized = raw.replace('\\', "/");
    let mut segments = Vec::new();
    for segment in normalized.split('/') {
        if segment.is_empty() || segment == "." {
            continue;
        }
        if segment == ".." {
            segments.pop();
            continue;
        }
        segments.push(segment);
    }
    segments.join("/")
}

fn has_module_extension(module_id: &str) -> bool {
    let last = module_id.rsplit('/').next().unwrap_or(module_id);
    last.rsplit_once('.')
        .map(|(_, ext)| !ext.is_empty())
        .unwrap_or(false)
}

pub(crate) fn is_relative_or_absolute_specifier(specifier: &str) -> bool {
    specifier.starts_with("./") || specifier.starts_with("../") || specifier.starts_with('/')
}

pub(crate) fn is_css_specifier(specifier: &str) -> bool {
    let without_query = specifier.split('?').next().unwrap_or(specifier);
    let without_hash = without_query.split('#').next().unwrap_or(without_query);
    without_hash.ends_with(".css")
}

pub(crate) fn is_browser_js_module(module_id: &str) -> bool {
    let normalized = normalize_module_id(module_id);
    normalized.ends_with(".js")
        || normalized.ends_with(".mjs")
        || normalized.ends_with(".cjs")
        || normalized.ends_with(".jsx")
}

pub(crate) fn strip_css_import_statements(source: &str) -> String {
    let css_import_re = Regex::new(
        r#"(?m)^\s*import(?:\s+[^'"\n;]*?\s+from)?\s*['"][^'"]+\.css(?:[?#][^'"]*)?['"]\s*;?\s*$"#,
    )
    .unwrap();
    css_import_re.replace_all(source, "").to_string()
}

pub(crate) fn strip_zen_import_statements(source: &str) -> String {
    let zen_import_re = Regex::new(
        r#"(?m)^\s*import(?:\s+[^'"\n;]*?\s+from)?\s*['"][^'"]+\.zen(?:[?#][^'"]*)?['"]\s*;?\s*$"#,
    )
    .unwrap();
    zen_import_re.replace_all(source, "").to_string()
}

pub(crate) fn collect_js_import_specifiers(source: &str) -> Vec<String> {
    let static_import_re =
        Regex::new(r#"(?m)\bimport\s+(?:[^'"\n;]*?\s+from\s+)?['"]([^'"]+)['"]"#).unwrap();
    let dynamic_import_re = Regex::new(r#"(?m)\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)"#).unwrap();
    let export_from_re =
        Regex::new(r#"(?m)\bexport\s+[^'"\n;]*?\s+from\s+['"]([^'"]+)['"]"#).unwrap();

    let mut out = Vec::new();
    for captures in static_import_re.captures_iter(source) {
        if let Some(spec) = captures.get(1) {
            let value = spec.as_str().to_string();
            if !out.contains(&value) {
                out.push(value);
            }
        }
    }
    for captures in dynamic_import_re.captures_iter(source) {
        if let Some(spec) = captures.get(1) {
            let value = spec.as_str().to_string();
            if !out.contains(&value) {
                out.push(value);
            }
        }
    }
    for captures in export_from_re.captures_iter(source) {
        if let Some(spec) = captures.get(1) {
            let value = spec.as_str().to_string();
            if !out.contains(&value) {
                out.push(value);
            }
        }
    }
    out
}

pub(crate) fn collect_dynamic_import_expressions(source: &str) -> Vec<String> {
    let dynamic_import_any_re = Regex::new(r#"(?m)\bimport\s*\(\s*([^)]+?)\s*\)"#).unwrap();
    let mut out = Vec::new();
    for captures in dynamic_import_any_re.captures_iter(source) {
        if let Some(expr) = captures.get(1) {
            let value = expr.as_str().trim().to_string();
            if !out.contains(&value) {
                out.push(value);
            }
        }
    }
    out
}
