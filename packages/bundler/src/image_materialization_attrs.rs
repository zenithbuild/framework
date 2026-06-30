use super::SourceTag;

pub(super) fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

pub(super) fn build_attr(name: &str, value: &str) -> String {
    if value.is_empty() {
        String::new()
    } else {
        format!(" {name}=\"{}\"", escape_html(value))
    }
}

pub(super) fn build_source_tags(sources: &[SourceTag]) -> String {
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

pub(super) fn merge_style(style: String, fit: String, position: String) -> String {
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
