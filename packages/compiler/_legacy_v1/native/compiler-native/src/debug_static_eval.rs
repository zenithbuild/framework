use std::collections::HashMap;

// Mock functions to replicate static_eval.rs behavior
fn static_eval(expr: &str, props: &HashMap<String, String>) -> Option<String> {
    let mut trimmed = expr.trim().to_string();
    while trimmed.ends_with(';') || trimmed.ends_with('\n') {
        trimmed.pop();
    }
    let mut trimmed_str = trimmed.trim();

    // Aggressive Zenith Qualification Strip
    if trimmed_str.contains("__ZENITH_SCOPES__") {
        if let Some(last_dot) = trimmed_str.rfind('.') {
            trimmed_str = &trimmed_str[last_dot + 1..];
        }
    } else if trimmed_str.starts_with("locals.") || trimmed_str.starts_with("state.") {
        if let Some(first_dot) = trimmed_str.find('.') {
            trimmed_str = &trimmed_str[first_dot + 1..];
        }
    }

    // Attempt verification logic
    if trimmed_str == "pageTitle" {
        return Some("Zenith | Home".to_string()); // Mock successful lookup
    }

    None
}

fn main() {
    let input = "window.__ZENITH_SCOPES__[\"inst0\"].locals.pageTitle;";
    let props = HashMap::new();
    let result = static_eval(input, &props);
    println!("Input: {}", input);
    println!("Result: {:?}", result);
}
