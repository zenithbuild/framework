//! CSS Buffer and Pruning Module
//!
//! Handles buffering CSS from .zen files and pruning unused classes
//! using lightningcss with ZenManifest.css_classes as the allow-list.
//!
//! Uses AST-based pruning via lightningcss to ensure safety and correctness.

use dashmap::DashMap;
use lightningcss::rules::CssRule;
use lightningcss::selector::Component;
use lightningcss::stylesheet::{MinifyOptions, ParserOptions, PrinterOptions, StyleSheet};
use lightningcss::targets::Browsers;
use std::collections::HashSet;

/// Thread-safe CSS buffer for collecting styles from .zen files
#[derive(Debug)]
pub struct CssBuffer {
    /// CSS content keyed by file path
    styles: DashMap<String, String>,
}

impl CssBuffer {
    pub fn new() -> Self {
        Self {
            styles: DashMap::new(),
        }
    }

    /// Insert CSS content for a file
    pub fn insert(&self, file_id: String, css: String) {
        self.styles.insert(file_id, css);
    }

    /// Get all buffered CSS
    pub fn get_all(&self) -> Vec<String> {
        self.styles.iter().map(|r| r.value().clone()).collect()
    }

    /// Stitch all CSS and prune unused classes
    ///
    /// Strategy:
    /// 1. Parse the CSS into AST using lightningcss
    /// 2. Walk the AST and remove rules/selectors that allow pruning
    /// 3. Minify and print the result
    pub fn stitch_and_prune(&self, used_classes: &[String]) -> Result<String, String> {
        let all_css: String = self
            .styles
            .iter()
            .map(|r| r.value().clone())
            .collect::<Vec<_>>()
            .join("\n");

        if all_css.is_empty() {
            return Ok(String::new());
        }

        // Build allow-list from used classes
        let used_set: HashSet<&str> = used_classes.iter().map(|s| s.as_str()).collect();

        // 1. Parse CSS
        let mut stylesheet = StyleSheet::parse(&all_css, ParserOptions::default())
            .map_err(|e| format!("CSS parse error: {:?}", e))?;

        // 2. Prune AST (Recursive)
        // Accessing rules directly requires ensuring we can iterate mutably
        let rules_vec = &mut stylesheet.rules.0;
        prune_rules(rules_vec, &used_set);

        // 3. Minify and Print

        stylesheet
            .minify(MinifyOptions {
                targets: Browsers::default().into(),
                ..Default::default()
            })
            .map_err(|e| format!("CSS minify error: {:?}", e))?;

        let result = stylesheet
            .to_css(PrinterOptions {
                minify: true,
                ..Default::default()
            })
            .map_err(|e| format!("CSS print error: {:?}", e))?;

        Ok(result.code)
    }

    /// Clear all buffered CSS
    pub fn clear(&self) {
        self.styles.clear();
    }
}

impl Default for CssBuffer {
    fn default() -> Self {
        Self::new()
    }
}

/// Recursively prune CSS rules
///
/// Returns true if rule should be kept, false if it should be removed (if single rule context)
/// But here we operate on Vec<CssRule>, so we use retain_mut.
fn prune_rules(rules: &mut Vec<CssRule>, used_set: &HashSet<&str>) {
    rules.retain_mut(|rule| {
        match rule {
            CssRule::Style(style_rule) => {
                // Filter selectors in this rule
                // style_rule.selectors is SelectorList.

                // We iterate and keep selectors that are "used"
                style_rule
                    .selectors
                    .0
                    .retain(|selector| is_selector_used(selector, used_set));

                // Determine if we keep the rule:
                // If NO selectors remain, the rule is empty and should be removed.
                !style_rule.selectors.0.is_empty()
            }
            CssRule::Media(media_rule) => {
                // Recursively prune rules inside @media
                // media_rule.rules is CssRuleList (which wraps Vec<CssRule>).
                // Access via .0
                prune_rules(&mut media_rule.rules.0, used_set);

                // Keep media rule only if it still has rules inside
                !media_rule.rules.0.is_empty()
            }
            CssRule::Supports(supports_rule) => {
                prune_rules(&mut supports_rule.rules.0, used_set);
                !supports_rule.rules.0.is_empty()
            }
            // For other rules (Keyframes, FontFace, etc.), we keep them ALWAYS.
            // We do not prune keyframes based on usage yet (harder analysis).
            _ => true,
        }
    });
}

