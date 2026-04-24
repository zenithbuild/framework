use super::{
    boundary_after, boundary_before, classify_attribute_violation, control_violation,
    format_violation, is_attribute_name_char, is_tag_name_char, ForeignSyntaxViolation,
};

pub(super) struct ForeignSyntaxScanner<'a> {
    input: &'a str,
    len: usize,
    offset: usize,
}

impl<'a> ForeignSyntaxScanner<'a> {
    pub(super) fn new(input: &'a str) -> Self {
        Self {
            input,
            len: input.len(),
            offset: 0,
        }
    }

    pub(super) fn scan(&mut self) -> Result<(), String> {
        while self.offset < self.len {
            if self.starts_with("<!--") {
                self.skip_comment();
                continue;
            }

            if self.starts_with_case_insensitive("<script")
                && self.tag_name_boundary("<script".len())
            {
                self.skip_script_block();
                continue;
            }

            if self.starts_with("<") {
                if let Some(violation) = self.match_react_conditional_violation() {
                    return Err(format_violation(self.input, violation));
                }
                self.scan_tag()?;
                continue;
            }

            if let Some(violation) = self.match_text_violation() {
                return Err(format_violation(self.input, violation));
            }

            if self.current_char() == Some('{') {
                self.skip_braced_attribute_value();
                continue;
            }

            self.advance_char();
        }

        Ok(())
    }

    fn scan_tag(&mut self) -> Result<(), String> {
        self.advance_char(); // '<'

        if self.offset >= self.len {
            return Ok(());
        }

        if matches!(self.current_char(), Some('!') | Some('?')) {
            self.skip_until_tag_close();
            return Ok(());
        }

        if self.current_char() == Some('/') {
            self.skip_until_tag_close();
            return Ok(());
        }

        let tag_name = self.read_tag_name();
        let is_component_tag = tag_name
            .chars()
            .next()
            .map(|ch| ch.is_ascii_uppercase())
            .unwrap_or(false);

        loop {
            self.skip_whitespace();

            if self.offset >= self.len {
                return Ok(());
            }

            if self.starts_with("/>") {
                self.offset += 2;
                return Ok(());
            }

            if self.current_char() == Some('>') {
                self.advance_char();
                return Ok(());
            }

            let attr_start = self.offset;
            let attr_name = self.read_attribute_name();
            if attr_name.is_empty() {
                self.advance_char();
                continue;
            }

            if let Some(violation) =
                classify_attribute_violation(attr_name, attr_start, is_component_tag)
            {
                return Err(format_violation(self.input, violation));
            }

            self.skip_whitespace();
            if self.current_char() == Some('=') {
                self.advance_char();
                self.skip_whitespace();
                self.skip_attribute_value();
            }
        }
    }

    fn match_text_violation(&self) -> Option<ForeignSyntaxViolation<'a>> {
        if self.starts_with("{#if") {
            return Some(control_violation(
                "{#if",
                "Zenith .zen files do not use Svelte-style control blocks.",
                "Rewrite this conditional using the canonical Zenith conditional syntax supported by the compiler.",
                self.offset,
            ));
        }

        if self.starts_with("{/if}") || self.starts_with("{/if") {
            return Some(control_violation(
                "{/if}",
                "Zenith .zen files do not use Svelte-style control blocks.",
                "Rewrite this conditional using the canonical Zenith conditional syntax supported by the compiler.",
                self.offset,
            ));
        }

        if self.starts_with("{#each") {
            return Some(control_violation(
                "{#each",
                "Zenith .zen files do not use Svelte-style each blocks.",
                "Rewrite this iteration using the canonical Zenith iteration syntax supported by the compiler.",
                self.offset,
            ));
        }

        if self.starts_with("{/each}") || self.starts_with("{/each") {
            return Some(control_violation(
                "{/each}",
                "Zenith .zen files do not use Svelte-style each blocks.",
                "Rewrite this iteration using the canonical Zenith iteration syntax supported by the compiler.",
                self.offset,
            ));
        }

