use crate::ast::Node;
use crate::expression_syntax::validate_expression_syntax;
use crate::lexer::Token;
use std::time::Instant;

use super::parser_embedded_markup::{contains_markup_tag, lower_embedded_markup_expression};
use super::Parser;

impl<'a> Parser<'a> {
    pub fn parse(&mut self) -> Node {
        let trim_started_at = self.profile_enabled.then(Instant::now);
        while let Token::Text(ref t) = self.current_token {
            if t.trim().is_empty() {
                self.advance();
            } else {
                break;
            }
        }
        if let Some(trim_started_at) = trim_started_at {
            self.profile_metrics.trim_whitespace_ms +=
                trim_started_at.elapsed().as_secs_f64() * 1000.0;
        }

        let root = self.parse_node();

        // Check for multiple roots or trailing garbage
        let trim_started_at = self.profile_enabled.then(Instant::now);
        while let Token::Text(ref t) = self.current_token {
            if t.trim().is_empty() {
                self.advance();
            } else {
                break;
            }
        }
        if let Some(trim_started_at) = trim_started_at {
            self.profile_metrics.trim_whitespace_ms +=
                trim_started_at.elapsed().as_secs_f64() * 1000.0;
        }

        if self.current_token != Token::EOF {
            panic!(
                "Multiple root nodes detected or trailing content: {:?}",
                self.current_token
            );
        }

        root
    }

    pub(super) fn parse_node(&mut self) -> Node {
        let started_at = self.profile_enabled.then(Instant::now);
        let node = match self.current_token {
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
            _ => panic!("Unexpected token at top level: {:?}", self.current_token),
        };
        if let Some(started_at) = started_at {
            self.profile_metrics.parse_node_ms += started_at.elapsed().as_secs_f64() * 1000.0;
        }
        node
    }

    pub(super) fn parse_expression(&mut self) -> Node {
        let started_at = self.profile_enabled.then(Instant::now);
        // current_token is LBrace — the lexer already consumed the '{' char.
        // Do NOT call expect(Token::LBrace) / advance() because that would
        // call next_token() which in Text mode consumes the expression content.
        // Instead, assert and call lex_expression_content() directly.
        assert_eq!(
            self.current_token,
            Token::LBrace,
            "parse_expression called without LBrace"
        );
        let start_offset = self.current_token_start;
        let raw = self.lexer.lex_expression_content();
        let end_offset_exclusive = self.lexer.current_offset();
        // lex_expression_content consumed everything up to and including the closing '}'.
        // Re-sync current_token from the lexer.
        self.sync_current_token();
        let content = self.contract_gate_expression(&raw, start_offset);
        let node = Node::Expression {
            value: content,
            span: self.span_for_offsets(start_offset, end_offset_exclusive),
        };
        if let Some(started_at) = started_at {
            self.profile_metrics.parse_expression_ms += started_at.elapsed().as_secs_f64() * 1000.0;
        }
        node
    }

    /// Contract gate: reject embedded markup tags inside expressions unless
    /// the `embeddedMarkupExpressions` flag is enabled.
    pub(super) fn contract_gate_expression(&mut self, raw: &str, start_offset: usize) -> String {
        let started_at = self.profile_enabled.then(Instant::now);
        let value = if self.embedded_markup_expressions {
            lower_embedded_markup_expression(raw)
        } else {
            let contains_markup_started_at = self.profile_enabled.then(Instant::now);
            let contains_markup = contains_markup_tag(raw);
            if let Some(contains_markup_started_at) = contains_markup_started_at {
                self.profile_metrics.contains_markup_ms +=
                    contains_markup_started_at.elapsed().as_secs_f64() * 1000.0;
            }
            if contains_markup {
                panic!(
                    "Embedded markup expressions are disabled.\n\
                     Expression contains HTML/component tags: {{{}}}\n\
                     To enable, set embeddedMarkupExpressions: true in zenith.config.js\n\
                     Or refactor the expression to avoid inline markup.",
                    raw.chars().take(80).collect::<String>()
                );
            }
            raw.to_string()
        };
        if validate_expression_syntax(&value).is_err() {
            let location = self.location_for_offset(start_offset);
            panic!(
                "Invalid markup expression syntax.\nExpression: {{{}}} at line {}, column {}.",
                raw.chars().take(80).collect::<String>(),
                location.line,
                location.column
            );
        }
        if let Some(started_at) = started_at {
            self.profile_metrics.contract_gate_ms += started_at.elapsed().as_secs_f64() * 1000.0;
        }
        value
    }
}
