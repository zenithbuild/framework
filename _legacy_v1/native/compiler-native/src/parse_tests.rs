#[cfg(test)]
mod tests {
    use crate::parse::parse_script;
    use crate::validate::ScriptIR;

    #[test]
    fn test_multi_script_extraction() {
        let html = r#"
            <script setup>
                const x = 1;
            </script>
            <div></div>
            <script>
                console.log(x);
            </script>
        "#;

        let script = parse_script(html).unwrap();
        assert!(script.raw.contains("const x = 1;"));
        assert!(script.raw.contains("console.log(x);"));
        // Ensure we didn't capture the div
        assert!(!script.raw.contains("<div></div>"));
    }

    #[test]
    fn test_script_with_attributes() {
        let html = r#"
            <script type="text/javascript" setup>
                const y = 2;
            </script>
        "#;
        let script = parse_script(html).unwrap();
        assert!(script.raw.contains("const y = 2;"));
        assert_eq!(
            script.attributes.get("type").map(|s| s.as_str()),
            Some("text/javascript")
        );
        assert_eq!(
            script.attributes.get("setup").map(|s| s.as_str()),
            Some("true")
        );
    }

    #[test]
    fn test_ignore_inline_script() {
        let html = r#"
            <script is:inline>
                console.log('inline');
            </script>
            <script setup>
                const z = 3;
            </script>
        "#;
        let script = parse_script(html).unwrap();
        assert!(!script.raw.contains("console.log('inline')"));
        assert!(script.raw.contains("const z = 3;"));
    }
    #[test]
    fn test_import_extraction() {
        let html = r#"
            <script setup>
                import DefaultLayout from '../layouts/DefaultLayout.zen';
                import { Header } from '../components/Header.zen';
                import React, { useState } from 'react';
            </script>
        "#;
        let script = parse_script(html).unwrap();
        assert!(script.bindings.contains(&"DefaultLayout".to_string()));
        assert!(script.bindings.contains(&"Header".to_string()));
        assert!(script.bindings.contains(&"React".to_string()));
        assert!(script.bindings.contains(&"useState".to_string()));
    }
}
