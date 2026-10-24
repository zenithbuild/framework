use super::strip_ts_param_annotations;

// ── Positive: annotations that must be stripped ──────────────

#[test]
fn single_string_param() {
    assert_eq!(
        strip_ts_param_annotations("items.map((item: string) => item)"),
        "items.map((item) => item)"
    );
}

#[test]
fn two_params() {
    assert_eq!(
        strip_ts_param_annotations("items.map((item: any, index: number) => item)"),
        "items.map((item, index) => item)"
    );
}

#[test]
fn generic_type() {
    assert_eq!(
        strip_ts_param_annotations("items.map((item: Record<string, any>) => item)"),
        "items.map((item) => item)"
    );
}

#[test]
fn array_type() {
    assert_eq!(
        strip_ts_param_annotations("items.map((item: Array<string>) => item)"),
        "items.map((item) => item)"
    );
}

#[test]
fn rest_param() {
    assert_eq!(
        strip_ts_param_annotations("fn((...args: string[]) => args)"),
        "fn((...args) => args)"
    );
}

#[test]
fn destructured_param() {
    assert_eq!(
        strip_ts_param_annotations("fn(({ a, b }: Props) => a)"),
        "fn(({ a, b }) => a)"
    );
}

#[test]
fn default_value_preserved() {
    assert_eq!(
        strip_ts_param_annotations("fn((x: string = \"hi\") => x)"),
        "fn((x = \"hi\") => x)"
    );
}

#[test]
fn nested_arrows() {
    assert_eq!(
        strip_ts_param_annotations(
            "a.map((x: string) => b.filter((y: number) => y))"
        ),
        "a.map((x) => b.filter((y) => y))"
    );
}

// ── Negative: expressions that must NOT be changed ──────────

#[test]
fn ternary_untouched() {
    let expr = "a ? b : c";
    assert_eq!(strip_ts_param_annotations(expr), expr);
}

#[test]
fn object_literal_untouched() {
    let expr = "({ key: value })";
    assert_eq!(strip_ts_param_annotations(expr), expr);
}

#[test]
fn string_colon_untouched() {
    let expr = "\"text:text\"";
    assert_eq!(strip_ts_param_annotations(expr), expr);
}

#[test]
fn template_colon_untouched() {
    let expr = "`text:text`";
    assert_eq!(strip_ts_param_annotations(expr), expr);
}

#[test]
fn no_annotation_passthrough() {
    let expr = "items.map((item) => item)";
    assert_eq!(strip_ts_param_annotations(expr), expr);
}

#[test]
fn no_arrow_passthrough() {
    let expr = "foo(bar, baz)";
    assert_eq!(strip_ts_param_annotations(expr), expr);
}

#[test]
fn mixed_expression_only_arrow_stripped() {
    assert_eq!(
        strip_ts_param_annotations(
            "condition ? items.map((x: string) => x) : fallback"
        ),
        "condition ? items.map((x) => x) : fallback"
    );
}

#[test]
fn function_type_annotation_stripped() {
    assert_eq!(
        strip_ts_param_annotations(
            "fn((cb: (a: number) => void) => cb)"
        ),
        "fn((cb) => cb)"
    );
}
