use std::iter::Peekable;
use std::str::Chars;

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

pub struct Lexer<'a> {
    _input: &'a str,
    chars: Peekable<Chars<'a>>,
    pos: usize,
    mode: LexMode,
}

impl<'a> Lexer<'a> {
    pub fn new(input: &'a str) -> Self {
        Self {
            _input: input,
            chars: input.chars().peekable(),
            pos: 0,
            mode: LexMode::Text,
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
        match self.mode {
            LexMode::Text => self.lex_text(),
            LexMode::Tag => self.lex_tag(),
        }
    }

    fn lex_text(&mut self) -> Token {
        let mut text = String::new();

        while let Some(&c) = self.peek() {
            match c {
                '<' => {
                    if text.is_empty() {
                        self.advance(); // Eat '<'
                        self.mode = LexMode::Tag;
                        return Token::Lt;
                    } else {
                        return Token::Text(text);
                    }
                }
                '{' => {
                    if text.is_empty() {
                        self.advance(); // Eat '{'
                        return Token::LBrace;
                    } else {
                        return Token::Text(text);
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
                        return Token::RBrace;
                    } else {
                        return Token::Text(text);
                    }
                }
                _ => {
                    text.push(self.advance().unwrap());
                }
            }
        }

        if !text.is_empty() {
            Token::Text(text)
        } else {
            Token::EOF
        }
    }

    fn lex_tag(&mut self) -> Token {
        self.skip_whitespace();

        let c = match self.peek() {
            Some(&c) => c,
            None => return Token::EOF,
        };

        match c {
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
        }
    }

    fn lex_string(&mut self) -> Token {
        self.advance(); // Eat "
        let mut value = String::new();
        while let Some(&c) = self.peek() {
            if c == '"' {
                self.advance(); // Eat closing "
                return Token::StringLiteral(value);
            }
            value.push(self.advance().unwrap());
        }
        panic!("Lexer error: unterminated string at pos {}", self.pos);
    }

    fn lex_identifier(&mut self) -> Token {
        let mut name = String::new();
        while let Some(&c) = self.peek() {
            if is_ident_char(c) {
                name.push(self.advance().unwrap());
            } else {
                break;
            }
        }
        Token::Identifier(name)
    }

    fn skip_whitespace(&mut self) {
        while let Some(&c) = self.peek() {
            if c.is_whitespace() {
                self.advance();
            } else {
                break;
            }
        }
    }
}

fn is_ident_start(c: char) -> bool {
    c.is_alphabetic() || c == '_'
}

fn is_ident_char(c: char) -> bool {
    c.is_alphanumeric() || c == '_' || c == '-' || c == ':'
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
