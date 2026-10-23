use regex::Regex;
use std::sync::OnceLock;
use std::time::Instant;

use super::script_types::{ScriptContractError, ScriptProfileMetrics};

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

pub(super) fn validate_script_tag_contract(
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

pub(super) fn script_contract_error(
    source_path: &str,
    script_id: usize,
    reason: String,
) -> ScriptContractError {
    ScriptContractError::new(format!(
        "Zenith requires TypeScript scripts. Add lang=\"ts\".\nFile: {}#script{}\nReason: {}\nExample: <script lang=\"ts\">",
        source_path, script_id, reason
    ))
}

pub(super) fn assert_no_forbidden_tokens(
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
