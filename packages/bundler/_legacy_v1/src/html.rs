//! HTML Injector Module
//!
//! Injects hashed asset links into index.html:
//! - `<script type="module" src="...">` for the Entry Chunk
//! - `<link rel="stylesheet">` for the CSS Asset
//! - `<link rel="modulepreload">` for critical chunks

/// Asset information for HTML injection
#[derive(Debug, Clone)]
pub struct AssetInfo {
    pub filename: String,
    pub is_entry: bool,
    pub is_css: bool,
}

/// The HTML Injector that updates index.html with hashed asset paths
pub struct HtmlInjector {
    /// Template HTML content
    template: String,
}

impl HtmlInjector {
    pub fn new(template: String) -> Self {
        Self { template }
    }

    /// Load template from file
    pub fn from_file(path: &str) -> Result<Self, std::io::Error> {
        let template = std::fs::read_to_string(path)?;
        Ok(Self::new(template))
    }

    /// Inject asset references into the HTML template
    pub fn inject(&self, assets: &[AssetInfo], preload_chunks: &[String]) -> String {
        let mut html = self.template.clone();

        // Build injection strings
        let mut script_tags = String::new();
        let mut css_links = String::new();
        let mut preload_links = String::new();

        // CSS links
        for asset in assets.iter().filter(|a| a.is_css) {
            css_links.push_str(&format!(
                r#"    <link rel="stylesheet" href="/{}">"#,
                asset.filename
            ));
            css_links.push('\n');
        }

        // Modulepreload for critical chunks
        for chunk in preload_chunks {
            preload_links.push_str(&format!(
                r#"    <link rel="modulepreload" href="/{}">"#,
                chunk
            ));
            preload_links.push('\n');
        }

        // Entry script (should be last, after preloads)
        for asset in assets.iter().filter(|a| a.is_entry && !a.is_css) {
            script_tags.push_str(&format!(
                r#"    <script type="module" src="/{}"></script>"#,
                asset.filename
            ));
            script_tags.push('\n');
        }

        // Inject before </head>
        let head_injection = format!("{}{}", css_links, preload_links);
        if let Some(pos) = html.find("</head>") {
            html.insert_str(pos, &head_injection);
        }

        // Inject scripts before </body>
        if let Some(pos) = html.find("</body>") {
            html.insert_str(pos, &script_tags);
        }

        html
    }

    /// Generate a minimal HTML template if none exists
    pub fn generate_default(title: &str) -> String {
        format!(
            r#"<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{}</title>
</head>
<body>
    <div id="app"></div>
</body>
</html>
"#,
            title
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_inject_assets() {
        let template = r#"<!DOCTYPE html>
<html>
<head>
    <title>Test</title>
</head>
<body>
    <div id="app"></div>
</body>
</html>"#;

        let injector = HtmlInjector::new(template.to_string());
        let assets = vec![
            AssetInfo {
                filename: "app-x82z.js".into(),
                is_entry: true,
                is_css: false,
            },
            AssetInfo {
                filename: "zenith-abc1.css".into(),
                is_entry: false,
                is_css: true,
            },
        ];
        let preloads = vec!["runtime-core-def2.js".into()];

        let result = injector.inject(&assets, &preloads);

        assert!(result.contains(r#"<link rel="stylesheet" href="/zenith-abc1.css">"#));
        assert!(result.contains(r#"<link rel="modulepreload" href="/runtime-core-def2.js">"#));
        assert!(result.contains(r#"<script type="module" src="/app-x82z.js"></script>"#));
    }

    #[test]
    fn test_generate_default_template() {
        let html = HtmlInjector::generate_default("My App");
        assert!(html.contains("<title>My App</title>"));
        assert!(html.contains("<div id=\"app\"></div>"));
    }
}
