use super::*;

fn parse_marker_selector(selector: &str) -> Option<(String, String)> {
    let regex =
        Regex::new(r#"^\[([^\]=]+)=(?:"([^"]+)"|'([^']+)')\]$"#).expect("valid selector regex");
    let captures = regex.captures(selector)?;
    let attr_name = captures.get(1)?.as_str().to_string();
    let attr_value = captures
        .get(2)
        .or_else(|| captures.get(3))
        .map(|capture| capture.as_str().to_string())?;
    Some((attr_name, attr_value))
}

fn attribute_equals(attrs: &str, attr_name: &str, attr_value: &str) -> bool {
    let regex = Regex::new(&format!(
        r#"(?i)\s{}=(?:"{}"|'{}')"#,
        regex::escape(attr_name),
        regex::escape(attr_value),
        regex::escape(attr_value)
    ))
    .expect("valid attribute equality regex");
    regex.is_match(attrs)
}

fn upsert_attribute_markup(attrs: &str, attr_name: &str, value: Option<&str>) -> String {
    let regex = Regex::new(&format!(
        r#"(?i)\s{}=(?:"[^"]*"|'[^']*')"#,
        regex::escape(attr_name)
    ))
    .expect("valid attribute upsert regex");
    let replacement = value
        .map(|value| format!(" {attr_name}=\"{}\"", escape_html(value)))
        .unwrap_or_default();
    if regex.is_match(attrs) {
        regex.replace(attrs, replacement.as_str()).to_string()
    } else if replacement.is_empty() {
        attrs.to_string()
    } else {
        format!("{attrs}{replacement}")
    }
}

fn find_matching_element(
    html: &str,
    attr_name: &str,
    attr_value: &str,
) -> Option<(usize, usize, usize, String, String)> {
    let tag_regex = Regex::new(r#"(?is)<([A-Za-z][\w:-]*)([^>]*)>"#).expect("valid open tag regex");
    for captures in tag_regex.captures_iter(html) {
        let whole = captures.get(0)?;
        let tag_name = captures.get(1)?.as_str().to_string();
        let attrs = captures
            .get(2)
            .map(|capture| capture.as_str())
            .unwrap_or_default()
            .to_string();
        if !attribute_equals(&attrs, attr_name, attr_value) {
            continue;
        }
        let close_tag = format!("</{tag_name}>");
        let after_open = whole.end();
        let close_offset = html[after_open..].find(&close_tag)?;
        let close_start = after_open + close_offset;
        let close_end = close_start + close_tag.len();
        return Some((whole.start(), close_start, close_end, tag_name, attrs));
    }
    None
}

fn apply_materialization_entry(
    html: &str,
    entry: &ImageMaterializationEntry,
    payload: &ImageRuntimePayload,
) -> String {
    let Some((attr_name, attr_value)) = parse_marker_selector(&entry.selector) else {
        return html.to_string();
    };
    let Some((tag_start, close_start, close_end, tag_name, attrs)) =
        find_matching_element(html, &attr_name, &attr_value)
    else {
        return html.to_string();
    };
    let encoded_props = serialize_image_props(&entry.props);
    let rendered_html = render_image_html_with_payload(&entry.props, payload);
    let next_attrs = upsert_attribute_markup(&attrs, "data-zenith-image", encoded_props.as_deref());
    let open_tag = format!("<{tag_name}{next_attrs}>");
    format!(
        "{}{}{}{}",
        &html[..tag_start],
        open_tag,
        rendered_html,
        &html[close_start..close_end]
    ) + &html[close_end..]
}

fn has_unmaterialized_image_markers(html: &str) -> bool {
    let regex = Regex::new(
        r#"(?is)<span\b[^>]*\bdata-zx-(?:data-zenith-image|unsafeHTML)=(?:"[^"]+"|'[^']+')[^>]*>"#,
    )
    .expect("valid unresolved marker regex");
    let has_unresolved = regex
        .find_iter(html)
        .any(|tag| !tag.as_str().contains(" data-zenith-image="));
    has_unresolved
}

pub(crate) fn materialize_image_markup(
    html: &str,
    payload: Option<&ImageRuntimePayload>,
    entries: &[ImageMaterializationEntry],
) -> Result<String, String> {
    let Some(payload) = payload else {
        return Ok(html.to_string());
    };
    let mut next_html = html.to_string();
    for entry in entries {
        next_html = apply_materialization_entry(&next_html, entry, payload);
    }
    if has_unmaterialized_image_markers(&next_html) {
        return Err(
            "[Zenith:Image] Unresolved Image markers require a compiler-owned image materialization artifact. Dynamic image props are currently unsupported.".to_string(),
        );
    }
    Ok(next_html)
}

pub(crate) fn materialize_image_markup_in_build_html(
    html: &str,
    payload: Option<&ImageRuntimePayload>,
    entries: &[ImageMaterializationEntry],
) -> Result<String, String> {
    materialize_image_markup(html, payload, entries)
}
