//! Safety Gate Tests for Zenith Compiler Invariants
//!
//! These tests verify structural invariants that must hold at compile-time:
//! - Z-ERR-ORPHAN-SLOT: All <slot> tags must be resolved before output
//! - Template node structure correctness

#[cfg(test)]
mod tests {
    use crate::validate::{
        AttributeIR, AttributeValue, ElementNode, ExpressionIR, SourceLocation, TemplateNode,
        TextNode,
    };

    fn mock_loc() -> SourceLocation {
        SourceLocation { line: 1, column: 1 }
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // Z-ERR-ORPHAN-SLOT: Slot Detection and Resolution Verification
    // ═══════════════════════════════════════════════════════════════════════════════

    fn is_slot_tag(tag: &str) -> bool {
        tag == "slot" || tag == "Slot"
    }

    fn find_orphan_slots(nodes: &[TemplateNode]) -> Vec<&ElementNode> {
        let mut orphans = Vec::new();
        for node in nodes {
            collect_orphan_slots(node, &mut orphans);
        }
        orphans
    }

    fn collect_orphan_slots<'a>(node: &'a TemplateNode, orphans: &mut Vec<&'a ElementNode>) {
        match node {
            TemplateNode::Element(el) => {
                if is_slot_tag(&el.tag) {
                    orphans.push(el);
                }
                for child in &el.children {
                    collect_orphan_slots(child, orphans);
                }
            }
            TemplateNode::ConditionalFragment(cf) => {
                for n in &cf.consequent {
                    collect_orphan_slots(n, orphans);
                }
                for n in &cf.alternate {
                    collect_orphan_slots(n, orphans);
                }
            }
            TemplateNode::OptionalFragment(of) => {
                for n in &of.fragment {
                    collect_orphan_slots(n, orphans);
                }
            }
            TemplateNode::LoopFragment(lf) => {
                for n in &lf.body {
                    collect_orphan_slots(n, orphans);
                }
            }
            _ => {}
        }
    }

    #[test]
    fn test_slot_lowercase_detection() {
        let nodes = vec![TemplateNode::Element(ElementNode {
            tag: "slot".to_string(),
            attributes: vec![],
            children: vec![],
            location: mock_loc(),
            loop_context: None,
        })];

        let orphans = find_orphan_slots(&nodes);
        assert_eq!(orphans.len(), 1, "Should detect lowercase slot");
        assert_eq!(orphans[0].tag, "slot");
    }

    #[test]
    fn test_slot_uppercase_detection() {
        let nodes = vec![TemplateNode::Element(ElementNode {
            tag: "Slot".to_string(),
            attributes: vec![],
            children: vec![],
            location: mock_loc(),
            loop_context: None,
        })];

        let orphans = find_orphan_slots(&nodes);
        assert_eq!(orphans.len(), 1, "Should detect uppercase Slot");
        assert_eq!(orphans[0].tag, "Slot");
    }

    #[test]
    fn test_nested_slot_detection() {
        let nodes = vec![TemplateNode::Element(ElementNode {
            tag: "div".to_string(),
            attributes: vec![],
            children: vec![TemplateNode::Element(ElementNode {
                tag: "slot".to_string(),
                attributes: vec![],
                children: vec![],
                location: mock_loc(),
                loop_context: None,
            })],
            location: mock_loc(),
            loop_context: None,
        })];

        let orphans = find_orphan_slots(&nodes);
        assert_eq!(orphans.len(), 1, "Should detect nested slot");
    }

    #[test]
    fn test_no_slots_clean() {
        let nodes = vec![TemplateNode::Element(ElementNode {
            tag: "div".to_string(),
            attributes: vec![],
            children: vec![TemplateNode::Text(TextNode {
                value: "Hello".to_string(),
                location: mock_loc(),
                loop_context: None,
            })],
            location: mock_loc(),
            loop_context: None,
        })];

        let orphans = find_orphan_slots(&nodes);
        assert_eq!(
            orphans.len(),
            0,
            "No orphan slots expected in clean template"
        );
    }

