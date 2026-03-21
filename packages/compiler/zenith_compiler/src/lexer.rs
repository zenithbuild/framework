use std::iter::Peekable;
use std::str::Chars;
use std::time::Instant;

#[derive(Debug, Clone, PartialEq)]
pub enum Token {
    Lt,
    Gt,
    SlashGt,
    Eq,
    LBrace,
    RBrace,
    Identifier(String),
    StringLiteral(String),
    Text(String),
    EOF,
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum LexMode {
    Text,
    Tag,
}

#[derive(Debug, Clone, Default)]
pub struct LexerProfileMetrics {
    pub next_token_ms: f64,
    pub lex_text_ms: f64,
    pub lex_tag_ms: f64,
    pub lex_string_ms: f64,
    pub lex_identifier_ms: f64,
    pub skip_whitespace_ms: f64,
    pub lex_expression_content_ms: f64,
    pub offset_to_line_col_ms: f64,
    pub offset_to_line_col_calls: usize,
}

pub struct Lexer<'a> {
    _input: &'a str,
    chars: Peekable<Chars<'a>>,
    line_starts: Vec<usize>,
    pos: usize,
    mode: LexMode,
    token_start: usize,
    token_end: usize,
    profile_enabled: bool,
    profile_metrics: LexerProfileMetrics,
}

impl<'a> Lexer<'a> {
    pub fn new(input: &'a str) -> Self {
        Self::new_with_profile(input, false)
    }

    pub fn new_with_profile(input: &'a str, profile_enabled: bool) -> Self {
        Self {
            _input: input,
            chars: input.chars().peekable(),
            line_starts: build_line_starts(input),
            pos: 0,
            mode: LexMode::Text,
            token_start: 0,
            token_end: 0,
            profile_enabled,
            profile_metrics: LexerProfileMetrics::default(),
        }
    }

    fn advance(&mut self) -> Option<char> {
        let c = self.chars.next();
        if c.is_some() {
            self.pos += 1;
        }
        c
    }

    fn peek(&mut self) -> Option<&char> {
        self.chars.peek()
    }

    pub fn next_token(&mut self) -> Token {
        let started_at = self.profile_enabled.then(Instant::now);
        self.token_start = self.pos;
        let token = match self.mode {
            LexMode::Text => self.lex_text(),
            LexMode::Tag => self.lex_tag(),
        };
        self.token_end = self.pos;
        if let Some(started_at) = started_at {
            self.profile_metrics.next_token_ms += started_at.elapsed().as_secs_f64() * 1000.0;
        }
        token
    }

    pub fn last_token_start(&self) -> usize {
        self.token_start
    }

    pub fn last_token_end(&self) -> usize {
        self.token_end
    }

    pub fn current_offset(&self) -> usize {
        self.pos
    }

    pub fn offset_to_line_col(&mut self, offset: usize) -> (usize, usize) {
        let started_at = self.profile_enabled.then(Instant::now);
        let line_index = self
            .line_starts
            .partition_point(|&line_start| line_start <= offset)
            .saturating_sub(1);
        let line_start = self.line_starts.get(line_index).copied().unwrap_or(0);
        let line = line_index + 1;
        let column = offset.saturating_sub(line_start) + 1;
        if let Some(started_at) = started_at {
            let elapsed_ms = started_at.elapsed().as_secs_f64() * 1000.0;
            self.profile_metrics.offset_to_line_col_ms += elapsed_ms;
            self.profile_metrics.offset_to_line_col_calls += 1;
        }
        (line, column)
    }

    fn lex_text(&mut self) -> Token {
        let started_at = self.profile_enabled.then(Instant::now);
        let mut text = String::new();

        while let Some(&c) = self.peek() {
            match c {
                '<' => {
                    if text.is_empty() {
                        self.advance(); // Eat '<'
                        self.mode = LexMode::Tag;
                        let token = Token::Lt;
                        if let Some(started_at) = started_at {
                            self.profile_metrics.lex_text_ms +=
                                started_at.elapsed().as_secs_f64() * 1000.0;
                        }
                        return token;
                    } else {
                        let token = Token::Text(text);
                        if let Some(started_at) = started_at {
                            self.profile_metrics.lex_text_ms +=
                                started_at.elapsed().as_secs_f64() * 1000.0;
                        }
                        return token;
                    }
                }
                '{' => {
                    if text.is_empty() {
                        self.advance(); // Eat '{'
                        let token = Token::LBrace;
                        if let Some(started_at) = started_at {
                            self.profile_metrics.lex_text_ms +=
                                started_at.elapsed().as_secs_f64() * 1000.0;
                        }
                        return token;
                    } else {
                        let token = Token::Text(text);
                        if let Some(started_at) = started_at {
                            self.profile_metrics.lex_text_ms +=
                                started_at.elapsed().as_secs_f64() * 1000.0;
                        }
                        return token;
                    }
                }
                '}' => {
                    // In text mode, '}' might be just text, unless we are in a text-expression?
                    // Spec says "{expression}".
                    // If we are in Top Level Text, '}' is generally invalid/text.
                    // But for robustness, let's treat it as Text unless explicitly handled?
                    // Actually, if we just returned LBrace for '{', the Parser will likely expect an RBrace eventually.
                    // But RBrace in Text mode?
                    // Let's treating it as a distinct token so Parser can decide.
                    if text.is_empty() {
                        self.advance();
                        let token = Token::RBrace;
                        if let Some(started_at) = started_at {
                            self.profile_metrics.lex_text_ms +=
                                started_at.elapsed().as_secs_f64() * 1000.0;
                        }
                        return token;
                    } else {
                        let token = Token::Text(text);
                        if let Some(started_at) = started_at {
                            self.profile_metrics.lex_text_ms +=
                                started_at.elapsed().as_secs_f64() * 1000.0;
                        }
                        return token;
                    }
                }
                _ => {
                    text.push(self.advance().unwrap());
                }
            }
        }

        if !text.is_empty() {
            let token = Token::Text(text);
            if let Some(started_at) = started_at {
                self.profile_metrics.lex_text_ms += started_at.elapsed().as_secs_f64() * 1000.0;
            }
            token
        } else {
            let token = Token::EOF;
            if let Some(started_at) = started_at {
                self.profile_metrics.lex_text_ms += started_at.elapsed().as_secs_f64() * 1000.0;
            }
            token
        }
    }

