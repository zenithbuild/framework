use super::*;

pub(crate) fn write_file(
    path: &PathBuf,
    content: &str,
    output_mode: OutputMode,
) -> Result<(), String> {
    write_file_for_mode(path, content, output_mode).map(|_| ())
}

pub(crate) fn ensure_document_html(fragment_or_doc: &str) -> String {
    let pascal_re = regex::Regex::new(r"<([A-Z][a-zA-Z0-9]+)[\s/>]").unwrap();
    for cap in pascal_re.captures_iter(fragment_or_doc) {
        eprintln!(
            "[zenith-bundler] WARNING: unresolved component tag <{}> in HTML emission. \
             The CLI did not expand all component references.",
            &cap[1]
        );
    }

    let lower = fragment_or_doc.to_ascii_lowercase();
    if lower.contains("<html") {
        if lower.contains("<!doctype") {
            return fragment_or_doc.to_string();
        }
        return format!("<!DOCTYPE html>{fragment_or_doc}");
    }
    format!(
        "<!DOCTYPE html><html><head></head><body>{}</body></html>",
        fragment_or_doc
    )
}

pub(crate) fn inject_modulepreload_hints(html: &str, hrefs: &[String]) -> String {
    let existing = modulepreload_hrefs(html);
    let mut block = String::new();
    for href in hrefs {
        if existing.iter().any(|found| found == href) {
            continue;
        }
        block.push_str("<link rel=\"modulepreload\" href=\"");
        block.push_str(&escape_attr(href));
        block.push_str("\">\n");
    }
    if block.is_empty() {
        return html.to_string();
    }
    if let Some(index) = find_tag_start(html, b"head", true) {
        let mut updated = String::with_capacity(html.len() + block.len());
        updated.push_str(&html[..index]);
        updated.push_str(&block);
        updated.push_str(&html[index..]);
        return updated;
    }
    if let Some(index) = find_tag_start(html, b"head", false) {
        let insert_at = scan_tag(html.as_bytes(), index).unwrap_or(index);
        let mut updated = String::with_capacity(html.len() + block.len() + 1);
        updated.push_str(&html[..insert_at]);
        updated.push('\n');
        updated.push_str(&block);
        updated.push_str(&html[insert_at..]);
        return updated;
    }
    format!("{block}{html}")
}

pub(crate) fn ensure_unique_modulepreload_hrefs(
    html: &str,
    hrefs: &[String],
    route: &str,
) -> Result<(), String> {
    let found = modulepreload_hrefs(html);
    for href in hrefs {
        let count = found.iter().filter(|item| *item == href).count();
        if count != 1 {
            return Err(format!(
                "Route '{route}' must contain exactly one modulepreload hint for '{href}', found {count}"
            ));
        }
    }
    Ok(())
}

fn modulepreload_hrefs(html: &str) -> Vec<String> {
    let Ok(tag_re) = Regex::new(r#"(?i)<link\b[^>]*\brel\s*=\s*['"]modulepreload['"][^>]*>"#)
    else {
        return Vec::new();
    };
    let Ok(href_re) = Regex::new(r#"(?i)\bhref\s*=\s*['"]([^'"]+)['"]"#) else {
        return Vec::new();
    };
    let mut hrefs = Vec::new();
    for tag in tag_re.find_iter(html) {
        if let Some(captures) = href_re.captures(tag.as_str()) {
            if let Some(href) = captures.get(1) {
                hrefs.push(unescape_attr(href.as_str()));
            }
        }
    }
    hrefs
}

fn escape_attr(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('"', "&quot;")
        .replace('<', "&lt;")
}

fn unescape_attr(value: &str) -> String {
    value
        .replace("&quot;", "\"")
        .replace("&lt;", "<")
        .replace("&amp;", "&")
}

/// Byte index of a real `<name` or `</name` tag. Quoted attributes, comments,
/// and script/style raw text do not count.
fn find_tag_start(html: &str, name: &[u8], end_tag: bool) -> Option<usize> {
    let bytes = html.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] != b'<' {
            i += 1;
            continue;
        }
        if bytes[i..].starts_with(b"<!--") {
            i = comment_end(bytes, i + 4);
            continue;
        }
        let Some(tag_end) = scan_tag(bytes, i) else {
            i += 1;
            continue;
        };
        if let Some(raw_name) = rawtext_name(&bytes[i..tag_end]) {
            i = rawtext_end(bytes, tag_end, raw_name);
            continue;
        }
        if tag_name_matches(&bytes[i..tag_end], name, end_tag) {
            return Some(i);
        }
        i = tag_end;
    }
    None
}