/// Determine if a selector usage deems it valid to keep.
///
/// POLICY: CONSERVATIVE
/// - If selector has NO classes -> KEEP (Element, ID, *, etc.)
/// - If selector has ANY class that is in `used_set` -> KEEP.
/// - Only remove if ALL classes in the selector are KNOWN UNUSED.
fn is_selector_used(selector: &lightningcss::selector::Selector, used_set: &HashSet<&str>) -> bool {
    let mut has_classes = false;
    let mut any_used = false;

    // Iterate over components in the selector
    // Selector iteration yields &Component
    for component in selector.iter() {
        if let Component::Class(ident) = component {
            has_classes = true;
            // ident is Atom or similar string-like. as_ref() works for AsRef<str>.
            if used_set.contains(ident.as_ref()) {
                any_used = true;
            }
        }
    }

    if !has_classes {
        // No classes involved (e.g. "div", "#app", "*"), so keep it.
        return true;
    }

    // Has classes. Keep ONLY if at least one class is used.
    any_used
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_css_buffer_insert_and_get() {
        let buffer = CssBuffer::new();
        buffer.insert("a.zen".into(), ".foo { color: red; }".into());
        buffer.insert("b.zen".into(), ".bar { color: blue; }".into());

        let all = buffer.get_all();
        assert_eq!(all.len(), 2);
    }

    #[test]
    fn test_css_stitch_and_minify() {
        let buffer = CssBuffer::new();
        buffer.insert("a.zen".into(), ".foo { color: red; }".into());

        let result = buffer.stitch_and_prune(&["foo".into()]).unwrap();
        assert!(result.contains("color:") || result.contains("color:red"));
    }

    #[test]
    fn test_css_pruning_removes_unused() {
        let buffer = CssBuffer::new();
        buffer.insert(
            "a.zen".into(),
            ".foo { color: red; } .bar { color: blue; } .baz { color: green; }".into(),
        );

        // Only "foo" is used, "bar" and "baz" should be pruned
        let result = buffer.stitch_and_prune(&["foo".into()]).unwrap();
        assert!(
            result.contains("red"),
            "Should keep .foo (used): {}",
            result
        );
        assert!(
            !result.contains("blue"),
            "Should prune .bar (unused): {}",
            result
        );
        assert!(
            !result.contains("green"),
            "Should prune .baz (unused): {}",
            result
        );
    }

    #[test]
    fn test_keeps_element_selectors() {
        let buffer = CssBuffer::new();
        buffer.insert(
            "a.zen".into(),
            "body { margin: 0; } h1 { font-size: 2rem; }".into(),
        );

        // Element selectors should always be kept
        let result = buffer.stitch_and_prune(&[]).unwrap();
        assert!(
            result.contains("margin") || result.contains("0"),
            "Should keep body selector: {}",
            result
        );
    }

    #[test]
    fn test_keeps_id_selectors() {
        let buffer = CssBuffer::new();
        buffer.insert("a.zen".into(), "#app { display: flex; }".into());

        // ID selectors should always be kept
        let result = buffer.stitch_and_prune(&[]).unwrap();
        assert!(
            result.contains("flex"),
            "Should keep #app selector: {}",
            result
        );
    }

    #[test]
    fn test_keeps_used_class_in_compound() {
        let buffer = CssBuffer::new();
        buffer.insert("a.zen".into(), ".foo.bar { color: red; }".into());

        // If either class is used, keep the rule
        let result = buffer.stitch_and_prune(&["foo".into()]).unwrap();
        assert!(
            result.contains("red"),
            "Should keep .foo.bar when foo is used: {}",
            result
        );
    }
}
