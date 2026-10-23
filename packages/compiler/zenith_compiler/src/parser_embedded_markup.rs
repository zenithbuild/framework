/// Detect HTML/component markup tags inside expression text.
///
/// Returns `true` if the expression contains patterns like `<div`, `</div`,
/// `<MyComponent` — i.e. `<` (optionally `/`) followed by an ASCII letter
/// and then another letter, digit, or whitespace/`>`.
///
/// Returns `false` for comparison operators (`x < 10`), generic syntax
/// (`fn<T>(x)`), and arrow expressions (`x => ...`).
///
/// Heuristic: a "markup tag" is `<` followed by an optional `/`, then an
/// ASCII letter, then at least one more ident char or whitespace/`>`/`/`.
/// Single-letter generics like `<T>` are allowed because the second char is
/// `>` which doesn't qualify as an ident continuation.
pub(super) fn contains_markup_tag(raw: &str) -> bool {
    let chars: Vec<char> = raw.chars().collect();
    let len = chars.len();
    let mut i = 0;

    while i < len {
        // Skip string literals to avoid false matches inside strings.
        let c = chars[i];
        if c == '"' || c == '\'' || c == '`' {
            i += 1;
            let quote = c;
            while i < len {
                if chars[i] == '\\' {
                    i += 2; // skip escaped char
                    continue;
                }
                if chars[i] == quote {
                    i += 1;
                    break;
                }
                i += 1;
            }
            continue;
        }

        if c == '<' {
            let mut j = i + 1;

            // Optional '/' for closing tags.
            let is_closing = j < len && chars[j] == '/';
            if is_closing {
                j += 1;
            }

            // Must have at least one ASCII letter.
            if j < len && chars[j].is_ascii_alphabetic() {
                let tag_start = j;
                // Consume the full tag name: letters, digits, hyphens.
                while j < len && (chars[j].is_ascii_alphanumeric() || chars[j] == '-') {
                    j += 1;
                }
                let tag_name_len = j - tag_start;

                // A single uppercase letter followed by '>' is a generic: <T>.
                // Allow that. Single-letter lowercase tags (<a>, <p>) are real markup.
                let boundary =
                    j >= len || chars[j].is_whitespace() || chars[j] == '>' || chars[j] == '/';
                if !boundary {
                    i += 1;
                    continue;
                }

                if tag_name_len > 1 {
                    return true;
                }

                let tag_initial = chars[tag_start];
                if tag_initial.is_ascii_lowercase() {
                    return true;
                }
            }
        }

        i += 1;
    }

    false
}

pub(super) fn lower_embedded_markup_expression(raw: &str) -> String {
    if !contains_markup_tag(raw) {
        return raw.to_string();
    }

    let bytes = raw.as_bytes();
    let mut out = String::new();
    let mut i = 0usize;
    let mut quote: Option<u8> = None;
    let mut escaped = false;
    while i < bytes.len() {
        let b = bytes[i];
        if let Some(q) = quote {
            let ch = raw[i..].chars().next().expect("valid UTF-8 boundary");
            out.push(ch);
            if escaped {
                escaped = false;
                i += ch.len_utf8();
                continue;
            }
            if ch == '\\' {
                escaped = true;
                i += ch.len_utf8();
                continue;
            }
            if ch == q as char {
                quote = None;
            }
            i += ch.len_utf8();
            continue;
        }

        if b == b'\'' || b == b'"' || b == b'`' {
            quote = Some(b);
            out.push(b as char);
            i += 1;
            continue;
        }

        if b == b'<' {
            if let Some((markup, end)) = read_markup_literal(raw, i) {
                assert_embedded_markup_safe(&markup);
                out.push_str("__zenith_fragment");
                out.push_str(&markup_literal_to_template(&markup));
                i = end;
                continue;
            }
        }

        let ch = raw[i..].chars().next().expect("valid UTF-8 boundary");
        out.push(ch);
        i += ch.len_utf8();
    }

    out
}

