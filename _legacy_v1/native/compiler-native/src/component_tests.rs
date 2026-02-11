
#[cfg(test)]
mod tests {
    use super::*;
    use crate::validate::{TemplateNode, ElementNode, SourceLocation, ExpressionIR};
    use std::collections::HashMap;

    fn mock_loc() -> SourceLocation {
        SourceLocation { line: 1, column: 1 }
    }

    #[test]
    fn test_extract_slots_default() {
        let children = vec![
            TemplateNode::Element(ElementNode {
                tag: "div".to_string(),
                attributes: vec![],
                children: vec![],
                location: mock_loc(),
                loop_context: None,
            })
        ];
        
        let slots = extract_slots("Card", children, None);
        assert_eq!(slots.default.len(), 1);
        assert!(slots.named.is_empty());
    }

    #[test]
    fn test_extract_slots_named() {
        let header_node = TemplateNode::Component(crate::validate::ComponentNode {
            name: "Card.Header".to_string(),
            attributes: vec![],
            children: vec![
                TemplateNode::Element(ElementNode {
                    tag: "h1".to_string(),
                    attributes: vec![],
                    children: vec![],
                    location: mock_loc(),
                    loop_context: None,
                })
            ],
            location: mock_loc(),
            loop_context: None,
        });
        
        let children = vec![header_node];
        
        let slots = extract_slots("Card", children, None);
        assert!(slots.default.is_empty());
        assert_eq!(slots.named.get("header").unwrap().len(), 1);
    }
    
    #[test]
    fn test_rename_symbols_simple() {
        let code = "const a = 1; let b = 2; console.log(a, b);";
        let mut map = HashMap::new();
        map.insert("a".to_string(), "a_1".to_string());
        map.insert("b".to_string(), "b_1".to_string());
        
        let renamed = rename_symbols_safe(code, &map);
        assert!(renamed.contains("const a_1 = 1"));
        assert!(renamed.contains("let b_1 = 2"));
        assert!(renamed.contains("console.log(a_1, b_1)"));
    }
    
    #[test]
    fn test_rename_symbols_object_property() {
        let code = "const a = 1; const obj = { a: a, b: 2 };";
        let mut map = HashMap::new();
        map.insert("a".to_string(), "a_1".to_string());
        
        let renamed = rename_symbols_safe(code, &map);
        
        // Expected: const a_1 = 1; const obj = { a: a_1, b: 2 };
        // Ideally we preserve the property key 'a'.
        
        assert!(renamed.contains("const a_1 = 1"));
        // Check that property key 'a' is preserved but value is renamed
        // Regex to check structure approximately
        assert!(renamed.contains("a: a_1")); 
    }
    
    #[test]
    fn test_rename_symbols_shorthand() {
        let code = "const a = 1; const obj = { a };";
        let mut map = HashMap::new();
        map.insert("a".to_string(), "a_1".to_string());
        
        let renamed = rename_symbols_safe(code, &map);
        
        // Expected: const a_1 = 1; const obj = { a: a_1 };
        assert!(renamed.contains("const a_1 = 1"));
        assert!(renamed.contains("a: a_1"));
    }
}
