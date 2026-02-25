use crate::ast::{Attribute, ElementNode, Node};
use crate::lexer::{Lexer, Token};

pub struct Parser<'a> {
    lexer: Lexer<'a>,
    current_token: Token,
    embedded_markup_expressions: bool,
}

impl<'a> Parser<'a> {
    pub fn new(input: &'a str) -> Self {
        let mut lexer = Lexer::new(input);
        let current_token = lexer.next_token();
        Self {
            lexer,
            current_token,
            embedded_markup_expressions: false,
        }
    }

    pub fn new_with_options(input: &'a str, embedded_markup_expressions: bool) -> Self {
        let mut lexer = Lexer::new(input);
        let current_token = lexer.next_token();
        Self {
            lexer,
            current_token,
            embedded_markup_expressions,
        }
    }

    fn advance(&mut self) {
        self.current_token = self.lexer.next_token();
    }

    fn expect(&mut self, token: Token) {
        if self.current_token == token {
            self.advance();
        } else {
            panic!("Expected {:?}, found {:?}", token, self.current_token);
        }
    }

    pub fn parse(&mut self) -> Node {
        while let Token::Text(ref t) = self.current_token {
            if t.trim().is_empty() {
                self.advance();
            } else {
                break;
            }
        }

        let root = self.parse_node();

        // Check for multiple roots or trailing garbage
        while let Token::Text(ref t) = self.current_token {
            if t.trim().is_empty() {
                self.advance();
            } else {
                break;
            }
        }

        if self.current_token != Token::EOF {
            panic!(
                "Multiple root nodes detected or trailing content: {:?}",
                self.current_token
            );
        }

        root
    }

    fn parse_node(&mut self) -> Node {
        match self.current_token {
            Token::Lt => self.parse_element(),
            Token::LBrace => self.parse_expression(),
            Token::Text(_) => {
                if let Token::Text(text) = self.current_token.clone() {
                    self.advance();
                    Node::Text(text)
                } else {
                    unreachable!()
                }
            }
            // EOF handling handled by caller or panic
            _ => panic!("Unexpected token at top level: {:?}", self.current_token),
        }
    }

    fn parse_expression(&mut self) -> Node {
        // current_token is LBrace — the lexer already consumed the '{' char.
        // Do NOT call expect(Token::LBrace) / advance() because that would
        // call next_token() which in Text mode consumes the expression content.
        // Instead, assert and call lex_expression_content() directly.
        assert_eq!(
            self.current_token,
            Token::LBrace,
            "parse_expression called without LBrace"
        );
        let raw = self.lexer.lex_expression_content();
        // lex_expression_content consumed everything up to and including the closing '}'.
        // Re-sync current_token from the lexer.
        self.current_token = self.lexer.next_token();
        let content = self.contract_gate_expression(&raw);
        Node::Expression(content)
    }

    /// Contract gate: reject embedded markup tags inside expressions unless
    /// the `embeddedMarkupExpressions` flag is enabled.
    fn contract_gate_expression(&self, raw: &str) -> String {
        if self.embedded_markup_expressions {
            return lower_embedded_markup_expression(raw);
        }
        if contains_markup_tag(raw) {
            panic!(
                "Embedded markup expressions are disabled.\n\
                 Expression contains HTML/component tags: {{{}}}\n\
                 To enable, set embeddedMarkupExpressions: true in zenith.config.js\n\
                 Or refactor the expression to avoid inline markup.",
                raw.chars().take(80).collect::<String>()
            );
        }
        raw.to_string()
    }