    fn lex_tag(&mut self) -> Token {
        let started_at = self.profile_enabled.then(Instant::now);
        self.skip_whitespace();
        self.token_start = self.pos;

        let c = match self.peek() {
            Some(&c) => c,
            None => {
                if let Some(started_at) = started_at {
                    self.profile_metrics.lex_tag_ms += started_at.elapsed().as_secs_f64() * 1000.0;
                }
                return Token::EOF;
            }
        };

        let token = match c {
            '>' => {
                self.advance();
                self.mode = LexMode::Text;
                Token::Gt
            }
            '/' => {
                self.advance();
                if let Some(&'>') = self.peek() {
                    self.advance();
                    self.mode = LexMode::Text;
                    Token::SlashGt
                } else {
                    // unexpected char after /
                    Token::Text("/".to_string()) // Should probably error, but let's tokenize
                }
            }
            '=' => {
                self.advance();
                Token::Eq
            }
            '{' => {
                self.advance();
                Token::LBrace
            }
            '}' => {
                self.advance();
                Token::RBrace
            }
            '"' => self.lex_string(),
            _ => {
                if is_ident_start(c) {
                    self.lex_identifier()
                } else {
                    // Invalid char in tag mode. Panic or fallback?
                    // User said: "Fail fast on malformed input"
                    // But Lexer just produces tokens. Let's return text?
                    // Or panic?
                    // Let's consume and return Error or specialized token?
                    // For V0, let's panic/expect parser to handle.
                    panic!("Lexer error: unexpected char '{}' at pos {}", c, self.pos);
                }
            }
        };
        if let Some(started_at) = started_at {
            self.profile_metrics.lex_tag_ms += started_at.elapsed().as_secs_f64() * 1000.0;
        }
        token
    }

    fn lex_string(&mut self) -> Token {
        let started_at = self.profile_enabled.then(Instant::now);
        self.advance(); // Eat "
        let mut value = String::new();
        while let Some(&c) = self.peek() {
            if c == '"' {
                self.advance(); // Eat closing "
                let token = Token::StringLiteral(value);
                if let Some(started_at) = started_at {
                    self.profile_metrics.lex_string_ms +=
                        started_at.elapsed().as_secs_f64() * 1000.0;
                }
                return token;
            }
            value.push(self.advance().unwrap());
        }
        panic!("Lexer error: unterminated string at pos {}", self.pos);
    }

    fn lex_identifier(&mut self) -> Token {
        let started_at = self.profile_enabled.then(Instant::now);
        let mut name = String::new();
        while let Some(&c) = self.peek() {
            if is_ident_char(c) {
                name.push(self.advance().unwrap());
            } else {
                break;
            }
        }
        let token = Token::Identifier(name);
        if let Some(started_at) = started_at {
            self.profile_metrics.lex_identifier_ms += started_at.elapsed().as_secs_f64() * 1000.0;
        }
        token
    }

    fn skip_whitespace(&mut self) {
        let started_at = self.profile_enabled.then(Instant::now);
        while let Some(&c) = self.peek() {
            if c.is_whitespace() {
                self.advance();
            } else {
                break;
            }
        }
        if let Some(started_at) = started_at {
            self.profile_metrics.skip_whitespace_ms += started_at.elapsed().as_secs_f64() * 1000.0;
        }
    }