fn scan_tag(bytes: &[u8], start: usize) -> Option<usize> {
    if bytes.get(start) != Some(&b'<') {
        return None;
    }
    let mut i = start + 1;
    if bytes.get(i) == Some(&b'/') {
        i += 1;
    }
    if !bytes.get(i).is_some_and(|byte| byte.is_ascii_alphabetic()) {
        return None;
    }
    let mut quote = None;
    while i < bytes.len() {
        let byte = bytes[i];
        if let Some(active) = quote {
            if byte == active {
                quote = None;
            }
        } else if byte == b'"' || byte == b'\'' {
            quote = Some(byte);
        } else if byte == b'>' {
            return Some(i + 1);
        }
        i += 1;
    }
    None
}

fn tag_name_matches(tag: &[u8], name: &[u8], end_tag: bool) -> bool {
    if tag.first() != Some(&b'<') {
        return false;
    }
    let mut i = 1;
    let is_end = tag.get(i) == Some(&b'/');
    if is_end {
        i += 1;
    }
    if is_end != end_tag || tag.len() < i + name.len() + 1 {
        return false;
    }
    if !tag[i..i + name.len()].eq_ignore_ascii_case(name) {
        return false;
    }
    matches!(
        tag[i + name.len()],
        b' ' | b'\t' | b'\n' | b'\r' | b'/' | b'>'
    )
}

fn rawtext_name(tag: &[u8]) -> Option<&'static [u8]> {
    if tag_name_matches(tag, b"script", false) {
        Some(b"script")
    } else if tag_name_matches(tag, b"style", false) {
        Some(b"style")
    } else {
        None
    }
}

fn comment_end(bytes: &[u8], from: usize) -> usize {
    let mut i = from;
    while i + 2 < bytes.len() {
        if bytes[i] == b'-' && bytes[i + 1] == b'-' && bytes[i + 2] == b'>' {
            return i + 3;
        }
        i += 1;
    }
    bytes.len()
}

fn rawtext_end(bytes: &[u8], from: usize, name: &[u8]) -> usize {
    let mut i = from;
    while i + 2 + name.len() < bytes.len() {
        let end_name = i + 2 + name.len();
        let boundary = bytes[end_name];
        if bytes[i] == b'<'
            && bytes[i + 1] == b'/'
            && bytes[i + 2..end_name].eq_ignore_ascii_case(name)
            && matches!(boundary, b' ' | b'\t' | b'\n' | b'\r' | b'>' | b'/')
        {
            if let Some(offset) = bytes[end_name..].iter().position(|byte| *byte == b'>') {
                return end_name + offset + 1;
            }
        }
        i += 1;
    }
    bytes.len()
}

pub(crate) fn inject_script_once(html: &str, script_src: &str, marker_attr: &str) -> String {
    if html.contains(script_src) {
        return html.to_string();
    }
    let script_tag =
        format!("<script type=\"module\" src=\"{script_src}\" {marker_attr}></script>");
    if html.contains("</body>") {
        return html.replacen("</body>", &format!("{script_tag}</body>"), 1);
    }
    format!("{html}{script_tag}")
}