    fn parse_element(&mut self) -> Node {
        self.expect(Token::Lt); // Eat '<'

        // Handling closing tag edge case: `</` comes as Lt -> Text("/") -> Ident -> Gt
        // But `parse_element` is called when we expect a new element `<div>`.
        // If we see `Text("/")`, it means we hit a closing tag where an opening was expected?
        // No, `parse_nodes` handles strictly.

        let tag_name = match &self.current_token {
            Token::Identifier(name) => name.clone(),
            _ => panic!("Expected tag name, found {:?}", self.current_token),
        };
        self.advance();

        let attributes = self.parse_attributes();

        if self.current_token == Token::SlashGt {
            self.advance(); // Eat '/>'
            return Node::Element(ElementNode {
                tag: tag_name,
                attributes,
                children: vec![],
                self_closing: true,
            });
        }

        self.expect(Token::Gt); // Eat '>'

        let children = self.parse_children(&tag_name);

        Node::Element(ElementNode {
            tag: tag_name,
            attributes,
            children,
            self_closing: false,
        })
    }

    fn parse_attributes(&mut self) -> Vec<Attribute> {
        let mut attributes = Vec::new();
        loop {
            match &self.current_token {
                Token::Identifier(name) => {
                    let name = name.clone();
                    self.advance();

                    if self.current_token == Token::Eq {
                        self.advance(); // Eat '='

                        if name == "ref" {
                            // ref attribute: must be expression binding with single identifier
                            if let Token::StringLiteral(_) = &self.current_token {
                                panic!("ref attribute does not accept string values. Use ref={{identifier}} syntax instead of ref=\"...\"");
                            }
                            if self.current_token != Token::LBrace {
                                panic!("ref attribute requires expression binding syntax: ref={{identifier}}");
                            }
                            self.advance(); // Eat '{'
                            let identifier = match &self.current_token {
                                Token::Identifier(v) => v.clone(),
                                _ => panic!(
                                    "ref attribute requires a single identifier, found {:?}",
                                    self.current_token
                                ),
                            };
                            self.advance();
                            self.expect(Token::RBrace);
                            attributes.push(Attribute::Ref { identifier });
                        } else if self.current_token == Token::LBrace {
                            // Expression or Event — use raw balanced capture.
                            // The lexer produced LBrace as current_token and is
                            // positioned right after the '{' char. Call
                            // lex_expression_content() directly (do NOT advance
                            // first, as that would consume the first content token).
                            let value = self.lexer.lex_expression_content();
                            self.current_token = self.lexer.next_token();
                            let value = self.contract_gate_expression(&value);

                            if name.starts_with("on:") {
                                attributes.push(Attribute::Event {
                                    name: name[3..].to_string(),
                                    handler: value,
                                });
                            } else {
                                attributes.push(Attribute::Expression { name, value });
                            }
                        } else if let Token::StringLiteral(value) = &self.current_token {
                            attributes.push(Attribute::Static {
                                name,
                                value: value.clone(),
                            });
                            self.advance();
                        } else {
                            panic!("Expected attribute value, found {:?}", self.current_token);
                        }
                    } else {
                        // Boolean attribute (static)
                        attributes.push(Attribute::Static {
                            name,
                            value: "true".to_string(),
                        });
                    }
                }
                Token::Gt | Token::SlashGt => break,
                _ => panic!("Unexpected token in attributes: {:?}", self.current_token),
            }
        }
        attributes
    }