fn read_markup_literal(source: &str, start: usize) -> Option<(String, usize)> {
    if source.as_bytes().get(start).copied() != Some(b'<') {
        return None;
    }

    let first = read_tag_token(source, start)?;
    if first.is_closing {
        return None;
    }
    if first.self_closing {
        return Some((source[start..first.end].to_string(), first.end));
    }

    let mut stack = vec![first.name];
    let mut cursor = first.end;

    while cursor < source.len() {
        let next_rel = source[cursor..].find('<')?;
        let next = cursor + next_rel;
        let token = match read_tag_token(source, next) {
            Some(token) => token,
            None => {
                cursor = next + 1;
                continue;
            }
        };
        cursor = token.end;

        if token.self_closing {
            continue;
        }

        if token.is_closing {
            let expected = stack.last().cloned()?;
            if token.name != expected {
                return None;
            }
            stack.pop();
            if stack.is_empty() {
                return Some((source[start..token.end].to_string(), token.end));
            }
            continue;
        }

        stack.push(token.name);
    }

    None
}

#[derive(Debug, Clone)]
struct TagToken {
    name: String,
    is_closing: bool,
    self_closing: bool,
    end: usize,
}

fn read_tag_token(source: &str, start: usize) -> Option<TagToken> {
    let bytes = source.as_bytes();
    if bytes.get(start).copied() != Some(b'<') {
        return None;
    }

    let mut i = start + 1;
    let mut is_closing = false;
    if i < bytes.len() && bytes[i] == b'/' {
        is_closing = true;
        i += 1;
    }

    if i >= bytes.len() {
        return None;
    }
    let first = bytes[i];
    if !((first as char).is_ascii_alphabetic() || first == b'_') {
        return None;
    }

    let name_start = i;
    while i < bytes.len() {
        let ch = bytes[i];
        let ok = (ch as char).is_ascii_alphanumeric() || ch == b':' || ch == b'_' || ch == b'-';
        if !ok {
            break;
        }
        i += 1;
    }
    if i == name_start {
        return None;
    }
    let name = source[name_start..i].to_string();

    let mut quote: Option<u8> = None;
    let mut escaped = false;
    let mut brace_depth = 0usize;

    while i < bytes.len() {
        let ch = bytes[i];
        if let Some(q) = quote {
            if escaped {
                escaped = false;
                i += 1;
                continue;
            }
            if ch == b'\\' {
                escaped = true;
                i += 1;
                continue;
            }
            if ch == q {
                quote = None;
            }
            i += 1;
            continue;
        }

        if ch == b'\'' || ch == b'"' || ch == b'`' {
            quote = Some(ch);
            i += 1;
            continue;
        }
        if ch == b'{' {
            brace_depth += 1;
            i += 1;
            continue;
        }
        if ch == b'}' {
            if brace_depth > 0 {
                brace_depth -= 1;
            }
            i += 1;
            continue;
        }
        if ch == b'>' && brace_depth == 0 {
            let segment = &source[start..(i + 1)];
            let self_closing = !is_closing && segment.trim_end().ends_with("/>");
            return Some(TagToken {
                name,
                is_closing,
                self_closing,
                end: i + 1,
            });
        }
        i += 1;
    }

    None
}

fn markup_literal_to_template(markup: &str) -> String {
    let bytes = markup.as_bytes();
    let mut out = String::from("`");
    let mut i = 0usize;

    while i < bytes.len() {
        let b = bytes[i];
        if b == b'{' {
            if let Some((content, end)) = read_balanced_braces(markup, i) {
                let lowered_content = lower_embedded_markup_expression(content.trim());
                if is_attribute_expression_start(markup, i) {
                    out.push_str("\"${");
                    out.push_str(&lowered_content);
                    out.push_str("}\"");
                } else {
                    out.push_str("${");
                    out.push_str(&lowered_content);
                    out.push('}');
                }
                i = end;
                continue;
            }
        }

        if b == b'`' {
            out.push_str("\\`");
            i += 1;
            continue;
        }
        if b == b'\\' {
            out.push_str("\\\\");
            i += 1;
            continue;
        }
        if b == b'$' && i + 1 < bytes.len() && bytes[i + 1] == b'{' {
            out.push_str("\\${");
            i += 2;
            continue;
        }

        let ch = markup[i..].chars().next().expect("valid UTF-8 boundary");
        out.push(ch);
        i += ch.len_utf8();
    }

    out.push('`');
    out
}