pub(crate) fn inject_stylesheet_link_once(
    html: &str,
    css_href: &str,
    route: &str,
) -> Result<String, String> {
    let anchor = "<!-- ZENITH_STYLES_ANCHOR -->";
    let css_link = format!("<link href=\"{}\" rel=\"stylesheet\">", css_href);
    let anchor_count = html.matches(anchor).count();

    let updated = match anchor_count {
        1 => html.replacen(anchor, &css_link, 1),
        0 => {
            let stylesheet_count = count_stylesheet_links(html)?;
            match stylesheet_count {
                1 => replace_single_stylesheet_link(html, &css_link)?,
                0 => {
                    if html.contains("</head>") {
                        html.replacen("</head>", &format!("{}\n</head>", css_link), 1)
                    } else if html.contains("<head>") {
                        html.replacen("<head>", &format!("<head>\n{}", css_link), 1)
                    } else {
                        format!("{}\n{}", css_link, html)
                    }
                }
                _ => {
                    return Err(format!(
                        "Route '{}' must contain exactly one ZENITH_STYLES_ANCHOR or one stylesheet link before emission, found anchors={} stylesheets={}",
                        route, anchor_count, stylesheet_count
                    ));
                }
            }
        }
        _ => {
            return Err(format!(
                "Route '{}' must contain exactly one ZENITH_STYLES_ANCHOR before emission, found {}",
                route, anchor_count
            ));
        }
    };

    if updated.contains(anchor) {
        return Err(format!(
            "Route '{}' retained ZENITH_STYLES_ANCHOR after stylesheet injection",
            route
        ));
    }
    let stylesheet_count = count_stylesheet_links(&updated)?;
    if stylesheet_count != 1 {
        return Err(format!(
            "Route '{}' must contain exactly one stylesheet link, found {}",
            route, stylesheet_count
        ));
    }
    if updated.matches(&format!("href=\"{}\"", css_href)).count() != 1 {
        return Err(format!(
            "Route '{}' must contain exactly one stylesheet link for '{}'",
            route, css_href
        ));
    }

    Ok(updated)
}

fn count_stylesheet_links(html: &str) -> Result<usize, String> {
    let stylesheet_re = Regex::new(r#"(?i)<link\b[^>]*\brel\s*=\s*['"]stylesheet['"][^>]*>"#)
        .map_err(|e| format!("failed to compile stylesheet link regex: {e}"))?;
    Ok(stylesheet_re.find_iter(html).count())
}

fn replace_single_stylesheet_link(html: &str, replacement: &str) -> Result<String, String> {
    let stylesheet_re = Regex::new(r#"(?i)<link\b[^>]*\brel\s*=\s*['"]stylesheet['"][^>]*>"#)
        .map_err(|e| format!("failed to compile stylesheet link rewrite regex: {e}"))?;

    let mut replaced = false;
    let rewritten = stylesheet_re
        .replace_all(html, |captures: &regex::Captures| {
            if replaced {
                captures
                    .get(0)
                    .map(|m| m.as_str().to_string())
                    .unwrap_or_default()
            } else {
                replaced = true;
                replacement.to_string()
            }
        })
        .into_owned();

    if !replaced {
        return Err("expected existing stylesheet link to rewrite".to_string());
    }
    Ok(rewritten)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn modulepreload_hints_keep_existing_workaround_and_skip_duplicates() {
        let html = "<!DOCTYPE html><html><head><link rel=\"modulepreload\" href=\"https://cdn.example/site-workaround.js\"></head><body></body></html>";
        let hrefs = vec![
            "https://cdn.example/site-workaround.js".to_string(),
            "/app/assets/runtime.abc.js".to_string(),
        ];
        let updated = inject_modulepreload_hints(html, &hrefs);
        assert_eq!(
            updated
                .matches("https://cdn.example/site-workaround.js")
                .count(),
            1
        );
        assert_eq!(updated.matches("/app/assets/runtime.abc.js").count(), 1);
        assert!(
            updated.contains("<link rel=\"modulepreload\" href=\"/app/assets/runtime.abc.js\">")
        );
        assert!(!updated.contains("crossorigin"));
        ensure_unique_modulepreload_hrefs(&updated, &hrefs, "/").unwrap();
    }

    #[test]
    fn modulepreload_hints_skip_head_close_inside_attributes_comments_and_scripts() {
        let html = "<!DOCTYPE html><html><head lang=\"en\"><meta name=\"description\" content=\"Learn about </head>\"><!-- </head> --><script>const marker = \"</head>\";</script><style>.x::before{content:\"</head>\"}</style></HEAD><body></body></html>";
        let hrefs = vec!["/assets/runtime.abc.js".to_string()];
        let updated = inject_modulepreload_hints(html, &hrefs);
        let hint = "<link rel=\"modulepreload\" href=\"/assets/runtime.abc.js\">";
        assert!(updated.contains(
            "<meta name=\"description\" content=\"Learn about </head>\"><!-- </head> --><script>const marker = \"</head>\";</script><style>.x::before{content:\"</head>\"}</style>"
        ));
        assert!(updated.contains(&format!("{hint}\n</HEAD>")));
        assert_eq!(updated.matches(hint).count(), 1);
        ensure_unique_modulepreload_hrefs(&updated, &hrefs, "/").unwrap();
    }
}
