use crate::ast::{Attribute, ElementNode, Node};
use crate::lexer::{Lexer, Token};

pub struct Parser<'a> {
    lexer: Lexer<'a>,
    current_token: Token,
}

impl<'a> Parser<'a> {
    pub fn new(input: &'a str) -> Self {
        let mut lexer = Lexer::new(input);
        let current_token = lexer.next_token();
        Self {
            lexer,
            current_token,
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
        self.expect(Token::LBrace);
        // Expression content could be Text (if Lexer in Text mode) or Identifier (if in Tag mode? No, expression always follows LBrace)
        // My Lexer returns Text or Identifier depending on mode.
        // But inside { ... }, we are just reading tokens. simple V0: just expect Text or Identifier.
        // Actually, Lexer `lex_text` returns `Text` for content up to `}`.
        // So we expect `Text` or `Identifier`.

        let content = match &self.current_token {
            Token::Text(t) => t.clone(),
            Token::Identifier(t) => t.clone(),
            _ => panic!(
                "Expected expression content, found {:?}",
                self.current_token
            ),
        };
        self.advance();

        self.expect(Token::RBrace);
        Node::Expression(content)
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

                        if self.current_token == Token::LBrace {
                            // Expression or Event
                            self.advance(); // Eat '{'
                            let value = match &self.current_token {
                                Token::Identifier(v) | Token::Text(v) => v.clone(),
                                _ => panic!(
                                    "Expected attribute value expression, found {:?}",
                                    self.current_token
                                ),
                            };
                            self.advance();
                            self.expect(Token::RBrace);

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
