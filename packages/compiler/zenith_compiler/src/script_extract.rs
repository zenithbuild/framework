use std::time::Instant;

use super::script_analyze::analyze_component_script;
use super::script_contract::{script_contract_error, validate_script_tag_contract};
use super::script_dom_lint::{collect_dom_lint_warnings, ScriptDomLint};
use super::script_types::{HoistedScript, ScriptContractError, ScriptProfileMetrics};

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