        if self.matches_directive("@elseif") && self.directive_followed_by_paren("@elseif") {
            return Some(control_violation(
                "@elseif",
                "Zenith .zen files do not use Blade/Twig-style directives.",
                "Rewrite this conditional using the canonical Zenith conditional syntax supported by the compiler.",
                self.offset,
            ));
        }

        if self.matches_directive("@else") {
            return Some(control_violation(
                "@else",
                "Zenith .zen files do not use Blade/Twig-style directives.",
                "Rewrite this conditional using the canonical Zenith conditional syntax supported by the compiler.",
                self.offset,
            ));
        }

        if self.matches_directive("@if") && self.directive_followed_by_paren("@if") {
            return Some(control_violation(
                "@if",
                "Zenith .zen files do not use Blade/Twig-style directives.",
                "Rewrite this conditional using the canonical Zenith conditional syntax supported by the compiler.",
                self.offset,
            ));
        }

        None
    }

    fn match_react_conditional_violation(&self) -> Option<ForeignSyntaxViolation<'a>> {
        let Some(next) = self.peek_char() else {
            return None;
        };
        if !next.is_ascii_alphabetic() {
            return None;
        }

        let mut cursor = self.offset;
        cursor = self.retreat_whitespace(cursor);
        while let Some((prev_offset, prev)) = self.prev_char(cursor) {
            if prev != '(' {
                break;
            }
            cursor = self.retreat_whitespace(prev_offset);
        }

        if self.slice_ends_with(cursor, "&&") {
            return Some(control_violation(
                "&& <",
                "Zenith .zen files do not use React/JSX inline conditional markup artifacts.",
                "Rewrite this conditional using the canonical Zenith conditional syntax supported by the compiler.",
                self.offset.saturating_sub(2),
            ));
        }

        if self.slice_ends_with(cursor, "?") {
            return Some(control_violation(
                "? <",
                "Zenith .zen files do not use React/JSX inline conditional markup artifacts.",
                "Rewrite this conditional using the canonical Zenith conditional syntax supported by the compiler.",
                self.offset.saturating_sub(1),
            ));
        }

        None
    }

    fn matches_directive(&self, token: &str) -> bool {
        self.starts_with(token)
            && boundary_before(self.input, self.offset)
            && boundary_after(self.input, self.offset + token.len())
    }

    fn directive_followed_by_paren(&self, token: &str) -> bool {
        let mut cursor = self.offset + token.len();
        while let Some(ch) = self.char_at(cursor) {
            if ch.is_whitespace() {
                cursor += ch.len_utf8();
                continue;
            }
            return ch == '(';
        }
        false
    }

    fn skip_comment(&mut self) {
        self.offset += "<!--".len();
        while self.offset < self.len && !self.starts_with("-->") {
            self.advance_char();
        }
        if self.starts_with("-->") {
            self.offset += "-->".len();
        }
    }

    fn skip_script_block(&mut self) {
        self.offset += "<script".len();
        self.skip_until_tag_close();

        while self.offset < self.len {
            if self.starts_with_case_insensitive("</script>") {
                self.offset += "</script>".len();
                return;
            }
            self.advance_char();
        }
    }

    fn skip_until_tag_close(&mut self) {
        while let Some(ch) = self.current_char() {
            self.advance_char();
            if ch == '>' {
                return;
            }
        }
    }

    fn read_tag_name(&mut self) -> &'a str {
        let start = self.offset;
        while let Some(ch) = self.current_char() {
            if is_tag_name_char(ch) {
                self.advance_char();
                continue;
            }
            break;
        }
        &self.input[start..self.offset]
    }

    fn read_attribute_name(&mut self) -> &'a str {
        let start = self.offset;
        while let Some(ch) = self.current_char() {
            if is_attribute_name_char(ch) {
                self.advance_char();
                continue;
            }
            break;
        }
        &self.input[start..self.offset]
    }

    fn skip_attribute_value(&mut self) {
        match self.current_char() {
            Some('"') | Some('\'') => self.skip_quoted_attribute_value(),
            Some('{') => self.skip_braced_attribute_value(),
            _ => {
                while let Some(ch) = self.current_char() {
                    if ch.is_whitespace() || ch == '>' {
                        break;
                    }
                    if ch == '/' && self.peek_char() == Some('>') {
                        break;
                    }
                    self.advance_char();
                }
            }
        }
    }

    fn skip_quoted_attribute_value(&mut self) {
        let Some(quote) = self.current_char() else {
            return;
        };
        self.advance_char();
        while let Some(ch) = self.current_char() {
            self.advance_char();
            if ch == quote {
                return;
            }
        }
    }

    fn skip_braced_attribute_value(&mut self) {
        let mut depth = 0usize;
        while let Some(ch) = self.current_char() {
            match ch {
                '{' => {
                    depth += 1;
                    self.advance_char();
                }
                '}' => {
                    self.advance_char();
                    depth = depth.saturating_sub(1);
                    if depth == 0 {
                        return;
                    }
                }
                '"' | '\'' => self.skip_js_string(ch),
                '`' => self.skip_template_literal(),
                '/' if self.peek_char() == Some('/') => self.skip_line_comment(),
                '/' if self.peek_char() == Some('*') => self.skip_block_comment(),
                _ => self.advance_char(),
            }
        }
    }

    fn skip_js_string(&mut self, quote: char) {
        self.advance_char();
        while let Some(ch) = self.current_char() {
            self.advance_char();
            if ch == '\\' {
                self.advance_char();
                continue;
            }
            if ch == quote {
                return;
            }
        }
    }

    fn skip_template_literal(&mut self) {
        self.advance_char();
        while let Some(ch) = self.current_char() {
            match ch {
                '\\' => {
                    self.advance_char();
                    self.advance_char();
                }
                '`' => {
                    self.advance_char();
                    return;
                }
                '$' if self.peek_char() == Some('{') => {
                    self.advance_char();
                    self.skip_braced_attribute_value();
                }
                _ => self.advance_char(),
            }
        }
    }

    fn skip_line_comment(&mut self) {
        self.offset += 2;
        while let Some(ch) = self.current_char() {
            self.advance_char();
            if ch == '\n' {
                return;
            }
        }
    }

    fn skip_block_comment(&mut self) {
        self.offset += 2;
        while self.offset < self.len {
            if self.starts_with("*/") {
                self.offset += 2;
                return;
            }
            self.advance_char();
        }
    }

    fn starts_with(&self, pattern: &str) -> bool {
        self.input[self.offset..].starts_with(pattern)
    }

    fn slice_ends_with(&self, offset: usize, pattern: &str) -> bool {
        self.input
            .get(..offset)
            .is_some_and(|segment| segment.ends_with(pattern))
    }

    fn starts_with_case_insensitive(&self, pattern: &str) -> bool {
        let end = self.offset + pattern.len();
        end <= self.len
            && self
                .input
                .get(self.offset..end)
                .is_some_and(|segment| segment.eq_ignore_ascii_case(pattern))
    }

    fn tag_name_boundary(&self, pattern_len: usize) -> bool {
        matches!(
            self.char_at(self.offset + pattern_len),
            None | Some('>') | Some('/') | Some('\t') | Some('\n') | Some('\r') | Some(' ')
        )
    }

    fn current_char(&self) -> Option<char> {
        self.char_at(self.offset)
    }

    fn peek_char(&self) -> Option<char> {
        let current = self.current_char()?;
        self.char_at(self.offset + current.len_utf8())
    }

    fn char_at(&self, offset: usize) -> Option<char> {
        self.input.get(offset..)?.chars().next()
    }

    fn prev_char(&self, offset: usize) -> Option<(usize, char)> {
        self.input.get(..offset)?.char_indices().next_back()
    }

    fn advance_char(&mut self) {
        if let Some(ch) = self.current_char() {
            self.offset += ch.len_utf8();
        } else {
            self.offset = self.len;
        }
    }

    fn skip_whitespace(&mut self) {
        while let Some(ch) = self.current_char() {
            if ch.is_whitespace() {
                self.advance_char();
                continue;
            }
            break;
        }
    }

    fn retreat_whitespace(&self, mut offset: usize) -> usize {
        while let Some((prev_offset, prev)) = self.prev_char(offset) {
            if prev.is_whitespace() {
                offset = prev_offset;
                continue;
            }
            break;
        }
        offset
    }
}
