use crate::ast::{SourceLocation, SourceSpan};
use crate::lexer::{Lexer, LexerProfileMetrics, Token};
use std::time::Instant;

#[path = "parser_elements.rs"]
mod parser_elements;
#[path = "parser_embedded_markup.rs"]
mod parser_embedded_markup;
#[path = "parser_parse.rs"]
mod parser_parse;

#[derive(Debug, Clone, Default)]
pub struct ParserProfileMetrics {
    pub trim_whitespace_ms: f64,
    pub sync_current_token_ms: f64,
    pub location_lookup_ms: f64,
    pub location_lookup_calls: usize,
    pub span_construction_ms: f64,
    pub parse_node_ms: f64,
    pub parse_expression_ms: f64,
    pub parse_element_ms: f64,
    pub parse_attributes_ms: f64,
    pub parse_children_ms: f64,
    pub contract_gate_ms: f64,
    pub contains_markup_ms: f64,
    pub lower_embedded_markup_ms: f64,
    pub lexer: LexerProfileMetrics,
}

pub struct Parser<'a> {
    lexer: Lexer<'a>,
    current_token: Token,
    current_token_start: usize,
    embedded_markup_expressions: bool,
    profile_enabled: bool,
    profile_metrics: ParserProfileMetrics,
}

impl<'a> Parser<'a> {
    pub fn new(input: &'a str) -> Self {
        Self::new_with_profile_options(input, false, false)
    }

    pub fn new_with_profile_options(
        input: &'a str,
        embedded_markup_expressions: bool,
        profile_enabled: bool,
    ) -> Self {
        let mut lexer = Lexer::new_with_profile(input, profile_enabled);
        let current_token = lexer.next_token();
        let current_token_start = lexer.last_token_start();
        Self {
            lexer,
            current_token,
            current_token_start,
            embedded_markup_expressions,
            profile_enabled,
            profile_metrics: ParserProfileMetrics::default(),
        }
    }

    pub fn new_with_options(input: &'a str, embedded_markup_expressions: bool) -> Self {
        Self::new_with_profile_options(input, embedded_markup_expressions, false)
    }

    fn advance(&mut self) {
        self.sync_current_token();
    }

    fn sync_current_token(&mut self) {
        let started_at = self.profile_enabled.then(Instant::now);
        self.current_token = self.lexer.next_token();
        self.current_token_start = self.lexer.last_token_start();
        if let Some(started_at) = started_at {
            self.profile_metrics.sync_current_token_ms +=
                started_at.elapsed().as_secs_f64() * 1000.0;
        }
    }

    fn location_for_offset(&mut self, offset: usize) -> SourceLocation {
        let started_at = self.profile_enabled.then(Instant::now);
        let (line, column) = self.lexer.offset_to_line_col(offset);
        if let Some(started_at) = started_at {
            self.profile_metrics.location_lookup_ms += started_at.elapsed().as_secs_f64() * 1000.0;
            self.profile_metrics.location_lookup_calls += 1;
        }
        SourceLocation { line, column }
    }

    fn span_for_offsets(&mut self, start_offset: usize, end_offset_exclusive: usize) -> SourceSpan {
        let started_at = self.profile_enabled.then(Instant::now);
        let end_offset = if end_offset_exclusive > start_offset {
            end_offset_exclusive.saturating_sub(1)
        } else {
            start_offset
        };
        let span = SourceSpan {
            start: self.location_for_offset(start_offset),
            end: self.location_for_offset(end_offset),
        };
        if let Some(started_at) = started_at {
            self.profile_metrics.span_construction_ms +=
                started_at.elapsed().as_secs_f64() * 1000.0;
        }
        span
    }

    fn expect(&mut self, token: Token) {
        if self.current_token == token {
            self.advance();
        } else {
            panic!("Expected {:?}, found {:?}", token, self.current_token);
        }
    }

    pub fn profile_metrics(&self) -> ParserProfileMetrics {
        let mut metrics = self.profile_metrics.clone();
        metrics.lexer = self.lexer.profile_metrics();
        metrics
    }
}