    #[test]
    fn test_multiple_slots_detection() {
        let nodes = vec![
            TemplateNode::Element(ElementNode {
                tag: "slot".to_string(),
                attributes: vec![AttributeIR {
                    name: "name".to_string(),
                    value: AttributeValue::Static("header".to_string()),
                    location: mock_loc(),
                    loop_context: None,
                }],
                children: vec![],
                location: mock_loc(),
                loop_context: None,
            }),
            TemplateNode::Element(ElementNode {
                tag: "main".to_string(),
                attributes: vec![],
                children: vec![],
                location: mock_loc(),
                loop_context: None,
            }),
            TemplateNode::Element(ElementNode {
                tag: "slot".to_string(),
                attributes: vec![AttributeIR {
                    name: "name".to_string(),
                    value: AttributeValue::Static("footer".to_string()),
                    location: mock_loc(),
                    loop_context: None,
                }],
                children: vec![],
                location: mock_loc(),
                loop_context: None,
            }),
        ];

        let orphans = find_orphan_slots(&nodes);
        assert_eq!(orphans.len(), 2, "Should detect both named slots");
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // TEMPLATE STRUCTURE VALIDATION
    // ═══════════════════════════════════════════════════════════════════════════════

    #[test]
    fn test_element_with_attributes() {
        let node = TemplateNode::Element(ElementNode {
            tag: "button".to_string(),
            attributes: vec![AttributeIR {
                name: "class".to_string(),
                value: AttributeValue::Static("btn-primary".to_string()),
                location: mock_loc(),
                loop_context: None,
            }],
            children: vec![],
            location: mock_loc(),
            loop_context: None,
        });

        if let TemplateNode::Element(el) = node {
            assert_eq!(el.tag, "button");
            assert_eq!(el.attributes.len(), 1);
            assert_eq!(el.attributes[0].name, "class");
        }
    }

    #[test]
    fn test_dynamic_attribute_value() {
        let expr = ExpressionIR {
            id: "expr_1".to_string(),
            code: "dynamicClass".to_string(),
            location: mock_loc(),
            loop_context: None,
        };

        let attr = AttributeIR {
            name: "class".to_string(),
            value: AttributeValue::Dynamic(expr),
            location: mock_loc(),
            loop_context: None,
        };

        match &attr.value {
            AttributeValue::Dynamic(e) => {
                assert_eq!(e.code, "dynamicClass");
            }
            _ => panic!("Expected dynamic attribute"),
        }
    }

    #[test]
    fn test_static_vs_dynamic_detection() {
        let attrs = vec![
            AttributeIR {
                name: "id".to_string(),
                value: AttributeValue::Static("my-id".to_string()),
                location: mock_loc(),
                loop_context: None,
            },
            AttributeIR {
                name: "class".to_string(),
                value: AttributeValue::Dynamic(ExpressionIR {
                    id: "expr_1".to_string(),
                    code: "className".to_string(),
                    location: mock_loc(),
                    loop_context: None,
                }),
                location: mock_loc(),
                loop_context: None,
            },
        ];

        let dynamic_count = attrs
            .iter()
            .filter(|a| matches!(&a.value, AttributeValue::Dynamic(_)))
            .count();
        let static_count = attrs
            .iter()
            .filter(|a| matches!(&a.value, AttributeValue::Static(_)))
            .count();

        assert_eq!(dynamic_count, 1);
        assert_eq!(static_count, 1);
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // SERIALIZATION ROUNDTRIP TESTS
    // ═══════════════════════════════════════════════════════════════════════════════

    #[test]
    fn test_template_node_serialization() {
        let node = TemplateNode::Element(ElementNode {
            tag: "div".to_string(),
            attributes: vec![],
            children: vec![TemplateNode::Text(TextNode {
                value: "test".to_string(),
                location: mock_loc(),
                loop_context: None,
            })],
            location: mock_loc(),
            loop_context: None,
        });

        let json = serde_json::to_string(&node).expect("Should serialize");
        assert!(json.contains("\"type\":\"element\""));
        assert!(json.contains("\"tag\":\"div\""));

        let parsed: TemplateNode = serde_json::from_str(&json).expect("Should deserialize");
        if let TemplateNode::Element(el) = parsed {
            assert_eq!(el.tag, "div");
        } else {
            panic!("Expected Element");
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // PHASE 3 ENHANCEMENT 2: IDENTIFIER BINDING AUDIT TESTS
    // Verifies all assignment target patterns are correctly rewritten
    // ═══════════════════════════════════════════════════════════════════════════════

    use crate::jsx_lowerer::ScriptRenamer;
    use oxc_allocator::Allocator;
    use oxc_ast_visit::VisitMut;
    use oxc_codegen::Codegen;
    use oxc_parser::Parser;
    use oxc_span::SourceType;
    use std::collections::HashSet;

    fn transform_code_with_guards(
        code: &str,
        state_bindings: &HashSet<String>,
        disallow_reactive_access: bool,
        is_event_handler: bool,
    ) -> (String, Vec<String>) {
        let allocator = Allocator::default();
        let source_type = SourceType::default()
            .with_module(true)
            .with_typescript(true);
        let mut ret = Parser::new(&allocator, code, source_type).parse();

        let mut renamer = ScriptRenamer::with_categories(
            &allocator,
            state_bindings.clone(),
            HashSet::new(),
            HashSet::new(),
            HashSet::new(),
        );
        renamer.disallow_reactive_access = disallow_reactive_access;
        renamer.is_event_handler = is_event_handler;
        renamer.visit_program(&mut ret.program);

        (Codegen::new().build(&ret.program).code, renamer.errors)
    }

    fn transform_code(code: &str, state_bindings: &HashSet<String>) -> String {
        transform_code_with_guards(code, state_bindings, false, false).0
    }

    #[test]
    fn test_update_expression_increment() {
        // count++ should become scope.state.count++
        let mut state = HashSet::new();
        state.insert("count".to_string());

        let result = transform_code("count++;", &state);
        assert!(
            result.contains("scope.state.count++"),
            "count++ should be rewritten to scope.state.count++, got: {}",
            result
        );
        assert!(
            !result.contains("return count"),
            "Bare 'count' should not survive: {}",
            result
        );
    }

    #[test]
    fn test_update_expression_decrement() {
        // --count should become --scope.state.count
        let mut state = HashSet::new();
        state.insert("count".to_string());

        let result = transform_code("--count;", &state);
        assert!(
            result.contains("--scope.state.count"),
            "--count should be rewritten to --scope.state.count, got: {}",
            result
        );
    }

    #[test]
    fn test_compound_assignment() {
        // count += 1 should become scope.state.count += 1
        let mut state = HashSet::new();
        state.insert("count".to_string());

        let result = transform_code("count += 1;", &state);
        assert!(
            result.contains("scope.state.count += 1"),
            "count += 1 should be rewritten, got: {}",
            result
        );
    }

    #[test]
    fn test_logical_assignment() {
        // count ||= 0 should become scope.state.count ||= 0
        let mut state = HashSet::new();
        state.insert("count".to_string());

        let result = transform_code("count ||= 0;", &state);
        assert!(
            result.contains("scope.state.count") && result.contains("||="),
            "count ||= 0 should be rewritten, got: {}",
            result
        );
    }

    #[test]
    fn test_simple_expression() {
        // count + 1 should become scope.state.count + 1
        let mut state = HashSet::new();
        state.insert("count".to_string());

        let result = transform_code("count + 1;", &state);
        assert!(
            result.contains("scope.state.count + 1"),
            "count + 1 should be rewritten, got: {}",
            result
        );
    }

    #[test]
    fn test_scope_root_protection() {
        // 'scope' identifier should never be renamed
        let mut state = HashSet::new();
        state.insert("scope".to_string()); // Try to add scope as a state binding

        let result = transform_code("scope.state.count;", &state);
        // scope should NOT become scope.state.scope
        assert!(
            !result.contains("scope.state.scope"),
            "scope root should be protected from renaming, got: {}",
            result
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // REACTIVITY GUARDRAIL TESTS (Phase A7 & A8)
    // ═══════════════════════════════════════════════════════════════════════════════

    #[test]
    fn test_disallow_reactive_reads_in_run() {
        let mut state = HashSet::new();
        state.insert("count".to_string());

        let (_, errors) = transform_code_with_guards("console.log(count);", &state, true, false);
        assert!(
            errors.iter().any(|e| e.contains("Z-ERR-RUN-REACTIVE")),
            "Should error on reactive read in __run()"
        );
    }

    #[test]
    fn test_disallow_reactive_writes_in_run() {
        let mut state = HashSet::new();
        state.insert("count".to_string());

        let (_, errors) = transform_code_with_guards("count = 10;", &state, true, false);
        assert!(
            errors.iter().any(|e| e.contains("Z-ERR-RUN-REACTIVE")),
            "Should error on reactive write in __run()"
        );
    }

    #[test]
    fn test_disallow_state_writes_in_expressions() {
        let mut state = HashSet::new();
        state.insert("count".to_string());

        // Expression (not event handler)
        let (_, errors) = transform_code_with_guards("count = 5", &state, false, false);
        assert!(
            errors
                .iter()
                .any(|e| e.contains("Z-ERR-REACTIVITY-BOUNDARY")),
            "Should error on state write in pure expression (non-handler)"
        );
    }

    #[test]
    fn test_allow_state_writes_in_event_handlers() {
        let mut state = HashSet::new();
        state.insert("count".to_string());

        // Event handler context
        let (_, errors) = transform_code_with_guards("count = 5", &state, false, true);
        assert!(
            errors.is_empty(),
            "Should ALLOW state write in event handler context, got: {:?}",
            errors
        );
    }
}