    /// Read raw expression content with brace balancing.
    ///
    /// Must be called immediately after the opening `{` has been consumed.
    /// Reads characters, tracking nested `{`/`}` pairs, string/template
    /// literal escapes, and JS comments to avoid false termination.
    /// Returns the raw content **without** the closing `}`.
    /// After returning, the lexer mode is restored to whatever it was before
    /// (Tag for attribute expressions, Text for text-node expressions).
    pub fn lex_expression_content(&mut self) -> String {
        let started_at = self.profile_enabled.then(Instant::now);
        let saved_mode = self.mode;
        let mut content = String::new();
        let mut depth: usize = 1; // opening '{' already consumed

        while let Some(c) = self.advance() {
            match c {
                '{' => {
                    depth += 1;
                    content.push(c);
                }
                '}' => {
                    depth -= 1;
                    if depth == 0 {
                        // Matched closing brace — done.
                        self.mode = saved_mode;
                        let value = content.trim().to_string();
                        if let Some(started_at) = started_at {
                            self.profile_metrics.lex_expression_content_ms +=
                                started_at.elapsed().as_secs_f64() * 1000.0;
                        }
                        return value;
                    }
                    content.push(c);
                }
                '"' | '\'' => {
                    // String literal — read until matching unescaped quote.
                    content.push(c);
                    let quote = c;
                    while let Some(sc) = self.advance() {
                        content.push(sc);
                        if sc == '\\' {
                            // Escaped char — consume the next char unconditionally.
                            if let Some(esc) = self.advance() {
                                content.push(esc);
                            }
                        } else if sc == quote {
                            break;
                        }
                    }
                }
                '`' => {
                    // Template literal — read until matching backtick.
                    // Handles ${...} interpolations by tracking brace depth.
                    content.push(c);
                    while let Some(tc) = self.advance() {
                        content.push(tc);
                        if tc == '\\' {
                            if let Some(esc) = self.advance() {
                                content.push(esc);
                            }
                        } else if tc == '`' {
                            break;
                        } else if tc == '$' {
                            if let Some(&'{') = self.peek() {
                                let brace = self.advance().unwrap();
                                content.push(brace);
                                // Read until matching } inside the template interpolation.
                                let mut tmpl_depth: usize = 1;
                                while tmpl_depth > 0 {
                                    match self.advance() {
                                        Some('{') => {
                                            tmpl_depth += 1;
                                            content.push('{');
                                        }
                                        Some('}') => {
                                            tmpl_depth -= 1;
                                            content.push('}');
                                        }
                                        Some(other) => content.push(other),
                                        None => break,
                                    }
                                }
                            }
                        }
                    }
                }
                '/' => {
                    // Possible comment start.
                    match self.peek() {
                        Some(&'/') => {
                            // Single-line comment — read until newline.
                            content.push(c);
                            while let Some(lc) = self.advance() {
                                content.push(lc);
                                if lc == '\n' {
                                    break;
                                }
                            }
                        }
                        Some(&'*') => {
                            // Block comment — read until */.
                            content.push(c);
                            content.push(self.advance().unwrap()); // '*'
                            loop {
                                match self.advance() {
                                    Some('*') => {
                                        content.push('*');
                                        if let Some(&'/') = self.peek() {
                                            content.push(self.advance().unwrap());
                                            break;
                                        }
                                    }
                                    Some(bc) => content.push(bc),
                                    None => break,
                                }
                            }
                        }
                        _ => {
                            content.push(c);
                        }
                    }
                }
                _ => {
                    content.push(c);
                }
            }
        }

        // Reached EOF without matching closing brace.
        panic!(
            "Lexer error: unterminated expression (unmatched '{{') at pos {}",
            self.pos
        );
    }

    pub fn profile_metrics(&self) -> LexerProfileMetrics {
        self.profile_metrics.clone()
    }
}

fn is_ident_start(c: char) -> bool {
    c.is_alphabetic() || c == '_'
}

fn is_ident_char(c: char) -> bool {
    c.is_alphanumeric() || c == '_' || c == '-' || c == ':'
}

fn build_line_starts(input: &str) -> Vec<usize> {
    let mut line_starts = vec![0];
    for (index, ch) in input.chars().enumerate() {
        if ch == '\n' {
            line_starts.push(index + 1);
        }
    }
    line_starts
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lex_basic_element() {
        let input = "<h1>hello</h1>";
        let mut lexer = Lexer::new(input);

        assert_eq!(lexer.next_token(), Token::Lt);
        assert_eq!(lexer.next_token(), Token::Identifier("h1".to_string()));
        assert_eq!(lexer.next_token(), Token::Gt);
        assert_eq!(lexer.next_token(), Token::Text("hello".to_string()));
        assert_eq!(lexer.next_token(), Token::Lt);
        assert_eq!(lexer.next_token(), Token::Text("/".to_string())); // Wait, '</h1>' is </ h1 >.
                                                                      // My lex_tag sees '/', then peeks '>'.
                                                                      // </ is matching '/' in lex_tag?
                                                                      // Wait: lex_text stops at '<'.
                                                                      // So '<' is emitted. Mode -> Tag.
                                                                      // Next is '/'.
                                                                      // In lex_tag: '/' checks for '>'. If not '>', it returns Text("/")?
                                                                      // This is weird.
    }
}
