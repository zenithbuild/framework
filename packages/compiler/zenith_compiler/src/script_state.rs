#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct StateDeclaration {
    pub(crate) statement_start: usize,
    pub(crate) keyword_start: usize,
    pub(crate) keyword_end: usize,
    pub(crate) name: String,
}

pub(crate) fn normalize_state_declarations(source: &str) -> (String, Vec<StateDeclaration>) {
    let bytes = source.as_bytes();
    let mut normalized = bytes.to_vec();
    let mut declarations = Vec::new();
    let mut i = 0usize;
    let mut brace_depth = 0usize;
    let mut regex_allowed = true;
    let mut template_stack: Vec<usize> = Vec::new();

    while i < bytes.len() {
        match bytes[i] {
            b'\'' | b'"' => {
                i = skip_quoted(bytes, i);
                regex_allowed = false;
            }
            b'`' => {
                i += 1;
                while i < bytes.len() {
                    match bytes[i] {
                        b'\\' => i = (i + 2).min(bytes.len()),
                        b'`' => {
                            i += 1;
                            break;
                        }
                        b'$' if i + 1 < bytes.len() && bytes[i + 1] == b'{' => {
                            template_stack.push(brace_depth);
                            i += 2;
                            break;
                        }
                        _ => i += 1,
                    }
                }
                regex_allowed = false;
            }
            b'/' if i + 1 < bytes.len() && bytes[i + 1] == b'/' => i = skip_line_comment(bytes, i),
            b'/' if i + 1 < bytes.len() && bytes[i + 1] == b'*' => i = skip_block_comment(bytes, i),
            b'/' if regex_allowed => {
                i = skip_regex_literal(bytes, i);
                regex_allowed = false;
            }
            b'{' => {
                brace_depth += 1;
                regex_allowed = true;
                i += 1;
            }
            b'}' => {
                if let Some(previous_depth) = template_stack.last().copied() {
                    if brace_depth == previous_depth {
                        template_stack.pop();
                        i += 1;
                        while i < bytes.len() {
                            match bytes[i] {
                                b'\\' => i = (i + 2).min(bytes.len()),
                                b'`' => {
                                    i += 1;
                                    break;
                                }
                                b'$' if i + 1 < bytes.len() && bytes[i + 1] == b'{' => {
                                    template_stack.push(brace_depth);
                                    i += 2;
                                    break;
                                }
                                _ => i += 1,
                            }
                        }
                        regex_allowed = false;
                        continue;
                    }
                }
                brace_depth = brace_depth.saturating_sub(1);
                regex_allowed = false;
                i += 1;
            }
            ch if is_identifier_start(ch) => {
                let end = scan_identifier(bytes, i);
                if brace_depth == 0
                    && &source[i..end] == "state"
                    && is_boundary_before(bytes, i)
                    && is_boundary_after(bytes, end)
                {
                    let mut cursor = skip_space(bytes, end);
                    let name_start = cursor;
                    if cursor < bytes.len() && is_identifier_start(bytes[cursor]) {
                        cursor = scan_identifier(bytes, cursor);
                        let name = &source[name_start..cursor];
                        let next = skip_space(bytes, cursor);
                        if next < bytes.len() && bytes[next] == b'=' {
                            normalized[i..end].copy_from_slice(b"const");
                            declarations.push(StateDeclaration {
                                statement_start: i,
                                keyword_start: i,
                                keyword_end: end,
                                name: name.to_string(),
                            });
                        }
                    }
                }
                regex_allowed = false;
                i = end;
            }
            ch if ch.is_ascii_digit() => {
                i = skip_number(bytes, i);
                regex_allowed = false;
            }
            b'(' | b'[' | b',' | b';' | b':' | b'?' | b'=' => {
                regex_allowed = true;
                i += 1;
            }
            b'.' | b')' | b']' => {
                regex_allowed = false;
                i += 1;
            }
            _ => {
                regex_allowed = !bytes[i].is_ascii_whitespace();
                i += 1;
            }
        }
    }

    (
        String::from_utf8(normalized).unwrap_or_else(|_| source.to_string()),
        declarations,
    )
}

fn is_identifier_start(ch: u8) -> bool {
    ch == b'_' || ch == b'$' || ch.is_ascii_alphabetic()
}

fn is_identifier_continue(ch: u8) -> bool {
    is_identifier_start(ch) || ch.is_ascii_digit()
}

fn scan_identifier(bytes: &[u8], mut i: usize) -> usize {
    while i < bytes.len() && is_identifier_continue(bytes[i]) {
        i += 1;
    }
    i
}

fn skip_space(bytes: &[u8], mut i: usize) -> usize {
    while i < bytes.len() && bytes[i].is_ascii_whitespace() {
        i += 1;
    }
    i
}

fn is_boundary_before(bytes: &[u8], start: usize) -> bool {
    start == 0 || !is_identifier_continue(bytes[start - 1])
}

fn is_boundary_after(bytes: &[u8], end: usize) -> bool {
    end >= bytes.len() || !is_identifier_continue(bytes[end])
}

fn skip_quoted(bytes: &[u8], start: usize) -> usize {
    let quote = bytes[start];
    let mut i = start + 1;
    while i < bytes.len() {
        if bytes[i] == b'\\' {
            i = (i + 2).min(bytes.len());
            continue;
        }
        if bytes[i] == quote {
            return i + 1;
        }
        i += 1;
    }
    bytes.len()
}

fn skip_line_comment(bytes: &[u8], start: usize) -> usize {
    let mut i = start + 2;
    while i < bytes.len() && bytes[i] != b'\n' {
        i += 1;
    }
    i
}

fn skip_block_comment(bytes: &[u8], start: usize) -> usize {
    let mut i = start + 2;
    while i + 1 < bytes.len() {
        if bytes[i] == b'*' && bytes[i + 1] == b'/' {
            return i + 2;
        }
        i += 1;
    }
    bytes.len()
}

fn skip_number(bytes: &[u8], start: usize) -> usize {
    let mut i = start;
    while i < bytes.len() && (bytes[i].is_ascii_alphanumeric() || matches!(bytes[i], b'.' | b'_')) {
        i += 1;
    }
    i
}

fn skip_regex_literal(bytes: &[u8], start: usize) -> usize {
    let mut i = start + 1;
    let mut in_class = false;
    while i < bytes.len() {
        match bytes[i] {
            b'\\' => i = (i + 2).min(bytes.len()),
            b'[' => {
                in_class = true;
                i += 1;
            }
            b']' => {
                in_class = false;
                i += 1;
            }
            b'/' if !in_class => {
                i += 1;
                while i < bytes.len() && bytes[i].is_ascii_alphabetic() {
                    i += 1;
                }
                return i;
            }
            _ => i += 1,
        }
    }
    bytes.len()
}
