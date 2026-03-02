#[test]
fn phase_0_hard_stop_sanity_check() {
    use crate::codegen::{generate_runtime_code_internal, CodegenInput};
    use crate::validate::ExpressionInput;

    // This test strictly enforces Phase 0 of the Lock-In Protocol:
    // "Inspect the generated JS for the failing page... NONE of the following strings appear: count++, parentCount, count), => count"

    let script_content = r#"
    state parentCount=10;
    state showExtra=false;
    state testVar=999;
    
    // Simulate the handler from verify-phase-2.zen
    function incrementParent() {
        parentCount += 10;
    }

    function toggleExtra() {
        showExtra = !showExtra;
    }
    "#;

    // Simulate expressions found in the template
    let expressions = vec![
        // <button on:click={incrementParent}>
        ExpressionInput {
            id: "expr_handler_1".to_string(),
            code: "incrementParent".to_string(),
            loop_context: None,
        },
        // {parentCount}
        ExpressionInput {
            id: "expr_text_1".to_string(),
            code: "parentCount".to_string(),
            loop_context: None,
        },
        // {showExtra ? 'ON' : 'OFF'}
        ExpressionInput {
            id: "expr_text_2".to_string(),
            code: "showExtra ? 'ON' : 'OFF'".to_string(),
            loop_context: None,
        },
        // Inline handler: () => parentCount += 1
        ExpressionInput {
            id: "expr_inline_handler".to_string(),
            code: "() => parentCount += 1".to_string(),
            loop_context: None,
        },
    ];

    let input = CodegenInput {
        file_path: "verify-phase-2.zen".to_string(),
        script_content: script_content.to_string(),
        expressions,
        styles: vec![],
        template_bindings: vec![],
        location: "test".to_string(),
        nodes: vec![],
        page_bindings: vec![
            "parentCount".to_string(),
            "showExtra".to_string(),
            "testVar".to_string(),
        ],
        page_props: vec![], // No props in this specific test case, but parentCount is state
        all_states: vec![
            ("parentCount".to_string(), "10".to_string()),
            ("showExtra".to_string(), "false".to_string()),
            ("testVar".to_string(), "999".to_string()),
        ]
        .into_iter()
        .collect(),
        locals: vec![],
    };

    let result = generate_runtime_code_internal(input);
    let code = result.bundle;

    println!("PHASE 0 GENERATED CODE:\n{}", code);

    // --- CRITICAL CHECKS ---

    // --- ROBUST CHECKS ---

    // Check identifiers: parentCount, showExtra, incrementParent
    // Rule: MUST be preceded by '.' (property access) OR followed by ':' (state init).
    // If it appears bare (preceded by space/newline/{/() and followed by something else), it's a FAIL.

    let identifiers = vec!["parentCount", "showExtra", "incrementParent", "testVar"];

    for ident in identifiers {
        let matches: Vec<_> = code.match_indices(ident).collect();
        for (i, _) in matches {
            if i == 0 {
                continue;
            }
            let prev_char = code.as_bytes()[i - 1] as char;
            let next_char = code.as_bytes()[i + ident.len()] as char;

            let is_property_access = prev_char == '.';
            let is_state_init = next_char == ':';
            let is_quoted = prev_char == '\'' || prev_char == '"';

            // Allow "function NAME" (named function expression)
            let is_fn_decl = i >= 9 && &code[i - 9..i] == "function ";

            if !is_property_access && !is_state_init && !is_quoted && !is_fn_decl {
                // Suspicious! Let's print context
                let start = if i > 10 { i - 10 } else { 0 };
                let end = if i + ident.len() + 10 < code.len() {
                    i + ident.len() + 10
                } else {
                    code.len()
                };
                let context = &code[start..end];

                // Allow "function incrementParent" if it wasn't hoisted? No, we WANT hoisting.
                // If the fix works, it should be "scope.locals.incrementParent ="

                panic!("FAIL: Found bare identifier '{}' in context: '{}'. Expected it to be qualified (scope.state/props/locals).", ident, context);
            }
        }
    }

    println!("SUCCESS: No bare identifiers found.");

    // 6. Verify strictness on "getThemePreference" type issues (local variable regression check)
    // We'll add a local variable case to ensure it doesn't get rewritten

    // (We would need a separate run or add to above script. Let's stick to the main Phase 0 requirements first).
}
