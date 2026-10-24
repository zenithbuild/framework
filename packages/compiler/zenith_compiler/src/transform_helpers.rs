use crate::ast::{Attribute, ElementNode};
use crate::script::{SCRIPT_ID_ATTR, SCRIPT_PLACEHOLDER_TAG};

pub(crate) fn script_placeholder_id(elem: &ElementNode) -> Option<usize> {
    if elem.tag != SCRIPT_PLACEHOLDER_TAG {
        return None;
    }

    for attr in &elem.attributes {
        if let Attribute::Static { name, value } = attr {
            if name == SCRIPT_ID_ATTR {
                return value.parse::<usize>().ok();
            }
        }
    }

    None
}

pub(crate) fn is_raw_text_container(tag: &str) -> bool {
    matches!(tag, "title" | "textarea" | "script" | "style")
}

pub(crate) fn quote_js_string(value: &str) -> String {
    let mut quoted = String::from("\"");
    for ch in value.chars() {
        match ch {
            '\\' => quoted.push_str("\\\\"),
            '"' => quoted.push_str("\\\""),
            '\n' => quoted.push_str("\\n"),
            '\r' => quoted.push_str("\\r"),
            '\t' => quoted.push_str("\\t"),
            _ => quoted.push(ch),
        }
    }
    quoted.push('"');
    quoted
}