fn read_balanced_braces(source: &str, start: usize) -> Option<(String, usize)> {
    let bytes = source.as_bytes();
    if bytes.get(start).copied() != Some(b'{') {
        return None;
    }

    let mut i = start + 1;
    let mut depth = 1usize;
    let mut quote: Option<u8> = None;
    let mut escaped = false;
    let mut out = String::new();
    while i < bytes.len() {
        let b = bytes[i];

        if let Some(q) = quote {
            let ch = source[i..].chars().next().expect("valid UTF-8 boundary");
            out.push(ch);
            if escaped {
                escaped = false;
                i += ch.len_utf8();
                continue;
            }
            if ch == '\\' {
                escaped = true;
                i += ch.len_utf8();
                continue;
            }
            if ch == q as char {
                quote = None;
            }
            i += ch.len_utf8();
            continue;
        }

        if b == b'\'' || b == b'"' || b == b'`' {
            quote = Some(b);
            out.push(b as char);
            i += 1;
            continue;
        }

        if b == b'{' {
            depth += 1;
            out.push('{');
            i += 1;
            continue;
        }
        if b == b'}' {
            depth -= 1;
            if depth == 0 {
                return Some((out, i + 1));
            }
            out.push('}');
            i += 1;
            continue;
        }

        let ch = source[i..].chars().next().expect("valid UTF-8 boundary");
        out.push(ch);
        i += ch.len_utf8();
    }

    None
}

fn is_attribute_expression_start(markup: &str, brace_start: usize) -> bool {
    if brace_start == 0 {
        return false;
    }
    let bytes = markup.as_bytes();
    let mut i = brace_start;
    while i > 0 {
        i -= 1;
        let b = bytes[i];
        if (b as char).is_ascii_whitespace() {
            continue;
        }
        return b == b'=';
    }
    false
}

fn assert_embedded_markup_safe(markup: &str) {
    let mut cursor = 0usize;
    while cursor < markup.len() {
        let Some(rel) = markup[cursor..].find('<') else {
            break;
        };
        let start = cursor + rel;
        let Some(token) = read_tag_token(markup, start) else {
            cursor = start + 1;
            continue;
        };

        if token.name.eq_ignore_ascii_case("script") {
            panic!(
                "Embedded markup security gate: <script> tags are forbidden inside expressions."
            );
        }

        if !token.is_closing {
            let segment = &markup[start..token.end];
            if tag_contains_string_event_handler(segment) {
                panic!(
                    "Embedded markup security gate: string event handlers are forbidden inside expressions. Use on:event={{handler}}."
                );
            }
        }

        cursor = token.end;
    }
}

fn tag_contains_string_event_handler(tag_segment: &str) -> bool {
    let bytes = tag_segment.as_bytes();
    let mut i = 0usize;
    while i + 3 < bytes.len() {
        let b0 = bytes[i];
        let b1 = bytes[i + 1];
        if (b0 == b'o' || b0 == b'O') && (b1 == b'n' || b1 == b'N') {
            if i > 0 {
                let prev = bytes[i - 1];
                if !((prev as char).is_ascii_whitespace() || prev == b'<' || prev == b'/') {
                    i += 1;
                    continue;
                }
            }

            let mut j = i + 2;
            while j < bytes.len() {
                let ch = bytes[j];
                let ok =
                    (ch as char).is_ascii_alphanumeric() || ch == b':' || ch == b'_' || ch == b'-';
                if !ok {
                    break;
                }
                j += 1;
            }
            if j == i + 2 {
                i += 1;
                continue;
            }

            while j < bytes.len() && (bytes[j] as char).is_ascii_whitespace() {
                j += 1;
            }
            if j >= bytes.len() || bytes[j] != b'=' {
                i += 1;
                continue;
            }
            j += 1;
            while j < bytes.len() && (bytes[j] as char).is_ascii_whitespace() {
                j += 1;
            }
            if j < bytes.len() && (bytes[j] == b'"' || bytes[j] == b'\'') {
                return true;
            }
        }
        i += 1;
    }
    false
}
