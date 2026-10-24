use oxc_allocator::Allocator;
use oxc_parser::Parser;
use oxc_span::SourceType;
use zenith_bundler::utils::generate_virtual_entry;
use zenith_bundler::CompilerOutput;

fn assert_module_parses(source: &str) {
    let allocator = Allocator::default();
    let parser = Parser::new(&allocator, source, SourceType::default().with_module(true));
    let result = parser.parse();

    assert!(
        result.errors.is_empty(),
        "virtual entry must remain parseable without downstream cleanup: {:?}\nsource:\n{}",
        result.errors,
        source
    );
}

#[test]
fn virtual_entry_serialization_needs_no_post_emit_cleanup_for_escape_sensitive_payloads() {
    let output = CompilerOutput {
        html: "<div data-note=\"`tick` ${hole}\u{2028}\">line\nnext</div>".into(),
        expressions: vec![
            "\"quote\"\n\\\\path".into(),
            "\u{0008}\u{000C}\u{0000}\t".into(),
        ],
        ..CompilerOutput::default()
    };

    let entry = generate_virtual_entry(&output);

    assert!(
        entry.contains(r#"<div data-note="\`tick\` \${hole}\u2028">line"#),
        "html payload must stay compiler-serialized, got: {}",
        entry
    );
    assert!(
        entry.contains(r#"\"quote\"\n\\\\path"#),
        "expression payload must preserve quotes, newlines, and backslashes, got: {}",
        entry
    );
    assert!(
        entry.contains(r#"\b\f\u0000\t"#),
        "control characters must stay serialized in the virtual entry, got: {}",
        entry
    );

    assert_module_parses(&entry);
}
