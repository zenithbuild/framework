pub fn serialize_js_string_literal(value: &str) -> String {
    let mut out = String::with_capacity(value.len() + 2);
    out.push('"');
    for ch in value.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\u{08}' => out.push_str("\\b"),
            '\u{0C}' => out.push_str("\\f"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            '\u{2028}' => out.push_str("\\u2028"),
            '\u{2029}' => out.push_str("\\u2029"),
            ch if ch <= '\u{1F}' => push_unicode_escape(&mut out, ch),
            ch => out.push(ch),
        }
    }
    out.push('"');
    out
}

pub fn serialize_js_template_literal(value: &str) -> String {
    let mut out = String::with_capacity(value.len() + 2);
    out.push('`');

    let chars = value.chars().collect::<Vec<_>>();
    let mut index = 0usize;
    while index < chars.len() {
        let ch = chars[index];
        match ch {
            '`' => out.push_str("\\`"),
            '\\' => out.push_str("\\\\"),
            '$' if index + 1 < chars.len() && chars[index + 1] == '{' => {
                out.push_str("\\${");
                index += 1;
            }
            '\0' => out.push_str("\\0"),
            '\r' => out.push_str("\\r"),
            '\u{2028}' => out.push_str("\\u2028"),
            '\u{2029}' => out.push_str("\\u2029"),
            ch if is_disallowed_template_control(ch) => push_unicode_escape(&mut out, ch),
            ch => out.push(ch),
        }
        index += 1;
    }

    out.push('`');
    out
}

fn is_disallowed_template_control(ch: char) -> bool {
    let code = ch as u32;
    matches!(ch, '\u{0008}' | '\u{000C}') || (code < 0x20 && !matches!(ch, '\n' | '\t'))
}

fn push_unicode_escape(out: &mut String, ch: char) {
    let code = ch as u32;
    out.push_str("\\u");
    out.push_str(&format!("{code:04X}"));
}

#[cfg(test)]
mod tests {
    use super::{serialize_js_string_literal, serialize_js_template_literal};

    #[test]
    fn string_literal_serializer_escapes_js_sensitive_content() {
        let input = "\"quote\" \\ slash\nline\u{2028}sep";
        let serialized = serialize_js_string_literal(input);

        assert_eq!(serialized, "\"\\\"quote\\\" \\\\ slash\\nline\\u2028sep\"");
    }

    #[test]
    fn template_literal_serializer_escapes_backticks_and_interpolation_openers() {
        let input = "raw `tick` ${danger}\\path\u{2029}";
        let serialized = serialize_js_template_literal(input);

        assert_eq!(serialized, "`raw \\`tick\\` \\${danger}\\\\path\\u2029`");
    }
}
