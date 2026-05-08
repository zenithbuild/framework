use crate::ast::{Attribute, ElementNode, Node};
use crate::event_contract;
use crate::lexer::Token;
use std::time::Instant;

use super::Parser;

impl<'a> Parser<'a> {
    pub(super) fn parse_element(&mut self) -> Node {
        let started_at = self.profile_enabled.then(Instant::now);
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

        let children = if tag_name.eq_ignore_ascii_case("style") {
            self.parse_raw_text_children(&tag_name)
        } else {
            self.parse_children(&tag_name)
        };

        let node = Node::Element(ElementNode {
            tag: tag_name,
            attributes,
            children,
            self_closing: false,
        });
        if let Some(started_at) = started_at {
            self.profile_metrics.parse_element_ms += started_at.elapsed().as_secs_f64() * 1000.0;
        }
        node
    }

    fn parse_attributes(&mut self) -> Vec<Attribute> {
        let started_at = self.profile_enabled.then(Instant::now);
        let mut attributes = Vec::new();
        loop {
            match &self.current_token {
                Token::Identifier(name) => {
                    let name = name.clone();
                    let attr_name_offset = self.current_token_start;
                    self.advance();

                    if name.eq_ignore_ascii_case("innerHTML") {
                        let attr_name_location = self.location_for_offset(attr_name_offset);
                        panic!(
                            "innerHTML bindings are forbidden.\n\
                             Found: {} at line {}, column {}.\n\
                             Use unsafeHTML={{value}} for explicit raw HTML, or embedded markup expressions for compiler-owned fragments.",
                            name, attr_name_location.line, attr_name_location.column
                        );
                    }

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
                            let end_offset_exclusive = self.lexer.current_offset();
                            self.expect(Token::RBrace);
                            attributes.push(Attribute::Ref {
                                identifier,
                                span: self.span_for_offsets(attr_name_offset, end_offset_exclusive),
                            });
                        } else if self.current_token == Token::LBrace {
                            // Expression or Event — use raw balanced capture.
                            // The lexer produced LBrace as current_token and is
                            // positioned right after the '{' char. Call
                            // lex_expression_content() directly (do NOT advance
                            // first, as that would consume the first content token).
                            let value = self.lexer.lex_expression_content();
                            let end_offset_exclusive = self.lexer.current_offset();
                            self.sync_current_token();
                            let value = self.contract_gate_expression(&value, attr_name_offset);
                            let span =
                                self.span_for_offsets(attr_name_offset, end_offset_exclusive);

                            if name.starts_with("on:") {
                                let handler = value.trim().to_string();
                                if event_contract::is_direct_call_expression(&handler) {
                                    let attr_name_location =
                                        self.location_for_offset(attr_name_offset);
                                    panic!(
                                        "Event handlers must not be direct call expressions.\n\
                                         Found: on:{}={{ {} }} at line {}, column {}.\n\
                                         Use a function reference or inline function expression.",
                                        &name[3..],
                                        handler,
                                        attr_name_location.line,
                                        attr_name_location.column
                                    );
                                }
                                attributes.push(Attribute::Event {
                                    name: name[3..].to_string(),
                                    handler,
                                    span,
                                });
                            } else {
                                attributes.push(Attribute::Expression { name, value, span });
                            }
                        } else if let Token::StringLiteral(value) = &self.current_token {
                            if name.starts_with("on:") {
                                let value = value.clone();
                                let attr_name_location = self.location_for_offset(attr_name_offset);
                                panic!(
                                    "Event attributes do not accept string handlers.\n\
                                     Found: {}=\"{}\" at line {}, column {}.\n\
                                     Use on:event={{handler}} with a function-valued expression.",
                                    name, value, attr_name_location.line, attr_name_location.column
                                );
                            }
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
        if let Some(started_at) = started_at {
            self.profile_metrics.parse_attributes_ms += started_at.elapsed().as_secs_f64() * 1000.0;
        }
        attributes
    }

    fn parse_children(&mut self, parent_tag: &str) -> Vec<Node> {
        let started_at = self.profile_enabled.then(Instant::now);
        let mut children = Vec::new();
        let parsed_children = loop {
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
                    // If it is Text("/"):
                    //    Check if Identifier matches parent_tag.
                    //    If so, consume, consume Gt, return children.
                    // If Identifier:
                    //    Call `parse_element_internal(tag_name)`.

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
                    //    Call `parse_element_tail(tag_name)`.

                    self.advance(); // Eat <

                    if let Token::Text(s) = &self.current_token {
                        if s == "/" {
                            // Closing tag candidate
                            self.advance(); // Eat /
                            if let Token::Identifier(name) = self.current_token.clone() {
                                if name == parent_tag {
                                    self.advance(); // Eat tag name
                                    self.expect(Token::Gt); // Eat >
                                    break children;
                                } else {
                                    let location =
                                        self.location_for_offset(self.current_token_start);
                                    panic!(
                                        "Mismatched closing tag: expected </{}>, found </{}> at line {}, column {}.",
                                        parent_tag, name, location.line, location.column
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
                Token::EOF => {
                    let location = self.location_for_offset(self.current_token_start);
                    panic!(
                        "Unexpected EOF while parsing children of <{}> at line {}, column {}.",
                        parent_tag, location.line, location.column
                    );
                }
                _ => {
                    // Text or Expression
                    children.push(self.parse_node());
                }
            }
        };
        if let Some(started_at) = started_at {
            self.profile_metrics.parse_children_ms += started_at.elapsed().as_secs_f64() * 1000.0;
        }
        parsed_children
    }

    fn parse_raw_text_children(&mut self, parent_tag: &str) -> Vec<Node> {
        let mut raw = String::new();
        loop {
            match &self.current_token {
                Token::Lt => break,
                Token::Text(text) => {
                    raw.push_str(text);
                    self.advance();
                }
                Token::LBrace => {
                    raw.push('{');
                    let value = self.lexer.lex_expression_content();
                    raw.push_str(&value);
                    raw.push('}');
                    self.sync_current_token();
                }
                Token::RBrace => {
                    raw.push('}');
                    self.advance();
                }
                Token::EOF => panic!(
                    "Unexpected EOF while parsing raw text children of <{}>",
                    parent_tag
                ),
                _ => panic!(
                    "Unexpected token while parsing raw text children of <{}>: {:?}",
                    parent_tag, self.current_token
                ),
            }
        }
        let mut children = Vec::new();
        if !raw.is_empty() {
            children.push(Node::Text(raw));
        }
        self.parse_closing_tag(parent_tag);
        children
    }

    fn parse_closing_tag(&mut self, parent_tag: &str) {
        self.expect(Token::Lt);
        match &self.current_token {
            Token::Text(value) if value == "/" => self.advance(),
            _ => panic!(
                "Expected closing tag for <{}>, found {:?}",
                parent_tag, self.current_token
            ),
        }
        match &self.current_token {
            Token::Identifier(name) if name.eq_ignore_ascii_case(parent_tag) => self.advance(),
            Token::Identifier(name) => {
                panic!(
                    "Mismatched closing tag: expected </{}>, found </{}>",
                    parent_tag, name
                )
            }
            _ => panic!("Expected closing tag name, found {:?}", self.current_token),
        }
        self.expect(Token::Gt);
    }

    fn parse_element_tail(&mut self) -> Node {
        let started_at = self.profile_enabled.then(Instant::now);
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

        let children = if tag_name.eq_ignore_ascii_case("style") {
            self.parse_raw_text_children(&tag_name)
        } else {
            self.parse_children(&tag_name)
        };

        let node = Node::Element(ElementNode {
            tag: tag_name,
            attributes,
            children,
            self_closing: false,
        });
        if let Some(started_at) = started_at {
            self.profile_metrics.parse_element_ms += started_at.elapsed().as_secs_f64() * 1000.0;
        }
        node
    }
}
