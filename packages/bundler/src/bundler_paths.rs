use super::*;

pub(crate) fn normalize_base_path(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed == "/" {
        return Ok("/".to_string());
    }
    if trimmed.contains('?') || trimmed.contains('#') {
        return Err(
            "invalid value for --base-path: must not include query or hash fragments".to_string(),
        );
    }
    if !trimmed.starts_with('/') {
        return Err("invalid value for --base-path: must start with '/'".to_string());
    }
    let normalized = Regex::new(r"/{2,}")
        .map_err(|e| format!("failed to compile base path regex: {e}"))?
        .replace_all(trimmed, "/")
        .trim_end_matches('/')
        .to_string();
    Ok(if normalized.is_empty() {
        "/".to_string()
    } else {
        normalized
    })
}

pub(crate) fn prepend_base_path(base_path: &str, pathname: &str) -> String {
    let normalized_path = if pathname.is_empty() {
        "/".to_string()
    } else if pathname.starts_with('/') {
        pathname.to_string()
    } else {
        format!("/{}", pathname)
    };
    if base_path == "/" {
        return normalized_path;
    }
    if normalized_path == "/" {
        return base_path.to_string();
    }
    if normalized_path == base_path || normalized_path.starts_with(&format!("{}/", base_path)) {
        return normalized_path;
    }
    format!("{}{}", base_path, normalized_path)
}

pub(crate) fn strip_base_path(public_path: &str, base_path: &str) -> String {
    let normalized = if public_path.is_empty() {
        "/".to_string()
    } else if public_path.starts_with('/') {
        public_path.replace('\\', "/")
    } else {
        format!("/{}", public_path.replace('\\', "/"))
    };
    if base_path == "/" {
        return normalized;
    }
    if normalized == base_path {
        return "/".to_string();
    }
    if normalized.starts_with(&format!("{}/", base_path)) {
        return normalized[base_path.len()..].to_string();
    }
    normalized
}

pub(crate) fn public_asset_path(base_path: &str, relative_path: &str) -> String {
    prepend_base_path(
        base_path,
        &format!("/{}", relative_path.trim_start_matches('/')),
    )
}

pub(crate) fn sanitize_route_to_token(route: &str) -> String {
    let s = route.replace('/', "_");
    if s == "_" {
        return "index".to_string();
    }
    let trimmed = s.trim_start_matches('_');
    let mut normalized = String::with_capacity(trimmed.len());
    let mut last_was_underscore = false;

    for ch in trimmed.chars() {
        let safe = if ch.is_ascii_alphanumeric() || ch == '_' || ch == '-' {
            ch
        } else {
            '_'
        };

        if safe == '_' {
            if last_was_underscore {
                continue;
            }
            last_was_underscore = true;
        } else {
            last_was_underscore = false;
        }

        normalized.push(safe);
    }

    let cleaned = normalized.trim_matches('_');
    if cleaned.is_empty() {
        "index".to_string()
    } else {
        cleaned.to_string()
    }
}

pub(crate) fn route_to_output_path(route_path: &str) -> PathBuf {
    if route_path == "/" {
        return PathBuf::from("index.html");
    }

    let mut out = PathBuf::new();
    for segment in route_path.split('/').filter(|s| !s.is_empty()) {
        if let Some(name) = segment.strip_prefix(':') {
            out.push(format!("__param_{}", name));
            continue;
        }
        if let Some(raw_name) = segment.strip_prefix('*') {
            let name = raw_name.strip_suffix('?').unwrap_or(raw_name);
            out.push(format!("__splat_{}", name));
            continue;
        }
        out.push(segment);
    }
    out.push("index.html");
    out
}

pub(crate) fn normalize_text_newlines(value: &str) -> String {
    value.replace("\r\n", "\n").replace('\r', "\n")
}

pub(crate) fn normalize_path_for_contract(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

pub(crate) fn strip_import_suffix(specifier: &str) -> String {
    let without_query = specifier.split('?').next().unwrap_or(specifier);
    without_query
        .split('#')
        .next()
        .unwrap_or(without_query)
        .to_string()
}

pub(crate) fn sanitize_asset_token(input: &str) -> String {
    input
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '_' || ch == '-' {
                ch
            } else {
                '_'
            }
        })
        .collect()
}
