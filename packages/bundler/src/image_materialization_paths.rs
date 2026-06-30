use regex::Regex;

pub(super) fn prepend_base_path(base_path: &str, pathname: &str) -> String {
    let normalized_base = normalize_base_path(base_path);
    let normalized_path = normalize_public_path(pathname);
    if normalized_base == "/" {
        return normalized_path;
    }
    if normalized_path == "/" {
        return normalized_base;
    }
    if normalized_path == normalized_base
        || normalized_path.starts_with(&format!("{normalized_base}/"))
    {
        return normalized_path;
    }
    format!("{normalized_base}{normalized_path}")
}

fn normalize_base_path(value: &str) -> String {
    let raw = value.trim();
    if raw.is_empty() || raw == "/" {
        return "/".to_string();
    }
    let with_leading = if raw.starts_with('/') {
        raw.to_string()
    } else {
        format!("/{raw}")
    };
    let squashed = Regex::new(r"/{2,}")
        .expect("valid regex")
        .replace_all(&with_leading, "/")
        .to_string();
    squashed.trim_end_matches('/').to_string()
}

fn normalize_public_path(pathname: &str) -> String {
    let raw = pathname.trim();
    let with_leading = if raw.starts_with('/') {
        raw.to_string()
    } else {
        format!("/{raw}")
    };
    let squashed = Regex::new(r"/{2,}")
        .expect("valid regex")
        .replace_all(&with_leading, "/")
        .to_string();
    if squashed.len() > 1 {
        squashed.trim_end_matches('/').to_string()
    } else {
        "/".to_string()
    }
}

fn normalize_format(value: &str) -> String {
    value.trim().trim_start_matches('.').to_lowercase()
}

fn build_local_image_key(public_path: &str) -> String {
    let mut hash: u32 = 2_166_136_261;
    for codepoint in public_path.chars() {
        hash ^= codepoint as u32;
        hash = hash.wrapping_mul(16_777_619);
    }
    format!("{hash:08x}")
}

pub(super) fn build_local_variant_path(
    public_path: &str,
    width: u32,
    quality: u32,
    format: &str,
    base_path: &str,
) -> String {
    let key = build_local_image_key(public_path);
    prepend_base_path(
        base_path,
        &format!(
            "/_zenith/image/local/{key}/w{width}-q{quality}.{}",
            normalize_format(format)
        ),
    )
}

pub(super) fn mime_type_for_format(value: &str) -> &'static str {
    match normalize_format(value).as_str() {
        "avif" => "image/avif",
        "webp" => "image/webp",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        _ => "",
    }
}