    fn parse_children(&mut self, parent_tag: &str) -> Vec<Node> {
        let mut children = Vec::new();
        loop {
            match &self.current_token {
                Token::Lt => {
                    // Could be new element OR closing tag.
                    // Peek ahead? Lexer doesn't expose peek to Parser easily implies we need to peek token?
                    // But Parser has `current_token`. We can't peek `next_token` easily without consuming.
                    // Hack: Consume Lt. Check if next is `/`.
                    // But if it is distinct element, we consumed Lt.
                    // We need to implement `peek` or just consume and handle.

                    // Actually, closing tag sequence: Lt, Text("/"), Ident(parent), Gt.
                    // New element sequence: Lt, Ident(new), ...

                    // Let's consume Lt.
                    // Then `current_token` becomes next.
                    // If it is Text("/") -> Closing tag.
                    // If it is Ident -> New Element.

                    // Wait, `Parser` struct eats tokens.
                    // We need to be careful.

                    // Logic:
                    // 1. We start at some token.
                    // 2. If it is Lt:
                    //    Check next.

                    // Since I can't peek easily with this struct, I'll modify `parse_element` to NOT eat Lt?
                    // No, `parse_element` expects to be called AT Lt.

                    // Here in `parse_children`, we see Lt.
                    // We advance.
                    // Now `current_token` is Identifier or Text("/").
                    // If Text("/"):
                    //    Check if Identifier matches parent_tag.
                    //    If so, consume, consume Gt, return children.
                    // If Identifier:
                    //    Call `parse_element_internal(tag_name)`.

                    self.advance(); // Eat <

                    if let Token::Text(s) = &self.current_token {
                        if s == "/" {
                            // Closing tag candidate
                            self.advance(); // Eat /
                            if let Token::Identifier(name) = &self.current_token {
                                if name == parent_tag {
                                    self.advance(); // Eat tag name
                                    self.expect(Token::Gt); // Eat >
                                    return children;
                                } else {
                                    panic!(
                                        "Mismatched closing tag: expected </{}>, found </{}>",
                                        parent_tag, name
                                    );
                                }
                            } else {
                                panic!("Expected closing tag name, found {:?}", self.current_token);
                            }
                        }
                    }

                    // It wasn't a closing tag (or at least not </).
                    // Must be a child element.
                    // But we already consumed `<`.
                    // `parse_element` expects `<`.
                    // Quick fix: Refactor `parse_element` to split `start` logic.
                    // Or construct a new node manually?

                    // Better: `parse_element_tail` that assumes `<` is consumed.
                    let child = self.parse_element_tail();
                    children.push(child);
                }
                Token::EOF => panic!("Unexpected EOF while parsing children of <{}>", parent_tag),
                _ => {
                    // Text or Expression
                    children.push(self.parse_node());
                }
            }
        }
    }

    fn parse_element_tail(&mut self) -> Node {
        // Assumes '<' is already consumed.
        let tag_name = match &self.current_token {
            Token::Identifier(name) => name.clone(),
            _ => panic!("Expected tag name, found {:?}", self.current_token),
        };
        self.advance();

        let attributes = self.parse_attributes();

        if self.current_token == Token::SlashGt {
            self.advance(); // Eat '/>'
            return Node::Element(ElementNode {
                tag: tag_name,
                attributes,
                children: vec![],
                self_closing: true,
            });
        }

        self.expect(Token::Gt); // Eat '>'

        let children = self.parse_children(&tag_name);

        Node::Element(ElementNode {
            tag: tag_name,
            attributes,
            children,
            self_closing: false,
        })
    }
}

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
fn contains_markup_tag(raw: &str) -> bool {
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
                let boundary = j >= len || chars[j].is_whitespace() || chars[j] == '>' || chars[j] == '/';
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

fn lower_embedded_markup_expression(raw: &str) -> String {
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
            out.push(b as char);
            if escaped {
                escaped = false;
                i += 1;
                continue;
            }
            if b == b'\\' {
                escaped = true;
                i += 1;
                continue;
            }
            if b == q {
                quote = None;
            }
            i += 1;
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
                out.push_str("__zenith_fragment(");
                out.push_str(&markup_literal_to_template(&markup));
                out.push(')');
                i = end;
                continue;
            }
        }

        out.push(b as char);
        i += 1;
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

        out.push(b as char);
        i += 1;
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
            out.push(b as char);
            if escaped {
                escaped = false;
                i += 1;
                continue;
            }
            if b == b'\\' {
                escaped = true;
                i += 1;
                continue;
            }
            if b == q {
                quote = None;
            }
            i += 1;
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

        out.push(b as char);
        i += 1;
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
                let ok = (ch as char).is_ascii_alphanumeric() || ch == b':' || ch == b'_' || ch == b'-';
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
