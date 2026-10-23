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
