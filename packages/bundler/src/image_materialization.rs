use std::collections::BTreeMap;

use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine as _;
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use url::Url;

const DEFAULT_DEVICE_SIZES: [u32; 8] = [640, 750, 828, 1080, 1200, 1920, 2048, 3840];
const DEFAULT_IMAGE_SIZES: [u32; 8] = [16, 32, 48, 64, 96, 128, 256, 384];
const DEFAULT_FORMATS: [&str; 2] = ["webp", "avif"];
const DEFAULT_QUALITY: u32 = 75;

#[path = "image_materialization_markup.rs"]
mod markup;
pub(crate) use markup::materialize_image_markup_in_build_html;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub(crate) struct ImageMaterializationEntry {
    pub(crate) selector: String,
    pub(crate) props: Value,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ImageRuntimePayload {
    #[serde(default)]
    #[allow(dead_code)]
    mode: String,
    #[serde(default)]
    base_path: String,
    #[serde(default)]
    config: ImageConfig,
    #[serde(default)]
    local_images: BTreeMap<String, LocalImageEntry>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImageConfig {
    #[serde(default = "default_formats")]
    formats: Vec<String>,
    #[serde(default = "default_quality")]
    quality: u32,
    #[serde(default = "default_device_sizes")]
    device_sizes: Vec<u32>,
    #[serde(default = "default_image_sizes")]
    image_sizes: Vec<u32>,
    #[serde(default)]
    remote_patterns: Vec<RemotePattern>,
}

impl Default for ImageConfig {
    fn default() -> Self {
        Self {
            formats: default_formats(),
            quality: default_quality(),
            device_sizes: default_device_sizes(),
            image_sizes: default_image_sizes(),
            remote_patterns: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemotePattern {
    #[serde(default = "default_protocol")]
    protocol: String,
    hostname: String,
    #[serde(default)]
    port: String,
    #[serde(default = "default_pathname")]
    pathname: String,
    #[serde(default)]
    search: String,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct LocalImageEntry {
    width: Option<u32>,
    height: Option<u32>,
    #[serde(default)]
    original_format: String,
    #[serde(default)]
    available_widths: Vec<u32>,
    #[serde(default)]
    available_formats: Vec<String>,
}

#[derive(Debug, Clone)]
enum ImageSource {
    Local {
        path: String,
        width: Option<u32>,
        height: Option<u32>,
        alt: String,
    },
    Remote {
        url: String,
        width: Option<u32>,
        height: Option<u32>,
        alt: String,
    },
}

#[derive(Debug, Clone)]
struct ImageModel {
    src: String,
    width: Option<u32>,
    height: Option<u32>,
    sizes: String,
    sources: Vec<SourceTag>,
}

#[derive(Debug, Clone)]
struct SourceTag {
    mime_type: String,
    sizes: String,
    srcset: String,
}

fn default_formats() -> Vec<String> {
    DEFAULT_FORMATS
        .iter()
        .map(|value| (*value).to_string())
        .collect()
}

fn default_quality() -> u32 {
    DEFAULT_QUALITY
}

fn default_device_sizes() -> Vec<u32> {
    DEFAULT_DEVICE_SIZES.to_vec()
}

fn default_image_sizes() -> Vec<u32> {
    DEFAULT_IMAGE_SIZES.to_vec()
}

fn default_protocol() -> String {
    "https".to_string()
}

fn default_pathname() -> String {
    "/**".to_string()
}

fn safe_string(value: Option<&Value>) -> String {
    match value {
        Some(Value::String(text)) => text.trim().to_string(),
        Some(Value::Number(number)) => number
            .as_u64()
            .map(|value| value.to_string())
            .unwrap_or_default(),
        _ => String::new(),
    }
}

fn positive_int(value: Option<&Value>) -> Option<u32> {
    let raw = value.and_then(Value::as_u64)?;
    if raw == 0 || raw > u32::MAX as u64 {
        return None;
    }
    Some(raw as u32)
}

fn bool_value(value: Option<&Value>) -> bool {
    matches!(value, Some(Value::Bool(true)))
}

fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

fn build_attr(name: &str, value: &str) -> String {
    if value.is_empty() {
        String::new()
    } else {
        format!(" {name}=\"{}\"", escape_html(value))
    }
}

fn prepend_base_path(base_path: &str, pathname: &str) -> String {
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

fn normalize_image_source(value: &Value) -> Option<ImageSource> {
    match value {
        Value::String(raw) => {
            let trimmed = raw.trim();
            if trimmed.is_empty() {
                return None;
            }
            if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
                return Some(ImageSource::Remote {
                    url: trimmed.to_string(),
                    width: None,
                    height: None,
                    alt: String::new(),
                });
            }
            if trimmed.starts_with('/') {
                return Some(ImageSource::Local {
                    path: trimmed.to_string(),
                    width: None,
                    height: None,
                    alt: String::new(),
                });
            }
            None
        }
        Value::Object(map) => {
            let raw_url = map
                .get("url")
                .or_else(|| map.get("src"))
                .or_else(|| map.get("path"))?;
            let normalized = normalize_image_source(raw_url)?;
            let width = positive_int(map.get("width"));
            let height = positive_int(map.get("height"));
            let alt = safe_string(map.get("alt"));
            match normalized {
                ImageSource::Local { path, .. } => Some(ImageSource::Local {
                    path,
                    width,
                    height,
                    alt,
                }),
                ImageSource::Remote { url, .. } => Some(ImageSource::Remote {
                    url,
                    width,
                    height,
                    alt,
                }),
            }
        }
        _ => None,
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

fn build_local_variant_path(
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

fn mime_type_for_format(value: &str) -> &'static str {
    match normalize_format(value).as_str() {
        "avif" => "image/avif",
        "webp" => "image/webp",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        _ => "",
    }
}

fn resolve_width_candidates(
    width: Option<u32>,
    sizes: &str,
    config: &ImageConfig,
    manifest_entry: Option<&LocalImageEntry>,
) -> Vec<u32> {
    let mut values = config.device_sizes.iter().copied().collect::<Vec<_>>();
    values.extend(config.image_sizes.iter().copied());
    if let Some(width) = width {
        values.push(width);
        values.push(width.saturating_mul(2));
    }
    if width.is_none() && !sizes.trim().is_empty() {
        values.extend(config.device_sizes.iter().copied());
    }
    values.sort_unstable();
    values.dedup();
    if let Some(entry) = manifest_entry {
        if !entry.available_widths.is_empty() {
            let filtered = values
                .into_iter()
                .filter(|value| entry.available_widths.contains(value))
                .collect::<Vec<_>>();
            if filtered.is_empty() {
                return entry.available_widths.clone();
            }
            return filtered;
        }
    }
    values
}

fn serialize_image_props(props: &Value) -> Option<String> {
    let object = props.as_object()?;
    let source = normalize_image_source(object.get("src")?)?;
    let alt = safe_string(object.get("alt"));
    let source_alt = match &source {
        ImageSource::Local { alt, .. } | ImageSource::Remote { alt, .. } => alt.clone(),
    };
    if alt.is_empty() && source_alt.is_empty() {
        return None;
    }
    let serialized = serde_json::to_string(props).ok()?;
    Some(BASE64_STANDARD.encode(serialized))
}

fn build_source_tags(sources: &[SourceTag]) -> String {
    sources
        .iter()
        .map(|entry| {
            format!(
                "<source{}{}{}>",
                build_attr("type", &entry.mime_type),
                build_attr("srcset", &entry.srcset),
                build_attr("sizes", &entry.sizes)
            )
        })
        .collect::<String>()
}

fn render_image_html_with_payload(props: &Value, payload: &ImageRuntimePayload) -> String {
    let object = match props.as_object() {
        Some(object) => object,
        None => return String::new(),
    };
    let source = match object.get("src").and_then(normalize_image_source) {
        Some(source) => source,
        None => return String::new(),
    };
    let direct_alt = safe_string(object.get("alt"));
    let alt = if !direct_alt.is_empty() {
        direct_alt
    } else {
        match &source {
            ImageSource::Local { alt, .. } | ImageSource::Remote { alt, .. } => {
                if alt.is_empty() {
                    return String::new();
                }
                alt.clone()
            }
        }
    };
    let model = match source {
        ImageSource::Local {
            path,
            width,
            height,
            ..
        } => build_local_image_model(object, payload, &path, width, height),
        ImageSource::Remote {
            url, width, height, ..
        } => build_remote_image_model(object, payload, &url, width, height),
    };
    let model = match model {
        Some(model) => model,
        None => return String::new(),
    };
    let style = merge_style(
        safe_string(object.get("style")),
        safe_string(object.get("fit")),
        safe_string(object.get("position")),
    );
    let loading = if bool_value(object.get("priority")) {
        "eager".to_string()
    } else {
        let explicit = safe_string(object.get("loading"));
        if explicit.is_empty() {
            "lazy".to_string()
        } else {
            explicit
        }
    };
    let decoding = {
        let explicit = safe_string(object.get("decoding"));
        if explicit.is_empty() {
            "async".to_string()
        } else {
            explicit
        }
    };
    let fetch_priority = if bool_value(object.get("priority")) {
        "high".to_string()
    } else {
        String::new()
    };
    let img_attrs = [
        build_attr("src", &model.src),
        build_attr("alt", &alt),
        build_attr("class", &safe_string(object.get("class"))),
        build_attr("style", &style),
        build_attr("loading", &loading),
        build_attr("decoding", &decoding),
        build_attr("fetchpriority", &fetch_priority),
        build_attr("sizes", &model.sizes),
        build_attr(
            "width",
            &model
                .width
                .map(|value| value.to_string())
                .unwrap_or_default(),
        ),
        build_attr(
            "height",
            &model
                .height
                .map(|value| value.to_string())
                .unwrap_or_default(),
        ),
    ]
    .join("");
    let sources_html = build_source_tags(&model.sources);
    if sources_html.is_empty() {
        format!("<img{img_attrs} />")
    } else {
        format!("<picture>{sources_html}<img{img_attrs} /></picture>")
    }
}

fn build_local_image_model(
    props: &serde_json::Map<String, Value>,
    payload: &ImageRuntimePayload,
    public_path: &str,
    source_width: Option<u32>,
    source_height: Option<u32>,
) -> Option<ImageModel> {
    let manifest_entry = payload.local_images.get(public_path);
    let width = positive_int(props.get("width"))
        .or(source_width)
        .or(manifest_entry.and_then(|entry| entry.width));
    let height = positive_int(props.get("height"))
        .or(source_height)
        .or(manifest_entry.and_then(|entry| entry.height));
    let quality = positive_int(props.get("quality")).unwrap_or(payload.config.quality);
    let sizes = safe_string(props.get("sizes"));
    let widths = resolve_width_candidates(width, &sizes, &payload.config, manifest_entry);
    let fallback_format = manifest_entry
        .map(|entry| entry.original_format.clone())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "jpg".to_string());
    let source_formats = payload
        .config
        .formats
        .iter()
        .filter(|format| {
            manifest_entry.map_or(true, |entry| {
                entry.available_formats.is_empty() || entry.available_formats.contains(*format)
            })
        })
        .cloned()
        .collect::<Vec<_>>();
    let fallback_width = widths
        .last()
        .copied()
        .or(width)
        .or(manifest_entry.and_then(|entry| entry.width))?;
    let unoptimized = bool_value(props.get("unoptimized"));
    let img_src = if unoptimized {
        prepend_base_path(&payload.base_path, public_path)
    } else {
        build_local_variant_path(
            public_path,
            fallback_width,
            quality,
            &fallback_format,
            &payload.base_path,
        )
    };
    let sources = if unoptimized {
        Vec::new()
    } else {
        source_formats
            .into_iter()
            .filter_map(|format| {
                let mime_type = mime_type_for_format(&format).to_string();
                if mime_type.is_empty() {
                    return None;
                }
                let srcset = widths
                    .iter()
                    .map(|candidate| {
                        format!(
                            "{} {}w",
                            build_local_variant_path(
                                public_path,
                                *candidate,
                                quality,
                                &format,
                                &payload.base_path
                            ),
                            candidate
                        )
                    })
                    .collect::<Vec<_>>()
                    .join(", ");
                Some(SourceTag {
                    mime_type,
                    sizes: sizes.clone(),
                    srcset,
                })
            })
            .collect()
    };
    Some(ImageModel {
        src: img_src,
        width,
        height,
        sizes,
        sources,
    })
}

fn build_remote_image_model(
    props: &serde_json::Map<String, Value>,
    payload: &ImageRuntimePayload,
    remote_url: &str,
    source_width: Option<u32>,
    source_height: Option<u32>,
) -> Option<ImageModel> {
    if !match_remote_pattern(remote_url, &payload.config.remote_patterns) {
        return None;
    }
    let width = positive_int(props.get("width")).or(source_width);
    let height = positive_int(props.get("height")).or(source_height);
    Some(ImageModel {
        src: remote_url.to_string(),
        width,
        height,
        sizes: safe_string(props.get("sizes")),
        sources: Vec::new(),
    })
}

fn match_remote_pattern(remote_url: &str, patterns: &[RemotePattern]) -> bool {
    if patterns.is_empty() {
        return false;
    }
    let parsed = match Url::parse(remote_url) {
        Ok(parsed) => parsed,
        Err(_) => return false,
    };
    let protocol = parsed.scheme().to_lowercase();
    let hostname = parsed.host_str().unwrap_or_default().to_lowercase();
    let port = parsed
        .port()
        .map(|value| value.to_string())
        .unwrap_or_default();
    let pathname = parsed.path().to_string();
    let search = parsed
        .query()
        .map(|value| format!("?{value}"))
        .unwrap_or_default();
    patterns.iter().any(|pattern| {
        if !pattern.protocol.is_empty() && pattern.protocol != protocol {
            return false;
        }
        if !hostname_matches(&hostname, &pattern.hostname) {
            return false;
        }
        if !pattern.port.is_empty() && pattern.port != port {
            return false;
        }
        if !pattern.search.is_empty() && pattern.search != search {
            return false;
        }
        glob_to_regex(&pattern.pathname, false).is_match(&pathname)
    })
}

fn hostname_matches(hostname: &str, pattern: &str) -> bool {
    if let Some(suffix) = pattern.strip_prefix("*.") {
        return hostname.ends_with(&format!(".{suffix}")) && hostname.len() > suffix.len() + 1;
    }
    glob_to_regex(pattern, true).is_match(hostname)
}

fn glob_to_regex(glob: &str, is_hostname: bool) -> Regex {
    let escaped = regex::escape(glob)
        .replace("\\*\\*", "__DOUBLE_STAR__")
        .replace("\\*", if is_hostname { "[^.]*" } else { "[^/]*" })
        .replace("__DOUBLE_STAR__", ".*");
    Regex::new(&format!("^{escaped}$")).expect("valid glob regex")
}

fn merge_style(style: String, fit: String, position: String) -> String {
    let mut segments = Vec::new();
    if !style.is_empty() {
        segments.push(style.trim_end_matches(';').to_string());
    }
    if !fit.is_empty() {
        segments.push(format!("object-fit: {fit}"));
    }
    if !position.is_empty() {
        segments.push(format!("object-position: {position}"));
    }
    segments.join("; ")
}
